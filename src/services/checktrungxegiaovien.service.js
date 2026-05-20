const xeGiaoVienRepository = require("../repositories/checktrungxegiaovien.reponsitory");
const CheckTrungXeGvModel = require("../models/checktrungxegiaovien.model");

const getListXeVaGiaoVien = async (khoa) => {
    const rawData = await xeGiaoVienRepository.getXeGiaoVienSql(khoa);
    const formattedData = CheckTrungXeGvModel.formatList(rawData);

    return formattedData;
}

module.exports = {
    getListXeVaGiaoVien,
};