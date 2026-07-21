const express = require("express");
const router = express.Router();
const controller = require("../controllers/gplxHoan.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

router.get("/", controller.listGplxHoan);
router.get("/search", controller.listGplxHoan);
router.post("/import", uploadSingle, controller.importExcel);

module.exports = router;
