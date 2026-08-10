const repository = require("../repositories/gplxHoan.repository");
const googleSheetA1Repository = require("../repositories/googleSheetA1.repository");
const GplxHoan = require("../models/gplxHoan.model");
const GplxHoanExcelParser = require("../utils/gplxHoanExcelParser");
const GplxHoanBuuDienExcelParser = require("../utils/gplxHoanBuuDienExcelParser");
const connectSQL = require("../configs/sql");

// "scan": file dạng dòng quét mã QR (so_gplx;ho_ten;ngay_sinh;hang;ngay_cap;thoi_han;dia_chi).
// "buu_dien": file tra cứu kết quả trả GPLX qua bưu điện (không có cột hạng xe/thời hạn).
const IMPORT_PARSERS = {
    scan: GplxHoanExcelParser,
    buu_dien: GplxHoanBuuDienExcelParser,
};

// Ưu tiên lấy đầu mối của học viên bên ô tô (google_sheet_data) trước; nếu người này không có
// trong danh sách ô tô thì mới lấy đầu mối bên xe máy A1 (google_sheet_a1) — vì cùng 1 người có thể
// vừa học ô tô vừa học A1, và đầu mối tuyển sinh ô tô được ưu tiên theo yêu cầu nghiệp vụ.
const findDauMoiUuTien = async (pool, hoTen, ngaySinh) => {
    const dauMoiOto = await repository.findDauMoiByHoTenNgaySinh(pool, hoTen, ngaySinh);
    if (dauMoiOto) return dauMoiOto;
    return googleSheetA1Repository.findDauMoiByHoTenNgaySinh(pool, hoTen, ngaySinh);
};

const searchGplxHoan = async (filters, page, limit) => {
    const { data, pagination } = await repository.searchGplxHoanSql(filters, page, limit);

    return {
        data: GplxHoan.formatList(data),
        pagination,
    };
};

const importExcel = async (fileBuffer, ngayNhanBuuDien, format = "scan") => {
    const Parser = IMPORT_PARSERS[format] || GplxHoanExcelParser;
    const { records, skipped } = Parser.parseExcel(fileBuffer);

    const pool = await connectSQL();
    let inserted = 0;
    let duplicated = 0;

    for (const record of records) {
        const existing = await repository.findBySoGplx(pool, record.so_gplx);
        if (existing) {
            // Số GPLX đã có sẵn trong hệ thống -> bỏ qua hoàn toàn, không đụng gì tới bản ghi
            // cũ. Trước đây import trùng sẽ ghi đè và reset trạng thái nhập/xuất kho về
            // "chờ nhập kho", gây loạn trạng thái kho khi lỡ import 1 file bị trùng dữ liệu.
            duplicated++;
            continue;
        }

        const dauMoi = await findDauMoiUuTien(pool, record.ho_ten, record.ngay_sinh);
        await repository.insertRecord(pool, record, ngayNhanBuuDien, dauMoi);
        inserted++;
    }

    return {
        total: records.length,
        inserted,
        duplicated,
        skipped,
    };
};

const getNgayNhanBuuDienOptions = async () => {
    const pool = await connectSQL();
    return repository.getDistinctNgayNhanBuuDien(pool);
};

const getNgayCapOptions = async () => {
    const pool = await connectSQL();
    return repository.getDistinctNgayCap(pool);
};

const STATUS_TRANSITIONS = {
    cho_nhap_kho: { next: "da_nhap_kho", timestampColumn: "ngay_nhap_kho", message: "Nhập kho thành công" },
    da_nhap_kho: { next: "da_xuat_kho", timestampColumn: "ngay_xuat_kho", message: "Xuất kho thành công" },
};

const TRANG_THAI_LABELS = {
    cho_nhap_kho: "đang ở trạng thái chờ nhập kho",
    da_nhap_kho: "đã được nhập kho",
    da_xuat_kho: "đã được xuất kho",
};

// Máy quét gửi kèm 1 dòng URL riêng sau dòng dữ liệu chính (vd https://gplx.csgt.bocongan.gov.vn/)
// -> bỏ qua hoàn toàn ngay từ đầu, không tra cứu, không báo gì cả.
const isNoiseUrlLine = (text) => /^https?:\/\/\S*$/i.test((text || "").trim());

const scanGplx = async ({ scanned_text, ngay_nhan_buu_dien, from_trang_thai }) => {
    if (isNoiseUrlLine(scanned_text)) {
        return { success: null, code: "IGNORE" };
    }

    const parsed = GplxHoanExcelParser.parseRow(scanned_text);
    if (!parsed) {
        return {
            success: false,
            message: `Mã quét không đúng định dạng: "${scanned_text}"`,
            raw_scanned_text: scanned_text,
        };
    }

    const pool = await connectSQL();
    const existing = await repository.findBySoGplx(pool, parsed.so_gplx);
    if (!existing) {
        return {
            success: false,
            message: `Không tìm thấy GPLX số ${parsed.so_gplx} trong danh sách đã import (ngày đang chọn: ${ngay_nhan_buu_dien || "chưa chọn"})`,
            raw_scanned_text: scanned_text,
            parsed_so_gplx: parsed.so_gplx,
        };
    }

    const existingDate = existing.ngay_nhan_buu_dien
        ? new Date(existing.ngay_nhan_buu_dien).toISOString().slice(0, 10)
        : null;
    if (ngay_nhan_buu_dien && existingDate !== ngay_nhan_buu_dien) {
        return { success: false, message: "GPLX này thuộc lượt nhận bưu điện khác", record: GplxHoan.formatOne(existing) };
    }

    // Trạng thái thực tế của bằng phải khớp đúng với tab đang quét (từ_trang_thai) thì mới cho
    // chuyển bước tiếp theo — tránh trường hợp quét ở tab "Chờ nhập kho" nhưng bằng đã được
    // nhập kho từ trước, khiến nó bị đẩy nhầm luôn sang "Xuất kho".
    if (from_trang_thai && existing.trang_thai !== from_trang_thai) {
        return {
            success: false,
            code: "ALREADY_IN_STATE",
            message: `GPLX ${existing.so_gplx} ${TRANG_THAI_LABELS[existing.trang_thai] || "không ở trạng thái phù hợp"}`,
            record: GplxHoan.formatOne(existing),
        };
    }

    const transition = STATUS_TRANSITIONS[existing.trang_thai];
    if (!transition) {
        return { success: false, message: "GPLX đã được xuất kho trước đó", record: GplxHoan.formatOne(existing) };
    }

    await repository.updateTrangThai(pool, existing.id, transition.next, transition.timestampColumn);

    return {
        success: true,
        message: transition.message,
        trang_thai_moi: transition.next,
        record: GplxHoan.formatOne({ ...existing, trang_thai: transition.next }),
    };
};

// Sửa trực tiếp 1 bản ghi từ UI (họ tên, ngày sinh, hạng, ngày cấp, thời hạn, địa chỉ, đầu mối,
// số GPLX) — không đụng tới trạng thái kho, để không làm gián đoạn luồng nhập/xuất kho đang chạy.
const updateGplxHoanRecord = async (id, fields) => {
    const pool = await connectSQL();
    const existing = await repository.findById(pool, id);
    if (!existing) {
        return { success: false, message: "Không tìm thấy bản ghi" };
    }

    const soGplx = (fields.so_gplx || "").trim();
    const hoTen = (fields.ho_ten || "").trim();
    if (!soGplx) return { success: false, message: "Số GPLX không được để trống" };
    if (!hoTen) return { success: false, message: "Họ tên không được để trống" };

    if (soGplx !== existing.so_gplx) {
        const conflict = await repository.findBySoGplx(pool, soGplx);
        if (conflict && conflict.id !== existing.id) {
            return { success: false, message: `Số GPLX ${soGplx} đã tồn tại ở bản ghi khác` };
        }
    }

    await repository.updateRecordManual(pool, id, {
        so_gplx: soGplx,
        ho_ten: hoTen,
        ngay_sinh: fields.ngay_sinh,
        hang: fields.hang,
        ngay_cap: fields.ngay_cap,
        thoi_han: fields.thoi_han,
        dia_chi: fields.dia_chi,
        dau_moi: fields.dau_moi,
    });

    const updated = await repository.findById(pool, id);
    return { success: true, message: "Cập nhật bản ghi thành công", record: GplxHoan.formatOne(updated) };
};

const VALID_TRANG_THAI = ["cho_nhap_kho", "da_nhap_kho", "da_xuat_kho"];

// Chuyển trạng thái thủ công bằng nút bấm trên UI (khác với scanGplx: cho phép cả lùi lại,
// không cần đối chiếu chuỗi quét).
const updateTrangThaiManual = async (id, trangThai) => {
    if (!VALID_TRANG_THAI.includes(trangThai)) {
        return { success: false, message: "Trạng thái không hợp lệ" };
    }

    const pool = await connectSQL();
    const existing = await repository.findById(pool, id);
    if (!existing) {
        return { success: false, message: "Không tìm thấy bản ghi" };
    }

    await repository.setTrangThai(pool, id, trangThai);

    return {
        success: true,
        message: "Cập nhật trạng thái thành công",
        record: GplxHoan.formatOne({ ...existing, trang_thai: trangThai }),
    };
};

module.exports = {
    searchGplxHoan,
    importExcel,
    getNgayNhanBuuDienOptions,
    getNgayCapOptions,
    scanGplx,
    updateTrangThaiManual,
    updateGplxHoanRecord,
};
