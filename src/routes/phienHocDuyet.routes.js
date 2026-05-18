const express = require("express");
const router = express.Router();
const { getPhienHocDuyetList, updatePhienHocDuyet } = require("../controllers/phienHocDuyet.controller");

// GET /api/phien-hoc-duyet/:ma_dk
router.get("/:ma_dk", getPhienHocDuyetList);

// PATCH /api/phien-hoc-duyet/:phien_hoc_dat_id
router.patch("/:phien_hoc_dat_id", updatePhienHocDuyet);

module.exports = router;
