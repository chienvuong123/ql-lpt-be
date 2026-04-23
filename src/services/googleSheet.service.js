const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

function getOAuthClient() {
  const credentialsPath = path.join(process.cwd(), "oauth_credentials.json");
  if (!fs.existsSync(credentialsPath)) {
    throw new Error("Không tìm thấy oauth_credentials.json ở thư mục gốc!");
  }
  
  const credentials = JSON.parse(fs.readFileSync(credentialsPath));
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const tokenPath = path.join(process.cwd(), "token.json");
  if (!fs.existsSync(tokenPath)) {
    throw new Error("Chưa có token.json! Hãy chạy lệnh: node getToken.js");
  }

  const token = JSON.parse(fs.readFileSync(tokenPath));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

class GoogleSheetService {
  /**
   * Lấy dữ liệu từ một Spreadsheet bất kỳ
   * @param {string} spreadsheetId ID của Google Sheet
   * @param {number|string} gid ID của sheet (tab) cụ thể
   */
  async fetchSheetData(spreadsheetId, gid = null) {
    try {
      const auth = getOAuthClient();
      const sheets = google.sheets({ version: "v4", auth });

      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      let sheetTitle = meta.data.sheets[0].properties.title;

      if (gid) {
        const targetSheet = meta.data.sheets.find((s) => s.properties.sheetId == gid);
        if (targetSheet) {
          sheetTitle = targetSheet.properties.title;
        }
      }

      // Bắt đầu lấy từ dòng 2 (A2) để lấy đúng tiêu đề trong file của bạn
      const finalRange = `${sheetTitle}!A2:R`;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: finalRange,
      });

      const values = response.data.values;
      if (!values || values.length === 0) {
        return [];
      }

      // Headers nằm ở dòng đầu tiên của vùng A2:R (chính là dòng 2 của Sheet)
      const [headers, ...rows] = values;

      // Bỏ qua các dòng trống hoặc dòng đệm (ví dụ dòng 3)
      // Chúng ta lọc những dòng có dữ liệu ở cột STT (index 0) hoặc cột Họ tên (index 5)
      const dataRows = rows.filter(row => row.length > 0 && (row[0] || row[5]));

      return dataRows.map((row) =>
        headers.reduce((obj, key, i) => {
          // Trimming key để tránh lỗi khoảng trắng trong tiêu đề
          const cleanKey = key ? key.toString().trim() : `Column_${i}`;
          obj[cleanKey] = row[i] !== undefined ? row[i] : null;
          return obj;
        }, {})
      );
    } catch (error) {
      console.error("[GoogleSheetService] Error:", error.message);
      throw error;
    }
  }
}

module.exports = new GoogleSheetService();