const express = require("express");
const router = express.Router();
const tienDoDaoTaoController = require("../controllers/tienDoDaoTao.controller");

// Route lấy dữ liệu tiến độ đào tạo
router.get("/", tienDoDaoTaoController.getTienDoDaoTao);

// Route kiểm tra và chuyển học viên chưa đạt LÝ THUYẾT vào học bù
router.post("/move-failed-theory-to-hoc-bu", tienDoDaoTaoController.moveFailedTheoryToHocBu);

// Route kiểm tra và chuyển học viên chưa đạt CABIN vào học bù
router.post("/move-failed-cabin-to-hoc-bu", tienDoDaoTaoController.moveFailedCabinToHocBu);

module.exports = router;
