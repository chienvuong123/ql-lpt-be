const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuService = require("../services/hocBu.service");

class TienDoDaoTaoController {
  /**
   * GET /api/tien-do-dao-tao
   * Lấy danh sách tiến độ đào tạo
   */
  async getTienDoDaoTao(req, res) {
    const { ma_khoa } = req.query;

    try {
      const data = await tienDoDaoTaoModel.getAll({ ma_khoa });
      res.status(200).json({
        success: true,
        message: "Lấy dữ liệu tiến độ đào tạo thành công",
        data: data,
      });
    } catch (error) {
      console.error("[TienDoDaoTaoController] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy dữ liệu tiến độ đào tạo",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-theory-to-hoc-bu
   * Kiểm tra và chuyển học viên chưa đạt LÝ THUYẾT vào học bù (Thủ công)
   */
  async moveFailedTheoryToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveTheory(ma_khoa);
      res.status(200).json({ success: true, message: `Học bù Lý thuyết: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (error) {
      console.error("[moveFailedTheoryToHocBu] Error:", error);
      res.status(500).json({ success: false, message: "Lỗi hệ thống", error: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-cabin-to-hoc-bu
   * Kiểm tra và chuyển học viên chưa đạt CABIN vào học bù (Thủ công)
   */
  async moveFailedCabinToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveCabin(ma_khoa);
      res.status(200).json({ success: true, message: `Học bù Cabin: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (error) {
      console.error("[moveFailedCabinToHocBu] Error:", error);
      res.status(500).json({ success: false, message: "Lỗi hệ thống", error: error.message });
    }
  }
}
module.exports = new TienDoDaoTaoController();
