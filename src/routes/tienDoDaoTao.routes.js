const express = require("express");
const router = express.Router();
const tienDoDaoTaoController = require("../controllers/tienDoDaoTao.controller");

// Route lấy dữ liệu tiến độ đào tạo
router.get("/", tienDoDaoTaoController.getTienDoDaoTao);

// Route lấy chi tiết tiến độ đào tạo (Theory, Cabin, DAT) của học viên
router.get("/chi-tiet", tienDoDaoTaoController.getChiTietDaoTao);
router.get("/chi-tiet-dao-tao", tienDoDaoTaoController.getChiTietDaoTao);

// core job chuyển học viên học bù
router.post("/move-failed-theory-to-hoc-bu", tienDoDaoTaoController.moveFailedTheoryToHocBu);
router.post("/move-failed-cabin-to-hoc-bu", tienDoDaoTaoController.moveFailedCabinToHocBu);
router.post("/move-failed-dat-to-hoc-bu", tienDoDaoTaoController.moveFailedDatToHocBu);

module.exports = router;

