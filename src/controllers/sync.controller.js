const XLSX = require("xlsx");
const syncService = require("../services/sync.service");

// ─── Helpers ────────────────────────────────────────────────────────────────

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

      const records = rows
        .slice(1)
        .filter((row) => row[COL_SQL.MA_DK] || row[COL_SQL.HO_VA_TEN])
        .map((row) => {
          const vThay = String(row[COL_SQL.GIAO_VIEN_THAY] || "").trim();
          const vGoc = String(row[COL_SQL.GIAO_VIEN] || "").trim();
          const finalTeacher = vThay || vGoc;

          return {
            stt: row[COL_SQL.STT] || null,
            ma_dk: String(row[COL_SQL.MA_DK] || "").trim(),
            khoa: String(row[COL_SQL.KHOA] || "").trim(),
            ho_ten: String(row[COL_SQL.HO_VA_TEN] || "").trim(),
            ngay_sinh: parseExcelDate(row[COL_SQL.NGAY_SINH]),
            gioi_tinh: String(row[COL_SQL.GIOI_TINH]),
            cccd: String(row[COL_SQL.CCCD] || "").trim(),
            dia_chi: String(row[COL_SQL.DIA_CHI] || "").trim(),
            ngay_nhap: parseExcelDate(row[COL_SQL.NGAY_NHAP]),
            giao_vien: finalTeacher,
            giao_vien_thay: vThay,
            xe_b2: String(row[COL_SQL.XE_B2] || "").trim(),
            xe_b1: String(row[COL_SQL.XE_B1] || "").trim(),
            ghi_chu: String(row[COL_SQL.GHI_CHU] || "").trim(),
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
}

module.exports = new SyncController();
