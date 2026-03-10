const express = require("express");
const { getDanhSachDatCabin } = require("../controllers/cabin.controller");

const router = express.Router();

router.get("/", getDanhSachDatCabin);

module.exports = router;
