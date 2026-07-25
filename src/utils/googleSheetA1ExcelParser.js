const XLSX = require("xlsx");
const { normalizeCccd } = require("./cccd.util");
const { extractYearFromTimestamp } = require("./date.util");

// File Excel export từ Google Form đăng ký học A1, dạng bảng có hàng tiêu đề, các cột:
// Dấu thời gian | Địa chỉ email | Mã phiếu | Họ và tên | Năm sinh | CMT/CCCD | Điện thoại |
// Địa chỉ | Loại hình | Đầu mối tuyển sinh | Hạng xe | Phí HS | Ghi chú
class GoogleSheetA1ExcelParser {
  // Đọc TẤT CẢ các sheet trong file (không chỉ sheet đầu tiên) — file nguồn có thể tách dữ liệu
  // thành nhiều sheet/tab (vd theo năm, theo cơ sở), mỗi sheet có hàng header riêng.
  static parseExcel(fileBuffer, options = {}) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    if (options.sheetName && !workbook.Sheets[options.sheetName]) {
      throw new Error(
        `Không tìm thấy sheet "${options.sheetName}" trong file này. Các sheet có trong file: ${workbook.SheetNames.join(", ")}`
      );
    }

    const sheetNames = options.sheetName ? [options.sheetName] : workbook.SheetNames;

    let records = [];
    let skipped = 0;
    let sheetsWithData = 0;

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: false,
      });

      if (rawData.length < 1) continue;

      const headerIndex = this.findHeaderRow(rawData);
      const headerRow = rawData[headerIndex].map((v) => String(v || "").trim().toLowerCase());

      // Sheet không tìm được cột "họ và tên" thì coi như không phải sheet dữ liệu (vd sheet ghi chú/hướng dẫn)
      const hoTenIdx = headerRow.findIndex((c) => c.includes("họ và tên") || c.includes("họ tên") || c.includes("tên học viên"));
      if (hoTenIdx === -1) continue;

      const dataRows = rawData.slice(headerIndex + 1);
      if (dataRows.length === 0) continue;

      const indices = {
        thoiGian: headerRow.findIndex((c) => c.includes("dấu thời gian") || c === "thoi_gian"),
        maPhieu: headerRow.findIndex((c) => c.includes("mã phiếu") || c === "ma_phieu"),
        hoTen: hoTenIdx,
        ngaySinh: headerRow.findIndex((c) => c.includes("năm sinh") || c.includes("ngày sinh") || c === "ngay_sinh"),
        cccd: headerRow.findIndex((c) => c.includes("cmt") || c.includes("cccd") || c.includes("căn cước")),
        dienThoai: headerRow.findIndex((c) => c.includes("điện thoại") || c.includes("sđt") || c === "dien_thoai"),
        diaChi: headerRow.findIndex((c) => c === "địa chỉ" || (c.includes("địa chỉ") && !c.includes("email"))),
        dauMoi: headerRow.findIndex((c) => c.includes("đầu mối") || c.includes("người tuyển sinh")),
        hang: headerRow.findIndex((c) => c.includes("hạng xe") || c === "hang"),
      };

      const { records: sheetRecords, skipped: sheetSkipped } = this.parseRows(dataRows, indices, options.year);
      records = records.concat(sheetRecords);
      skipped += sheetSkipped;
      sheetsWithData++;
    }

    if (sheetsWithData === 0) {
      throw new Error("Không tìm thấy sheet dữ liệu hợp lệ trong file Excel (thiếu cột Họ và tên)");
    }

    return { records, skipped };
  }

  static findHeaderRow(rawData) {
    let bestIndex = 0;
    let maxScore = 0;

    for (let i = 0; i < Math.min(rawData.length, 12); i++) {
      const row = rawData[i].map((v) => String(v || "").trim().toLowerCase());

      let score = 0;
      if (row.some((c) => c.includes("họ và tên") || c.includes("họ tên"))) score += 2;
      if (row.some((c) => c.includes("năm sinh") || c.includes("ngày sinh"))) score += 2;
      if (row.some((c) => c.includes("hạng xe"))) score += 2;
      if (row.some((c) => c.includes("mã phiếu"))) score += 1;
      if (row.some((c) => c.includes("đầu mối"))) score += 1;
      if (row.some((c) => c.includes("dấu thời gian"))) score += 1;

      if (score > maxScore) {
        maxScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  static parseRows(rows, indices, filterYear) {
    const records = [];
    let skipped = 0;

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const ho_ten = indices.hoTen !== -1 && row[indices.hoTen] !== undefined ? this.parseString(row[indices.hoTen]) : "";

      if (!ho_ten || ho_ten.toLowerCase().includes("họ và tên") || ho_ten.toLowerCase().includes("họ tên")) {
        // Dòng thực sự trống (không có dữ liệu gì ở các cột khác) thì không tính là bị bỏ qua
        if (row.some((c) => c !== undefined && String(c).trim() !== "")) {
          skipped++;
        }
        continue;
      }

      // Phòng trường hợp lỡ import nhầm file quét GPLX (dạng "so_gplx;ho_ten;ngay_sinh;...")
      // vào tính năng này — không có tên người Việt nào chứa dấu ";", nên bỏ qua thẳng dòng đó.
      if (ho_ten.includes(";")) {
        skipped++;
        continue;
      }

      // Lọc theo năm dựa vào "Dấu thời gian" — dùng khi 1 sheet gộp chung dữ liệu nhiều năm
      // (vd sheet báo cáo A1 có cả năm 2023 lẫn 2024), chỉ lấy đúng năm được yêu cầu.
      if (filterYear) {
        const thoiGianVal = this.getCell(row, indices.thoiGian);
        const rowYear = extractYearFromTimestamp(thoiGianVal);
        if (rowYear !== Number(filterYear)) {
          continue;
        }
      }

      const ngay_sinh = indices.ngaySinh !== -1 && row[indices.ngaySinh] !== undefined ? this.parseStringDate(row[indices.ngaySinh]) : "";
      const cccd = this.parseCccd(this.getCell(row, indices.cccd));

      // Yêu cầu tối thiểu để nhận là 1 bản ghi hợp lệ: phải có đủ họ tên + ngày sinh + CCCD.
      // Các trường còn lại (điện thoại, địa chỉ, đầu mối, hạng, mã phiếu...) thiếu vẫn lấy bình thường.
      if (!ngay_sinh || !cccd) {
        skipped++;
        continue;
      }

      records.push({
        ma_phieu: this.parseMaPhieu(this.getCell(row, indices.maPhieu)),
        ho_ten,
        ngay_sinh,
        cccd,
        dien_thoai: this.getCell(row, indices.dienThoai),
        dia_chi: this.getCell(row, indices.diaChi),
        dau_moi: this.getCell(row, indices.dauMoi),
        hang: this.getCell(row, indices.hang),
      });
    }

    return { records, skipped };
  }

  // Excel/Google Sheets thường tự nhận cột CCCD là số nên làm rụng mất các số 0 ở đầu
  // (vd "001234567890" -> 1234567890). CCCD 12 số nên nếu sau khi đọc chỉ toàn chữ số và
  // ngắn hơn 12 ký tự thì đệm lại số 0 ở đầu cho đủ 12 số; giữ nguyên nếu đã có chữ (không phải số).
  static parseCccd(value) {
    return normalizeCccd(value);
  }

  // File nguồn đôi khi bị lệch cột giữa các đợt dán dữ liệu khác nhau, khiến cột "Mã phiếu"
  // đọc nhầm ra giá trị của cột khác (thường gặp nhất là email hoặc mã cơ sở ngắn như "cs3").
  // Không có mã phiếu thật nào chứa "@", nên loại bỏ thẳng để tránh dùng nhầm làm khoá đối chiếu
  // (nếu không, hàng trăm/nghìn dòng khác nhau sẽ bị coi là "trùng" và ghi đè lẫn nhau).
  static parseMaPhieu(value) {
    const text = String(value || "").trim();
    if (!text || text.includes("@")) return "";
    return text;
  }

  static getCell(row, index) {
    if (index === -1 || row[index] === undefined) return "";
    return this.parseString(row[index]);
  }

  static parseString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  static parseStringDate(value) {
    if (value === null || value === undefined || value === "") return "";

    if (typeof value === "number") {
      try {
        const date = XLSX.SSF.parse_date_code(value);
        const d = String(date.d).padStart(2, "0");
        const m = String(date.m).padStart(2, "0");
        return `${d}/${m}/${date.y}`;
      } catch {
        return String(value).trim();
      }
    }

    const valStr = String(value).trim();
    if (!valStr) return "";

    try {
      const dmyMatch = valStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (dmyMatch) {
        let p1 = parseInt(dmyMatch[1]);
        let p2 = parseInt(dmyMatch[2]);
        let year = parseInt(dmyMatch[3]);

        if (year < 100) {
          year += year < 30 ? 2000 : 1900;
        }

        if (p2 > 12 && p1 <= 12) {
          return `${String(p2).padStart(2, "0")}/${String(p1).padStart(2, "0")}/${year}`;
        }
        return `${String(p1).padStart(2, "0")}/${String(p2).padStart(2, "0")}/${year}`;
      }

      const isoMatch = valStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (isoMatch) {
        const year = isoMatch[1];
        const month = String(isoMatch[2]).padStart(2, "0");
        const day = String(isoMatch[3]).padStart(2, "0");
        return `${day}/${month}/${year}`;
      }

      const parsedDate = new Date(valStr);
      if (!isNaN(parsedDate.getTime())) {
        const day = String(parsedDate.getDate()).padStart(2, "0");
        const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
        const year = parsedDate.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch (e) {
      console.error("[GoogleSheetA1ExcelParser.parseStringDate Error]", e.message);
    }

    return valStr;
  }
}

module.exports = GoogleSheetA1ExcelParser;
