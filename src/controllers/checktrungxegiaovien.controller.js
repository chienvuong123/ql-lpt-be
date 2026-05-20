const xeGiaoVienService = require("../services/checktrungxegiaovien.service");
const responseHelper = require("../helpers/response.helper");

const getListXeVaGiaoVien = async (req, res, next) => {
    try {
        const { khoa } = req.query;
        const data = await xeGiaoVienService.getListXeVaGiaoVien(khoa);
        return responseHelper.success(res, data, "Lấy danh sách xe và giáo viên thành công!");
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getListXeVaGiaoVien,
};