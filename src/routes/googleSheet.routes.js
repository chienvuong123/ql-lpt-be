const express = require("express");
const router = express.Router();
const googleSheetController = require("../controllers/googleSheet.controller");
// Route lấy dữ liệu học viên từ Sheet
router.get("/hoc-vien-list", googleSheetController.getHocVienList);
// Route lấy dữ liệu học viên đã được đồng bộ từ SQL Database
router.get("/hoc-vien-list-sql", googleSheetController.getHocVienListFromDb);
// Route đồng bộ dữ liệu Sheet vào SQL
router.post("/sync-data", googleSheetController.syncData);
// Route lấy thống kê số lượng học viên theo hạng B1, B2, C1
router.get("/rank-stats", googleSheetController.getRankStats);
module.exports = router;
