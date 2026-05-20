const express = require("express");
const router = express.Router();
const controller = require("../controllers/checktrungxegiaovien.controller");

router.get("/trung-xe", controller.getListXeVaGiaoVien);

module.exports = router;