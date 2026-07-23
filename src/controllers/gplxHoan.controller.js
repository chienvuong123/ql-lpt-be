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
    getNgayNhanBuuDien,
    getNgayCap,
    scanGplx,
    updateTrangThai,
};
