const XLSX = require("xlsx");
const uyQuyenRepository = require("../repositories/uyquyet.repository");
const UyQuyen = require("../models/uyquyen.model");

// Normalizes header strings to ignore Vietnamese accents, case, and spaces
function normalizeHeaderStr(str) {
    if (!str) return "";
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    const str = String(val).trim();
    if (!str || str === "" || str === "#N/A" || str.toUpperCase() === "N/A" || str === "0") return null;

    // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed month
        const year = parseInt(dmyMatch[3], 10);
        const date = new Date(year, month, day);
        return isNaN(date.getTime()) ? null : date;
    }

    const parsedDate = new Date(str);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

// Converts a time-frame string/number input to months
function parseThoiHanToMonths(val) {
    if (!val) return null;
    const str = String(val).trim().toLowerCase();
    const numMatch = str.match(/(\d+)/);
    if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        // If the string explicitly has "năm"/"nam" or the value is low (<= 10), treat as years and convert to months
        if (str.includes("năm") || str.includes("nam") || num <= 10) {
            return String(num * 12);
        }
        return String(num); // Otherwise it is already in months
    }
    return str;
}

function normalizePayload(data) {
    if (!data) return {};
    const normalized = { ...data };
    
    // Support mapping alternate fields if passed from frontend
    if (data.bien_so && !data.bien_so_xe) {
        normalized.bien_so_xe = data.bien_so;
    } else if (data.bien_kiem_soat && !data.bien_so_xe) {
        normalized.bien_so_xe = data.bien_kiem_soat;
    }
    
    // Convert time-frame term to months
    if (data.thoi_han_uy_quyen) {
        normalized.thoi_han_uy_quyen = parseThoiHanToMonths(data.thoi_han_uy_quyen);
    }
    
    return normalized;
}

const getListUyQuyen = async (search, page = 1, limit = 10) => {
    const { data, pagination } = await uyQuyenRepository.getListUyQuyenSql(search, page, limit);
    return {
        data: data.map(item => new UyQuyen(item)),
        pagination,
    };
}

const createUyQuyen = async (rawData) => {
    try {
        const data = normalizePayload(rawData);
        if (!data.bien_so_xe) {
            throw new Error("Biển số xe là bắt buộc!");
        }

        return await uyQuyenRepository.createUyQuyenSql(data);
    } catch (error) {
        throw error;
    }
}

const editUyQuyen = async (id, rawData) => {
    try {
        const data = normalizePayload(rawData);
        const existingRecord = await uyQuyenRepository.getById(id);
        if (!existingRecord) {
            throw new Error("Bản ghi không tồn tại!");
        }

        await uyQuyenRepository.editUyQuyenSql(id, data);
    } catch (error) {
        throw error;
    }
}

const getChiTietUyQuyen = async (bien_so_xe) => {
    const data = await uyQuyenRepository.getByBienSoXeAll(bien_so_xe);
    return data.map(item => new UyQuyen(item));
}

const importFromExcel = async (fileBuffer) => {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length === 0) {
        throw new Error("Tệp Excel trống!");
    }

    // Auto-detect header row
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.some(cell => {
            const cellStr = normalizeHeaderStr(cell);
            return cellStr.includes("bienkiemsoat") || cellStr.includes("bienso");
        })) {
            headerIndex = i;
            break;
        }
    }

    // Default indexes
    let bienKiemSoatIdx = 0;
    let nguoiKyHdIdx = 1;
    let scccdHdIdx = 2;
    let ngayCapCcHdIdx = 3;
    let noiCapHdIdx = 4;
    let diaChiNguoiKyIdx = 5;
    let chuXeIdx = 6;
    let diaChiChuXeIdx = 7;
    let thoiHanUyQuyenIdx = 8;

    if (headerIndex !== -1) {
        const row = rows[headerIndex];
        let foundScccdCount = 0;
        let foundNoiCapCount = 0;

        for (let c = 0; c < row.length; c++) {
            const headerVal = normalizeHeaderStr(row[c]);
            if (!headerVal) continue;

            if (headerVal.includes("bienkiemsoat") || headerVal.includes("bienso") || headerVal.includes("bienkiem")) {
                bienKiemSoatIdx = c;
            } else if (headerVal.includes("nguoiky")) {
                nguoiKyHdIdx = c;
            } else if (headerVal.includes("scccd") || headerVal.includes("cccd")) {
                foundScccdCount++;
                if (foundScccdCount === 1) {
                    scccdHdIdx = c;
                } else {
                    diaChiNguoiKyIdx = c;
                }
            } else if (headerVal.includes("ngaycap")) {
                ngayCapCcHdIdx = c;
            } else if (headerVal.includes("noicap")) {
                foundNoiCapCount++;
                if (foundNoiCapCount === 1) {
                    noiCapHdIdx = c;
                } else {
                    diaChiChuXeIdx = c;
                }
            } else if (headerVal.includes("chuxe")) {
                chuXeIdx = c;
            } else if (headerVal.includes("nam") || headerVal.includes("thoihan") || headerVal.includes("thoigian")) {
                thoiHanUyQuyenIdx = c;
            }
        }
    }

    const startIndex = headerIndex !== -1 ? headerIndex + 1 : 1;
    const dataRows = rows.slice(startIndex).filter((row) => {
        const bienSo = row[bienKiemSoatIdx];
        return bienSo && String(bienSo).trim() !== "" && normalizeHeaderStr(bienSo) !== "bienkiemsoat" && normalizeHeaderStr(bienSo) !== "bienso";
    });

    const records = dataRows.map((row) => {
        return {
            bien_so_xe: String(row[bienKiemSoatIdx] || "").trim(),
            nguoi_ky_hd: String(row[nguoiKyHdIdx] || "").trim(),
            scccd_hd: String(row[scccdHdIdx] || "").trim(),
            ngay_cap_cc_hd: parseExcelDate(row[ngayCapCcHdIdx]),
            noi_cap_hd: String(row[noiCapHdIdx] || "").trim(),
            dia_chi_nguoi_ky: String(row[diaChiNguoiKyIdx] || "").trim(),
            chu_xe: String(row[chuXeIdx] || "").trim(),
            dia_chi_chu_xe: String(row[diaChiChuXeIdx] || "").trim(),
            thoi_han_uy_quyen: parseThoiHanToMonths(row[thoiHanUyQuyenIdx]),
        };
    });

    if (records.length === 0) {
        throw new Error("Không tìm thấy dòng dữ liệu ủy quyền hợp lệ nào trong tệp Excel!");
    }

    const { insertedCount, updatedCount } = await uyQuyenRepository.upsertMany(records);

    return {
        total_processed: records.length,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: 0
    };
}

const deleteUyQuyen = async (id) => {
    try {
        const existingRecord = await uyQuyenRepository.getById(id);
        if (!existingRecord) {
            throw new Error("Bản ghi không tồn tại!");
        }
        await uyQuyenRepository.deleteUyQuyenSql(id);
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getListUyQuyen,
    createUyQuyen,
    editUyQuyen,
    getChiTietUyQuyen,
    importFromExcel,
    deleteUyQuyen
};
