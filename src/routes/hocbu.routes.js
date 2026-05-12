const router = require("express").Router();
const ctrl = require("../controllers/hocbu.controller");
const upload = require("../middlewares/upload.middlewares");

router.get("/", ctrl.getTienDoDaoTao);

router.get("/hoc-bu", ctrl.getHocBuList);
router.get("/hoc-bu/cho-duyet", ctrl.getChoDuyetHocBuList);
router.get("/hoc-bu/cho-duyet-ly-thuyet", ctrl.getChoDuyetLyThuyetList);
router.get("/hoc-bu/cho-duyet-thuc-hanh", ctrl.getChoDuyetThucHanhList);
router.get("/hoc-bu/dang-hoc-bu", ctrl.getDangHocBuList);

router.get("/hoc-bu/detail", ctrl.getHocBuDetail);
router.get("/hoc-bu/chi-tiet-lop-ly-thuyet/:ma_khoa_bu", ctrl.getChiTietLopBuLyThuyet);
router.get("/hoc-bu/chi-tiet-lop-thuc-hanh/:ma_khoa_bu", ctrl.getChiTietLopBuThucHanh);

router.post("/hoc-bu", ctrl.addStudentToHocBu);
router.post("/hoc-bu/import", upload, ctrl.importHocBuExcel);
router.post("/hoc-bu/update-status", ctrl.updateHocBuStatus);
router.post("/hoc-bu/update-status-bulk", ctrl.updateHocBuStatusBulk);

router.get("/hoc-bu/check-hoan-thanh-ly-thuyet", ctrl.checkHoanThanhLyThuyet);

module.exports = router;