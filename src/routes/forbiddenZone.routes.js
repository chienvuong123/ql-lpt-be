const express = require("express");
const router = express.Router();
const forbiddenZoneController = require("../controllers/forbiddenZone.controller");

// GET /api/forbidden-zones - Get all zones
router.get("/", forbiddenZoneController.getZones);

// POST /api/forbidden-zones - Create a zone
router.post("/", forbiddenZoneController.createZone);

// PUT /api/forbidden-zones/:id - Update a zone by id
router.put("/:id", forbiddenZoneController.updateZone);

// DELETE /api/forbidden-zones/:id - Delete a zone by id
router.delete("/:id", forbiddenZoneController.deleteZone);

module.exports = router;
