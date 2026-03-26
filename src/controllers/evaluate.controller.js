const axios = require("axios");
const http = require("http");
const {
  callWithRetry,
  getHocVienTheoKhoa,
} = require("../services/lotusApi.service");
const {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");
const {
  computeSummary,
  evaluate,
  HANG_DAO_TAO_CONFIG,
  getInvalidSessionIndexes,
} = require("../utils/evaluate");
const { LOCAL_BASE } = require("../constants/base");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";

const CACHE_TTL_MS = 5 * 60 * 1000;
const STUDENT_CHECK_TTL_MS = 5 * 60 * 1000;
const MEMBERS_TTL_MS = 5 * 60 * 1000;

const CONCURRENCY = Number(process.env.HANH_TRINH_CONCURRENCY || 8);

// ─── Helper lấy avatar + năm sinh ────────────────────────────────────────────
function extractAvatarAndDob(student) {
  const avatar = student?.user?.avatar || student?.user?.default_avatar || null;
  const namSinh =
    student?.user?.birth_year ||
    (student?.user?.birthday
      ? new Date(student.user.birthday * 1000).getFullYear()
      : null);
  return { avatar, namSinh };
}

// ─── Token cache — chống thundering herd ─────────────────────────────────────
let _tokenPromise = null;
let _tokenExpiresAt = 0;
let _tokenLastFailedAt = 0;

const TOKEN_RETRY_DELAY_MS = 3000;

async function getCachedToken() {
  if (_tokenPromise && Date.now() > _tokenExpiresAt - 30_000) {
    _tokenPromise = null;
  }
  if (!_tokenPromise) {
    _tokenPromise = getHanhTrinhToken()
      .then((result) => {
        if (!result || typeof result !== "object" || !result.token) {
          throw new Error("Khong lay duoc token HanhTrinh hop le");
        }
        const ttl = (result.expires_in || 600) * 1000;
        _tokenExpiresAt = Date.now() + ttl;
        _tokenLastFailedAt = 0;
        return result;
      })
      .catch((err) => {
        _tokenPromise = null;
        _tokenExpiresAt = 0;
        _tokenLastFailedAt = Date.now();
        throw err;
      });
  }
  return _tokenPromise;
}

async function getValidToken() {
  if (Date.now() - _tokenLastFailedAt < TOKEN_RETRY_DELAY_MS) {
    throw new Error(
      "Dang nhap HanhTrinh dang loi, vui long thu lai sau vai giay",
    );
  }

  const result = await getCachedToken();
  if (!result?.token) {
    throw new Error("Khong lay duoc token HanhTrinh hop le");
  }

  return result.token;
}

function invalidateCachedToken() {
  _tokenPromise = null;
  _tokenExpiresAt = 0;
  _tokenLastFailedAt = 0;
  invalidateHanhTrinhToken();
}

// ─── HTTP Agent ───────────────────────────────────────────────────────────────
const hanhTrinhAxios = axios.create({
  baseURL: HANH_TRINH_BASE,
  httpAgent: new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 80,
    maxFreeSockets: 20,
    timeout: 15000,
    scheduling: "lifo",
  }),
  timeout: 10000,
});

// ─── In-flight dedup ──────────────────────────────────────────────────────────
const _inFlight = new Map();

function dedupFetch(key, fn) {
  if (_inFlight.has(key)) return _inFlight.get(key);
  const p = fn().finally(() => _inFlight.delete(key));
  _inFlight.set(key, p);
  return p;
}

// ─── Result cache ─────────────────────────────────────────────────────────────
const _resultCache = new Map();

function getCached(key) {
  const entry = _resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _resultCache.delete(key);
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

// ─── Cache check-data-student ─────────────────────────────────────────────────
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

// ─── Cache members per plan ───────────────────────────────────────────────────
const _membersCache = new Map();

async function getMembersPerPlanCached(planIid) {
  const cached = _membersCache.get(planIid);
  if (cached && Date.now() - cached.ts < MEMBERS_TTL_MS) return cached.data;

  const data = await callWithRetry((auth) =>
    getHocVienTheoKhoa(planIid, {}, auth),
  );

  const members = Array.isArray(data?.result) ? data.result : [];

  if (members.length > 0) {
    _membersCache.set(planIid, { ts: Date.now(), data: members });
  }

  return members;
}

setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of _membersCache) {
      if (now - v.ts > MEMBERS_TTL_MS) _membersCache.delete(k);
    }
  },
  10 * 60 * 1000,
).unref();

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, baseDelayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isCanceled =
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.message === "canceled";
      if (isCanceled) throw err;

      const isRetryable =
        !err?.response?.status ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.response?.status === 429 ||
        err.response?.status >= 500;

      if (!isRetryable || attempt === retries) throw err;
      if (err?.response?.status === 401) throw err;

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      console.warn(
        `[withRetry] attempt ${attempt + 1}/${retries} failed (${err.message}), retry in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isDuDieuKienToiThieu(summary, hangDaoTao) {
  const cfg = HANG_DAO_TAO_CONFIG[hangDaoTao] || HANG_DAO_TAO_CONFIG["B.01"];
  return (
    summary.tongThoiGianChuaLoaiGio >= cfg.thoiGian.tong &&
    summary.tongQuangDuongChuaLoai >= cfg.quangDuong.tong
  );
}

// ─── formatErrorSummary — gộp cả errors lẫn warnings quan trọng ──────────────
function formatErrorSummary(allErrors, allWarnings = []) {
  const parts = [];

  // ── Phần errors: gộp nhóm thiếu giờ/km ──
  if (allErrors.length) {
    const knownErrorLabels = new Set([
      "Tổng thời lượng",
      "Tổng quãng đường",
      "Thời gian ban đêm",
      "Quãng đường ban đêm",
      "Thời gian số tự động",
      "Quãng đường số tự động",
    ]);

    const groups = [];
    if (
      allErrors.some(
        (e) => e.label === "Tổng thời lượng" || e.label === "Tổng quãng đường",
      )
    )
      groups.push("tổng");
    if (
      allErrors.some(
        (e) =>
          e.label === "Thời gian ban đêm" || e.label === "Quãng đường ban đêm",
      )
    )
      groups.push("ban đêm");
    if (
      allErrors.some(
        (e) =>
          e.label === "Thời gian số tự động" ||
          e.label === "Quãng đường số tự động",
      )
    )
      groups.push("số tự động");

    if (groups.length)
      parts.push(`Thiếu quãng đường/thời gian ${groups.join(", ")}`);

    allErrors
      .filter((e) => !knownErrorLabels.has(e.label))
      .forEach((e) => parts.push(e.label || e.message));
  }

  // ── Phần warnings: map label → text hiển thị gọn ──
  // Các label được gộp thành 1 cụm (value = text hiển thị, null = dùng label gốc)
  const warnLabelMap = {
    // Sai xe
    "Sai biển số xe": "sai xe",
    "Thiếu phiên xe B1": "thiếu phiên xe B1",
    "Thiếu phiên xe B2": "thiếu phiên xe B2",
    "Không có thông tin xe": "không có thông tin xe",

    // Sai giáo viên
    "Sai tên giáo viên": "sai giáo viên",
    "Sai giáo viên đăng ký": "sai giáo viên",

    // Tốc độ thấp
    "Tốc độ trung bình phiên": "Có phiên tốc độ thấp",

    // Xe tự động sai giờ (3 label → 1 cụm)
    "Xe tự động chạy sai giờ phiên sáng": "xe tự động sai giờ",
    "Xe tự động chạy sai giờ phiên chiều": "xe tự động sai giờ",
    "Xe tự động chạy ngoài giờ cho phép": "xe tự động sai giờ",

    // Nghỉ giữa phiên
    "Thời gian nghỉ giữa phiên": "nghỉ giữa phiên < 15 phút",

    // Phiên quá ngắn
    "Phiên học quá ngắn": "có phiên học < 5 phút",
  };

  const addedWarnDisplay = new Set();
  allWarnings.forEach((w) => {
    if (!(w.label in warnLabelMap)) return;
    const display = warnLabelMap[w.label]; // Luôn có value, không null
    if (addedWarnDisplay.has(display)) return; // Gộp trùng
    addedWarnDisplay.add(display);
    parts.push(display);
  });

  return parts.length ? parts.join(", ") : null;
}

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

// ─── Concurrency limiter với abort ────────────────────────────────────────────
function withConcurrencyLimit(tasks, limit, signal) {
  return new Promise((resolve) => {
    const results = new Array(tasks.length);
    let started = 0;
    let completed = 0;

    if (!tasks.length) return resolve(results);

    function finishOne(index, result) {
      results[index] = result;
      completed += 1;
      if (completed === tasks.length) resolve(results);
      else runNext();
    }

    function runNext() {
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
    }

    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
      runNext();
    }
  });
}

// ─── Core fetch & evaluate ────────────────────────────────────────────────────
async function fetchAndEvaluate(
  { maDK, maKhoaHoc, planIid, student },
  { ngaybatdau, endDate, signal },
  studentCheckMap,
) {
  const cacheKey = `${maDK}::${maKhoaHoc}::${ngaybatdau}::${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  return dedupFetch(cacheKey, () =>
    _fetchRaw(
      { maDK, maKhoaHoc, planIid, student },
      { ngaybatdau, endDate, signal },
      studentCheckMap,
      cacheKey,
    ),
  );
}

async function _fetchRaw(
  { maDK, maKhoaHoc, planIid, student },
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
      limit: 20,
      page: 1,
    });

    const response = await withRetry(
      async () => {
        const token = await getValidToken();
        return hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
      },
      3,
      300,
    );

    const dataSource = response.data?.Data || [];

    const hoTen =
      student?.user?.name ||
      student?.name ||
      studentCheckMap.get(maDK)?.hoVaTen ||
      null;

    const { avatar, namSinh } = extractAvatarAndDob(student);

    // ── Không có dữ liệu ──
    if (!dataSource.length) {
      return setAndReturn(cacheKey, {
        maDK,
        maKhoaHoc,
        planIid,
        hoTen,
        avatar,
        namSinh,
        hangDaoTao: "B.01",
        status: "no_data",
        message: "Chưa có thông tin phiên học",
        totalSessions: 0,
        summary: null,
        studentInfo: null,
        errors: [],
        warnings: [],
      });
    }

    const hangDaoTao = dataSource[0]?.HangDaoTao || "B.01";
    const studentInfo = studentCheckMap.get(maDK) || null;
    const summary = computeSummary(dataSource, hangDaoTao, studentInfo);

    // ── Kiểm tra điều kiện tối thiểu ──
    if (!isDuDieuKienToiThieu(summary, hangDaoTao)) {
      const cfg =
        HANG_DAO_TAO_CONFIG[hangDaoTao] || HANG_DAO_TAO_CONFIG["B.01"];
      return setAndReturn(cacheKey, {
        maDK,
        maKhoaHoc,
        planIid,
        hoTen,
        avatar,
        namSinh,
        hangDaoTao,
        status: "chua_hoan_thanh",
        message: `Chưa đủ điều kiện tối thiểu (tổng giờ: ${summary.tongThoiGianGio.toFixed(2)}h / yêu cầu ${cfg.thoiGian.tong}h, tổng km: ${summary.tongQuangDuong.toFixed(2)} / yêu cầu ${cfg.quangDuong.tong}km)`,
        totalSessions: dataSource.length,
        summary: {
          tongThoiGianGio: +summary.tongThoiGianGio.toFixed(2),
          tongQuangDuong: +summary.tongQuangDuong.toFixed(2),
          yeuCauThoiGianGio: cfg.thoiGian.tong,
          yeuCauQuangDuong: cfg.quangDuong.tong,
        },
        studentInfo: studentInfo
          ? {
              giaoVien: studentInfo.giaoVien,
              xeB1: studentInfo.xeB1,
              xeB2: studentInfo.xeB2,
              khoaHoc: studentInfo.khoaHoc,
            }
          : null,
        errors: [],
        warnings: [],
      });
    }

    // ── Evaluate ──
    const evalResult = evaluate(summary, dataSource, studentInfo);
    const { invalidIndexes, tuDongLoiIndexes, invalidReasons } =
      getInvalidSessionIndexes(dataSource, studentInfo);

    return setAndReturn(cacheKey, {
      maDK,
      maKhoaHoc,
      planIid,
      hoTen,
      avatar,
      namSinh,
      hangDaoTao,
      giaoVien: dataSource[0]?.HoTenGV || null,
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
      // ── errorSummary giờ bao gồm cả warnings quan trọng ──
      errorSummary: formatErrorSummary(evalResult.errors, evalResult.warnings),
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

    if (
      err?.name === "CanceledError" ||
      err?.code === "ERR_CANCELED" ||
      err?.message === "canceled"
    ) {
      return {
        maDK,
        maKhoaHoc,
        planIid,
        status: "error",
        message: "Aborted by timeout",
      };
    }

    if (err?.response?.status === 401) {
      return {
        maDK,
        maKhoaHoc,
        planIid,
        status: "error",
        message: "Token HanhTrinh khong hop le hoac da het han",
      };
    }

    if (err?.message?.toLowerCase().includes("dang nhap hanhtrinh")) {
      return {
        maDK,
        maKhoaHoc,
        planIid,
        status: "error",
        message: err.message,
      };
    }

    return { maDK, maKhoaHoc, planIid, status: "error", message: err.message };
  }
}

// ─── Main controller ──────────────────────────────────────────────────────────
async function evaluateHanhTrinh(req, res) {
  const startTime = Date.now();

  const TOTAL_TIMEOUT_MS = Number(req.body.timeoutMs) || 90_000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    TOTAL_TIMEOUT_MS,
  );

  try {
    let {
      enrolmentPlanIids,
      ngaybatdau = "2020-01-01",
      ngayketthuc,
      maKhoaHoc,
    } = req.body;

    if (!enrolmentPlanIids)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu enrolmentPlanIids" });

    if (!Array.isArray(enrolmentPlanIids))
      enrolmentPlanIids = [enrolmentPlanIids];
    enrolmentPlanIids = enrolmentPlanIids.map(String);

    if (!enrolmentPlanIids.length)
      return res
        .status(400)
        .json({ success: false, message: "enrolmentPlanIids không được rỗng" });

    if (
      !Array.isArray(maKhoaHoc) ||
      maKhoaHoc.length !== enrolmentPlanIids.length
    )
      return res.status(400).json({
        success: false,
        message: "maKhoaHoc phải là mảng có số phần tử bằng enrolmentPlanIids",
      });

    const planToKhoaHocMap = Object.fromEntries(
      enrolmentPlanIids.map((id, i) => [id, maKhoaHoc[i]]),
    );

    const endDate = ngayketthuc || new Date().toISOString().slice(0, 19);

    try {
      await getValidToken();
    } catch (err) {
      console.error("[evaluateHanhTrinh] login/token error:", err.message);
      return res.status(502).json({
        success: false,
        message: "Khong dang nhap duoc API HanhTrinh",
        detail: err.message,
      });
    }

    const tFetchMeta = Date.now();
    const [checkDataList, ...membersPerPlan] = await Promise.all([
      getAllStudentCheckDataCached(),
      ...enrolmentPlanIids.map(async (planIid) => {
        try {
          const members = await getMembersPerPlanCached(planIid);
          return { planIid, members };
        } catch (err) {
          console.error(`[getHocVien] planIid=${planIid}`, err.message);
          return { planIid, members: [] };
        }
      }),
    ]);
    mark("load checkData + membersPerPlan", tFetchMeta);

    const studentCheckMap = buildStudentCheckMap(checkDataList);

    const tBuildStudents = Date.now();
    const uniqueStudentsMap = new Map();

    membersPerPlan.forEach(({ planIid, members }) => {
      console.log(
        `[getHocVien] planIid=${planIid} => ${members.length} học viên`,
      );
      const mappedMaKhoaHoc = planToKhoaHocMap[planIid];
      members.forEach((m) => {
        const maDK = m?.user?.admission_code;
        if (!maDK) return;
        const uniqueKey = `${maDK}::${mappedMaKhoaHoc}`;
        if (!uniqueStudentsMap.has(uniqueKey)) {
          uniqueStudentsMap.set(uniqueKey, {
            maDK,
            maKhoaHoc: mappedMaKhoaHoc,
            planIid,
            student: m,
          });
        }
      });
    });

    const allStudents = [...uniqueStudentsMap.values()];
    mark("build allStudents", tBuildStudents);

    const tEvaluate = Date.now();
    const results = await withConcurrencyLimit(
      allStudents.map(
        (s) => () =>
          fetchAndEvaluate(
            s,
            { ngaybatdau, endDate, signal: abortController.signal },
            studentCheckMap,
          ),
      ),
      CONCURRENCY,
      abortController.signal,
    );
    mark("fetchAndEvaluate(all students)", tEvaluate);

    const passList = results.filter((r) => r?.status === "pass");
    const failList = results.filter((r) => r?.status === "fail");
    const noDataList = results.filter((r) => r?.status === "no_data");
    const chuaHTList = results.filter((r) => r?.status === "chua_hoan_thanh");
    const errorList = results.filter((r) => r?.status === "error");

    const thoiGianXuLyMs = Date.now() - startTime;
    const wasAborted = abortController.signal.aborted;

    const summary = {
      tongSoHocVien: results.length,
      daKiemTra: passList.length + failList.length,
      pass: passList.length,
      fail: failList.length,
      chuaHoanThanh: chuaHTList.length,
      noData: noDataList.length,
      error: errorList.length,
      thoiGianXuLyMs,
      ...(wasAborted
        ? { warning: "Kết quả không đầy đủ do timeout tổng" }
        : {}),
    };

    return res.json({
      success: true,
      summary,
      data: [...failList, ...chuaHTList],
      debugErrors: errorList
        .slice(0, 5)
        .map((e) => ({ maDK: e.maDK, message: e.message })),
    });
  } catch (err) {
    console.error("[evaluateHanhTrinh]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

module.exports = { evaluateHanhTrinh };
