"use strict";

const { Router } = require("express");
const controller = require("../controllers/evaluate.controller");
const controllerOne = require("../controllers/evaluateOne.controller");

const router = Router();

router.post("/evaluate-hanh-trinh", controller.evaluateHanhTrinh);
router.post("/hanh-trinh/evaluate-one", controllerOne.evaluateOne);

module.exports = router;
