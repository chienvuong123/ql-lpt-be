const service = require("../services/kiemTraTotNghiep.service");

async function getAll(req, res) {
  try {
    const data = await service.getAllStudents();
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function importExcel(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }
  try {
    const result = await service.importFromExcel(req.file.buffer);
    res.json({ success: true, message: "Import completed", ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, importExcel };
