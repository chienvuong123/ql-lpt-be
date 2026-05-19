const XLSX = require("xlsx");
const syncService = require("../services/sync.service");

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseExcelDate(value) {
  if (value === undefined || value === null) return null;
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    d = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split("/");
    if (parts.length === 3) {
      d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
      d = new Date(trimmed);
    }
  }
  if (d && !isNaN(d.getTime())) {
    return d;
  }
  return null;
}

const COL_SQL = {
  STT: 0,
  MA_DK: 1,
  KHOA: 2,
  HO_VA_TEN: 3,
  NGAY_SINH: 4,
  GIOI_TINH: 5,
  CCCD: 7,
  DIA_CHI: 8,
  NGAY_NHAP: 10,
  GIAO_VIEN: 11,
  XE_B2: 12,
  XE_B1: 13,
  GIAO_VIEN_THAY: 14,
  GHI_CHU: 15,
};

// ─── Controller ─────────────────────────────────────────────────────────────

class SyncController {
  /**
   * POST /api/sync/courses
   * Sync all enrolment plans from Lotus
   */
  async syncCourses(req, res) {
    try {
      const count = await syncService.syncCourses();
      res.status(200).json({
        success: true,
        message: `Đã đồng bộ ${count} khóa học từ Lotus LMS.`,
        data: { count }
      });
    } catch (err) {
      console.error("[SyncController] syncCourses error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi đồng bộ danh sách khóa học",
        error: err.message
      });
    }
  }

  /**
   * POST /api/sync/students
   * Body: { enrolmentPlanIid: Number | Array }
   * Sync students for one or multiple enrolment plans
   */
  async syncStudents(req, res) {
    const { enrolmentPlanIid } = req.body;

    if (!enrolmentPlanIid) {
      return res.status(400).json({
        success: false,
        message: "Thiếu enrolmentPlanIid (IID khóa học)"
      });
    }

    try {
      // Chuyển đổi sang mảng nếu chỉ là 1 ID
      const ids = Array.isArray(enrolmentPlanIid) ? enrolmentPlanIid : [enrolmentPlanIid];

      const result = await syncService.syncStudents(ids);

      res.status(200).json({
        success: true,
        message: `Đã hoàn tất đồng bộ ${result.success}/${result.totalCourses} khóa học.`,
        data: result
      });
    } catch (err) {
      console.error("[SyncController] syncStudents error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi đồng bộ danh sách học viên",
        error: err.message
      });
    }
  }

  /**
   * POST /api/sync/import-sql
   */
  async importToSql(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Không có file." });
      }

      const { upsertMany } = require("../models/vehicleRegistration.model");

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (rows.length < 2) {
        return res.status(400).json({ success: false, message: "File trống." });
      }

      // 1. Find the header row dynamically by looking for ma_dk and ho_ten keywords
      let headerRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(cell => String(cell || "").toLowerCase()).join(" ");
        if (
          (rowStr.includes("mã đăng ký") || rowStr.includes("ma dang ky") || rowStr.includes("ma dang ki") || rowStr.includes("mã đăng kí")) &&
          (rowStr.includes("họ và tên") || rowStr.includes("ho va ten") || rowStr.includes("họ tên") || rowStr.includes("ho ten"))
        ) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return res.status(400).json({ success: false, message: "Không tìm thấy dòng tiêu đề hợp lệ trong file Excel." });
      }

      const headers = rows[headerRowIndex].map(h => String(h || "").trim());

      // 2. Helper function to find column index by matching header keywords with exclusions
      function findColIndex(keywords, excludeKeywords = []) {
        return headers.findIndex(h => {
          const lowerH = String(h || "").toLowerCase();
          const matches = keywords.some(k => lowerH.includes(k.toLowerCase()));
          if (!matches) return false;
          const excluded = excludeKeywords.some(k => lowerH.includes(k.toLowerCase()));
          return !excluded;
        });
      }

      const COL_INDEX = {
        STT: findColIndex(["stt", "số thứ tự"]),
        MA_DK: findColIndex(["mã đăng ký", "ma dang ky", "ma dang ki", "mã đăng kí"]),
        KHOA: findColIndex(["khóa", "khoa"]),
        HO_VA_TEN: findColIndex(["họ và tên", "ho va ten", "họ tên", "ho ten"]),
        NGAY_SINH: findColIndex(["ngày sinh", "ngay sinh"]),
        GIOI_TINH: findColIndex(["giới tính", "gioi tinh"]),
        CCCD: findColIndex(["cmnd", "cccd", "hộ chiếu", "ho chieu", "số cmnd"]),
        DIA_CHI: findColIndex(["địa chỉ", "dia chi"]),
        NGAY_NHAP: findColIndex(["nhận hồ sơ", "nhập hồ sơ", "ngay nhan", "ngay nhap"]),
        GIAO_VIEN: findColIndex(["giáo viên", "giao vien", "gv"], ["thay"]),
        GIAO_VIEN_THAY: findColIndex(["giáo viên thay", "giao vien thay", "gv thay"]),
        XE_B2: findColIndex(["xe b2", "b2"], ["b1"]),
        XE_B1: findColIndex(["xe b1", "b1"], ["b2"]),
        GHI_CHU: findColIndex(["ghi chú", "ghi chu"])
      };
      // 3. Map sheet rows into normalized database records
      const records = rows
        .slice(headerRowIndex + 1)
        .filter((row) => {
          const maDkIndex = COL_INDEX.MA_DK;
          const hoTenIndex = COL_INDEX.HO_VA_TEN;
          if (maDkIndex === -1 && hoTenIndex === -1) return false;
          const valMaDk = maDkIndex !== -1 && maDkIndex < row.length ? String(row[maDkIndex] || "").trim() : "";
          const valHoTen = hoTenIndex !== -1 && hoTenIndex < row.length ? String(row[hoTenIndex] || "").trim() : "";
          return valMaDk || valHoTen;
        })
        .map((row) => {
          const getVal = (colIndex) => {
            if (colIndex === -1 || colIndex === undefined || colIndex >= row.length) return "";
            return String(row[colIndex] || "").trim();
          };

          const vThay = getVal(COL_INDEX.GIAO_VIEN_THAY);
          const vGoc = getVal(COL_INDEX.GIAO_VIEN);
          const finalTeacher = vThay || vGoc;

          return {
            stt: COL_INDEX.STT !== -1 && COL_INDEX.STT < row.length ? (Number(row[COL_INDEX.STT]) || null) : null,
            ma_dk: getVal(COL_INDEX.MA_DK),
            khoa: getVal(COL_INDEX.KHOA),
            ho_ten: getVal(COL_INDEX.HO_VA_TEN),
            ngay_sinh: COL_INDEX.NGAY_SINH !== -1 && COL_INDEX.NGAY_SINH < row.length ? parseExcelDate(row[COL_INDEX.NGAY_SINH]) : null,
            gioi_tinh: getVal(COL_INDEX.GIOI_TINH),
            cccd: getVal(COL_INDEX.CCCD),
            dia_chi: getVal(COL_INDEX.DIA_CHI),
            ngay_nhap: COL_INDEX.NGAY_NHAP !== -1 && COL_INDEX.NGAY_NHAP < row.length ? parseExcelDate(row[COL_INDEX.NGAY_NHAP]) : null,
            giao_vien: finalTeacher,
            giao_vien_thay: vThay,
            xe_b2: getVal(COL_INDEX.XE_B2),
            xe_b1: getVal(COL_INDEX.XE_B1),
            ghi_chu: getVal(COL_INDEX.GHI_CHU)
          };
        });

      const result = await upsertMany(records);

      return res.status(200).json({
        success: true,
        message: "Xử lý file thành công (SQL).",
        details: {
          totalProcessed: records.length,
          insertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      console.error("Import SQL error:", error);
      return res.status(500).json({ success: false, message: "Import SQL thất bại.", error: error.message });
    }
  }
  /**
   * POST /api/sync/tien-do
   * Add or update training progress
   */
  async upsertTienDoDaoTao(req, res) {
    const data = req.body;

    if (!data.ma_khoa) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ma_khoa",
      });
    }

    try {
      await syncService.upsertTienDoDaoTao(data);
      res.status(200).json({
        success: true,
        message: "Cập nhật tiến độ đào tạo thành công",
      });
    } catch (err) {
      console.error("[SyncController] upsertTienDoDaoTao error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi cập nhật tiến độ đào tạo",
        error: err.message,
      });
    }
  }
  /**
   * GET /api/sync/tien-do
   * Get list of training progress with filters
   */
  async getTienDoDaoTaoList(req, res) {
    const { ma_khoa, tot_nghiep, loai } = req.query;

    try {
      const list = await syncService.getTienDoDaoTaoList({ ma_khoa, tot_nghiep, loai });
      res.status(200).json({
        success: true,
        data: list,
      });
    } catch (err) {
      console.error("[SyncController] getTienDoDaoTaoList error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách tiến độ đào tạo",
        error: err.message,
      });
    }
  }
  /**
 * GET /api/sync/courses
 * Get list of all courses
 */
  /**
   * GET /api/sync/courses
   * Get list of all courses
   */
  async getKhoaHocList(req, res) {
    try {
      const list = await syncService.getKhoaHocList();
      res.status(200).json({
        success: true,
        data: list,
      });
    } catch (err) {
      console.error("[SyncController] getKhoaHocList error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách khóa học",
        error: err.message,
      });
    }
  }

  /**
   * GET /api/sync/students
   * Get list of students with search and course filters
   */
  async getStudentsList(req, res) {
    const { search, ma_khoa, giao_vien, nam_sinh_gv } = { ...req.query, ...req.body };

    try {
      const list = await syncService.getHocVienSearch({ search, ma_khoa, giao_vien, nam_sinh_gv });
      res.status(200).json({
        success: true,
        data: list,
      });
    } catch (err) {
      console.error("[SyncController] getStudentsList error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách học viên",
        error: err.message,
      });
    }
  }

  async kiemTraDongBo(req, res) {
    const khoa = req.body.khoa || req.query.khoa || (typeof req.body === "string" ? req.body : null);
    if (!khoa) {
      return res.status(400).json({
        success: false,
        message: "Mã khóa học (khoa) không được để trống"
      });
    }

    try {
      const results = await syncService.kiemTraDongBo(khoa);
      res.status(200).json({
        success: true,
        data: results
      });
    } catch (err) {
      console.error("[SyncController] kiemTraDongBo error:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi kiểm tra đồng bộ cabin",
        error: err.message
      });
    }
  }
}

module.exports = new SyncController();
