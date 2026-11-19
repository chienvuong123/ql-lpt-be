const service = require("../services/tiepSinh.service");
const mauDon = require("../services/tiepSinhMauDon.service");
const ocr = require("../services/tiepSinhOcr.service");
const responseHelper = require("../helpers/response.helper");

// Tên người thao tác do FE gửi lên (giống các màn khác, chưa dùng JWT)
const nguoiThaoTac = (req) => {
  const raw = req.headers["x-user-name"];
  if (!raw) return req.body?.nguoi || null;
  try {
    return decodeURIComponent(String(raw)).slice(0, 255);
  } catch {
    return String(raw).slice(0, 255);
  }
};

const wrap = (fn, message) => async (req, res, next) => {
  try {
    const data = await fn(req);
    return responseHelper.success(res, data, message);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list: async (req, res, next) => {
    try {
      const { data, pagination } = await service.list(req.query);
      return responseHelper.pagination(res, data, pagination, "Lấy danh sách hồ sơ thành công");
    } catch (err) {
      next(err);
    }
  },
  ocrCccd: wrap((req) => ocr.docAnhCccd(req.files || []), "Đã đọc ảnh CCCD"),
  thongKe: wrap((req) => service.thongKe(req.query), "Lấy thống kê thành công"),
  detail: wrap((req) => service.getDetail(req.params.id), "Lấy hồ sơ thành công"),
  create: wrap((req) => service.create(req.body, nguoiThaoTac(req)), "Tiếp nhận hồ sơ thành công"),
  update: wrap((req) => service.update(req.params.id, req.body, nguoiThaoTac(req)), "Cập nhật hồ sơ thành công"),
  capNhatAnh: wrap((req) => service.capNhatAnh(req.params.id, req.body?.anh, nguoiThaoTac(req)), "Cập nhật ảnh thành công"),
  duyet: wrap((req) => service.duyet(req.params.id, nguoiThaoTac(req)), "Duyệt hồ sơ thành công"),
  traBoSung: wrap((req) => service.traBoSung(req.params.id, req.body?.ly_do, nguoiThaoTac(req)), "Đã trả hồ sơ yêu cầu bổ sung"),
  moLai: wrap((req) => service.moLai(req.params.id, nguoiThaoTac(req)), "Đã chuyển hồ sơ về chờ duyệt"),
  danhDauIn: wrap((req) => service.danhDauIn(req.params.id, nguoiThaoTac(req)), "Đã ghi nhận in hồ sơ"),
  remove: wrap((req) => service.remove(req.params.id, nguoiThaoTac(req)), "Đã xoá hồ sơ"),
  getCauHinh: wrap(() => service.getCauHinh(), "Lấy cấu hình thành công"),
  saveCauHinh: wrap((req) => service.saveCauHinh(req.body), "Lưu cấu hình thành công"),
  dongBo: wrap((req) => service.dongBoGoogleSheet(req.body, nguoiThaoTac(req)), "Đồng bộ Google Sheet thành công"),
  mauDon: async (req, res, next) => {
    try {
      const [hs, cfg] = await Promise.all([service.getDetail(req.params.id), service.getCauHinh()]);
      const { buffer, fileName } = await mauDon.taoMauDon(req.params.mau, hs, cfg);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName.replace(/[^ -~]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      return res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
  importExcel: async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Vui lòng chọn file Excel" });
      const data = await service.importExcel(req.file.buffer, req.body, nguoiThaoTac(req));
      return responseHelper.success(res, data, "Import hồ sơ thành công");
    } catch (err) {
      next(err);
    }
  },
};
