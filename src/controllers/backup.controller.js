const backupService = require("../services/backup.service");

class BackupController {
  async backupHanhTrinh(req, res) {
    try {
      const { ma_khoa } = { ...req.query, ...req.body };
      if (!ma_khoa) {
        return res.status(400).json({
          success: false,
          message: "Mã khóa học (ma_khoa) không được để trống"
        });
      }

      const result = await backupService.backupHanhTrinh(ma_khoa);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[BackupController] backupHanhTrinh error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi thực hiện backup HanhTrinh",
        error: err.message
      });
    }
  }

  async checkOverlap(req, res) {
    try {
      const { ma_khoa, start_date, end_date, type, page = 1, limit = 20 } = { ...req.query, ...req.body };
      const result = await backupService.checkOverlap({ ma_khoa, start_date, end_date, type, page, limit });
      return res.status(200).json(result);
    } catch (err) {
      console.error("[BackupController] checkOverlap error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi thực hiện kiểm tra trùng xe/giáo viên",
        error: err.message
      });
    }
  }
}

module.exports = new BackupController();
