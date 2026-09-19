const XLSX = require("xlsx");

// File Excel "Quản lý phiên học thực hành lái xe trên đường" do CSĐT/Sở GTVT xuất ra:
// vài dòng tiêu đề trống ở đầu, dòng header nằm ở đâu đó trong ~15 dòng đầu, cột xác định
// bằng cách dò chữ trong ô header (không cố định theo vị trí cột vì file có thể lệch cột).
const HEADER_FIELD_MATCHERS = [
  ["mã phiên học", "ma_phien_hoc"],
  ["thời gian bắt đầu", "thoi_gian_bat_dau"],
  ["thời gian kết thúc", "thoi_gian_ket_thuc"],
  ["thời gian thực hành", "thoi_gian_thuc_hanh_gio"],
  ["quãng đường thực hành", "quang_duong_thuc_hanh_km"],
  ["mã giáo viên", "ma_giao_vien"],
  ["họ và tên giáo viên", "ho_ten_giao_vien"],
  ["họ tên giáo viên", "ho_ten_giao_vien"],
  ["mã học viên", "ma_hoc_vien"],
  ["họ và tên học viên", "ho_ten_hoc_vien"],
  ["họ tên học viên", "ho_ten_hoc_vien"],
  ["mã khóa học", "ma_khoa_hoc"],
  ["hạng đào tạo", "hang_dao_tao"],
  ["biển số xe", "bien_so_xe"],
  ["sở xây dựng", "so_xay_dung"],
  ["cơ sở đào tạo", "co_so_dao_tao"],
  ["đơn vị truyền dữ liệu", "don_vi_truyen_du_lieu"],
  ["thời gian máy chủ", "thoi_gian_may_chu_nhan"],
  ["thời gian truyền dữ liệu", "thoi_gian_truyen_du_lieu"],
  ["trạng thái", "trang_thai"],
];

const normalizeHeaderText = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Trạng thái coi là "Khả dụng" — so khớp không phân biệt hoa thường/khoảng trắng.
const isKhaDung = (trangThai) =>
  normalizeHeaderText(trangThai) === "khả dụng";

// Cắt bớt phòng trường hợp dò cột lệch hoặc dữ liệu nguồn dài bất thường —
// tránh lỗi "String or binary data would be truncated" khi ghi vào NVARCHAR có giới hạn.
const truncateStr = (value, maxLen) => {
  const str = String(value || "").trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
};

const parseDateTime = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const isoLike = trimmed.includes(" ") && !trimmed.includes("T")
    ? trimmed.replace(" ", "T")
    : trimmed;
  const date = new Date(isoLike);
  return isNaN(date.getTime()) ? null : date;
};

function detectHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 20);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const hasMaPhienHoc = row.some(
      (cell) => normalizeHeaderText(cell).includes("mã phiên học"),
    );
    if (hasMaPhienHoc) return i;
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const columnMap = {};
  const usedFields = new Set();

  headerRow.forEach((cell, colIndex) => {
    const normalized = normalizeHeaderText(cell);
    if (!normalized) return;

    for (const [matcher, field] of HEADER_FIELD_MATCHERS) {
      if (usedFields.has(field)) continue;
      if (normalized.includes(matcher)) {
        columnMap[field] = colIndex;
        usedFields.add(field);
        break;
      }
    }
  });

  return columnMap;
}

class PhienHocThucHanhCsdtExcelParser {
  static parseExcel(fileBuffer) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return { records: [], skipped: 0, duplicatedInFile: 0 };

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    const headerRowIndex = detectHeaderRow(rows);
    if (headerRowIndex === -1) {
      return { records: [], skipped: 0, duplicatedInFile: 0 };
    }

    const columnMap = buildColumnMap(rows[headerRowIndex]);
    if (columnMap.ma_phien_hoc === undefined) {
      return { records: [], skipped: 0, duplicatedInFile: 0 };
    }

    const rawRecords = [];
    let skipped = 0;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const maPhienHoc = String(row[columnMap.ma_phien_hoc] || "").trim();
      if (!maPhienHoc) {
        const hasAnyData = row.some((cell) => String(cell || "").trim() !== "");
        if (hasAnyData) skipped++;
        continue;
      }

      const get = (field) =>
        columnMap[field] !== undefined ? row[columnMap[field]] : "";

      rawRecords.push({
        ma_phien_hoc: truncateStr(maPhienHoc, 195),
        thoi_gian_bat_dau: parseDateTime(get("thoi_gian_bat_dau")),
        thoi_gian_ket_thuc: parseDateTime(get("thoi_gian_ket_thuc")),
        thoi_gian_thuc_hanh_gio: parseNumber(get("thoi_gian_thuc_hanh_gio")),
        quang_duong_thuc_hanh_km: parseNumber(get("quang_duong_thuc_hanh_km")),
        ma_giao_vien: truncateStr(get("ma_giao_vien"), 95),
        ho_ten_giao_vien: truncateStr(get("ho_ten_giao_vien"), 250),
        ma_hoc_vien: truncateStr(get("ma_hoc_vien"), 145),
        ho_ten_hoc_vien: truncateStr(get("ho_ten_hoc_vien"), 250),
        ma_khoa_hoc: truncateStr(get("ma_khoa_hoc"), 145),
        hang_dao_tao: truncateStr(get("hang_dao_tao"), 95),
        bien_so_xe: truncateStr(get("bien_so_xe"), 45),
        so_xay_dung: truncateStr(get("so_xay_dung"), 250),
        co_so_dao_tao: truncateStr(get("co_so_dao_tao"), 250),
        don_vi_truyen_du_lieu: truncateStr(get("don_vi_truyen_du_lieu"), 250),
        thoi_gian_truyen_du_lieu: parseDateTime(get("thoi_gian_truyen_du_lieu")),
        thoi_gian_may_chu_nhan: parseDateTime(get("thoi_gian_may_chu_nhan")),
        trang_thai: truncateStr(get("trang_thai"), 95),
      });
    }

    // Dedup trong cùng 1 file: nếu 1 mã phiên học xuất hiện nhiều lần, chỉ giữ lại
    // bản ghi có trạng thái "Khả dụng"; nếu không có bản nào Khả dụng thì giữ bản đầu tiên.
    const grouped = new Map();
    rawRecords.forEach((record) => {
      if (!grouped.has(record.ma_phien_hoc)) {
        grouped.set(record.ma_phien_hoc, []);
      }
      grouped.get(record.ma_phien_hoc).push(record);
    });

    let duplicatedInFile = 0;
    const records = [];
    grouped.forEach((group) => {
      if (group.length > 1) duplicatedInFile += group.length - 1;
      const khaDungRecord = group.find((r) => isKhaDung(r.trang_thai));
      records.push(khaDungRecord || group[0]);
    });

    return { records, skipped, duplicatedInFile };
  }
}

module.exports = PhienHocThucHanhCsdtExcelParser;
module.exports.isKhaDung = isKhaDung;
