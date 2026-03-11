const express = require("express");
const {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
} = require("../controllers/cabin.controller");

const router = express.Router();

router.get("/", getDanhSachDatCabin);
router.get("/hoc-vien/:enrolmentPlanIid", getDanhSachHocVienCabin);

module.exports = router;
