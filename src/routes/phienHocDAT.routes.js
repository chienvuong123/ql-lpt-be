const express = require("express");
const router = express.Router();
const {
  getPhienHocDAT,
  updateTrangThaiDAT,
} = require("../controllers/phienHocDAT.controller");

// GET thông tin phiên học theo maDK
router.get("/:maDK", getPhienHocDAT);

// PUT cập nhật trạng thái Duyệt / Hủy
router.put("/trang-thai", updateTrangThaiDAT);

module.exports = router;
