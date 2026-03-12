"use strict";

const { Router } = require("express");
const controller = require("../controllers/lopLyThuyet.controller");

const router = Router();

router.get("/", controller.getDanhSach);
router.get("/:maDk/lich-su", controller.getLichSu);
router.patch("/:maDk/trang-thai", controller.capNhatTrangThai);
router.patch("/trang-thai/tat-ca", controller.capNhatTatCaTrangThai);
router.get("/:maDk", controller.getChiTiet);

module.exports = router;
