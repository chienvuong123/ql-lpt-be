const express = require("express");
const router = express.Router();
const tienDoDaoTaoController = require("../controllers/tienDoDaoTao.controller");

// Route lấy dữ liệu tiến độ đào tạo
router.get("/", tienDoDaoTaoController.getTienDoDaoTao);

// core job chuyển học viên học bù
router.post("/move-failed-theory-to-hoc-bu", tienDoDaoTaoController.moveFailedTheoryToHocBu);
router.post("/move-failed-cabin-to-hoc-bu", tienDoDaoTaoController.moveFailedCabinToHocBu);
router.post("/move-failed-dat-to-hoc-bu", tienDoDaoTaoController.moveFailedDatToHocBu);

module.exports = router;
