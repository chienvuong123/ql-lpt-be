const express = require("express");
const router = express.Router();
const checkConfigController = require("../controllers/checkConfig.controller");

router.get("/", checkConfigController.getConfigs);
router.put("/", checkConfigController.updateConfigs);
router.post("/", checkConfigController.createConfig);

module.exports = router;
