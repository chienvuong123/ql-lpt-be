const service = require("../services/gplxHoan.service");
const responseHelper = require("../helpers/response.helper");

const listGplxHoan = async (req, res, next) => {
    const message = "Lấy danh sách GPLX hoàn trả bưu điện thành công!";
    try {
        const { search, ho_ten, hoTen, so_gplx, soGplx, hang, page, limit } = req.query;

        const filters = {
            search,
            ho_ten: ho_ten || hoTen,
            so_gplx: so_gplx || soGplx,
            hang,
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

        const result = await service.importExcel(req.file.buffer);

        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listGplxHoan,
    importExcel,
};
