const hocVienService = require("../services/hocvien.service");
const responseHelper = require("../helpers/response.helper");

const listHocVien = async (req, res, next) => {
    const message = "Lấy danh sách học viên thành công!"
    try {
        const { search, ma_khoa, page, limit } = req.query;
        const { data, pagination } = await hocVienService.searchHocVien(search, ma_khoa, page, limit);

        return responseHelper.pagination(res, data, pagination, message);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listHocVien,
};