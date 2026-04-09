const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

// Route đồng bộ danh sách khóa học
router.post("/courses", syncController.syncCourses);

// Route đồng bộ danh sách học viên của một khóa học
// Payload: { enrolmentPlanIid: Number }
router.post("/students", syncController.syncStudents);
router.post("/import-sql", uploadSingle, syncController.importToSql);
router.post("/tien-do", syncController.upsertTienDoDaoTao);
router.get("/tien-do", syncController.getTienDoDaoTaoList);

module.exports = router;
