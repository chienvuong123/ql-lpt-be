const express = require("express");
const multer = require("multer");
const controller = require("../controllers/uyquyen.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/danh-sach", controller.getListUyQuyen);
router.get("/chi-tiet/:bien_so_xe", controller.getChiTietUyQuyen);
router.post("/add", upload.any(), controller.createUyQuyen);
router.post("/import", upload.single("file"), controller.importExcel);
router.patch("/edit/:id", upload.any(), controller.editUyQuyen);
router.delete("/delete/:id", controller.deleteUyQuyen);

module.exports = router;
