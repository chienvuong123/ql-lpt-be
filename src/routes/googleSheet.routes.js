const express = require("express");
const router = express.Router();
const googleSheetController = require("../controllers/googleSheet.controller");
// Route lấy dữ liệu học viên từ Sheet
router.get("/hoc-vien-list", googleSheetController.getHocVienList);
module.exports = router;
