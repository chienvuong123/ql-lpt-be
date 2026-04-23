const express = require("express");
const router = express.Router();
const studentDetailController = require("../controllers/studentDetail.controller");

// Route proxy lấy tiến độ hoàn thành từ Lotus
router.post("/tien-do-hoan-thanh", studentDetailController.getTienDoHoanThanh);

// Route proxy lấy điểm theo rubric từ Lotus
router.post("/score-by-rubric", studentDetailController.getUserScoreByRubric);

// Route proxy lấy ảnh camera từ Lotus
router.post("/camera-snapshot", studentDetailController.getCameraSnapshot);

// Route proxy lấy lịch sử học tập (Time Tracking) từ Lotus
router.post("/time-tracking", studentDetailController.getTimeTrackingLog);

// Route proxy lấy thời gian học chi tiết (Learning Time Tracking) từ Lotus
router.post("/learning-time", studentDetailController.getLearningTimeTracking);

// Route proxy lấy chi tiết thời gian học của một môn từ Lotus
router.post("/detail-learning-time", studentDetailController.getDetailLearningTime);

module.exports = router;
