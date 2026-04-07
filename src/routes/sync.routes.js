const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");

// Route đồng bộ danh sách khóa học
router.post("/courses", syncController.syncCourses);

// Route đồng bộ danh sách học viên của một khóa học
// Payload: { enrolmentPlanIid: Number }
router.post("/students", syncController.syncStudents);

module.exports = router;
