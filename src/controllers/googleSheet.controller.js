const googleSheetService = require("../services/googleSheet.service");

class GoogleSheetController {
  async getHocVienList(req, res) {
    try {
      const GID = req.query.gid;
      
      // Tự động đồng bộ tất cả dữ liệu từ cả 2 Google Sheets vào SQL (Đã tối ưu cực nhanh)
      await googleSheetService.syncAllSheetsToDatabase();
      
      const filter = {};
      if (GID === "1754545655") filter.co_so = "CS 1";
      if (GID === "258055040") filter.co_so = "CS 3";

      // Đọc trực tiếp từ SQL Database thay vì gọi lại Google API lần thứ hai
      const result = await googleSheetService.getDataFromDatabase({
        ...filter,
        page: 1,
        limit: 100000
      });
      
      res.status(200).json({ 
        success: true, 
        total: result.total, 
        data: result.data 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async syncData(req, res) {
    try {
      const result = await googleSheetService.syncAllSheetsToDatabase();
      res.status(200).json({ 
        success: true, 
        message: "Đồng bộ dữ liệu thành công", 
        count: result.count 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async getHocVienListFromDb(req, res) {
    try {
      const { search, co_so, hang, nguoi_tuyen_sinh, page, limit } = req.query;
      const result = await googleSheetService.getDataFromDatabase({
        search,
        co_so,
        hang,
        nguoi_tuyen_sinh,
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

  async updateHocVien(req, res) {
    try {
      const { oldCccd, data } = req.body;
      if (!oldCccd || !data || !data.cccd) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin cccd cũ hoặc dữ liệu mới"
        });
      }
      await googleSheetService.updateHocVien(oldCccd, data);
      res.status(200).json({
        success: true,
        message: "Cập nhật thông tin học viên thành công"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getUnassignedStudents(req, res) {
    try {
      const { search } = req.query;
      const result = await googleSheetService.getUnassignedStudents(search);
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

  async transferFee(req, res) {
    try {
      const { sourceCccd, targetCccd } = req.body;
      if (!sourceCccd || !targetCccd) {
        return res.status(400).json({
          success: false,
          message: "Thiếu CCCD học viên nguồn hoặc học viên nhận."
        });
      }
      await googleSheetService.transferFee(sourceCccd, targetCccd);
      res.status(200).json({
        success: true,
        message: "Chuyển học phí thành công!"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new GoogleSheetController();