const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

let cachedAuthClient = null;

function safeReadJsonSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
      return null;
    }
    return JSON.parse(content);
  } catch (error) {
    console.error(`[GoogleSheetService] Lỗi khi đọc/parse file JSON ${filePath}:`, error.message);
    return null;
  }
}

function safeWriteJsonSync(filePath, data) {
  const tempPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`[GoogleSheetService] Lỗi khi ghi file JSON ${filePath}:`, error.message);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

function getAuthClient() {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  const serviceAccountPath = path.join(process.cwd(), "service_account.json");
  if (fs.existsSync(serviceAccountPath)) {
    // Authenticate using Service Account - NO login required!
    cachedAuthClient = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return cachedAuthClient;
  }

  const credentialsPath = path.join(process.cwd(), "oauth_credentials.json");
  if (!fs.existsSync(credentialsPath)) {
    throw new Error("Không tìm thấy service_account.json hoặc oauth_credentials.json ở thư mục gốc!");
  }
  
  const credentials = safeReadJsonSync(credentialsPath);
  if (!credentials || !credentials.installed) {
    throw new Error("File oauth_credentials.json bị trống hoặc không đúng định dạng JSON!");
  }
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

  const token = safeReadJsonSync(tokenPath);
  if (!token) {
    throw new Error("File token.json bị trống hoặc không đúng định dạng JSON! Hãy chạy lại lệnh: node getToken.js");
  }
  oAuth2Client.setCredentials(token);

  oAuth2Client.on("tokens", (tokens) => {
    try {
      const currentToken = safeReadJsonSync(tokenPath) || {};
      const updatedToken = { ...currentToken, ...tokens };
      safeWriteJsonSync(tokenPath, updatedToken);
      console.log("[GoogleSheetService] Đã tự động gia hạn và lưu token mới vào token.json");
    } catch (err) {
      console.error("[GoogleSheetService] Lỗi khi ghi đè token mới:", err.message);
    }
  });

  cachedAuthClient = oAuth2Client;
  return cachedAuthClient;
}

const googleSheetModel = require("../models/googleSheet.model");
const { normalizeCccd } = require("../utils/cccd.util");
const { normalizeVietnameseDate } = require("../utils/date.util");

// Ánh xạ 1 dòng dữ liệu thô (object theo tên cột) thành bản ghi google_sheet_data — dùng chung
// cho cả đồng bộ Google Sheets API và import Excel thủ công, để tránh lệch logic giữa 2 nguồn.
const mapRowToRecord = (item) => {
  const cccdVal = normalizeCccd(item["Căn cước /CMND"] || item["Căn cước/CMND"] || "");

  const photoVal = item["CCCD Photo"] || item["CCCD photo"] || item["CCCD phô tô"] || item["Căn cước/CMND photo"] || "";
  const isPhotoOk = photoVal === true ||
                     photoVal === 1 ||
                     ["ok", "đã có", "yes", "có"].includes(photoVal.toString().trim().toLowerCase());

  const hangVal = item["Hạng"] || null;
  const loaiVal = item["LH"] || item["Loại hình"] || item["Loại"] || null;

  return {
    cccd: cccdVal,
    stt_n: item["STT Ngày"] || item["STT_N"] || null,
    thoi_gian: item["Dấu thời gian"] || item["Thời gian"] || null,
    email: item["Địa chỉ email"] || item["Email"] || null,
    co_so: item["Cơ sở tuyển sinh"] || item["Cơ sở\ntuyển\nsinh"] || item["CS"] || item["Cơ sở"] || null,
    ten_hoc_vien: (item["Họ tên học viên"] || item["Họ và tên"] || "").toString().trim() || null,
    ngay_sinh: normalizeVietnameseDate(item["Ngày sinh"]) || null,
    dien_thoai: item["Số điện thoại"] || item["SĐT học viên"] || item["Điện thoại"] || null,
    dia_chi: (item["Địa chỉ"] || "").toString().trim() || null,
    loai: loaiVal,
    hang: hangVal,
    nguoi_tuyen_sinh: (item["Người tuyển sinh"] || "").toString().trim() || null,
    ctv: item["CTV"] || null,
    cccd_pho_to: isPhotoOk,
    dat_coc: item["Đặt cọc"] || null,
    ma_anh: item["Mã ảnh"] || null,
    ghi_chu: item["Ghi chú"] || null,
  };
};

// Nhiều dòng có thể trùng CCCD (import lại/đồng bộ nhiều sheet) — giữ lại bản ghi có
// "Dấu thời gian" mới nhất cho mỗi CCCD.
const resolveLatestByCccd = (records) => {
  const parseSheetDate = (dateStr) => {
    if (!dateStr) return 0;
    const parts = dateStr.trim().split(/\s+/);
    const dateParts = parts[0].split("/");
    if (dateParts.length < 3) return 0;
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);
    let hour = 0, minute = 0, second = 0;
    if (parts[1]) {
      const timeParts = parts[1].split(":");
      hour = parseInt(timeParts[0], 10) || 0;
      minute = parseInt(timeParts[1], 10) || 0;
      second = parseInt(timeParts[2], 10) || 0;
    }
    return new Date(year, month, day, hour, minute, second).getTime();
  };

  const sorted = [...records].sort((a, b) => parseSheetDate(a.thoi_gian) - parseSheetDate(b.thoi_gian));

  const uniqueDataMap = {};
  sorted.forEach((item) => {
    uniqueDataMap[item.cccd] = item;
  });
  return Object.values(uniqueDataMap);
};

const getMaKeToan = (hang, cccd) => {
  if (!cccd) return "";
  const h = (hang || "").toString().trim().toUpperCase();
  if (h === "B2") return `B${cccd}`;
  if (h === "C1") return `C${cccd}`;
  return cccd;
};

const getMaTinhTien = (hang, loai) => {
  const h = (hang || "").toString().trim().toUpperCase();
  const l = (loai || "").toString().trim().toUpperCase();
  if (!h || !l) return "";
  return `${h}${l}`;
};

const getHocPhi = (hang, loai) => {
  const h = (hang || "").toString().trim().toUpperCase();
  const l = (loai || "").toString().trim().toUpperCase();
  
  if (h === "B2" || h === "B1") {
      if (l === "TT") return 16000000;
      if (l === "LK") return 4200000;
      if (l === "CBNV") return 12000000;
  } else if (h === "C1") {
      if (l === "TT") return 18000000;
      if (l === "LK") return 4700000;
      if (l === "CBNV") return 14000000;
  }
  return null;
};

class GoogleSheetService {
  constructor() {
    this.SHEETS_TO_SYNC = [
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "1754545655" },
      { spreadsheetId: "1TEeB_qAGJz_aLCzjDOUxEitgrwNWohcy6VjU3k6DppU", gid: "258055040" },
    ];
  }

  /**
   * Lấy dữ liệu từ một Spreadsheet bất kỳ
   * @param {string} spreadsheetId ID của Google Sheet
   * @param {number|string} gid ID của sheet (tab) cụ thể
   */
  async fetchSheetData(spreadsheetId, gid = null) {
    try {
      const auth = getAuthClient();
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

  async syncAllSheetsToDatabase(specificGid = null) {
    console.log("[GoogleSheetService] Bắt đầu đồng bộ dữ liệu từ Google Sheets vào SQL...");
    try {
      await googleSheetModel.createTableIfNotExists();
      
      let allSyncedData = [];
      const sheetsToSync = specificGid
        ? this.SHEETS_TO_SYNC.filter(s => String(s.gid) === String(specificGid))
        : this.SHEETS_TO_SYNC;

      for (const sheet of sheetsToSync) {
        console.log(`[GoogleSheetService] Đang lấy dữ liệu từ GID: ${sheet.gid}...`);
        const data = await this.fetchSheetData(sheet.spreadsheetId, sheet.gid);

        if (data && data.length > 0) {
          const mappedData = data.map(mapRowToRecord).filter((item) => item.cccd);
          allSyncedData = allSyncedData.concat(mappedData);
        }
      }

      if (allSyncedData.length > 0) {
        const finalData = resolveLatestByCccd(allSyncedData);

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

  // Import thủ công từ file Excel (.xlsx/.xls) có cùng cấu trúc cột với Google Sheet nguồn —
  // dùng chung logic map cột + gộp trùng CCCD với đường đồng bộ qua Google Sheets API.
  //
  // Sheet nguồn có dòng 1 là dòng gộp/tổng (không phải header thật) và header thật nằm ở
  // dòng 2 (giống hệt fetchSheetData ở trên phải đọc range A2:R để bỏ qua dòng 1) — nên phải
  // tự dò đúng dòng chứa tên cột thay vì mặc định dòng đầu tiên là header.
  async importExcelToDatabase(fileBuffer) {
    const XLSX = require("xlsx");
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false, raw: false });
    if (rawRows.length === 0) {
      throw new Error("File Excel không hợp lệ hoặc rỗng");
    }

    const headerIndex = this.findHeaderRowIndex(rawRows);
    const headerRow = rawRows[headerIndex].map((v) => (v ? v.toString().trim() : ""));
    const dataRows = rawRows.slice(headerIndex + 1);

    const rows = dataRows
      .filter((row) => row.length > 0 && (row[0] || row[5]))
      .map((row) =>
        headerRow.reduce((obj, key, i) => {
          const cleanKey = key || `Column_${i}`;
          obj[cleanKey] = row[i] !== undefined ? row[i] : null;
          return obj;
        }, {})
      );

    const mappedData = rows.map(mapRowToRecord).filter((item) => item.cccd);

    if (mappedData.length === 0) {
      return { success: true, count: 0 };
    }

    await googleSheetModel.createTableIfNotExists();
    const finalData = resolveLatestByCccd(mappedData);
    await googleSheetModel.upsertGoogleSheetData(finalData);

    return { success: true, count: finalData.length };
  }

  // Tìm dòng chứa tên cột thật (vd "Họ tên học viên", "Ngày sinh") trong vài dòng đầu tiên,
  // vì dòng 1 của sheet nguồn thường chỉ là dòng gộp/tổng, không phải header.
  findHeaderRowIndex(rawRows) {
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      const row = rawRows[i].map((v) => (v ? v.toString().trim().toLowerCase() : ""));
      const looksLikeHeader =
        row.some((c) => c.includes("họ tên học viên") || c.includes("họ và tên")) &&
        row.some((c) => c.includes("ngày sinh"));
      if (looksLikeHeader) return i;
    }
    return 0;
  }

  async getDataFromDatabase(filters) {
    return await googleSheetModel.getAllData(filters);
  }

  async getRankStats(filters) {
    return await googleSheetModel.getRankStats(filters);
  }
}

const instance = new GoogleSheetService();
instance.getMaKeToan = getMaKeToan;
instance.getMaTinhTien = getMaTinhTien;
instance.getHocPhi = getHocPhi;
module.exports = instance;