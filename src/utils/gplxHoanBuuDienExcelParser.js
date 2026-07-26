const XLSX = require("xlsx");

// File tra cứu kết quả trả GPLX qua bưu điện (export từ hệ thống bưu điện), có các cột kiểu:
// Tên khách hàng người nhận | Địa chỉ người nhận | Ngày chấp nhận | Người nhận/Lý do |
// Bưu cục phát | Kết quả xử lý | SỐ GPLX | NGÀY THI | NGÀY GHI TRÊN BẰNG | STT MỚI | CŨ | Số hiệu BG
//
// Chỉ thật sự cần 3 thứ để chấp nhận 1 dòng: tên+ngày sinh (tách từ "Tên khách hàng người nhận"),
// "SỐ GPLX", và có giá trị ở "NGÀY THI" (dùng để xác nhận đây là dòng dữ liệu thật đã xử lý xong,
// KHÔNG lưu giá trị ngày thi vào bảng). Các cột khác (địa chỉ, ngày ghi trên bằng...) không bắt buộc,
// thiếu thì để trống, không suy đoán hay chặn import.
//
// Địa chỉ nguồn có tiền tố rác dạng "- - " (vd "- - Hải Phòng") cần lọc bỏ.
//
// LƯU Ý: cột SỐ GPLX trong file gốc thường bị Excel lưu dưới dạng SỐ (không phải text) và hiển thị
// ở định dạng General -> với các mã dài (12 số) Excel/SheetJS format thành dạng khoa học kiểu
// "3.0025E+11" khi đọc formatted string, làm mất số. Phải lấy giá trị số THÔ (raw) rồi tự
// Math.round + String() để giữ nguyên đầy đủ chữ số thay vì dùng chuỗi đã format sẵn.
class GplxHoanBuuDienExcelParser {
  static parseExcel(fileBuffer, options = {}) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetNames = options.sheetName ? [options.sheetName] : workbook.SheetNames;

    const records = [];
    let skipped = 0;

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const rawDataFormatted = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: false,
      });

      if (rawDataFormatted.length < 1) continue;

      // Đọc song song bản "raw" (số gốc, không format) chỉ để lấy đúng giá trị SỐ GPLX —
      // cùng tuỳ chọn blankrows:false nên 2 mảng luôn khớp hàng với nhau theo index.
      const rawDataRaw = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: true,
      });

      const headerIndex = this.findHeaderRow(rawDataFormatted);
      const headerRow = rawDataFormatted[headerIndex].map((v) => String(v || "").trim().toLowerCase());

      const indices = {
        hoTenNgaySinh: headerRow.findIndex((c) => c.includes("tên khách hàng") || c.includes("tên người nhận")),
        diaChi: headerRow.findIndex((c) => c.includes("địa chỉ người nhận") || (c.includes("địa chỉ") && !c.includes("email"))),
        soGplx: headerRow.findIndex((c) => c.includes("số gplx") || c === "so_gplx"),
        ngayCap: headerRow.findIndex((c) => c.includes("ngày ghi trên bằng")),
        ngayThi: headerRow.findIndex((c) => c.includes("ngày thi")),
      };

      // Sheet thiếu 1 trong 3 cột bắt buộc thì coi như không phải sheet dữ liệu này.
      if (indices.soGplx === -1 || indices.hoTenNgaySinh === -1 || indices.ngayThi === -1) continue;

      const dataRowsFormatted = rawDataFormatted.slice(headerIndex + 1);
      const dataRowsRaw = rawDataRaw.slice(headerIndex + 1);

      for (let i = 0; i < dataRowsFormatted.length; i++) {
        const row = dataRowsFormatted[i];
        if (!row || row.length === 0) continue;

        const rawRow = dataRowsRaw[i] || row;
        const soGplxRawVal = rawRow[indices.soGplx];
        const soGplx = this.extractSoGplx(soGplxRawVal, this.getCell(row, indices.soGplx));
        if (!soGplx || !/^\d+$/.test(soGplx)) {
          if (row.some((c) => c !== undefined && String(c).trim() !== "")) skipped++;
          continue;
        }

        const { ho_ten, ngay_sinh } = this.parseNameAndDob(this.getCell(row, indices.hoTenNgaySinh));
        if (!ho_ten) {
          skipped++;
          continue;
        }

        // "Ngày thi" chỉ dùng để xác nhận dòng đã xử lý xong (không lưu vào bảng) — thiếu thì
        // coi như dòng chưa hoàn tất, bỏ qua.
        const ngayThi = this.getCell(row, indices.ngayThi);
        if (!ngayThi) {
          skipped++;
          continue;
        }

        records.push({
          so_gplx: soGplx,
          ho_ten,
          ngay_sinh,
          hang: "",
          ngay_cap: this.normalizeDate(this.getCell(row, indices.ngayCap)),
          thoi_han: "",
          dia_chi: this.parseDiaChi(this.getCell(row, indices.diaChi)),
        });
      }
    }

    return { records, skipped };
  }

  static findHeaderRow(rawData) {
    let bestIndex = 0;
    let maxScore = 0;

    for (let i = 0; i < Math.min(rawData.length, 12); i++) {
      const row = rawData[i].map((v) => String(v || "").trim().toLowerCase());

      let score = 0;
      if (row.some((c) => c.includes("số gplx"))) score += 2;
      if (row.some((c) => c.includes("tên khách hàng"))) score += 2;
      if (row.some((c) => c.includes("ngày thi"))) score += 1;
      if (row.some((c) => c.includes("ngày ghi trên bằng"))) score += 1;
      if (row.some((c) => c.includes("bưu cục phát"))) score += 1;

      if (score > maxScore) {
        maxScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  static getCell(row, index) {
    if (index === -1 || row[index] === undefined) return "";
    return String(row[index]).trim();
  }

  // Ưu tiên giá trị số thô (không bị Excel format thành dạng khoa học như "3.0025E+11")
  // -> làm tròn rồi chuyển thẳng sang chuỗi (JS không tự chuyển sang dạng khoa học với
  // số nguyên < 1e21 nên đủ an toàn cho mã GPLX 12 số).
  static extractSoGplx(rawValue, formattedValue) {
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return String(Math.round(rawValue));
    }
    return String(formattedValue || "").trim();
  }

  // Cột gộp "Họ Tên NNN dd/mm/yyyy" -> tách ngày sinh ở cuối chuỗi, phần còn lại là họ tên.
  static parseNameAndDob(value) {
    const text = String(value || "").trim();
    if (!text) return { ho_ten: "", ngay_sinh: "" };

    const match = text.match(/^(.*?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (match) {
      return { ho_ten: match[1].trim(), ngay_sinh: this.normalizeDate(match[2]) };
    }
    return { ho_ten: text, ngay_sinh: "" };
  }

  // Địa chỉ nguồn có tiền tố rác dạng dấu gạch ngang do cột gộp nhiều cấp hành chính bị trống
  // (vd "- - Hải Phòng" khi thiếu cấp xã/huyện) -> bỏ hết dấu "-"/khoảng trắng ở đầu.
  static parseDiaChi(value) {
    return String(value || "").trim().replace(/^[\s-]+/, "").trim();
  }

  static normalizeDate(value) {
    if (!value) return "";

    if (typeof value === "number") {
      try {
        const date = XLSX.SSF.parse_date_code(value);
        return `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${date.y}`;
      } catch {
        return String(value).trim();
      }
    }

    // Bỏ phần giờ nếu có (vd "02/04/2026 16:47:11" -> "02/04/2026")
    const valStr = String(value).trim().split(/\s+/)[0];
    const match = valStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      let [, d, m, y] = match;
      if (y.length === 2) y = (Number(y) < 30 ? "20" : "19") + y;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
    return valStr;
  }
}

module.exports = GplxHoanBuuDienExcelParser;
