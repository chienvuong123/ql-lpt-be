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

const googleSheetModel = require("../models/googleSheet.model");

class GoogleSheetService {
  constructor() {
    this.SHEETS_TO_SYNC = [
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "652741371" },
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "258055040" },
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "802299212" },
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "1754545655" },
    ];
  }

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

  async syncAllSheetsToDatabase() {
    console.log("[GoogleSheetService] Bắt đầu đồng bộ dữ liệu từ Google Sheets vào SQL...");
    try {
      await googleSheetModel.createTableIfNotExists();
      
      let allSyncedData = [];

      for (const sheet of this.SHEETS_TO_SYNC) {
        console.log(`[GoogleSheetService] Đang lấy dữ liệu từ GID: ${sheet.gid}...`);
        const data = await this.fetchSheetData(sheet.spreadsheetId, sheet.gid);
        
        if (data && data.length > 0) {
          const mappedData = data.map(item => {
            // Map chính xác theo tiêu đề trong ảnh screenshot của người dùng
            return {
              cccd: (item["Căn cước /CMND"] || item["Căn cước/CMND"] || "").toString().trim(),
              stt_n: item["STT Ngày"] || item["STT_N"] || null,
              thoi_gian: item["Dấu thời gian"] || item["Thời gian"] || null,
              email: item["Địa chỉ email"] || item["Email"] || null,
              co_so: item["Cơ sở tuyển sinh"] || item["Cơ sở\ntuyển\nsinh"] || item["CS"] || item["Cơ sở"] || null,
              ten_hoc_vien: item["Họ tên học viên"] || item["Họ và tên"] || null,
              ngay_sinh: item["Ngày sinh"] || null,
              dien_thoai: item["Số điện thoại"] || item["SĐT học viên"] || item["Điện thoại"] || null,
              dia_chi: item["Địa chỉ"] || null,
              loai: item["LH"] || item["Loại hình"] || item["Loại"] || null,
              hang: item["Hạng"] || null,
              nguoi_tuyen_sinh: item["Người tuyển sinh"] || null,
              ctv: item["CTV"] || null,
              cccd_pho_to: item["CCCD Photo"] === "OK" || item["CCCD Photo"] === true || item["CCCD phô tô"] === "OK",
              dat_coc: item["Đặt cọc"] || null,
              ma_anh: item["Mã ảnh"] || null,
              ghi_chu: item["Ghi chú"] || null,
            };
          }).filter(item => item.cccd); // Chỉ lấy những dòng có CCCD

          allSyncedData = allSyncedData.concat(mappedData);
        }
      }

      if (allSyncedData.length > 0) {
        // Loại bỏ trùng lặp CCCD trong danh sách mới (ưu tiên bản ghi cuối cùng)
        const uniqueDataMap = {};
        allSyncedData.forEach(item => {
          uniqueDataMap[item.cccd] = item;
        });
        const finalData = Object.values(uniqueDataMap);

        await googleSheetModel.upsertGoogleSheetData(finalData);
        console.log(`[GoogleSheetService] Đồng bộ thành công ${finalData.length} bản ghi.`);
        return { success: true, count: finalData.length };
      } else {
        console.log("[GoogleSheetService] Không có dữ liệu để đồng bộ.");
        return { success: true, count: 0 };
      }
    } catch (error) {
      console.error("[GoogleSheetService] Lỗi đồng bộ:", error.message);
      throw error;
    }
  }
}

module.exports = new GoogleSheetService();