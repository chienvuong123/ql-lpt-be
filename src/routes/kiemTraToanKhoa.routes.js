"use strict";

const { Router } = require("express");
const controller = require("../controllers/kiemTraToanKhoa.controller");

const router = Router();

router.post("/toan-khoa", controller.kiemTraToanKhoa);

module.exports = router;
