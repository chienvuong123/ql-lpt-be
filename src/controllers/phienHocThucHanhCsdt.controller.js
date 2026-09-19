const service = require("../services/phienHocThucHanhCsdt.service");
const responseHelper = require("../helpers/response.helper");

const importExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file Excel để import!" });
    }

    const ngayImport = req.body.ngay_import || new Date().toISOString().split("T")[0];
    const result = await service.importExcel(req.file.buffer, ngayImport);

    return responseHelper.success(res, result, "Import file Excel thành công!");
  } catch (error) {
    next(error);
  }
};

const getByMaPhienHocList = async (req, res, next) => {
  try {
    const { ma_phien_hoc_list } = req.body;
    if (!Array.isArray(ma_phien_hoc_list) || ma_phien_hoc_list.length === 0) {
      return responseHelper.success(res, {}, "Danh sách rỗng");
    }

    const map = await service.getByMaPhienHocList(ma_phien_hoc_list);
    return responseHelper.success(res, map, "Lấy dữ liệu CSĐT thành công");
  } catch (error) {
    next(error);
  }
};

module.exports = { importExcel, getByMaPhienHocList };
