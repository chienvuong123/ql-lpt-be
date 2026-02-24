const XLSX = require("xlsx");

class StudentExcelParser {
  static parseExcel(filePath, options = {}) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = options.sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    if (rawData.length < 6) {
      throw new Error("File Excel không hợp lệ");
    }

    const headerIndex = this.findHeaderRow(rawData);
    const dataRows = rawData.slice(headerIndex + 1);

    if (dataRows.length === 0) {
      throw new Error("Không có dữ liệu");
    }

    return this.parseStudentData(dataRows);
  }

  static findHeaderRow(rawData) {
    for (let i = 0; i < Math.min(rawData.length, 12); i++) {
      const row = rawData[i].map((v) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      );
      if (
        row[0].includes("stt") &&
        row[1].includes("mã đăng ký") &&
        row[3].includes("tên")
      ) {
        return i;
      }
    }

    for (let i = 0; i < Math.min(rawData.length, 12); i++) {
      if (String(rawData[i][0] || "").trim() === "STT") {
        return i;
      }
    }

    return 3;
  }

  static parseStudentData(rows) {
    const students = [];

    for (const row of rows) {
      if (!row || row.length < 15) continue;

      const maDangKy = this.parseString(row[1]);
      if (!maDangKy || maDangKy.length < 10 || !maDangKy.includes("-")) {
        continue;
      }

      students.push({
        stt: this.parseNumber(row[0]),
        maDangKy,
        ma: this.parseString(row[2]),
        ten: this.parseString(row[3]),
        gioiTinh: this.parseString(row[4]),
        ngaySinh: this.parseDate(row[5]),
        trangThaiDat: this.parseString(row[6]),

        kyThuatLaiXe: {
          diem: this.parseNumber(row[7]),
          trangThaiDat: this.parseString(row[8]),
        },

        cauTaoSuaChua: {
          diem: this.parseNumber(row[9]),
          trangThaiDat: this.parseString(row[10]),
        },

        daoDucVHGT: {
          diem: this.parseNumber(row[11]),
          trangThaiDat: this.parseString(row[12]),
        },

        phapLuatGT08: {
          pl1: {
            diem: this.parseNumber(row[13]),
            trangThaiDat: this.parseString(row[14]),
          },
          pl2: {
            diem: this.parseNumber(row[15]),
            trangThaiDat: this.parseString(row[16]),
          },
          pl3: {
            diem: this.parseNumber(row[17]),
            trangThaiDat: this.parseString(row[18]),
          },
          tongOnTap: {
            diem: this.parseNumber(row[19]),
            trangThaiDat: this.parseString(row[20]),
          },
        },

        moPhong: {
          diem: this.parseNumber(row[21]),
          trangThaiDat: this.parseString(row[22]),
        },

        thoiGianDat: this.parseString(row[23]),
        ghiChu: this.parseString(row[24]),
        lanCuoiDangNhap: this.parseDateTime(row[25]),
        thoiGianDaHocHomNay: this.parseString(row[26]),
      });
    }

    return students;
  }

  static parseString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  static parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  static parseDate(value) {
    if (!value) return null;
    try {
      if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);
        return new Date(date.y, date.m - 1, date.d);
      }
      if (typeof value === "string") {
        const parts = value.split("/");
        if (parts.length === 3) {
          return new Date(parts[2], parts[1] - 1, parts[0]);
        }
      }
      return new Date(value);
    } catch {
      return null;
    }
  }

  static parseDateTime(value) {
    if (!value) return null;
    try {
      if (typeof value === "string") {
        const match = value.match(
          /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/,
        );
        if (match) {
          const [, d, M, y, h, m] = match;
          return new Date(y, M - 1, d, h, m);
        }
        const date = new Date(value);
        if (!isNaN(date.getTime())) return date;
      }
      if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);
        return new Date(
          date.y,
          date.m - 1,
          date.d,
          date.H || 0,
          date.M || 0,
          date.S || 0,
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  static validateData(data) {
    const errors = [];
    data.forEach((student, index) => {
      const rowErrors = [];
      if (!student.maDangKy) rowErrors.push("Thiếu mã đăng ký");
      if (!student.ten) rowErrors.push("Thiếu tên học viên");
      if (rowErrors.length > 0) {
        errors.push({
          row: index + 1,
          maDangKy: student.maDangKy,
          ten: student.ten,
          errors: rowErrors,
        });
      }
    });
    return { isValid: errors.length === 0, errors };
  }
}

module.exports = StudentExcelParser;
