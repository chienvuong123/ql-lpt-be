const hocVienRepository = require("../repositories/hocvien.repository");
const HocVien = require("../models/hocvien.model");

const searchHocVien = async (search, ma_khoa, page, limit) => {
    const { data, pagination } = await hocVienRepository.searchHocVienSql(search, ma_khoa, page, limit);

    return {
        data: HocVien.formatList(data),
        pagination,
    };
}

module.exports = {
    searchHocVien,
};
