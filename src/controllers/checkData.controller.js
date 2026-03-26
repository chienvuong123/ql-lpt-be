const XLSX = require("xlsx");
const StudentCheck = require("../models/checkData.model");
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

    // 1. Chuẩn bị mảng các thao tác (Operations)
    const operations = rows
      .slice(1)
      .filter((row) => row[COL.MA_DANG_KY] || row[COL.HO_VA_TEN])
      .map((row) => {
        const studentData = {
          stt: row[COL.STT] || null,
          maDangKy: String(row[COL.MA_DANG_KY] || "").trim(),
          khoaHoc: String(row[COL.KHOA] || "").trim(),
          hoVaTen: String(row[COL.HO_VA_TEN] || "").trim(),
          ngaySinh: parseExcelDate(row[COL.NGAY_SINH]),
          gioiTinh: String(row[COL.GIOI_TINH]),
          soCMND: String(row[COL.SO_CMND] || "").trim(),
          diaChiThuongTru: String(row[COL.DIA_CHI] || "").trim(),
          ngayNhap: parseExcelDate(row[COL.NGAY_NHAP]),
          giaoVien: String(row[COL.GIAO_VIEN] || "").trim(),
          xeB2: String(row[COL.XE_B2] || "").trim(),
          xeB1: String(row[COL.XE_B1] || "").trim(),
          ghiChu: String(row[COL.GHI_CHU] || "").trim(),
        };

        // 2. Định nghĩa logic Upsert:
        // Dùng maDangKy (hoặc soCMND) làm "khóa" để kiểm tra trùng lặp
        return {
          updateOne: {
            filter: { maDangKy: studentData.maDangKy }, // Điều kiện tìm kiếm
            update: { $set: studentData }, // Dữ liệu cập nhật
            upsert: true, // Nếu không thấy thì tạo mới
          },
        };
      });

    if (operations.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Dữ liệu không hợp lệ." });
    }

    // 3. Thực thi tất cả các lệnh trong 1 lần gửi duy nhất tới DB
    const result = await StudentCheck.bulkWrite(operations);

    return res.status(200).json({
      success: true,
      message: "Xử lý file thành công.",
      details: {
        totalProcessed: operations.length,
        insertedCount: result.upsertedCount, // Số lượng bản ghi mới tạo
        modifiedCount: result.modifiedCount, // Số lượng bản ghi cũ được cập nhật
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
    const filter = {};

    // 1. Thiết lập bộ lọc (Giữ nguyên logic của bạn)
    if (khoa) filter.khoaHoc = khoa;
    if (giaoVien) filter.giaoVien = giaoVien.trim();
    if (search) {
      filter.$or = [
        { hoVaTen: new RegExp(search, "i") },
        { maDangKy: new RegExp(search, "i") },
        { soCMND: new RegExp(search, "i") },
      ];
    }

    // 2. Truy vấn dữ liệu (Bỏ skip và limit)
    const data = await StudentCheck.find(filter).sort({ stt: 1 });

    // 3. Trả về kết quả
    return res.json({
      success: true,
      total: data.length, // Tổng số bản ghi tìm thấy
      data,
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
    const filter = {};
    if (khoa) filter.khoaHoc = khoa;

    console.log("Filter:", filter); // Log xem filter đang là gì

    const giaoViens = await StudentCheck.distinct("giaoVien", filter);

    console.log("Result:", giaoViens); // Log xem trả về gì

    return res.json({
      success: true,
      data: giaoViens.sort(),
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
