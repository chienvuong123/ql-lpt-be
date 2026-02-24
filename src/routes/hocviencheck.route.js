"use strict";

const express = require("express");
const router = express.Router();
const {
  upsertCheck,
  getCheck,
} = require("../controllers/hocviencheck.controller");

router.get("/:maHocVien/check", /* verifyToken, */ getCheck);
router.put("/:maHocVien/check", /* verifyToken, */ upsertCheck);

module.exports = router;
