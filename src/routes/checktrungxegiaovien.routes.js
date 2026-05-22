const express = require("express");
const router = express.Router();
const controller = require("../controllers/checktrungxegiaovien.controller");

router.get("/danh-sach", controller.getListXeVaGiaoVien);
router.patch("/edit/:id", controller.editXeGiaoVien);

module.exports = router;