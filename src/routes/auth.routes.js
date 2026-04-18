const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.post("/login", authController.login);
router.get("/profile", verifyToken, authController.getProfile);

module.exports = router;
