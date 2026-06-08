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
  HANG_DAO_TAO_CONFIG,
  setSystemConfig,
  getInvalidSessionIndexes,
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
    const pool = await connectSQL();
    let result = await pool.request()
      .input("maDangKy", mssql.VarChar, maDK)
      .query(`
        SELECT TOP 1 stt, ma_dang_ky AS maDangKy, khoa_hoc AS khoaHoc, ho_va_ten AS hoVaTen, 
               ngay_sinh AS ngaySinh, gioi_tinh AS gioiTinh, so_cmnd AS soCMND, 
               dia_chi_thuong_tru AS diaChiThuongTru, ngay_nhap AS ngayNhap, 
               giao_vien AS giaoVien, xe_b2 AS xeB2, xe_b1 AS xeB1, ghi_chu AS ghiChu, 
               created_at AS createdAt, updated_at AS updatedAt
        FROM [dbo].[check_data_students] WITH (NOLOCK)
        WHERE ma_dang_ky = @maDangKy
      `);
    if (result.recordset && result.recordset.length > 0) {
      return result.recordset[0];
    }

    result = await pool.request()
      .input("maDK", mssql.VarChar, maDK)
      .query(`
        SELECT TOP 1 stt, ma_dk AS maDangKy, khoa AS khoaHoc, ho_ten AS hoVaTen, 
               ngay_sinh AS ngaySinh, gioi_tinh AS gioiTinh, cccd AS soCMND, 
               dia_chi AS diaChiThuongTru, ngay_nhap AS ngayNhap, 
               giao_vien AS giaoVien, xe_b2 AS xeB2, xe_b1 AS xeB1, ghi_chu AS ghiChu, 
               created_at AS createdAt, updated_at AS updatedAt
        FROM [dbo].[dang_ky_xe_gv] WITH (NOLOCK)
        WHERE ma_dk = @maDK
      `);
    return result.recordset[0] || null;
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
    summary.tongThoiGianChuaLoaiGio >= cfg.thoiGian.tong &&
    summary.tongQuangDuongChuaLoai >= cfg.quangDuong.tong
  );
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
    const pool = await connectSQL();

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

    // Fetch configs, forbidden zones, and phien_hoc_dat records in parallel
    const [checkConfigs, forbiddenZoneRows, phienHocList, studentInfo] = await Promise.all([
      pool.request().query(`
        SELECT check_key, enabled, start_date, value
        FROM check_configs
      `).then(r => r.recordset.map(row => {
        let val = row.value;
        if (val !== null && val !== undefined) {
          try {
            val = JSON.parse(val);
          } catch (e) {
            if (!isNaN(val) && String(val).trim() !== "") {
              val = Number(val);
            }
          }
        }
        return { ...row, value: val };
      })).catch(() => []),
      pool.request().query(`
        SELECT name, lat, lng, radius_m, enabled
        FROM forbidden_zones
      `).then(r => r.recordset).catch(() => []),
      pool.request()
        .input("ma_dk", mssql.VarChar, ma_dk)
        .query(`
          SELECT phien_hoc_id, id, ngay, gio_tu, gio_den, bien_so_xe, trang_thai
          FROM phien_hoc_dat
          WHERE ma_dk = @ma_dk
        `).then(r => r.recordset).catch(() => []),
      getStudentInfo(ma_dk)
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
    const statusMap = buildStatusMap(phienHocList);

    // 4. Tính summary
    const hangDaoTao = dataSource[0]?.HangDaoTao || "B.01";
    const summary = computeSummary(dataSource, hangDaoTao, studentInfo, [], [], statusMap);

    // 6. Evaluate
    const evalResult = evaluate(summary, dataSource, [], studentInfo, [], statusMap);
    const { invalidIndexes, tuDongLoiIndexes, invalidReasons } =
      getInvalidSessionIndexes(dataSource, studentInfo, [], [], statusMap);

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
        isValid: !invalidIndexes.has(idx),
        isTuDongLoi: tuDongLoiIndexes.has(idx),
        sessionErrors: (invalidReasons.get(idx) || []).map((msg) => ({
          message: msg,
        })),
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
