const axios = require("axios");
const http = require("http");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");

const {
  computeSummary,
  evaluate,
  getInvalidSessionIndexes,
  setSystemConfig,
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
    const pool = await connectSQL();
    const [checkResult, regResult] = await Promise.all([
      pool.request().query(`
        SELECT stt, ma_dang_ky AS maDangKy, khoa_hoc AS khoaHoc, ho_va_ten AS hoVaTen, 
               ngay_sinh AS ngaySinh, gioi_tinh AS gioiTinh, so_cmnd AS soCMND, 
               dia_chi_thuong_tru AS diaChiThuongTru, ngay_nhap AS ngayNhap, 
               giao_vien AS giaoVien, xe_b2 AS xeB2, xe_b1 AS xeB1, ghi_chu AS ghiChu, 
               created_at AS createdAt, updated_at AS updatedAt
        FROM [dbo].[check_data_students] WITH (NOLOCK)
      `),
      pool.request().query(`
        SELECT stt, ma_dk AS maDangKy, khoa AS khoaHoc, ho_ten AS hoVaTen, 
               ngay_sinh AS ngaySinh, gioi_tinh AS gioiTinh, cccd AS soCMND, 
               dia_chi AS diaChiThuongTru, ngay_nhap AS ngayNhap, 
               giao_vien AS giaoVien, xe_b2 AS xeB2, xe_b1 AS xeB1, ghi_chu AS ghiChu, 
               created_at AS createdAt, updated_at AS updatedAt
        FROM [dbo].[dang_ky_xe_gv] WITH (NOLOCK)
      `)
    ]);

    const checkList = checkResult.recordset || [];
    const regList = regResult.recordset || [];

    const map = new Map();
    regList.forEach(item => {
      if (item.maDangKy) {
        map.set(item.maDangKy, item);
      }
    });
    checkList.forEach(item => {
      if (item.maDangKy) {
        map.set(item.maDangKy, item);
      }
    });

    const list = Array.from(map.values());
    _studentCheckCache = { ts: now, data: list };
    return list;
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

function buildStatusMap(phienHocList = []) {
  const statusMap = {};
  
  const formatDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatTime = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${sec}`;
  };

  const normalizePlateStr = (plate) => {
    if (!plate) return "";
    return plate.replace(/[-.\s]/g, "").toUpperCase().trim();
  };

  phienHocList.forEach((row) => {
    const status = row.trang_thai;
    if (status !== "DUYET" && status !== "HUY") return;

    const sessionId = row.phien_hoc_id || row.id;
    if (sessionId) {
      statusMap[`id:${sessionId}`] = { status };
    }

    const date = formatDate(row.ngay || row.gio_tu);
    const startTime = formatTime(row.gio_tu);
    const endTime = formatTime(row.gio_den);
    const plate = normalizePlateStr(row.bien_so_xe);

    if (date && plate && startTime && endTime) {
      statusMap[`slot:${date}|${plate}|${startTime}|${endTime}`] = { status };
    }
    if (date && startTime && endTime) {
      statusMap[`time:${date}|${startTime}|${endTime}`] = { status };
    }
  });

  return statusMap;
}

// ─── Core Fetch & Evaluate ─────────────────────────────────────
async function fetchAndEvaluate(
  { maDK, maKhoaHoc },
  { ngaybatdau, endDate, signal },
  studentCheckMap,
  statusMap = {},
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
      statusMap,
    ),
  );
}

async function _fetchRaw(
  { maDK, maKhoaHoc },
  { ngaybatdau, endDate, signal },
  studentCheckMap,
  cacheKey,
  statusMap = {},
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
    const summary = computeSummary(dataSource, hangDaoTao, studentInfo, [], [], statusMap);

    const evalResult = evaluate(summary, dataSource, [], studentInfo, [], statusMap);
    const { invalidIndexes, tuDongLoiIndexes, invalidReasons } =
      getInvalidSessionIndexes(dataSource, studentInfo, [], [], statusMap);

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

    const CheckConfigModel = require("../models/checkConfig.model");
    const ForbiddenZoneModel = require("../models/forbiddenZone.model");
    const PhienHocModel = require("../models/phienHocDAT.model");

    // Load student check data, configs, forbidden zones, and phien_hoc_dat
    const [checkDataList, checkConfigs, forbiddenZoneRows, phienHocList] = await Promise.all([
      getAllStudentCheckDataCached(),
      CheckConfigModel.getAll().catch(() => []),
      ForbiddenZoneModel.getAll().catch(() => []),
      PhienHocModel.getPhienHocDATByMaDKList(ma_dk).catch(() => []),
    ]);

    const configMap = {};
    checkConfigs.forEach((cfg) => {
      configMap[cfg.check_key] = {
        enabled: cfg.enabled,
        startDate: cfg.start_date,
        value: cfg.value,
      };
    });
    setSystemConfig(configMap);

    const forbiddenZones = forbiddenZoneRows.filter((z) => z.enabled === true || z.enabled === 1);
    const studentCheckMap = buildStudentCheckMap(checkDataList);

    // Group phien_hoc_dat by ma_dk and build statusMaps
    const phienHocMapByMaDK = new Map();
    phienHocList.forEach((row) => {
      const maDK = row.ma_dk;
      if (!phienHocMapByMaDK.has(maDK)) {
        phienHocMapByMaDK.set(maDK, []);
      }
      phienHocMapByMaDK.get(maDK).push(row);
    });

    const studentStatusMap = new Map();
    ma_dk.forEach((maDK) => {
      const list = phienHocMapByMaDK.get(maDK) || [];
      const statusMap = buildStatusMap(list);
      studentStatusMap.set(maDK, statusMap);
    });

    const tEvaluate = Date.now();

    const tasks = ma_dk.map(
      (maDK) => () =>
        fetchAndEvaluate(
          { maDK, maKhoaHoc: ma_khoa_hoc },
          { ngaybatdau, endDate, signal: abortController.signal },
          studentCheckMap,
          studentStatusMap.get(maDK) || {},
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
