const express = require("express");
const {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
} = require("../controllers/cabin.controller");
const controller = require("../controllers/chiaCabin.controller");

const router = express.Router();

router.get("/", getDanhSachDatCabin);
router.get("/hoc-vien/:enrolmentPlanIid", getDanhSachHocVienCabin);
router.post("/", upsertCabinNote);
router.get("/danh-sach-chia-lich", controller.getXepLichCabin);

module.exports = router;
