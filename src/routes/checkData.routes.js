const express = require("express");
const router = express.Router();
const uploadSingle = require("../middlewares/upload.middlewares");
const controller = require("../controllers/checkData.controller");

router.post("/import", uploadSingle, controller.importFromExcel);

router.get("/", controller.getCheckStudents);
router.get("/giao-vien", controller.getGiaoVienByKhoa);
router.post("/phien", controller.checkDuplicateSessions);

module.exports = router;
