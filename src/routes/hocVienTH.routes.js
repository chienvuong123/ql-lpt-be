const express = require("express");
const router = express.Router();
const hocVienTHController = require("../controllers/hocVienTH.controller");

router.get("/", hocVienTHController.getHocVienTHList);

module.exports = router;
