const express = require("express");
const {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
} = require("../controllers/cabin.controller");

const router = express.Router();

router.get("/", getDanhSachDatCabin);
router.get("/hoc-vien/:enrolmentPlanIid", getDanhSachHocVienCabin);
router.post("/", upsertCabinNote);

module.exports = router;
