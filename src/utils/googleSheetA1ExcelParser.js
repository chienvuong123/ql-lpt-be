const XLSX = require("xlsx");

// File Excel export từ Google Form đăng ký học A1, dạng bảng có hàng tiêu đề, các cột:
// Dấu thời gian | Địa chỉ email | Mã phiếu | Họ và tên | Năm sinh | CMT/CCCD | Điện thoại |
// Địa chỉ | Loại hình | Đầu mối tuyển sinh | Hạng xe | Phí HS | Ghi chú
class GoogleSheetA1ExcelParser {
  static parseExcel(fileBuffer, options = {}) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = options.sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    if (rawData.length < 1) {
      throw new Error("File Excel không hợp lệ hoặc rỗng");
    }

    const headerIndex = this.findHeaderRow(rawData);
    const dataRows = rawData.slice(headerIndex + 1);

    if (dataRows.length === 0) {
      throw new Error("Không có dữ liệu trong file Excel");
    }

    const headerRow = rawData[headerIndex].map((v) => String(v || "").trim().toLowerCase());

    const indices = {
      maPhieu: headerRow.findIndex((c) => c.includes("mã phiếu") || c === "ma_phieu"),
      hoTen: headerRow.findIndex((c) => c.includes("họ và tên") || c.includes("họ tên") || c.includes("tên học viên")),
      ngaySinh: headerRow.findIndex((c) => c.includes("năm sinh") || c.includes("ngày sinh") || c === "ngay_sinh"),
      cccd: headerRow.findIndex((c) => c.includes("cmt") || c.includes("cccd") || c.includes("căn cước")),
      dienThoai: headerRow.findIndex((c) => c.includes("điện thoại") || c.includes("sđt") || c === "dien_thoai"),
      diaChi: headerRow.findIndex((c) => c === "địa chỉ" || (c.includes("địa chỉ") && !c.includes("email"))),
      dauMoi: headerRow.findIndex((c) => c.includes("đầu mối") || c.includes("người tuyển sinh")),
      hang: headerRow.findIndex((c) => c.includes("hạng xe") || c === "hang"),
    };

    return this.parseRows(dataRows, indices);
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

  static parseRows(rows, indices) {
    const records = [];

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const ho_ten = indices.hoTen !== -1 && row[indices.hoTen] !== undefined ? this.parseString(row[indices.hoTen]) : "";

      if (!ho_ten || ho_ten.toLowerCase().includes("họ và tên") || ho_ten.toLowerCase().includes("họ tên")) {
        continue;
      }

      // Phòng trường hợp lỡ import nhầm file quét GPLX (dạng "so_gplx;ho_ten;ngay_sinh;...")
      // vào tính năng này — không có tên người Việt nào chứa dấu ";", nên bỏ qua thẳng dòng đó.
      if (ho_ten.includes(";")) {
        continue;
      }

      records.push({
        ma_phieu: this.getCell(row, indices.maPhieu),
        ho_ten,
        ngay_sinh: indices.ngaySinh !== -1 && row[indices.ngaySinh] !== undefined ? this.parseStringDate(row[indices.ngaySinh]) : "",
        cccd: this.parseCccd(this.getCell(row, indices.cccd)),
        dien_thoai: this.getCell(row, indices.dienThoai),
        dia_chi: this.getCell(row, indices.diaChi),
        dau_moi: this.getCell(row, indices.dauMoi),
        hang: this.getCell(row, indices.hang),
      });
    }

    return records;
  }

  // Excel/Google Sheets thường tự nhận cột CCCD là số nên làm rụng mất các số 0 ở đầu
  // (vd "001234567890" -> 1234567890). CCCD 12 số nên nếu sau khi đọc chỉ toàn chữ số và
  // ngắn hơn 12 ký tự thì đệm lại số 0 ở đầu cho đủ 12 số; giữ nguyên nếu đã có chữ (không phải số).
  static parseCccd(value) {
    let text = String(value || "").trim();
    if (text.startsWith("'")) text = text.substring(1).trim();
    if (/^\d+$/.test(text) && text.length > 0 && text.length < 12) {
      return text.padStart(12, "0");
    }
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
