const express = require("express");
const router = express.Router();
const controller = require("../controllers/gplxHoan.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

router.get("/", controller.listGplxHoan);
router.get("/search", controller.listGplxHoan);
router.get("/ngay-nhan-buu-dien", controller.getNgayNhanBuuDien);
router.get("/ngay-cap", controller.getNgayCap);
router.get("/export", controller.exportExcel);
router.post("/import", uploadSingle, controller.importExcel);
router.post("/scan", controller.scanGplx);
router.post("/update-trang-thai", controller.updateTrangThai);

module.exports = router;
