const express = require("express");
const router = express.Router();
const keToanController = require("../controllers/keToan.controller");

// GET /api/ke-toan/danh-sach
router.get("/danh-sach", keToanController.getDanhSach);

// POST /api/ke-toan/duyet
router.post("/duyet", keToanController.duyetThanhToan);

// GET /api/ke-toan/bao-cao
router.get("/bao-cao", keToanController.getBaoCao);

module.exports = router;
