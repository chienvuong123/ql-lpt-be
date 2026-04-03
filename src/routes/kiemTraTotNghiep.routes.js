const express = require("express");
const multer = require("multer");
const controller = require("../controllers/kiemTraTotNghiep.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", controller.getAll);
router.post("/import", upload.single("file"), controller.importExcel);

module.exports = router;
