const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middlewares");
const StudentController = require("../controllers/student.controller");

router.get("/", StudentController.getAll);
router.post(
  "/import",
  upload.fields([
    { name: "excelFile", maxCount: 1 },
    { name: "xmlFile", maxCount: 1 },
  ]),
  StudentController.importStudents,
);

module.exports = router;
