const xeGiaoVienRepository = require("../repositories/checktrungxegiaovien.reponsitory");
const ListXeVaGiaoVien = require("../models/checktrungxegiaovien.model");

const getListXeVaGiaoVien = async (khoa, page = 1, limit = 10) => {
    const { data, pagination } = await xeGiaoVienRepository.getListXeVaGiaoVienSql(khoa, page, limit);

    return {
        data: ListXeVaGiaoVien.formatList(data),
        pagination,
    };
}

module.exports = {
    getListXeVaGiaoVien,
};