const express = require("express");
const {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
  saveLichPhanBo,
  getLichPhanBo,
  updateLichNote,
} = require("../controllers/cabin.controller");
const controller = require("../controllers/chiaCabin.controller");

const router = express.Router();

router.get("/", getDanhSachDatCabin);
router.get("/hoc-vien/:enrolmentPlanIid", getDanhSachHocVienCabin);
router.post("/", upsertCabinNote);
router.get("/danh-sach-chia-lich", controller.getDanhSachCabinSQL);

router.post("/save-lich", saveLichPhanBo);
router.get("/get-lich", getLichPhanBo);
router.patch("/update-lich-note/:id", updateLichNote);

module.exports = router;
