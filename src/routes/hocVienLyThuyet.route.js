const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/hocVienLyThuyet.controller");

router.get("/lop-hoc", ctrl.getDanhSachLop);
router.get("/hoc-vien/:enrolmentPlanIid", ctrl.getDanhSachHocVien);
router.get(
  "/hoc-vien/khoa/:enrolmentPlanIid/",
  ctrl.getDanhSachHocVienTheoKhoa,
);

module.exports = router;
