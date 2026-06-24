const keToanModel = require("../models/keToan.model");

class KeToanController {
  async getDanhSach(req, res) {
    try {
      const { search, co_so, trang_thai, thoi_gian, page, limit } = req.query;

      const result = await keToanModel.getDanhSach({
        search,
        co_so,
        trang_thai,
        thoi_gian,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50
      });

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async duyetThanhToan(req, res) {
    try {
      const { cccd, so_tien_da_nop, phuong_thuc, ngay_nop, ghi_chu_ke_toan, nguoi_duyet: body_nguoi_duyet } = req.body;
      const nguoi_duyet = body_nguoi_duyet || req.user?.username || "he_thong"; // Extract from body or token verification

      if (!cccd) {
        return res.status(400).json({
          success: false,
          message: "CCCD học viên là bắt buộc."
        });
      }

      if (so_tien_da_nop === undefined || so_tien_da_nop === null) {
        return res.status(400).json({
          success: false,
          message: "Số tiền đã nộp là bắt buộc."
        });
      }

      const amount = parseFloat(so_tien_da_nop);
      if (isNaN(amount)) {
        return res.status(400).json({
          success: false,
          message: "Số tiền đã nộp phải là một số hợp lệ."
        });
      }

      const result = await keToanModel.duyetThanhToan({
        cccd,
        so_tien_da_nop: amount,
        phuong_thuc,
        ngay_nop,
        ghi_chu_ke_toan,
        nguoi_duyet
      });

      res.status(200).json({
        success: true,
        message: "Duyệt thanh toán học viên thành công.",
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getBaoCao(req, res) {
    try {
      const result = await keToanModel.getBaoCao();
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new KeToanController();
