const XLSX = require("xlsx");

// Cột A có dạng: "990158889612;LÊ ĐÌNH LẬP;24081987;A1;06052025;Không thời hạn;Hải Dương"
// kèm theo dòng url "https://gplx.csgt.bocongan.gov.vn/" (có thể tách dòng hoặc dính liền)
class GplxHoanExcelParser {
  static parseExcel(fileBuffer, options = {}) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetNames = options.sheetName ? [options.sheetName] : workbook.SheetNames;

    const records = [];
    let skipped = 0;

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: false,
      });

      for (const row of rawData) {
        const cellValue = row && row[0];
        const record = this.parseRow(cellValue);
        if (record) {
          records.push(record);
        } else if (this.looksLikeDataRow(cellValue)) {
          skipped++;
        }
      }
    }

    return { records, skipped };
  }

  // Dòng title/tổng hợp (VD: "THÁNG 5/2025", "CỘNG THÁNG 5/2025") không có chuỗi số dài
  // nên không tính là dòng dữ liệu bị thiếu trường.
  static looksLikeDataRow(cellValue) {
    if (cellValue === null || cellValue === undefined) return false;
    const text = String(cellValue).replace(/https?:\/\/\S+/gi, "").trim();
    if (!text) return false;
    return /\d{6,}/.test(text);
  }

  static parseRow(cellValue) {
    if (cellValue === null || cellValue === undefined) return null;

    const text = String(cellValue)
      .replace(/https?:\/\/\S+/gi, "")
      .trim();

    if (!text) return null;

    const parts = text.split(";").map((p) => p.trim());
    if (parts.length < 6) return null;

    const [soGplx, hoTen, ngaySinh, hang, ngayCap, thoiHan, diaChi = ""] = parts;

    if (!soGplx || !/^\d+$/.test(soGplx)) return null;
    if (!hoTen) return null;
    if (!hang) return null;

    return {
      so_gplx: soGplx,
      ho_ten: hoTen,
      ngay_sinh: this.parseDate(ngaySinh),
      hang,
      ngay_cap: this.parseDate(ngayCap),
      thoi_han: this.parseThoiHan(thoiHan),
      dia_chi: diaChi ? diaChi.trim() : "",
    };
  }

  static parseDate(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const match = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${dd}/${mm}/${yyyy}`;
    }
    return trimmed;
  }

  static parseThoiHan(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const match = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${dd}/${mm}/${yyyy}`;
    }
    return trimmed;
  }
}

module.exports = GplxHoanExcelParser;
