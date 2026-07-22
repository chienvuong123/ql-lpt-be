const service = require("../services/googleSheetA1.service");
const responseHelper = require("../helpers/response.helper");

const listGoogleSheetA1 = async (req, res, next) => {
    const message = "Lấy danh sách học viên A1 thành công!";
    try {
        const { search, page, limit } = req.query;
        const filters = { search };

        const { data, pagination } = await service.searchGoogleSheetA1(filters, page, limit);

        return responseHelper.pagination(res, data, pagination, message);
    } catch (error) {
        next(error);
    }
};

const importExcel = async (req, res, next) => {
    const message = "Import danh sách học viên A1 thành công!";
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
    listGoogleSheetA1,
    importExcel,
};
