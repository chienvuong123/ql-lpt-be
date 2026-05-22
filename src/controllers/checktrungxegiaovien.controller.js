const xeGiaoVienService = require("../services/checktrungxegiaovien.service");
const responseHelper = require("../helpers/response.helper");

const getListXeVaGiaoVien = async (req, res, next) => {
    const messageSuccess = "Lấy danh sách xe và giáo viên thành công!";
    try {
        const { khoa, search, page, limit } = req.query;
        const { data, pagination } = await xeGiaoVienService.getListXeVaGiaoVien(khoa, search, page, limit);

        return responseHelper.pagination(res, data, pagination, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const editXeGiaoVien = async (req, res, next) => {
    const messageSuccess = "Cập nhật thông tin thành công!";
    try {
        const { id } = req.params;
        const { giao_vien, xe_b1, xe_b2 } = req.body;
        await xeGiaoVienService.editXeGiaoVien(id, giao_vien, xe_b1, xe_b2);
        return responseHelper.success(res, null, messageSuccess);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getListXeVaGiaoVien,
    editXeGiaoVien
};