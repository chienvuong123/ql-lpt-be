// Chuẩn hoá các kiểu chuỗi ngày Việt Nam hay gặp (kể cả không đệm số 0, năm 2 chữ số như
// "1/6/84") về đúng dạng "dd/mm/yyyy" — để lưu DB nhất quán, tránh việc TRY_CONVERT/TRY_CAST
// trong SQL đoán sai định dạng (vd hiểu nhầm "1/6/84" thành tháng/ngày kiểu Mỹ).
const normalizeVietnameseDate = (value) => {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number") {
    try {
      const XLSX = require("xlsx");
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
    const dmyMatch = valStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dmyMatch) {
      let p1 = parseInt(dmyMatch[1], 10);
      let p2 = parseInt(dmyMatch[2], 10);
      let year = parseInt(dmyMatch[3], 10);

      if (year < 100) {
        year += year < 30 ? 2000 : 1900;
      }

      if (p2 > 12 && p1 <= 12) {
        // p2 là ngày, p1 là tháng (vd 11/24/1997) -> đổi lại thành DD/MM/YYYY
        return `${String(p2).padStart(2, "0")}/${String(p1).padStart(2, "0")}/${year}`;
      }
      return `${String(p1).padStart(2, "0")}/${String(p2).padStart(2, "0")}/${year}`;
    }

    const isoMatch = valStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoMatch) {
      const year = isoMatch[1];
      const month = String(isoMatch[2]).padStart(2, "0");
      const day = String(isoMatch[3]).padStart(2, "0");
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    console.error("[normalizeVietnameseDate Error]", e.message);
  }

  return valStr;
};

// Lấy năm (4 chữ số, 2000-2099) từ 1 chuỗi timestamp/ngày bất kỳ định dạng — dùng để lọc
// import theo năm khi 1 sheet gộp chung dữ liệu nhiều năm.
const extractYearFromTimestamp = (value) => {
  if (!value) return null;
  const matches = String(value).match(/\d{4}/g);
  if (!matches) return null;
  const validYear = matches.find((y) => {
    const n = parseInt(y, 10);
    return n >= 2000 && n <= 2099;
  });
  return validYear ? parseInt(validYear, 10) : null;
};

module.exports = { normalizeVietnameseDate, extractYearFromTimestamp };
