const axios = require("axios");
const http = require("http");
const {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");

const {
  computeSummary,
  evaluate,
  getInvalidSessionIndexes,
} = require("../utils/evaluate");

const { LOCAL_BASE } = require("../constants/base");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";

const CACHE_TTL_MS = 5 * 60 * 1000;
const STUDENT_CHECK_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = Number(process.env.HANH_TRINH_CONCURRENCY || 8);

// ─── Token cache ─────────────────────────────────────
let _tokenPromise = null;
let _tokenExpiresAt = 0;

let _tokenLastFailedAt = 0;
const TOKEN_RETRY_DELAY = 3000;

async function getValidToken() {
  const now = Date.now();

  // Nếu token vừa lỗi cách đây ít giây → throw ngay để tránh flood request
  if (now - _tokenLastFailedAt < TOKEN_RETRY_DELAY) {
    throw new Error(
      "Token service đang có vấn đề, vui lòng thử lại sau vài giây",
    );
  }

  // Reset promise nếu token sắp hết hạn hoặc đã lỗi trước đó
  if (_tokenPromise && now > _tokenExpiresAt - 30000) {
    _tokenPromise = null;
  }

  if (!_tokenPromise) {
    _tokenPromise = (async () => {
      try {
        console.log("[Token] Đang lấy token mới...");

        const result = await getHanhTrinhToken();

        if (!result || typeof result !== "object") {
          throw new Error(
            `getHanhTrinhToken trả về không hợp lệ: ${typeof result}`,
          );
        }

        const token = result.token || result.access_token;
        if (!token || typeof token !== "string") {
          throw new Error("Không tìm thấy token hợp lệ");
        }

        const expires_in = result.expires_in || result.expiresIn || 600;
        if (expires_in <= 0) {
          throw new Error(`expires_in không hợp lệ: ${expires_in}`);
        }

        _tokenExpiresAt = Date.now() + expires_in * 1000;
        _tokenLastFailedAt = 0;

        console.log(`[Token] Thành công - hết hạn sau ${expires_in} giây`);
        return token; // Trả về chuỗi token trực tiếp
      } catch (err) {
        _tokenLastFailedAt = Date.now();
        _tokenPromise = null;
        console.error("[Token] Lấy token thất bại:", err.message);
        throw err;
      }
    })();
  }

  return _tokenPromise;
}

function invalidateCachedToken() {
  _tokenPromise = null;
  _tokenExpiresAt = 0;
  invalidateHanhTrinhToken();
}

// ─── HTTP Agent ─────────────────────────────────────
const hanhTrinhAxios = axios.create({
  baseURL: HANH_TRINH_BASE,
  httpAgent: new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 80,
    maxFreeSockets: 20,
    timeout: 15000,
  }),
  timeout: 10000,
});

// ─── Retry helper ─────────────────────────────────────
async function withRetry(fn, retries = 3, baseDelayMs = 400) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isCanceled =
        err?.name === "CanceledError" || err?.code === "ERR_CANCELED";
      if (isCanceled) throw err;

      // Xử lý riêng lỗi token
      if (err.message?.includes("token") || err.message?.includes("Token")) {
        console.warn(
          `[withRetry] Token error detected on attempt ${attempt + 1}`,
        );
        if (attempt < 1) {
          // Chỉ retry tối đa 1 lần cho lỗi token
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        throw err; // Fail nhanh nếu token lỗi nhiều lần
      }

      // Lỗi 401 → invalidate và throw
      if (err?.response?.status === 401) {
        invalidateCachedToken();
        throw err;
      }

      const isRetryable =
        !err?.response?.status ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.response?.status >= 500 ||
        err.response?.status === 429;

      if (!isRetryable || attempt === retries) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 120;
      console.warn(
        `[withRetry] attempt ${attempt + 1}/${retries} failed (${err.message}), retry in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── Cache Student Check Data ─────────────────────────────────────
let _studentCheckCache = { ts: 0, data: null };

async function getAllStudentCheckDataCached() {
  const now = Date.now();
  if (
    _studentCheckCache.data &&
    now - _studentCheckCache.ts < STUDENT_CHECK_TTL_MS
  ) {
    return _studentCheckCache.data;
  }

  try {
    const { data } = await axios.get(`${LOCAL_BASE}/api/check-data-student`);
    const list = data?.data || data?.result || data || [];
    const result = Array.isArray(list) ? list : [];

    _studentCheckCache = { ts: now, data: result };
    return result;
  } catch (err) {
    console.error("[getAllStudentCheckDataCached]", err.message);
    return _studentCheckCache.data || [];
  }
}

// ─── In-flight dedup & Result cache ─────────────────────────────────────
const _inFlight = new Map();
const _resultCache = new Map();

function dedupFetch(key, fn) {
  if (_inFlight.has(key)) return _inFlight.get(key);
  const p = fn().finally(() => _inFlight.delete(key));
  _inFlight.set(key, p);
  return p;
}

function getCached(key) {
  const entry = _resultCache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) {
    if (entry) _resultCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key, result) {
  if (result && result.status !== "error") {
    _resultCache.set(key, { ts: Date.now(), result });
  }
}

setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of _resultCache) {
      if (now - v.ts > CACHE_TTL_MS) _resultCache.delete(k);
    }
  },
  10 * 60 * 1000,
).unref();

// ─── Helpers ─────────────────────────────────────
function buildStudentCheckMap(list) {
  return new Map(list.filter((s) => s.maDangKy).map((s) => [s.maDangKy, s]));
}

function setAndReturn(key, result) {
  setCache(key, result);
  return result;
}

function mark(label, start) {
  console.log(`[timing] ${label}: ${Date.now() - start}ms`);
}

// ─── Concurrency limiter ─────────────────────────────────────
function withConcurrencyLimit(tasks, limit, signal) {
  return new Promise((resolve) => {
    const results = new Array(tasks.length);
    let started = 0,
      completed = 0;

    if (!tasks.length) return resolve(results);

    const finishOne = (index, result) => {
      results[index] = result;
      completed++;
      if (completed === tasks.length) resolve(results);
      else runNext();
    };

    const runNext = () => {
      if (started >= tasks.length) return;
      const idx = started++;
      if (signal?.aborted) {
        return finishOne(idx, {
          status: "error",
          message: "Aborted by timeout",
        });
      }

      tasks[idx]()
        .then((r) => finishOne(idx, r))
        .catch((err) =>
          finishOne(idx, {
            status: "error",
            message: err?.message || "Unknown error",
          }),
        );
    };

    for (let i = 0; i < Math.min(limit, tasks.length); i++) runNext();
  });
}

// ─── Core Fetch & Evaluate ─────────────────────────────────────
async function fetchAndEvaluate(
  { maDK, maKhoaHoc },
  { ngaybatdau, endDate, signal },
  studentCheckMap,
) {
  const cacheKey = `${maDK}::${maKhoaHoc}::${ngaybatdau}::${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  return dedupFetch(cacheKey, () =>
    _fetchRaw(
      { maDK, maKhoaHoc },
      { ngaybatdau, endDate, signal },
      studentCheckMap,
      cacheKey,
    ),
  );
}

async function _fetchRaw(
  { maDK, maKhoaHoc },
  { ngaybatdau, endDate, signal },
  studentCheckMap,
  cacheKey,
) {
  try {
    const params = new URLSearchParams({
      ngaybatdau,
      ngayketthuc: endDate,
      ten: maDK,
      makhoahoc: maKhoaHoc,
      limit: 50,
      page: 1,
    });

    const response = await withRetry(
      async () => {
        const token = await getValidToken(); // ← Sửa ở đây
        return hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
      },
      3,
      400,
    );

    const dataSource = response.data?.Data || [];

    const studentInfo = studentCheckMap.get(maDK) || null;
    const hoTen = studentInfo?.hoVaTen || dataSource[0]?.HoTen || null;

    if (!dataSource.length) {
      return setAndReturn(cacheKey, {
        maDK,
        maKhoaHoc,
        hoTen,
        hangDaoTao: "B.01",
        status: "no_data",
        message: "Chưa có thông tin phiên học",
        totalSessions: 0,
        summary: null,
        errors: [],
        warnings: [],
        studentInfo: studentInfo
          ? {
              giaoVien: studentInfo.giaoVien,
              xeB1: studentInfo.xeB1,
              xeB2: studentInfo.xeB2,
            }
          : null,
      });
    }

    const hangDaoTao = dataSource[0]?.HangDaoTao || "B.01";
    const summary = computeSummary(dataSource, hangDaoTao, studentInfo);

    const evalResult = evaluate(summary, dataSource, studentInfo);
    const { invalidIndexes, tuDongLoiIndexes, invalidReasons } =
      getInvalidSessionIndexes(dataSource, studentInfo);

    return setAndReturn(cacheKey, {
      maDK,
      maKhoaHoc,
      hoTen,
      hangDaoTao,
      giaoVien: dataSource[0]?.HoTenGV || studentInfo?.giaoVien || null,
      bienSoXe1: studentInfo?.xeB1 || null,
      bienSoXe2: studentInfo?.xeB2 || null,
      studentInfo: studentInfo
        ? {
            giaoVien: studentInfo.giaoVien,
            xeB1: studentInfo.xeB1,
            xeB2: studentInfo.xeB2,
            khoaHoc: studentInfo.khoaHoc,
          }
        : null,

      summary: {
        tongThoiGianChuaLoaiGio: +summary.tongThoiGianChuaLoaiGio.toFixed(2),
        tongQuangDuongChuaLoai: +summary.tongQuangDuongChuaLoai.toFixed(2),
        tongThoiGianGio: +summary.tongThoiGianGio.toFixed(2),
        thoiGianBanNgayGio: +summary.thoiGianBanNgayGio.toFixed(2),
        thoiGianBanDemGio: +summary.thoiGianBanDemGio.toFixed(2),
        thoiGianTuDongGio: +summary.thoiGianTuDongGio.toFixed(2),
        tongQuangDuong: +summary.tongQuangDuong.toFixed(2),
        quangDuongBanNgay: +summary.quangDuongBanNgay.toFixed(2),
        quangDuongBanDem: +summary.quangDuongBanDem.toFixed(2),
        quangDuongTuDong: +summary.quangDuongTuDong.toFixed(2),
      },

      status: evalResult.errors.length ? "fail" : "pass",
      errors: evalResult.errors,
      warnings: evalResult.warnings,
      totalSessions: dataSource.length,
      sessions: dataSource.map((s, idx) => ({
        stt: idx + 1,
        thoiDiemDangNhap: s.ThoiDiemDangNhap,
        thoiDiemDangXuat: s.ThoiDiemDangXuat,
        bienSo: s.BienSo,
        hoTenGV: s.HoTenGV,
        loaiPhien: s.LoaiPhien,
        tongThoiGianGiay: s.TongThoiGian,
        tongQuangDuongKm: s.TongQuangDuong,
        thoiGianBanDemGiay: s.ThoiGianBanDem || 0,
        quangDuongBanDemKm: s.QuangDuongBanDem || 0,
        isValid: !invalidIndexes.has(idx),
        isTuDongLoi: tuDongLoiIndexes.has(idx),
        sessionErrors: (invalidReasons.get(idx) || []).map((msg) => ({
          message: msg,
        })),
      })),
    });
  } catch (err) {
    if (err?.response?.status === 401) invalidateCachedToken();

    if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
      return {
        maDK,
        maKhoaHoc,
        status: "error",
        message: "Aborted by timeout",
      };
    }

    return { maDK, maKhoaHoc, status: "error", message: err.message };
  }
}

// ─── Main Controller ─────────────────────────────────────
async function kiemTraToanKhoa(req, res) {
  const startTime = Date.now();
  const TOTAL_TIMEOUT_MS = Number(req.body.timeoutMs) || 120000;

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    TOTAL_TIMEOUT_MS,
  );

  try {
    const {
      ma_dk, // array
      ma_khoa_hoc,
      ngaybatdau = "2020-01-01",
      ngayketthuc,
    } = req.body;

    if (!Array.isArray(ma_dk) || ma_dk.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ma_dk phải là mảng và không được rỗng",
      });
    }
    if (!ma_khoa_hoc) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu ma_khoa_hoc" });
    }

    const endDate = ngayketthuc || new Date().toISOString().slice(0, 19);

    // Load student check data (quan trọng)
    const checkDataList = await getAllStudentCheckDataCached();
    const studentCheckMap = buildStudentCheckMap(checkDataList);

    // await getCachedToken().catch((e) =>
    //   console.warn("[pre-warm token]", e.message),
    // );

    const tEvaluate = Date.now();

    const tasks = ma_dk.map(
      (maDK) => () =>
        fetchAndEvaluate(
          { maDK, maKhoaHoc: ma_khoa_hoc },
          { ngaybatdau, endDate, signal: abortController.signal },
          studentCheckMap,
        ),
    );

    const results = await withConcurrencyLimit(
      tasks,
      CONCURRENCY,
      abortController.signal,
    );

    mark("fetchAndEvaluate all ma_dk", tEvaluate);

    const passList = results.filter((r) => r?.status === "pass");
    const failList = results.filter((r) => r?.status === "fail");
    const noDataList = results.filter((r) => r?.status === "no_data");
    const errorList = results.filter((r) => r?.status === "error");

    const thoiGianXuLyMs = Date.now() - startTime;
    const wasAborted = abortController.signal.aborted;

    const summary = {
      tongSoHocVien: results.length,
      daKiemTra: passList.length + failList.length,
      pass: passList.length,
      fail: failList.length,
      noData: noDataList.length,
      error: errorList.length,
      thoiGianXuLyMs,
      ...(wasAborted && { warning: "Kết quả không đầy đủ do timeout tổng" }),
    };

    return res.json({
      success: true,
      summary,
      data: [...failList, ...noDataList],
      debugErrors: errorList
        .slice(0, 8)
        .map((e) => ({ maDK: e.maDK, message: e.message })),
    });
  } catch (err) {
    console.error("[kiemTraToanKhoa]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

module.exports = { kiemTraToanKhoa };
