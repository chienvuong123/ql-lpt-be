const xeGiaoVienRepository = require("../repositories/checktrungxegiaovien.reponsitory");
const ListXeVaGiaoVien = require("../models/checktrungxegiaovien.model");

const getListXeVaGiaoVien = async (khoa, search, page = 1, limit = 10) => {
    const { data, pagination } = await xeGiaoVienRepository.getListXeVaGiaoVienSql(khoa, search, page, limit);

    return {
        data: ListXeVaGiaoVien.formatList(data),
        pagination,
    };
}

const editXeGiaoVien = async (id, giao_vien, xe_b1, xe_b2) => {
    try {
        const existingRecord = await xeGiaoVienRepository.getById(id);
        if (!existingRecord) {
            throw new Error("Bản ghi không tồn tại!");
        }
        await xeGiaoVienRepository.editXeGiaoVienSql(id, giao_vien, xe_b1, xe_b2);
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getListXeVaGiaoVien,
    editXeGiaoVien
};