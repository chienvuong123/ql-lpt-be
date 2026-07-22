const express = require("express");
const router = express.Router();
const controller = require("../controllers/googleSheetA1.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

router.get("/", controller.listGoogleSheetA1);
router.get("/search", controller.listGoogleSheetA1);
router.post("/import", uploadSingle, controller.importExcel);

module.exports = router;
