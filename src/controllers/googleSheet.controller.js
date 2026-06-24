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
}

module.exports = new GoogleSheetController();