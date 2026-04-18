const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { verifyToken, checkRole } = require("../middlewares/auth.middleware");

// Routes for managing users - restricted to admin and truong_phong
router.get("/", verifyToken, checkRole(["admin", "truong_phong"]), userController.getAllUsers);
router.post("/", verifyToken, checkRole(["admin", "truong_phong"]), userController.createUser);
router.get("/:id", verifyToken, checkRole(["admin", "truong_phong"]), userController.getUserById);
router.put("/:id", verifyToken, checkRole(["admin", "truong_phong"]), userController.updateUser);
router.delete("/:id", verifyToken, checkRole(["admin", "truong_phong"]), userController.deleteUser);

module.exports = router;
