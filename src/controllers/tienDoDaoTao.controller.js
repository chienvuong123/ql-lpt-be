const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const cronService = require("../services/cron.service");

class TienDoDaoTaoController {
  /**
   * GET /api/tien-do-dao-tao
   * Lấy danh sách tiến độ đào tạo
   */
  async getTienDoDaoTao(req, res) {
    const { ma_khoa } = req.query;
    try {
      const data = await tienDoDaoTaoModel.getAll({ ma_khoa });
      res.status(200).json({ success: true, message: "Thành công", data });
    } catch (error) {
      console.error("[TienDoDaoTaoController] Error:", error.message);
      res.status(500).json({ success: false, message: "Lỗi hệ thống", error: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-theory-to-hoc-bu
   * Chạy thủ công kiểm tra lý thuyết trượt
   */
  async moveFailedTheoryToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });
    try {
      const result = await cronService.checkAndMoveTheory(ma_khoa);
      res.status(200).json({ success: true, message: `Chuyển ${result.movedCount} học viên`, data: result });
    } catch (error) {
      console.error("[moveFailedTheoryToHocBu]", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-cabin-to-hoc-bu
   * Chạy thủ công kiểm tra cabin trượt
   */
  async moveFailedCabinToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });
    try {
      const result = await cronService.checkAndMoveCabin(ma_khoa);
      res.status(200).json({ success: true, message: `Chuyển ${result.movedCount} học viên`, data: result });
    } catch (error) {
      console.error("[moveFailedCabinToHocBu]", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-dat-to-hoc-bu
   * Chạy thủ công kiểm tra DAT trượt
   */
  async moveFailedDatToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });
    try {
      const result = await cronService.checkAndMoveDat(ma_khoa);
      res.status(200).json({ success: true, message: `Chuyển ${result.movedCount} học viên`, data: result });
    } catch (error) {
      console.error("[moveFailedDatToHocBu]", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new TienDoDaoTaoController();
