const express = require("express");
const multer = require("multer");
const controller = require("../controllers/xe.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/danh-sach", controller.getListXe);
router.post("/add", upload.any(), controller.createXe);
router.post("/import", upload.single("file"), controller.importExcel);
router.patch("/edit/:id", upload.any(), controller.editXe);
router.delete("/delete/:id", controller.deleteXe);


module.exports = router;
