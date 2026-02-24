const XLSX = require("xlsx");

class CourseExcelParser {
  static parseExcel(filePath) {
    const workbook = XLSX.readFile(filePath);
    const rawData = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { header: 1, defval: null, blankrows: false },
    );
    return this.parseCourseData(rawData.slice(3));
  }

  static parseCourseData(rows) {
    return rows
      .filter((r) => r[1])
      .map((row) => ({
        maKhoa: String(row[1] || "").trim(),
        tenKhoa: String(row[2] || "").trim(),
        donViToChuc: String(row[2] || "").trim(),
        lopHoc: Number(row[3]) || 0,
        luotCuDiHoc: Number(row[4]) || 0,
        soLuotDat: Number(row[5]) || 0,
        ngayBatDau: this.parseDate(row[6]),
        ngayKetThuc: this.parseDate(row[7]),
        trangThai: String(row[8] || "").trim(),
      }));
  }

  static parseDate(v) {
    if (!v) return null;
    if (typeof v === "number") {
      const d = XLSX.SSF.parse_date_code(v);
      return new Date(d.y, d.m - 1, d.d);
    }
    const p = String(v).split("/");
    return p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : new Date(v);
  }

  static validateData(data) {
    const errors = data
      .filter((c) => !c.maKhoa || !c.tenKhoa)
      .map((c, i) => ({ row: i + 4, error: "Missing maKhoa or tenKhoa" }));
    return { isValid: errors.length === 0, errors };
  }
}
module.exports = CourseExcelParser;
