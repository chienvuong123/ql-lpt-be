const uyQuyenService = require("../services/uyquyet.service");
const responseHelper = require("../helpers/response.helper");

const getListUyQuyen = async (req, res, next) => {
    const messageSuccess = "Lấy danh sách ủy quyền thành công!";
    try {
        const { search, page, limit } = req.query;
        const { data, pagination } = await uyQuyenService.getListUyQuyen(search, page, limit);
        return responseHelper.pagination(res, data, pagination, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const createUyQuyen = async (req, res, next) => {
    const messageSuccess = "Thêm mới ủy quyền thành công!";
    try {
        const resultId = await uyQuyenService.createUyQuyen(req.body);
        return responseHelper.success(res, { id: resultId }, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const editUyQuyen = async (req, res, next) => {
    const messageSuccess = "Cập nhật thông tin ủy quyền thành công!";
    try {
        const { id } = req.params;
        await uyQuyenService.editUyQuyen(id, req.body);
        return responseHelper.success(res, null, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const importExcel = async (req, res, next) => {
    const messageSuccess = "Import dữ liệu ủy quyền thành công!";
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn tệp Excel để nhập!"
            });
        }

        const result = await uyQuyenService.importFromExcel(req.file.buffer);
        return responseHelper.success(res, result, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const getChiTietUyQuyen = async (req, res, next) => {
    const messageSuccess = "Lấy chi tiết lịch sử ủy quyền thành công!";
    try {
        const { bien_so_xe } = req.params;
        const data = await uyQuyenService.getChiTietUyQuyen(bien_so_xe);
        return responseHelper.success(res, data, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const deleteUyQuyen = async (req, res, next) => {
    const messageSuccess = "Xóa ủy quyền thành công!";
    try {
        const { id } = req.params;
        await uyQuyenService.deleteUyQuyen(id);
        return responseHelper.success(res, null, messageSuccess);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getListUyQuyen,
    createUyQuyen,
    editUyQuyen,
    getChiTietUyQuyen,
    importExcel,
    deleteUyQuyen
};
