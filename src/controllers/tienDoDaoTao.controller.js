const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuService = require("../services/hocBu.service");
const hocBuModel = require("../models/hocBu.model");

class TienDoDaoTaoController {
  /**
   * GET /api/tien-do-dao-tao/hoc-bu
   * Lấy danh sách học viên học bù với bộ lọc
   */
  async getHocBuList(req, res) {
    const { ma_khoa, loai, search } = req.query;

    try {
      const data = await hocBuModel.getHocBuList({ ma_khoa, loai, search });
      res.status(200).json({
        success: true,
        message: "Lấy danh sách học bù thành công",
        data: data,
      });
    } catch (error) {
      console.error("[getHocBuList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách học bù",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/detail
   * Lấy dữ liệu chi tiết tiến độ (LT, Cabin, DAT) của 1 học viên
   */
  async getHocBuDetail(req, res) {
    const { ma_dk } = req.query;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    try {
      const data = await hocBuService.getStudentProgressDetail(ma_dk);
      res.status(200).json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error("[getHocBuDetail] Error:", error.message);
      res.status(500).json({
        success: false,
        message: error.message || "Lỗi hệ thống khi lấy chi tiết học viên",
      });
    }
  }

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
      res.json({ success: true, message: `Học bù Cabin: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (err) {
      console.error("[moveFailedCabinToHocBu]", err.message);
      res.status(500).json({ success: false, message: "Lỗi server", error: err.message });
    }
  }

  async moveFailedDatToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveDat(ma_khoa);
      res.json({ success: true, message: `Học bù DAT: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (err) {
      console.error("[moveFailedDatToHocBu]", err.message);
      res.status(500).json({ success: false, message: "Lỗi server", error: err.message });
    }
  }
}
module.exports = new TienDoDaoTaoController();
