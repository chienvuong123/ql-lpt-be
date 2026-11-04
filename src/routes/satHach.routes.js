const express = require("express");
const multer = require("multer");
const router = express.Router();
const controller = require("../controllers/satHach.controller");

// 4 file XML của ngày thi (danh sách + lý thuyết + sa hình + đường trường), file có ảnh chân dung ~25MB
const uploadXml = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (/\.xml$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận file XML (.xml)"));
  },
}).array("files", 10);

router.post("/import", uploadXml, controller.importXml);
router.get("/ky", controller.getKyList);
router.get("/ky/:maKySh", controller.getKetQuaKy);
router.get("/thong-ke-cac-ky", controller.getThongKeCacKy);
router.get("/lich-su", controller.getLichSu);
router.get("/anh/:maKySh/:maDk", controller.getAnh);

module.exports = router;
