"use strict";

const { Router } = require("express");
const controller = require("../controllers/evaluate.controller");

const router = Router();

router.post("/evaluate-hanh-trinh", controller.evaluateHanhTrinh);

module.exports = router;
