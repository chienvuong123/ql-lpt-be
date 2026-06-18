const XLSX = require("xlsx");

class DsNhanGplxExcelParser {
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

    // Map headers to columns dynamically
    const headerRow = rawData[headerIndex].map((v) =>
      String(v || "")
        .trim()
        .toLowerCase()
    );

    // Identify the column indices dynamically
    const indices = {
      hoTen: headerRow.findIndex(c => c.includes("họ tên") || c.includes("họ và tên") || c.includes("tên học viên") || c === "tên" || c === "ho_ten"),
      ngaySinh: headerRow.findIndex(c => c.includes("ngày sinh") || c.includes("ngaysinh") || c === "ngay_sinh" || c === "dob"),
      soGplx: headerRow.findIndex(c => c.includes("số gplx") || c.includes("gplx") || c.includes("số hiệu gplx") || c === "so_gplx"),
      diaChi: headerRow.findIndex(c => c.includes("địa chỉ") || c.includes("diachi") || c === "dia_chi" || c === "address"),
      daNhan: headerRow.findIndex(c => c.includes("đã nhận") || c.includes("da_nhan") || c.includes("trạng thái nhận")),
      ghiChu: headerRow.findIndex(c => c.includes("ghi chú") || c.includes("ghichu") || c === "ghi_chu" || c === "notes" || c.includes("ngày nhận") || c.includes("ngaynhan")),
    };

    // If headers are missing, check generic synonyms for basic columns
    if (indices.hoTen === -1) indices.hoTen = headerRow.findIndex(c => c.includes("họ") || c.includes("tên"));
    
    // Safely default only name and birthday to basic columns if still missing to keep it working
    if (indices.hoTen === -1) indices.hoTen = 1;
    if (indices.ngaySinh === -1) indices.ngaySinh = 2;

    return this.parseGplxData(dataRows, indices);
  }

  static findHeaderRow(rawData) {
    let bestIndex = 0;
    let maxScore = 0;

    for (let i = 0; i < Math.min(rawData.length, 12); i++) {
      const row = rawData[i].map((v) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      );
      
      let score = 0;
      if (row.some(c => c.includes("họ tên") || c.includes("họ và tên") || c === "tên" || c.includes("học viên"))) score += 2;
      if (row.some(c => c.includes("ngày sinh") || c.includes("ngaysinh"))) score += 2;
      if (row.some(c => c.includes("địa chỉ") || c.includes("diachi"))) score += 1;
      if (row.some(c => c.includes("gplx") || c.includes("giấy phép") || c.includes("số hiệu gplx"))) score += 1;
      if (row.some(c => c === "stt" || c.includes("thứ tự"))) score += 1;

      if (score > maxScore) {
        maxScore = score;
        bestIndex = i;
      }
    }
    
    return bestIndex;
  }

  static parseGplxData(rows, indices) {
    const records = [];

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const ho_ten = indices.hoTen !== -1 && row[indices.hoTen] !== undefined ? this.parseString(row[indices.hoTen]) : "";
      
      // Defensively skip headers or empty rows
      if (!ho_ten || ho_ten === "" || ho_ten.toLowerCase() === "họ và tên" || ho_ten.toLowerCase() === "họ tên" || ho_ten.toLowerCase() === "họ và tên học viên") {
        continue;
      }

      records.push({
        ho_ten,
        ngay_sinh: indices.ngaySinh !== -1 && row[indices.ngaySinh] !== undefined ? this.parseStringDate(row[indices.ngaySinh]) : "",
        so_gplx: indices.soGplx !== -1 && row[indices.soGplx] !== undefined ? this.parseString(row[indices.soGplx]) : "",
        dia_chi: indices.diaChi !== -1 && row[indices.diaChi] !== undefined ? this.parseString(row[indices.diaChi]) : "",
        da_nhan: indices.daNhan !== -1 && row[indices.daNhan] !== undefined ? (this.parseString(row[indices.daNhan]).toLowerCase() === "đã nhận" || this.parseString(row[indices.daNhan]) === "1" || this.parseString(row[indices.daNhan]).toLowerCase() === "true") : false,
        ghi_chu: indices.ghiChu !== -1 && row[indices.ghiChu] !== undefined ? this.parseString(row[indices.ghiChu]) : "",
      });
    }

    return records;
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
        const d = String(date.d).padStart(2, '0');
        const m = String(date.m).padStart(2, '0');
        return `${d}/${m}/${date.y}`;
      } catch {
        return String(value).trim();
      }
    }

    let valStr = String(value).trim();
    if (!valStr) return "";

    try {
      // 1. Match DD/MM/YYYY or MM/DD/YYYY formats
      const dmyMatch = valStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (dmyMatch) {
        let p1 = parseInt(dmyMatch[1]);
        let p2 = parseInt(dmyMatch[2]);
        let year = parseInt(dmyMatch[3]);

        if (year < 100) {
          year += year < 30 ? 2000 : 1900;
        }

        if (p2 > 12 && p1 <= 12) {
          // p2 is day, p1 is month (e.g. 11/24/1997) -> convert to DD/MM/YYYY
          return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${year}`;
        } else {
          // Otherwise, it is already DD/MM/YYYY (either p1 > 12, or both <= 12, e.g. 05/06/1991)
          return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${year}`;
        }
      }

      // 2. Match ISO format YYYY-MM-DD
      const isoMatch = valStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (isoMatch) {
        const year = isoMatch[1];
        const month = String(isoMatch[2]).padStart(2, '0');
        const day = String(isoMatch[3]).padStart(2, '0');
        return `${day}/${month}/${year}`;
      }

      // 3. Fallback to native Date parser
      const parsedDate = new Date(valStr);
      if (!isNaN(parsedDate.getTime())) {
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const year = parsedDate.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch (e) {
      console.error("[parseStringDate Error]", e.message);
    }

    return valStr;
  }
}

module.exports = DsNhanGplxExcelParser;
