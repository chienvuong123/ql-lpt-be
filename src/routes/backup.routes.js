const express = require("express");
const router = express.Router();
const backupController = require("../controllers/backup.controller");

router.post("/hanh-trinh", backupController.backupHanhTrinh);
router.get("/hanh-trinh", backupController.backupHanhTrinh);

router.post("/check-trung", backupController.checkOverlap);
router.get("/check-trung", backupController.checkOverlap);

module.exports = router;
