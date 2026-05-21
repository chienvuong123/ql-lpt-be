const xeGiaoVienService = require("../services/checktrungxegiaovien.service");
const responseHelper = require("../helpers/response.helper");

const getListXeVaGiaoVien = async (req, res, next) => {
    const messageSuccess = "Lấy danh sách xe và giáo viên thành công!";
    try {
        const { khoa, page, limit } = req.query;
        const { data, pagination } = await xeGiaoVienService.getListXeVaGiaoVien(khoa, page, limit);

        return responseHelper.pagination(res, data, pagination, messageSuccess);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getListXeVaGiaoVien,
};