const axios = require("axios");
const http = require("http");
const {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");
const {
  computeSummary,
  evaluate,
  HANG_DAO_TAO_CONFIG,
} = require("../utils/evaluate");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";
const LOCAL_BASE = "http://192.168.1.69:8000";

const hanhTrinhAxios = axios.create({
  baseURL: HANH_TRINH_BASE,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 5 }),
  timeout: 15000,
});

// ─── Token ────────────────────────────────────────────────────────────────────
let _tokenPromise = null;

async function getCachedToken() {
  if (!_tokenPromise) {
    _tokenPromise = getHanhTrinhToken().catch((err) => {
      _tokenPromise = null;
      throw err;
    });
  }
  return _tokenPromise;
}

function invalidateCachedToken() {
  _tokenPromise = null;
  invalidateHanhTrinhToken();
}

// ─── Retry ────────────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, baseDelayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.response?.status === 401) throw err;
      const isRetryable =
        !err?.response?.status ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.response?.status >= 500;
      if (!isRetryable || attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── Lấy studentInfo từ check-data-student ────────────────────────────────────
async function getStudentInfo(maDK) {
  try {
    const { data } = await axios.get(`${LOCAL_BASE}/api/check-data-student`);
    const list = Array.isArray(data?.data || data?.result || data)
      ? data?.data || data?.result || data
      : [];
    return list.find((s) => s.maDangKy === maDK) || null;
  } catch (err) {
    console.warn(
      "[getStudentInfo] Không lấy được check-data-student:",
      err.message,
    );
    return null;
  }
}

// ─── isDuDieuKienToiThieu ─────────────────────────────────────────────────────
function isDuDieuKienToiThieu(summary, hangDaoTao) {
  const cfg = HANG_DAO_TAO_CONFIG[hangDaoTao] || HANG_DAO_TAO_CONFIG["B.01"];
  return (
    summary.tongThoiGianGio >= cfg.thoiGian.tong &&
    summary.tongQuangDuong >= cfg.quangDuong.tong
  );
}

// ─── Controller ───────────────────────────────────────────────────────────────
async function evaluateOne(req, res) {
  const {
    ma_dk,
    ma_khoa_hoc,
    ngaybatdau = "2020-01-01",
    ngayketthuc,
  } = req.body;

  if (!ma_dk || !ma_khoa_hoc) {
    return res.status(400).json({
      success: false,
      message: "Thiếu ma_dk hoặc ma_khoa_hoc",
    });
  }

  const endDate = ngayketthuc || new Date().toISOString().slice(0, 19);

  try {
    // 1. Lấy token
    const { token } = await getCachedToken();

    // 2. Gọi API hành trình
    const params = new URLSearchParams({
      ngaybatdau,
      ngayketthuc: endDate,
      ten: ma_dk,
      makhoahoc: ma_khoa_hoc,
      limit: 20,
      page: 1,
    });

    let response;
    try {
      response = await withRetry(async () => {
        const { token: t } = await getCachedToken();
        return hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
      });
    } catch (err) {
      if (err?.response?.status === 401) invalidateCachedToken();
      return res.status(502).json({
        success: false,
        message: "Lỗi khi gọi API hành trình",
        detail: err.message,
        errorCode: err.code,
        httpStatus: err.response?.status || null,
      });
    }

    const dataSource = response.data?.Data || [];

    // 3. Không có dữ liệu
    if (!dataSource.length) {
      return res.json({
        success: true,
        ma_dk,
        ma_khoa_hoc,
        status: "no_data",
        message: "Không có phiên học nào trong khoảng thời gian này",
        totalSessions: 0,
        rawData: [],
      });
    }

    // 4. Tính summary
    const hangDaoTao = dataSource[0]?.HangDaoTao || "B.01";
    const summary = computeSummary(dataSource, hangDaoTao);

    // 5. Lấy studentInfo để check GV + xe
    const studentInfo = await getStudentInfo(ma_dk);

    // 6. Evaluate
    const evalResult = evaluate(summary, dataSource, studentInfo);

    // 7. Trả về đầy đủ thông tin để debug
    const cfg = HANG_DAO_TAO_CONFIG[hangDaoTao] || HANG_DAO_TAO_CONFIG["B.01"];

    return res.json({
      success: true,
      ma_dk,
      ma_khoa_hoc,
      name: studentInfo?.hoVaTen,
      hangDaoTao,
      status: evalResult.status,
      duDieuKienToiThieu: isDuDieuKienToiThieu(summary, hangDaoTao),
      totalSessions: dataSource.length,
      studentInfo: studentInfo
        ? {
            giaoVien: studentInfo.giaoVien,
            xeB1: studentInfo.xeB1,
            xeB2: studentInfo.xeB2,
          }
        : null,
      yeuCau: {
        thoiGian: cfg.thoiGian,
        quangDuong: cfg.quangDuong,
      },
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
        tongThoiGianLoiGio: +summary.tongThoiGianLoiGio.toFixed(2),
        tongQuangDuongLoi: +summary.tongQuangDuongLoi.toFixed(2),
      },
      errors: evalResult.errors,
      warnings: evalResult.warnings,
      // Danh sách phiên raw để debug từng phiên
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
      })),
    });
  } catch (err) {
    console.error("[evaluateOne]", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = { evaluateOne };
