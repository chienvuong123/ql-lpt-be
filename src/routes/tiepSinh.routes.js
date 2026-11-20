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
