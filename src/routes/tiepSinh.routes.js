const express = require("express");
const router = express.Router();
const c = require("../controllers/tiepSinh.controller");
const uploadSingle = require("../middlewares/upload.middlewares");
const multer = require("multer");

// Ảnh CCCD (mặt trước + mặt sau) để OCR
const uploadAnhCccd = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) =>
    /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Chỉ chấp nhận file ảnh")),
}).array("files", 2);

router.get("/thong-ke", c.thongKe);
router.get("/cau-hinh", c.getCauHinh);
router.get("/dau-moi", c.dauMoi);
router.get("/da-xoa", c.daXoa);
router.get("/nop-ke-toan", c.nopKeToanList);
router.post("/nop-ke-toan", c.nopKeToan);
// Phòng kế toán
router.get("/ke-toan/thong-ke", c.ktThongKe);
router.get("/ke-toan/ho-so", c.ktList);
router.get("/ke-toan/so-phieu", c.ktSoPhieu);
router.get("/ke-toan/ho-so/:id", c.ktChiTiet);
router.post("/ke-toan/ho-so/:id/thu-phi", c.ktThuPhi);
router.get("/ke-toan/dot", c.ktDot);
router.get("/ke-toan/dot/:id", c.ktChiTietDot);
router.post("/ke-toan/dot/:id/duyet", c.ktDuyetDot);
// Đào tạo — xếp lớp học viên (chỉ HV kế toán đã thu đủ tiền)
router.get("/xep-lop/du-dieu-kien", c.xlDuDieuKien);
router.get("/xep-lop/tra-cuu", c.xlTraCuu);
router.get("/xep-lop/lop", c.xlLop);
router.post("/xep-lop/lop", c.xlTaoLop);
router.get("/xep-lop/lop/:id", c.xlChiTietLop);
router.put("/xep-lop/lop/:id", c.xlSuaLop);
router.delete("/xep-lop/lop/:id", c.xlXoaLop);
router.post("/xep-lop/lop/:id/them", c.xlThem);
router.post("/xep-lop/lop/:id/quet", c.xlQuet);
router.post("/xep-lop/lop/:id/bo", c.xlBo);
router.post("/xep-lop/lop/:id/vao-khoa", c.xlVaoKhoa);
// Đào tạo — khai giảng khoá học
router.get("/khai-giang/lop", c.kgLop);
router.post("/khai-giang/lop", c.kgTaoLop);
router.put("/khai-giang/lop/:id", c.kgSuaLop);
router.post("/khai-giang/lop/:id/khai-giang", c.kgKhaiGiang);
// Đào tạo — tiến độ đào tạo của lớp (ghép giáo viên – xe, xác thực, báo cáo)
router.get("/tien-do/goi-y", c.tdGoiY);
router.get("/tien-do/lop/:id", c.tdChiTiet);
router.put("/tien-do/lop/:id", c.tdThongTin);
router.post("/tien-do/lop/:id/nhom", c.tdTaoNhom);
router.put("/tien-do/lop/:id/nhom/:nhomId", c.tdSuaNhom);
router.delete("/tien-do/lop/:id/nhom/:nhomId", c.tdXoaNhom);
router.post("/tien-do/lop/:id/gan-nhom", c.tdGanNhom);
router.post("/tien-do/lop/:id/tu-dong-ghep", c.tdTuDong);
router.post("/tien-do/lop/:id/xac-thuc", c.tdXacThuc);
router.post("/dau-moi/xoa", c.xoaDauMoi);
router.put("/cau-hinh", c.saveCauHinh);
router.post("/dong-bo-google-sheet", c.dongBo);
router.post("/import-excel", uploadSingle, c.importExcel);
router.post("/ocr-cccd", uploadAnhCccd, c.ocrCccd);

router.get("/ho-so", c.list);
router.post("/ho-so", c.create);
router.get("/ho-so/:id", c.detail);
router.put("/ho-so/:id", c.update);
router.delete("/ho-so/:id", c.remove);
router.put("/ho-so/:id/anh", c.capNhatAnh);
router.post("/ho-so/:id/duyet", c.duyet);
router.post("/ho-so/:id/tra-bo-sung", c.traBoSung);
router.post("/ho-so/:id/mo-lai", c.moLai);
router.post("/ho-so/:id/in", c.danhDauIn);
router.get("/ho-so/:id/mau-don/:mau", c.mauDon);
router.post("/ho-so/:id/chuyen-hoc-phi", c.chuyenHocPhi);
router.post("/ho-so/:id/chuyen-hang", c.chuyenHang);
router.post("/ho-so/:id/chuyen-phi-kham", c.chuyenPhiKham);
router.post("/ho-so/:id/bo-hoc", c.boHoc);

module.exports = router;
