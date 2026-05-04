const express = require("express");
const router = express.Router();
const tienDoDaoTaoController = require("../controllers/tienDoDaoTao.controller");

// Route lấy dữ liệu tiến độ đào tạo
router.get("/", tienDoDaoTaoController.getTienDoDaoTao);

// Route lấy danh sách học bù
router.get("/hoc-bu", tienDoDaoTaoController.getHocBuList);
router.get("/hoc-bu/cho-duyet", tienDoDaoTaoController.getChoDuyetHocBuList);

// Route lấy chi tiết học bù của 1 học viên
router.get("/hoc-bu/detail", tienDoDaoTaoController.getHocBuDetail);
router.post("/hoc-bu", tienDoDaoTaoController.addStudentToHocBu);
router.post("/hoc-bu/update-status", tienDoDaoTaoController.updateHocBuStatus);
router.get("/hoc-bu/ly-thuyet", tienDoDaoTaoController.getTheoryProgress);
router.get("/hoc-bu/ly-thuyet/detail", tienDoDaoTaoController.getTheoryLotusDetail);
router.get("/hoc-bu/cabin", tienDoDaoTaoController.getCabinProgress);
router.get("/hoc-bu/dat", tienDoDaoTaoController.getDatProgress);

// Route kiểm tra và chuyển học viên chưa đạt LÝ THUYẾT vào học bù
router.post("/move-failed-theory-to-hoc-bu", tienDoDaoTaoController.moveFailedTheoryToHocBu);

// Route kiểm tra và chuyển học viên chưa đạt CABIN vào học bù
router.post("/move-failed-cabin-to-hoc-bu", tienDoDaoTaoController.moveFailedCabinToHocBu);

// Route kiểm tra và chuyển học viên chưa đạt DAT vào học bù
router.post("/move-failed-dat-to-hoc-bu", tienDoDaoTaoController.moveFailedDatToHocBu);

module.exports = router;
