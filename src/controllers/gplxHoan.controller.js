const service = require("../services/gplxHoan.service");
const responseHelper = require("../helpers/response.helper");

const listGplxHoan = async (req, res, next) => {
    const message = "Lấy danh sách GPLX hoàn trả bưu điện thành công!";
    try {
        const { search, ho_ten, hoTen, so_gplx, soGplx, hang, dau_moi, ngay_nhan_buu_dien, ngay_cap, trang_thai, page, limit } = req.query;

        const filters = {
            search,
            ho_ten: ho_ten || hoTen,
            so_gplx: so_gplx || soGplx,
            hang,
            dau_moi,
            ngay_nhan_buu_dien,
            ngay_cap,
            trang_thai,
        };

        const { data, pagination } = await service.searchGplxHoan(filters, page, limit);

        return responseHelper.pagination(res, data, pagination, message);
    } catch (error) {
        next(error);
    }
};

const TRANG_THAI_LABELS_EXPORT = {
    cho_nhap_kho: "Chờ nhập kho",
    da_nhap_kho: "Đã nhập kho",
    da_xuat_kho: "Đã xuất kho",
};

const exportExcel = async (req, res, next) => {
    try {
        const { search, ho_ten, hoTen, so_gplx, soGplx, hang, dau_moi, ngay_nhan_buu_dien, ngay_cap, trang_thai } = req.query;

        const filters = {
            search,
            ho_ten: ho_ten || hoTen,
            so_gplx: so_gplx || soGplx,
            hang,
            dau_moi,
            ngay_nhan_buu_dien,
            ngay_cap,
            trang_thai,
        };

        // Lấy toàn bộ bản ghi khớp filter (không phân trang) để xuất hết ra Excel
        const { data } = await service.searchGplxHoan(filters, 1, 999999);

        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("GplxHoan");

        worksheet.columns = [
            { header: "STT", key: "stt", width: 6 },
            { header: "Số GPLX", key: "so_gplx", width: 18 },
            { header: "Họ và tên", key: "ho_ten", width: 25 },
            { header: "Ngày sinh", key: "ngay_sinh", width: 14 },
            { header: "Hạng", key: "hang", width: 10 },
            { header: "Ngày cấp", key: "ngay_cap", width: 14 },
            { header: "Thời hạn", key: "thoi_han", width: 16 },
            { header: "Địa chỉ", key: "dia_chi", width: 35 },
            { header: "Đầu mối", key: "dau_moi", width: 22 },
            { header: "Ngày nhận bưu điện", key: "ngay_nhan_buu_dien", width: 18 },
            { header: "Trạng thái", key: "trang_thai", width: 16 },
        ];

        worksheet.spliceRows(1, 1);

        const titleText = "DANH SÁCH GPLX HOÀN TRẢ BƯU ĐIỆN";
        const titleRow = worksheet.addRow([titleText]);
        titleRow.height = 28;
        worksheet.mergeCells("A1:K1");

        const headerRow = worksheet.addRow([
            "STT",
            "Số GPLX",
            "Họ và tên",
            "Ngày sinh",
            "Hạng",
            "Ngày cấp",
            "Thời hạn",
            "Địa chỉ",
            "Đầu mối",
            "Ngày nhận bưu điện",
            "Trạng thái",
        ]);
        headerRow.height = 24;

        data.forEach((record, index) => {
            const ngayNhanStr = record.ngay_nhan_buu_dien
                ? new Date(record.ngay_nhan_buu_dien).toLocaleDateString("vi-VN")
                : "";

            const dataRow = worksheet.addRow([
                index + 1,
                record.so_gplx || "",
                record.ho_ten || "",
                record.ngay_sinh || "",
                record.hang || "",
                record.ngay_cap || "",
                record.thoi_han || "",
                record.dia_chi || "",
                record.dau_moi || "",
                ngayNhanStr,
                TRANG_THAI_LABELS_EXPORT[record.trang_thai] || record.trang_thai || "",
            ]);
            dataRow.height = 20;
        });

        const cellA1 = worksheet.getCell("A1");
        cellA1.font = { name: "Times New Roman", size: 14, bold: true };
        cellA1.alignment = { horizontal: "center", vertical: "middle" };

        headerRow.eachCell((cell) => {
            cell.font = { name: "Times New Roman", size: 10.5, bold: true };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber >= 2) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (rowNumber > 2) {
                        cell.font = { name: "Times New Roman", size: 10 };
                        if ([1, 4, 5, 6, 7, 10, 11].includes(colNumber)) {
                            cell.alignment = { horizontal: "center", vertical: "middle" };
                        } else {
                            cell.alignment = { horizontal: "left", vertical: "middle" };
                        }
                    }
                    cell.border = {
                        top: { style: "thin" },
                        left: { style: "thin" },
                        bottom: { style: "thin" },
                        right: { style: "thin" },
                    };
                });
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=gplx_hoan_buu_dien.xlsx");

        return res.send(buffer);
    } catch (error) {
        next(error);
    }
};

const importExcel = async (req, res, next) => {
    const message = "Import file Excel thành công!";
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn file Excel để import!" });
        }

        const { ngay_nhan_buu_dien } = req.body;
        if (!ngay_nhan_buu_dien) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn ngày nhận bưu điện!" });
        }

        const result = await service.importExcel(req.file.buffer, ngay_nhan_buu_dien);

        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const getNgayNhanBuuDien = async (req, res, next) => {
    const message = "Lấy danh sách ngày nhận bưu điện thành công!";
    try {
        const data = await service.getNgayNhanBuuDienOptions();
        return responseHelper.success(res, data, message);
    } catch (error) {
        next(error);
    }
};

const getNgayCap = async (req, res, next) => {
    const message = "Lấy danh sách ngày cấp thành công!";
    try {
        const data = await service.getNgayCapOptions();
        return responseHelper.success(res, data, message);
    } catch (error) {
        next(error);
    }
};

const scanGplx = async (req, res, next) => {
    const message = "Quét mã GPLX thành công!";
    try {
        const { scanned_text, ngay_nhan_buu_dien, from_trang_thai } = req.body;
        if (!scanned_text) {
            return res.status(400).json({ success: false, message: "Thiếu dữ liệu quét!" });
        }

        const result = await service.scanGplx({ scanned_text, ngay_nhan_buu_dien, from_trang_thai });

        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const updateTrangThai = async (req, res, next) => {
    const message = "Cập nhật trạng thái GPLX thành công!";
    try {
        const { id, trang_thai } = req.body;
        if (!id || !trang_thai) {
            return res.status(400).json({ success: false, message: "Thiếu id hoặc trạng thái!" });
        }

        const result = await service.updateTrangThaiManual(id, trang_thai);

        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listGplxHoan,
    importExcel,
    exportExcel,
    getNgayNhanBuuDien,
    getNgayCap,
    scanGplx,
    updateTrangThai,
};
