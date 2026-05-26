const XLSX = require("xlsx");
const xeRepository = require("../repositories/xe.repository");
const Xe = require("../models/xe.model");

// Hàm normalize chuỗi để so sánh tiêu đề không phân biệt dấu tiếng Việt, hoa thường, hay khoảng trắng
function normalizeHeaderStr(str) {
    if (!str) return "";
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Xóa dấu tiếng Việt
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""); // Chỉ giữ lại ký tự chữ cái và số
}

function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        // Excel base date is Dec 30, 1899
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

function normalizePayload(data) {
    if (!data) return {};
    const normalized = { ...data };

    // Nếu frontend truyền bien_so, map sang bien_so_xe
    if (data.bien_so && !data.bien_so_xe) {
        normalized.bien_so_xe = data.bien_so;
    }
    // Nếu frontend truyền ten_xe, map sang nhan_hieu
    if (data.ten_xe && !data.nhan_hieu) {
        normalized.nhan_hieu = data.ten_xe;
    }
    // Nếu frontend truyền anh hoặc anh_xe, map sang anh_xe_tap_lai
    if (data.anh && !data.anh_xe_tap_lai) {
        normalized.anh_xe_tap_lai = data.anh;
    }
    if (data.anh_xe && !data.anh_xe_tap_lai) {
        normalized.anh_xe_tap_lai = data.anh_xe;
    }

    return normalized;
}

const getListXe = async (search, page = 1, limit = 10) => {
    const { data, pagination } = await xeRepository.getListXeSql(search, page, limit);
    return {
        data: Xe.formatList(data),
        pagination,
    };
}

const createXe = async (rawData) => {
    try {
        const data = normalizePayload(rawData);
        if (!data.bien_so_xe) {
            throw new Error("Biển số xe là bắt buộc!");
        }

        const existingRecord = await xeRepository.getByBienSo(data.bien_so_xe);
        if (existingRecord) {
            throw new Error(`Xe có biển số '${data.bien_so_xe}' đã tồn tại!`);
        }

        return await xeRepository.createXeSql(data);
    } catch (error) {
        throw error;
    }
}

const editXe = async (id, rawData) => {
    try {
        const data = normalizePayload(rawData);
        const existingRecord = await xeRepository.getById(id);
        if (!existingRecord) {
            throw new Error("Bản ghi không tồn tại!");
        }

        if (data.bien_so_xe && data.bien_so_xe !== existingRecord.bien_so_xe) {
            const duplicateRecord = await xeRepository.getByBienSo(data.bien_so_xe);
            if (duplicateRecord) {
                throw new Error(`Xe có biển số '${data.bien_so_xe}' đã tồn tại ở bản ghi khác!`);
            }
        }

        await xeRepository.editXeSql(id, data);
    } catch (error) {
        throw error;
    }
}

const importFromExcel = async (fileBuffer) => {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length === 0) {
        throw new Error("Tệp Excel trống!");
    }

    // Tự động phát hiện hàng tiêu đề (header row)
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.some(cell => {
            const cellStr = normalizeHeaderStr(cell);
            return cellStr.includes("biensoxe") || cellStr.includes("bienso");
        })) {
            headerIndex = i;
            break;
        }
    }

    // Hàm lấy cột linh hoạt không phân biệt dấu và khoảng cách
    const getIdx = (term, defaultVal) => {
        if (headerIndex === -1) return defaultVal;
        const normalizedTerm = normalizeHeaderStr(term);
        const idx = rows[headerIndex].findIndex(cell => {
            const cellStr = normalizeHeaderStr(cell);
            return cellStr.includes(normalizedTerm) || normalizedTerm.includes(cellStr);
        });
        return idx !== -1 ? idx : defaultVal;
    };

    const plateIdx = getIdx("biển số xe", 1);
    const regIdx = getIdx("đăng ký xe", 2);
    const colorIdx = getIdx("màu sắc", 3);
    const gpxtlIdx = getIdx("giấy phép xe", 4);
    const yearIdx = getIdx("năm sản xuất", 5);
    const gpxtlCapIdx = getIdx("ngày cấp gpxtl", 6);
    const gpxtlHetIdx = getIdx("ngày hết hạn gpxtl", 7);
    const kiemDinhCapIdx = getIdx("ngày cấp gcn", 8);
    const kiemDinhHetIdx = getIdx("ngày hết hạn gcn", 9);
    const coQuanIdx = getIdx("cơ quan cấp", 10);
    const soHuuIdx = getIdx("sở hữu", 11);
    const hangIdx = getIdx("hạng xe", 12);
    const khungIdx = getIdx("số khung", 13);
    const mayIdx = getIdx("số máy", 14);
    const loaiIdx = getIdx("loại xe", 15);
    const nhanHieuIdx = getIdx("nhãn hiệu", 16);
    const anhIdx = getIdx("ảnh xe", 17);
    const noteIdx = getIdx("ghi chú", 18);

    const startIndex = headerIndex !== -1 ? headerIndex + 1 : 4;
    const dataRows = rows.slice(startIndex).filter((row) => {
        const bienSo = row[plateIdx];
        return bienSo && String(bienSo).trim() !== "" && normalizeHeaderStr(bienSo) !== "biensoxe" && normalizeHeaderStr(bienSo) !== "bienso";
    });

    const records = dataRows.map((row) => {
        const rawYear = row[yearIdx];
        let namSanXuat = null;
        if (rawYear) {
            const parsedYear = parseInt(String(rawYear).trim(), 10);
            if (!isNaN(parsedYear)) {
                namSanXuat = parsedYear;
            }
        }

        return {
            bien_so_xe: String(row[plateIdx] || "").trim(),
            so_dang_ky_xe: String(row[regIdx] || "").trim(),
            mau_sac: String(row[colorIdx] || "").trim(),
            so_gpxtl: String(row[gpxtlIdx] || "").trim(),
            nam_san_xuat: namSanXuat,
            ngay_cap_gpxtl: parseExcelDate(row[gpxtlCapIdx]),
            ngay_het_han_gpxtl: parseExcelDate(row[gpxtlHetIdx]),
            ngay_cap_gcn_kiem_dinh: parseExcelDate(row[kiemDinhCapIdx]),
            ngay_het_han_gcn_kiem_dinh: parseExcelDate(row[kiemDinhHetIdx]),
            co_quan_cap_gpxtl: String(row[coQuanIdx] || "").trim(),
            so_huu: String(row[soHuuIdx] || "").trim(),
            hang_xe_tap_lai: String(row[hangIdx] || "").trim(),
            so_khung: String(row[khungIdx] || "").trim(),
            so_may: String(row[mayIdx] || "").trim(),
            loai_xe: String(row[loaiIdx] || "").trim(),
            nhan_hieu: String(row[nhanHieuIdx] || "").trim(),
            anh_xe_tap_lai: String(row[anhIdx] || "").trim() === "#N/A" ? "" : String(row[anhIdx] || "").trim(),
            ghi_chu: String(row[noteIdx] || "").trim() === "0" ? "" : String(row[noteIdx] || "").trim(),
        };
    });

    if (records.length === 0) {
        throw new Error("Không tìm thấy dòng dữ liệu xe hợp lệ nào trong tệp Excel!");
    }

    const { insertedCount, updatedCount } = await xeRepository.upsertMany(records);

    return {
        total_processed: records.length,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: 0
    };
}

const deleteXe = async (id) => {
    try {
        const existingRecord = await xeRepository.getById(id);
        if (!existingRecord) {
            throw new Error("Bản ghi không tồn tại!");
        }
        await xeRepository.deleteXeSql(id);
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getListXe,
    createXe,
    editXe,
    importFromExcel,
    deleteXe
};
