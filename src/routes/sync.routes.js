const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

// Route đồng bộ danh sách khóa học
router.post("/courses", syncController.syncCourses);
router.get("/courses", syncController.getKhoaHocList);

// Route đồng bộ danh sách học viên của một khóa học
// Payload: { enrolmentPlanIid: Number }
router.post("/students", syncController.syncStudents);
router.get("/students", syncController.getStudentsList);
router.post("/import-sql", uploadSingle, syncController.importToSql);
router.post("/tien-do", syncController.upsertTienDoDaoTao);
router.get("/tien-do", syncController.getTienDoDaoTaoList);
router.get("/tien-do/b1", syncController.getTienDoDaoTaoListB1);
router.get("/tien-do/b2", syncController.getTienDoDaoTaoListB2);
router.get("/tien-do/c1", syncController.getTienDoDaoTaoListC1);
router.post("/kiem-tra-dong-bo", syncController.kiemTraDongBo);

module.exports = router;
