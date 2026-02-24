const express = require("express");
const router = express.Router();
const CourseController = require("../controllers/course.controller");
const upload = require("../middlewares/upload.middlewares");

router.get("/options", CourseController.getCourseOptions);
router.get("/", CourseController.getAll);
router.get("/:id", CourseController.getById);
router.post("/import", upload.single("file"), CourseController.importCourses);

module.exports = router;
