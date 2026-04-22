const express = require("express");
const router = express.Router();
const studentDetailController = require("../controllers/studentDetail.controller");

// Route proxy lấy tiến độ hoàn thành từ Lotus
router.post("/tien-do-hoan-thanh", studentDetailController.getTienDoHoanThanh);

// Route proxy lấy điểm theo rubric từ Lotus
router.post("/score-by-rubric", studentDetailController.getUserScoreByRubric);

module.exports = router;
