const express = require("express");
const router = express.Router();
const uploadSingle = require("../middlewares/upload.middlewares");
const checkDataStudentController = require("../controllers/checkData.controller");

router.post(
  "/import",
  uploadSingle,
  checkDataStudentController.importFromExcel,
);

router.get("/", checkDataStudentController.getCheckStudents);

module.exports = router;
