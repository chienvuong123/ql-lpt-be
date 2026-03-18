"use strict";

const { Router } = require("express");
const controller = require("../controllers/log.controller");

const router = Router();

router.get("/lich-su-thay-doi", controller.getLichSuThayDoi);

module.exports = router;
