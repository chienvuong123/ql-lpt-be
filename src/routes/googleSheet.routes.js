const express = require("express");
const router = express.Router();
const googleSheetController = require("../controllers/googleSheet.controller");
// Route lấy dữ liệu học viên từ Sheet
router.get("/hoc-vien-list", googleSheetController.getHocVienList);
// Route lấy dữ liệu học viên đã được đồng bộ từ SQL Database
router.get("/hoc-vien-list-sql", googleSheetController.getHocVienListFromDb);
// Route đồng bộ dữ liệu Sheet vào SQL
router.post("/sync-data", googleSheetController.syncData);
// Route cập nhật thông tin học viên
router.put("/update-hoc-vien", googleSheetController.updateHocVien);
// Route lấy danh sách học viên chưa khai giảng/chưa xếp khóa
router.get("/unassigned-students", googleSheetController.getUnassignedStudents);
// Route lấy danh sách học viên chưa xếp khóa từ năm 2026 trở đi
router.get("/unassigned-students-2026", googleSheetController.getUnassignedStudents2026);
// Route chuyển học phí (swap học phí và cọc)
router.post("/transfer-fee", googleSheetController.transferFee);
module.exports = router;
