const express = require("express");
const router = express.Router();
const controller = require("../controllers/phienHocThucHanhCsdt.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

router.post("/import", uploadSingle, controller.importExcel);
router.post("/by-ma-phien-hoc", controller.getByMaPhienHocList);

module.exports = router;
