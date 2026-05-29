const XLSX = require("xlsx");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { default: axios } = require("axios");
const { URL_DAT } = require("../constants/base");
const {
  getHanhTrinhToken2,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");

// ─── helpers ────────────────────────────────────────────────────────────────

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value === "string") {
    const parts = value.trim().split("/");
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return new Date(value);
  }
  return null;
}

// Column index mapping (theo thứ tự cột trong file Excel)
const COL = {
  STT: 0, // A
  MA_DANG_KY: 1, // B
  KHOA: 2, // C
  HO_VA_TEN: 3, // D
  NGAY_SINH: 4, // E
  GIOI_TINH: 5, // F
  SO_CMND: 7, // H
  DIA_CHI: 8, // I
  NGAY_NHAP: 10, // K
  GIAO_VIEN: 11, // L
  XE_B2: 12, // M
  XE_B1: 13, // N
  GHI_CHU: 14, // O
};

// ─── controllers ────────────────────────────────────────────────────────────

exports.importFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Không có file." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: "File trống." });
    }

    const pool = await connectSQL();
    let insertedCount = 0;
    let modifiedCount = 0;

    const validRows = rows
      .slice(1)
      .filter((row) => row[COL.MA_DANG_KY] || row[COL.HO_VA_TEN]);

    for (const row of validRows) {
      const maDangKy = String(row[COL.MA_DANG_KY] || "").trim();
      if (!maDangKy) continue;

      const stt = row[COL.STT] ? Number(row[COL.STT]) : null;
      const khoaHoc = String(row[COL.KHOA] || "").trim();
      const hoVaTen = String(row[COL.HO_VA_TEN] || "").trim();
      const ngaySinh = parseExcelDate(row[COL.NGAY_SINH]);
      const gioiTinh = String(row[COL.GIOI_TINH] || "").trim();
      const soCMND = String(row[COL.SO_CMND] || "").trim();
      const diaChiThuongTru = String(row[COL.DIA_CHI] || "").trim();
      const ngayNhap = parseExcelDate(row[COL.NGAY_NHAP]);
      const giaoVien = String(row[COL.GIAO_VIEN] || "").trim();
      const xeB2 = String(row[COL.XE_B2] || "").trim();
      const xeB1 = String(row[COL.XE_B1] || "").trim();
      const ghiChu = String(row[COL.GHI_CHU] || "").trim();

      const request = pool.request();
      request.input("stt", mssql.Int, stt);
      request.input("maDangKy", mssql.VarChar, maDangKy);
      request.input("khoaHoc", mssql.NVarChar, khoaHoc);
      request.input("hoVaTen", mssql.NVarChar, hoVaTen);
      request.input("ngaySinh", mssql.Date, ngaySinh);
      request.input("gioiTinh", mssql.NVarChar, gioiTinh);
      request.input("soCMND", mssql.VarChar, soCMND);
      request.input("diaChiThuongTru", mssql.NVarChar, diaChiThuongTru);
      request.input("ngayNhap", mssql.Date, ngayNhap);
      request.input("giaoVien", mssql.NVarChar, giaoVien);
      request.input("xeB2", mssql.NVarChar, xeB2);
      request.input("xeB1", mssql.NVarChar, xeB1);
      request.input("ghiChu", mssql.NVarChar, ghiChu);

      const result = await request.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[check_data_students] WHERE ma_dang_ky = @maDangKy)
        BEGIN
          UPDATE [dbo].[check_data_students]
          SET stt = @stt,
              khoa_hoc = @khoaHoc,
              ho_va_ten = @hoVaTen,
              ngay_sinh = @ngaySinh,
              gioi_tinh = @gioiTinh,
              so_cmnd = @soCMND,
              dia_chi_thuong_tru = @diaChiThuongTru,
              ngay_nhap = @ngayNhap,
              giao_vien = @giaoVien,
              xe_b2 = @xeB2,
              xe_b1 = @xeB1,
              ghi_chu = @ghiChu,
              updated_at = GETDATE()
          WHERE ma_dang_ky = @maDangKy;
          SELECT 'UPDATE' AS action;
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[check_data_students] (stt, ma_dang_ky, khoa_hoc, ho_va_ten, ngay_sinh, gioi_tinh, so_cmnd, dia_chi_thuong_tru, ngay_nhap, giao_vien, xe_b2, xe_b1, ghi_chu, created_at, updated_at)
          VALUES (@stt, @maDangKy, @khoaHoc, @hoVaTen, @ngaySinh, @gioiTinh, @soCMND, @diaChiThuongTru, @ngayNhap, @giaoVien, @xeB2, @xeB1, @ghiChu, GETDATE(), GETDATE());
          SELECT 'INSERT' AS action;
        END
      `);

      if (result.recordset[0]?.action === "INSERT") {
        insertedCount++;
      } else {
        modifiedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Xử lý file thành công.",
      details: {
        totalProcessed: validRows.length,
        insertedCount,
        modifiedCount,
      },
    });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({
      success: false,
      message: "Import thất bại.",
      error: error.message,
    });
  }
};

exports.getCheckStudents = async (req, res) => {
  try {
    const { khoa, giaoVien, search } = req.query;
    const pool = await connectSQL();
    const request = pool.request();

    let query = `
      SELECT stt, ma_dang_ky AS maDangKy, khoa_hoc AS khoaHoc, ho_va_ten AS hoVaTen, 
             ngay_sinh AS ngaySinh, gioi_tinh AS gioiTinh, so_cmnd AS soCMND, 
             dia_chi_thuong_tru AS diaChiThuongTru, ngay_nhap AS ngayNhap, 
             giao_vien AS giaoVien, xe_b2 AS xeB2, xe_b1 AS xeB1, ghi_chu AS ghiChu, 
             created_at AS createdAt, updated_at AS updatedAt
      FROM [dbo].[check_data_students]
      WHERE 1=1
    `;

    if (khoa) {
      request.input("khoa", mssql.NVarChar, khoa);
      query += ` AND khoa_hoc = @khoa`;
    }

    if (giaoVien) {
      request.input("giaoVien", mssql.NVarChar, giaoVien.trim());
      query += ` AND giao_vien = @giaoVien`;
    }

    if (search) {
      // Tách search thành Unicode (ho_va_ten) và Ansi (ma_dang_ky, so_cmnd) để tránh Implicit Type Conversion
      request.input("searchUnicode", mssql.NVarChar, `%${search}%`);
      request.input("searchAnsi", mssql.VarChar, `%${search}%`);
      query += ` AND (ho_va_ten LIKE @searchUnicode OR ma_dang_ky LIKE @searchAnsi OR so_cmnd LIKE @searchAnsi)`;
    }

    query += ` ORDER BY stt ASC`;

    const result = await request.query(query);

    return res.json({
      success: true,
      total: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({
      success: false,
      message: "Lấy dữ liệu thất bại.",
      error: error.message,
    });
  }
};

exports.getGiaoVienByKhoa = async (req, res) => {
  try {
    const { khoa } = req.query;
    const pool = await connectSQL();
    const request = pool.request();

    let query = `SELECT DISTINCT giao_vien FROM [dbo].[check_data_students] WHERE 1=1`;

    if (khoa) {
      request.input("khoa", mssql.NVarChar, khoa);
      query += ` AND khoa_hoc = @khoa`;
    }

    const result = await request.query(query);
    const list = result.recordset.map(row => row.giao_vien).filter(Boolean);

    return res.json({
      success: true,
      data: list.sort(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkDuplicateSessions = async function (req, res) {
  try {
    const { ma_dk_list, ngaybatdau = "2020-01-01", ngayketthuc } = req.body;

    if (!Array.isArray(ma_dk_list) || ma_dk_list.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ma_dk_list phải là mảng không rỗng",
      });
    }

    const endDate = ngayketthuc || new Date().toISOString().slice(0, 19);
    const { token } = await getHanhTrinhToken2();

    // 1. Gọi API hành trình cho từng ma_dk
    const allSessions = [];

    await Promise.all(
      ma_dk_list.map(async (ma_dk) => {
        try {
          const response = await axios.get(`${URL_DAT}/api/HanhTrinh`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              ngaybatdau,
              ngayketthuc: endDate,
              ten: ma_dk,
              limit: 500,
              page: 1,
            },
          });

          const sessions = response.data?.Data || [];

          sessions.forEach((s) => {
            if (s.ThoiDiemDangNhap && s.ThoiDiemDangXuat) {
              allSessions.push({
                ma_dk,
                id: s.ID,
                bienSo: s.BienSo,
                hoTenGV: s.HoTenGV,
                dangNhap: new Date(s.ThoiDiemDangNhap),
                dangXuat: new Date(s.ThoiDiemDangXuat),
                dangNhapStr: s.ThoiDiemDangNhap,
                dangXuatStr: s.ThoiDiemDangXuat,
                khoaHoc: s.KhoaHoc,
              });
            }
          });
        } catch (err) {
          if (err.response?.status === 401) {
            invalidateHanhTrinhToken();
          }
          console.error(`[checkDuplicate] Lỗi ma_dk=${ma_dk}:`, err.message);
        }
      }),
    );

    // 2. Tìm các cặp phiên cùng giáo viên bị overlap thời gian
    const conflicts = [];

    for (let i = 0; i < allSessions.length; i++) {
      for (let j = i + 1; j < allSessions.length; j++) {
        const a = allSessions[i];
        const b = allSessions[j];

        if (a.id === b.id) continue;
        if (a.ma_dk === b.ma_dk) continue; // cùng học viên thì bỏ qua

        const isOverlap = a.dangNhap < b.dangXuat && a.dangXuat > b.dangNhap;
        if (!isOverlap) continue;

        const sameGV =
          a.hoTenGV && b.hoTenGV && a.hoTenGV.trim() === b.hoTenGV.trim();
        if (!sameGV) continue;

        conflicts.push({
          giaoVien: a.hoTenGV,
          phien_1: {
            id: a.id,
            ma_dk: a.ma_dk,
            khoaHoc: a.khoaHoc,
            bienSo: a.bienSo,
            dangNhap: a.dangNhapStr,
            dangXuat: a.dangXuatStr,
          },
          phien_2: {
            id: b.id,
            ma_dk: b.ma_dk,
            khoaHoc: b.khoaHoc,
            bienSo: b.bienSo,
            dangNhap: b.dangNhapStr,
            dangXuat: b.dangXuatStr,
          },
        });
      }
    }

    return res.json({
      success: true,
      tong_phien: allSessions.length,
      tong_conflict: conflicts.length,
      conflicts,
    });
  } catch (err) {
    console.error("[checkDuplicateSessions]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
