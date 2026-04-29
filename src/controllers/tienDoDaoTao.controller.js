const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuService = require("../services/hocBu.service");
const hocBuModel = require("../models/hocBu.model");

class TienDoDaoTaoController {
  /**
   * GET /api/tien-do-dao-tao/hoc-bu
   * Lấy danh sách học viên học bù với bộ lọc
   */
  async getHocBuList(req, res) {
    const { ma_khoa, loai, search, sync } = req.query;

    try {
      const data = await hocBuService.getHocBuListDetailed({ ma_khoa, loai, search, sync });
      res.status(200).json({
        success: true,
        message: "Lấy danh sách học bù thành công",
        data: data.students,
        course: data.course
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
    const { ma_dk, sync } = req.query;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    try {
      const data = await hocBuService.getStudentProgressDetail(ma_dk, sync === 'true' || sync === true);
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
   * POST /api/tien-do-dao-tao/hoc-bu
   * Thêm 1 học viên vào danh sách học bù
   */
  async addStudentToHocBu(req, res) {
    const { ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao, trang_thai_hoc_bu } = req.body;
    if (!ma_dk || !ma_khoa || !loai) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc (ma_dk, ma_khoa, loai)" });
    }

    try {
      const students = [{ 
        ma_dk, 
        ma_khoa, 
        loai, 
        ghi_chu: ghi_chu || "Đăng ký học bù thủ công",
        trang_thai,
        nguoi_tao,
        trang_thai_hoc_bu
      }];
      const result = await hocBuModel.moveToHocBu(students);
      
      res.status(200).json({
        success: true,
        message: "Đã thêm học viên vào danh sách học bù",
        count: result
      });
    } catch (error) {
      console.error("[addStudentToHocBu] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi thêm học viên vào danh sách học bù",
        error: error.message
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/hoc-bu/update-status
   * Cập nhật trạng thái của bản ghi học bù
   */
  async updateHocBuStatus(req, res) {
    const { id, trang_thai, nguoi_update, trang_thai_hoc_bu } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Thiếu ID bản ghi học bù" });
    }

    try {
      const result = await hocBuModel.updateHocBu(id, { trang_thai, nguoi_update, trang_thai_hoc_bu });
      
      if (result > 0) {
        res.status(200).json({
          success: true,
          message: "Cập nhật trạng thái học bù thành công"
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy bản ghi học bù để cập nhật"
        });
      }
    } catch (error) {
      console.error("[updateHocBuStatus] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi cập nhật trạng thái học bù",
        error: error.message
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
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/theory
   */
  async getTheoryProgress(req, res) {
    const { ma_dk, ma_khoa } = req.query;
    try {
      const data = await hocBuService.getTheoryProgress(ma_dk, ma_khoa);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/theory-detail
   */
  async getTheoryLotusDetail(req, res) {
    const { ma_dk } = req.query;
    if (!ma_dk) return res.status(400).json({ success: false, message: "Thiếu ma_dk cho chi tiết Lotus" });

    try {
      const data = await hocBuService.getTheoryLotusDetail(ma_dk);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/cabin
   */
  async getCabinProgress(req, res) {
    console.log("[getCabinProgress]", req.query);
    const { ma_dk, ma_khoa } = req.query;
    try {
      const data = await hocBuService.getCabinProgress(ma_dk, ma_khoa);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/dat
   */
  async getDatProgress(req, res) {
    const { ma_dk, ma_khoa, sync } = req.query;
    try {
      const data = await hocBuService.getDatProgress(ma_dk, ma_khoa, sync === 'true' || sync === true);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
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
