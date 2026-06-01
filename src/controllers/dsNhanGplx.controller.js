const service = require("../services/dsNhanGplx.service");
const responseHelper = require("../helpers/response.helper");
const XLSX = require("xlsx");

const listDsNhanGplx = async (req, res, next) => {
    const message = "Lấy danh sách ký nhận GPLX thành công!";
    try {
        const { search, daNhan, da_nhan, ho_ten, ten_hoc_vien, hoTen, ngay_thi, ngayThi, dau_moi, dauMoi, giao_vien, ten_giao_vien, nguoi_tuyen_sinh, giaoVien, tenGiaoVien, page, limit } = req.query;

        const filters = {
            search,
            da_nhan: da_nhan !== undefined ? da_nhan : daNhan,
            ho_ten: ho_ten || ten_hoc_vien || hoTen,
            ngay_thi: ngay_thi || ngayThi,
            dau_moi: dau_moi === "true" || dau_moi === true || dauMoi === "true" || dauMoi === true,
            giao_vien: giao_vien || ten_giao_vien || nguoi_tuyen_sinh || giaoVien || tenGiaoVien,
        };

        const { data, pagination } = await service.searchDsNhanGplx(filters, page, limit);

        return responseHelper.pagination(res, data, pagination, message);
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

        const { ngay_thi, ngayThi } = req.body;
        const ngayThiInput = ngay_thi || ngayThi;

        const result = await service.importExcel(req.file.buffer, ngayThiInput);

        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const updateSingleStatus = async (req, res, next) => {
    const message = "Cập nhật trạng thái nhận GPLX thành công!";
    try {
        const { id } = req.params;
        const { da_nhan } = req.body;
        await service.updateDaNhanStatus([id], da_nhan);

        return responseHelper.success(res, null, message);
    } catch (error) {
        next(error);
    }
};

const bulkUpdateStatus = async (req, res, next) => {
    const message = "Cập nhật hàng loạt thành công!";
    try {
        const { ids, da_nhan } = req.body;
        await service.updateDaNhanStatus(ids, da_nhan);

        return responseHelper.success(res, null, message);
    } catch (error) {
        next(error);
    }
};

const listDistinctDates = async (req, res, next) => {
    const message = "Lấy danh sách ngày thi thành công!";
    try {
        const result = await service.getDistinctDates();
        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const exportExcel = async (req, res, next) => {
    try {
        const { search, daNhan, da_nhan, ho_ten, ten_hoc_vien, hoTen, ngay_thi, ngayThi, dau_moi, dauMoi, giao_vien, ten_giao_vien, nguoi_tuyen_sinh, giaoVien, tenGiaoVien } = req.query;

        const filters = {
            search,
            da_nhan: da_nhan !== undefined ? da_nhan : daNhan,
            ho_ten: ho_ten || ten_hoc_vien || hoTen,
            ngay_thi: ngay_thi || ngayThi,
            dau_moi: dau_moi === "true" || dau_moi === true || dauMoi === "true" || dauMoi === true,
            giao_vien: giao_vien || ten_giao_vien || nguoi_tuyen_sinh || giaoVien || tenGiaoVien,
        };

        // Fetch matching records (max limit 999999 to cover all matching records)
        const { data } = await service.searchDsNhanGplx(filters, 1, 999999);

        // Create workbook and worksheet
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("DanhSachKyNhan");

        // Define column keys and widths
        worksheet.columns = [
            { header: "STT", key: "stt", width: 6 },
            { header: "Họ và Tên", key: "ho_ten", width: 25 },
            { header: "Ngày sinh", key: "ngay_sinh", width: 15 },
            { header: "Số GPLX", key: "so_gplx", width: 18 },
            { header: "Địa chỉ", key: "dia_chi", width: 45 },
            { header: "Đầu mối", key: "dau_moi", width: 20 },
            { header: "Ngày nhận", key: "ngay_nhan", width: 15 },
            { header: "Người nhận", key: "nguoi_nhan", width: 20 },
            { header: "Ký tên", key: "ky_nhan", width: 12 },
            { header: "Ghi chú", key: "ghi_chu", width: 25 }
        ];

        // Clear default auto-added headers row from exceljs
        worksheet.spliceRows(1, 1);

        // Row 1: Merged Title text (14pt, bold, centered)
        const dateStr = filters.ngay_thi ? ` NGÀY ${filters.ngay_thi}` : "";
        const titleText = `DANH SÁCH KÝ NHẬN HỒ SƠ VÀ GPLX${dateStr}`.toUpperCase();
        const titleRow = worksheet.addRow([titleText]);
        titleRow.height = 30;
        worksheet.mergeCells("A1:J1");

        // Row 2: Merged Instructions text (9pt, bold, centered, wrapped, tall height)
        const instructionText = "Người ký nhận có trách nhiệm bảo quản và bàn giao hồ sơ và GPLX đúng cho học viên đã ký nhận; thực hiện đối chiếu thông tin người nhận trước khi bàn giao.\nKhông tự ý giao cho người khác, không để thất lạc, hư hỏng hoặc chậm bàn giao hồ sơ GPLX. Trường hợp xảy ra mất mát, nhầm lẫn hoặc\nphát sinh khiếu nại trong quá trình quản lý, bàn giao, người ký nhận chịu trách nhiệm báo cáo và phối hợp xử lý theo quy định của Trung tâm";
        const instructionRow = worksheet.addRow([instructionText]);
        instructionRow.height = 54;
        worksheet.mergeCells("A2:J2");

        // Row 3: Table Column Headers (10pt, bold, centered)
        const headerRow = worksheet.addRow([
            "STT",
            "Họ và Tên",
            "Ngày sinh",
            "Số GPLX",
            "Địa chỉ",
            "Đầu mối",
            "Ngày nhận",
            "Người nhận",
            "Ký tên",
            "Ghi chú"
        ]);
        headerRow.height = 25;

        // Student data rows (Row 4 onwards)
        data.forEach((student, index) => {
            const dataRow = worksheet.addRow([
                index + 1,
                student.ho_ten || "",
                student.ngay_sinh || "",
                student.so_gplx || "",
                student.dia_chi || "",
                student.dau_moi || "",
                student.ngay_nhan || "",
                student.nguoi_nhan || "",
                student.ky_nhan || "",
                student.ghi_chu || ""
            ]);
            dataRow.height = 22;
        });

        // 1. Style Row 1 (Title)
        const cellA1 = worksheet.getCell("A1");
        cellA1.font = { name: "Times New Roman", size: 14.5, bold: true };
        cellA1.alignment = { horizontal: "center", vertical: "middle" };

        // 2. Style Row 2 (Instructions)
        const cellA2 = worksheet.getCell("A2");
        cellA2.font = { name: "Times New Roman", size: 10.5, bold: true };
        cellA2.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        // 3. Style Row 3 (Headers)
        headerRow.eachCell((cell) => {
            cell.font = { name: "Times New Roman", size: 10.5, bold: true };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        // Apply grid styling, alignment and borders to all rows starting from row 3
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber >= 3) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    // Set default font for data rows (below header row)
                    if (rowNumber > 3) {
                        cell.font = { name: "Times New Roman", size: 10 };
                        // Center-align specific columns (STT, Ngày sinh, Số GPLX, Ngày nhận, Ký tên)
                        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 7 || colNumber === 9) {
                            cell.alignment = { horizontal: "center", vertical: "middle" };
                        } else {
                            cell.alignment = { horizontal: "left", vertical: "middle" };
                        }
                    }

                    // Apply thin cell borders
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            }
        });

        // Write workbook to buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers and send attachment
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=danh_sach_ky_nhan_gplx.xlsx");

        return res.send(buffer);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listDsNhanGplx,
    importExcel,
    updateSingleStatus,
    bulkUpdateStatus,
    listDistinctDates,
    exportExcel,
};
