const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");

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
}

module.exports = new TienDoDaoTaoController();
