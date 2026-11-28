const service = require("../services/tiepSinh.service");
const mauDon = require("../services/tiepSinhMauDon.service");
const ocr = require("../services/tiepSinhOcr.service");
const keToan = require("../services/keToanTiepSinh.service");
const xepLop = require("../services/xepLop.service");
const tienDo = require("../services/tienDoLop.service");
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
  // Phòng kế toán: thu phí hồ sơ đã nộp KT
  ktList: async (req, res, next) => {
    try {
      const { data, dem, pagination } = await keToan.danhSach(req.query);
      return res.json({ success: true, message: "Lấy danh sách thu phí thành công", data, dem, pagination });
    } catch (err) {
      next(err);
    }
  },
  ktThongKe: wrap(() => keToan.thongKe(), "Lấy thống kê kế toán thành công"),
  ktSoPhieu: wrap(() => keToan.xemSoPhieu(), "Lấy số phiếu thu thành công"),
  ktChiTiet: wrap((req) => keToan.chiTiet(req.params.id), "Lấy thông tin học viên thành công"),
  ktDot: wrap(() => keToan.danhSachDot(), "Lấy danh sách đợt gửi thành công"),
  ktChiTietDot: wrap((req) => keToan.chiTietDot(req.params.id), "Lấy đợt gửi thành công"),
  ktDuyetDot: wrap((req) => keToan.duyetDot(req.params.id, req.body, nguoiThaoTac(req)), "Đã duyệt thu"),
  ktThuPhi: wrap((req) => keToan.thuPhi(req.params.id, req.body, nguoiThaoTac(req)), "Đã xác nhận thu phí"),
  // Đào tạo — xếp lớp
  xlLop: wrap((req) => xepLop.danhSachLop(req.query), "Lấy danh sách lớp thành công"),
  xlTaoLop: wrap((req) => xepLop.taoLop(req.body, nguoiThaoTac(req)), "Đã tạo lớp"),
  xlSuaLop: wrap((req) => xepLop.suaLop(req.params.id, req.body), "Đã cập nhật lớp"),
  xlXoaLop: wrap((req) => xepLop.xoaLop(req.params.id), "Đã xoá lớp"),
  xlChiTietLop: wrap((req) => xepLop.chiTietLop(req.params.id), "Lấy lớp thành công"),
  xlDuDieuKien: wrap((req) => xepLop.duDieuKien(req.query), "Lấy danh sách đủ điều kiện thành công"),
  xlThem: wrap((req) => xepLop.themVaoLop(req.params.id, req.body?.ids, nguoiThaoTac(req)), "Đã đưa học viên vào lớp"),
  xlTraCuu: wrap((req) => xepLop.traCuu(req.query.ma), "Đã tìm thấy hồ sơ"),
  xlQuet: wrap((req) => xepLop.quetQr(req.params.id, req.body?.ma, nguoiThaoTac(req), req.body), "Đã thêm học viên vào lớp"),
  xlBo: wrap((req) => xepLop.boKhoiLop(req.params.id, req.body?.ids, nguoiThaoTac(req)), "Đã bỏ học viên khỏi lớp"),
  xlVaoKhoa: wrap((req) => xepLop.vaoKhoa(req.params.id, nguoiThaoTac(req)), "Đã vào khoá"),
  // Đào tạo — khai giảng
  kgLop: wrap((req) => xepLop.danhSachKhaiGiang(req.query), "Lấy danh sách lớp khai giảng thành công"),
  kgTaoLop: wrap((req) => xepLop.taoLopKhaiGiang(req.body, nguoiThaoTac(req)), "Đã tạo lớp"),
  kgSuaLop: wrap((req) => xepLop.suaKhaiGiang(req.params.id, req.body), "Đã cập nhật lớp"),
  kgKhaiGiang: wrap((req) => xepLop.khaiGiang(req.params.id, nguoiThaoTac(req)), "Đã khai giảng lớp"),
  // Đào tạo — tiến độ đào tạo của lớp
  tdChiTiet: wrap((req) => tienDo.chiTiet(req.params.id), "Lấy tiến độ lớp thành công"),
  tdGoiY: wrap((req) => tienDo.goiY(req.query.hang), "Lấy giáo viên / xe thành công"),
  tdThongTin: wrap((req) => tienDo.luuThongTin(req.params.id, req.body), "Đã lưu"),
  tdTaoNhom: wrap((req) => tienDo.luuNhom(req.params.id, null, req.body), "Đã thêm nhóm"),
  tdSuaNhom: wrap((req) => tienDo.luuNhom(req.params.id, req.params.nhomId, req.body), "Đã cập nhật nhóm"),
  tdXoaNhom: wrap((req) => tienDo.xoaNhom(req.params.id, req.params.nhomId), "Đã xoá nhóm"),
  tdGanNhom: wrap((req) => tienDo.ganNhom(req.params.id, req.body), "Đã cập nhật nhóm"),
  tdTuDong: wrap((req) => tienDo.tuDongGhep(req.params.id), "Đã ghép đề xuất"),
  tdXacThuc: wrap((req) => tienDo.xacThuc(req.params.id, nguoiThaoTac(req), !!req.body?.huy), "Đã cập nhật xác thực"),
  ocrCccd: wrap((req) => ocr.docAnhCccd(req.files || []), "Đã đọc ảnh CCCD"),
  thongKe: wrap((req) => service.thongKe(req.query), "Lấy thống kê thành công"),
  detail: wrap((req) => service.getDetail(req.params.id), "Lấy hồ sơ thành công"),
  create: wrap((req) => service.create(req.body, nguoiThaoTac(req)), "Tiếp nhận hồ sơ thành công"),
  update: wrap((req) => service.update(req.params.id, req.body, nguoiThaoTac(req)), "Cập nhật hồ sơ thành công"),
  capNhatAnh: wrap((req) => service.capNhatAnh(req.params.id, req.body?.anh, nguoiThaoTac(req)), "Cập nhật ảnh thành công"),
  duyet: wrap((req) => service.duyet(req.params.id, nguoiThaoTac(req), { xac_nhan: !!req.body?.xac_nhan }), "Duyệt hồ sơ thành công"),
  traBoSung: wrap((req) => service.traBoSung(req.params.id, req.body?.ly_do, nguoiThaoTac(req)), "Đã trả hồ sơ yêu cầu bổ sung"),
  moLai: wrap((req) => service.moLai(req.params.id, nguoiThaoTac(req)), "Đã chuyển hồ sơ về chờ duyệt"),
  danhDauIn: wrap((req) => service.danhDauIn(req.params.id, nguoiThaoTac(req)), "Đã ghi nhận in hồ sơ"),
  chuyenHocPhi: wrap((req) => service.chuyenHocPhi(req.params.id, req.body, nguoiThaoTac(req)), "Đã chuyển học phí"),
  chuyenHang: wrap((req) => service.chuyenHang(req.params.id, req.body, nguoiThaoTac(req)), "Đã chuyển hạng"),
  chuyenPhiKham: wrap((req) => service.chuyenPhiKham(req.params.id, req.body, nguoiThaoTac(req)), "Đã xử lý phí khám sức khoẻ"),
  boHoc: wrap((req) => service.boHoc(req.params.id, req.body, nguoiThaoTac(req)), "Đã chuyển học viên sang bỏ học"),
  nopKeToanList: wrap((req) => service.danhSachNopKeToan(req.query), "Lấy danh sách nộp kế toán thành công"),
  nopKeToan: wrap((req) => service.nopKeToan(req.body, nguoiThaoTac(req)), "Đã gửi dữ liệu lên kế toán"),
  daXoa: wrap((req) => service.danhSachDaXoa(req.query), "Lấy danh sách hồ sơ đã xoá thành công"),
  dauMoi: wrap(() => service.danhSachDauMoi(), "Lấy danh sách đầu mối thành công"),
  xoaDauMoi: wrap((req) => service.xoaDauMoi(req.body?.ten), "Đã xoá đầu mối"),
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
