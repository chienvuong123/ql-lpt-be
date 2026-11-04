const service = require("../services/satHach.service");
const responseHelper = require("../helpers/response.helper");

const importXml = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file XML sát hạch để import!" });
    }

    const result = await service.importXml(files, { ngayThi: req.body.ngay_thi || null });
    const coLoi = result.files.some((f) => f.loi);
    return responseHelper.success(res, result, coLoi ? "Import xong, có file bị lỗi" : "Import dữ liệu sát hạch thành công!");
  } catch (error) {
    next(error);
  }
};

const getKyList = async (req, res, next) => {
  try {
    const data = await service.getKyList();
    return responseHelper.success(res, data, "Lấy danh sách kỳ sát hạch thành công");
  } catch (error) {
    next(error);
  }
};

const getKetQuaKy = async (req, res, next) => {
  try {
    const data = await service.getKetQuaKy(req.params.maKySh);
    if (!data) return res.status(404).json({ success: false, message: "Không tìm thấy kỳ sát hạch" });
    return responseHelper.success(res, data, "Lấy kết quả sát hạch thành công");
  } catch (error) {
    next(error);
  }
};

const getThongKeCacKy = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const data = await service.getThongKeCacKy(limit, req.query.den_ky || null);
    return responseHelper.success(res, data, "Lấy thống kê các kỳ thành công");
  } catch (error) {
    next(error);
  }
};

const getLichSu = async (req, res, next) => {
  try {
    const { so_cmt, ma_dk } = req.query;
    if (!so_cmt && !ma_dk) return responseHelper.success(res, [], "Thiếu CCCD hoặc mã đăng ký");
    const data = await service.getLichSu({ soCmt: so_cmt, maDk: ma_dk });
    return responseHelper.success(res, data, "Lấy lịch sử sát hạch thành công");
  } catch (error) {
    next(error);
  }
};

const getAnh = async (req, res, next) => {
  try {
    const anh = await service.getAnh(req.params.maKySh, req.params.maDk);
    if (!anh) return res.status(404).end();
    res.set("Content-Type", anh.contentType);
    res.set("Cache-Control", "private, max-age=86400");
    return res.send(anh.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { importXml, getKyList, getKetQuaKy, getThongKeCacKy, getLichSu, getAnh };
