"use strict";

const { Router } = require("express");
const controller = require("../controllers/lopLyThuyet.controller");

const router = Router();

router.get("/trang-thai", controller.getDanhSachLyThuyet);
router.get("/:maDk/lich-su", controller.getLichSu);
router.post("/trang-thai/bulk", controller.capNhatTatCaTrangThaiLyThuyet);
router.patch("/trang-thai/:maDk", controller.capNhatHocVienLyThuyet);
router.get("/:maDk", controller.getChiTiet);

module.exports = router;
