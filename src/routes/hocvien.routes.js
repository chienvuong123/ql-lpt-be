const express = require("express");
const router = express.Router();
const controller = require("../controllers/hocvien.controller");

router.get("/search", controller.listHocVien);

module.exports = router;