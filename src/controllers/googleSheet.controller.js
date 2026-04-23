const googleSheetService = require("../services/googleSheet.service");

class GoogleSheetController {
  async getHocVienList(req, res) {
    try {
      // ID mới mà bạn cung cấp
      const SPREADSHEET_ID = "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU";
      // GID cụ thể từ đường dẫn của bạn
      const GID = "1754545655";
      
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
}

module.exports = new GoogleSheetController();