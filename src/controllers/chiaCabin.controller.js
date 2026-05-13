const chiaCabinService = require("../services/chiaCabin.service");

const getDanhSachCabinSQL = async (req, res) => {
  try {
    const { khoa, hoTen } = req.query;
    const data = await chiaCabinService.getDanhSachCabinSQL({ khoa, hoTen });
    return res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error("[getDanhSachCabinSQL] Lỗi:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDanhSachCabinSQL };
