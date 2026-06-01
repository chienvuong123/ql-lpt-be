const express = require("express");
const router = express.Router();
const controller = require("../controllers/dsNhanGplx.controller");
const uploadSingle = require("../middlewares/upload.middlewares");

router.get("/", controller.listDsNhanGplx);
router.get("/search", controller.listDsNhanGplx);
router.get("/dates", controller.listDistinctDates);
router.get("/export", controller.exportExcel);
router.post("/import", uploadSingle, controller.importExcel);
router.put("/:id", controller.updateSingleStatus);
router.post("/bulk-update", controller.bulkUpdateStatus);

module.exports = router;
