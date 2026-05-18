const express = require("express");
const router = Router = express.Router();
const { getHocVienDuyet, updateHocVienDuyet } = require("../controllers/hocVienDuyet.controller");

// GET /api/hoc-vien-duyet/:ma_dk
router.get("/:ma_dk", getHocVienDuyet);

// PATCH /api/hoc-vien-duyet/:ma_dk/:loai_duyet
router.patch("/:ma_dk/:loai_duyet", updateHocVienDuyet);

module.exports = router;
