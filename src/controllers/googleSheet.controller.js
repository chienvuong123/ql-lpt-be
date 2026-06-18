const googleSheetService = require("../services/googleSheet.service");

class GoogleSheetController {
  async getHocVienList(req, res) {
    try {
      const SPREADSHEET_ID = "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU";
      // Hỗ trợ truyền GID động qua query param (?gid=...), mặc định là "1754545655"
      const GID = req.query.gid || "1754545655";
      
      // Tự động đồng bộ tất cả dữ liệu từ cả 2 Google Sheets vào SQL
      await googleSheetService.syncAllSheetsToDatabase();
      
      const data = await googleSheetService.fetchSheetData(SPREADSHEET_ID, GID);
      
      res.status(200).json({ 
        success: true, 
        total: data.length, 
        data 
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
}

module.exports = new GoogleSheetController();