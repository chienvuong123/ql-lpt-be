const express = require("express");
const router = express.Router();
const dkMappingController = require("../controllers/dkMapping.controller");

router.post("/sync-tu-hoc-vien-th", dkMappingController.syncMaDkFromHocVienTH);

module.exports = router;
