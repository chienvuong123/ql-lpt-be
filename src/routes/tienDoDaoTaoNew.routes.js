const express = require("express");
const router = express.Router();
const tienDoDaoTaoNewController = require("../controllers/tienDoDaoTaoNew.controller");

// Route lấy dữ liệu tiến độ đào tạo
router.get("/", tienDoDaoTaoNewController.getTienDoDaoTao);

// Route lấy danh sách học bù
router.get("/hoc-bu", tienDoDaoTaoNewController.getHocBuList);
router.get("/hoc-bu/cho-duyet", tienDoDaoTaoNewController.getChoDuyetHocBuList);
router.get("/hoc-bu/cho-duyet-ly-thuyet", tienDoDaoTaoNewController.getChoDuyetLyThuyetList);
router.get("/hoc-bu/cho-duyet-thuc-hanh", tienDoDaoTaoNewController.getChoDuyetThucHanhList);
router.get("/hoc-bu/dang-hoc-bu", tienDoDaoTaoNewController.getDangHocBuList);

// Route lấy chi tiết học bù của 1 học viên
router.get("/hoc-bu/detail", tienDoDaoTaoNewController.getHocBuDetail);
router.post("/hoc-bu", tienDoDaoTaoNewController.addStudentToHocBu);
router.post("/hoc-bu/update-status", tienDoDaoTaoNewController.updateHocBuStatus);
router.get("/hoc-bu/check-hoan-thanh-ly-thuyet", tienDoDaoTaoNewController.checkHoanThanhLyThuyet);

module.exports = router;
