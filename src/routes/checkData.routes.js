const express = require("express");
const uploadSingle = require("../middlewares/upload.middlewares");
const controller = require("../controllers/checkData.controller");
const ctrl = require("../controllers/kiemTraToanKhoa.controller");
const router = express.Router();

router.post("/import", uploadSingle, controller.importFromExcel);

router.get("/", controller.getCheckStudents);
router.get("/giao-vien", controller.getGiaoVienByKhoa);
router.post("/phien", controller.checkDuplicateSessions);

router.post("/toan-khoa", ctrl.kiemTraToanKhoa);

module.exports = router;
