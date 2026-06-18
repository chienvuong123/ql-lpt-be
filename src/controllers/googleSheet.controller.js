const googleSheetService = require("../services/googleSheet.service");

class GoogleSheetController {
  async getHocVienList(req, res) {
    try {
      const SPREADSHEET_ID = "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU";
      const GID = req.query.gid;
      
      // Tự động đồng bộ tất cả dữ liệu từ cả 2 Google Sheets vào SQL
      await googleSheetService.syncAllSheetsToDatabase();
      
      let data = [];
      if (GID) {
        data = await googleSheetService.fetchSheetData(SPREADSHEET_ID, GID);
      } else {
        // Lấy song song dữ liệu từ cả 2 Tab để tối ưu tốc độ
        const [data1, data2] = await Promise.all([
          googleSheetService.fetchSheetData(SPREADSHEET_ID, "1754545655"),
          googleSheetService.fetchSheetData(SPREADSHEET_ID, "258055040")
        ]);
        data = data1.concat(data2);
      }
      
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