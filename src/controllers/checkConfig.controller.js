const CheckConfig = require("../models/checkConfig.model");

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

async function getConfigs(req, res) {
  try {
    const rows = await CheckConfig.getAll();
    const data = {};
    
    rows.forEach((row) => {
      data[row.check_key] = {
        enabled: !!row.enabled,
        startDate: formatDate(row.start_date),
        description: row.description,
      };
    });

    res.json({
      success: true,
      data: data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function updateConfigs(req, res) {
  try {
    const updates = req.body;
    
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({
        success: false,
        message: "Request body must be an object mapping check keys to settings",
      });
    }

    for (const [key, config] of Object.entries(updates)) {
      if (config && typeof config === "object") {
        await CheckConfig.updateConfig(key, !!config.enabled, config.startDate);
      }
    }

    res.json({
      success: true,
      message: "Configs updated successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function createConfig(req, res) {
  try {
    const { checkKey, enabled, startDate, description } = req.body;

    if (!checkKey) {
      return res.status(400).json({
        success: false,
        message: "checkKey is required",
      });
    }

    const existing = await CheckConfig.findByKey(checkKey);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Config with key '${checkKey}' already exists`,
      });
    }

    await CheckConfig.create(checkKey, !!enabled, startDate, description);

    res.status(201).json({
      success: true,
      message: "Config created successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  getConfigs,
  updateConfigs,
  createConfig,
};
