"use strict";

const { Router } = require("express");
const controller = require("../controllers/kyDat.controller");

const router = Router();

router.get("/", controller.getDanhSach);
router.get("/:maDk", controller.getChiTiet);
router.put("/:maDk", controller.luuDatKy);

module.exports = router;
