const cabinService = require("../services/chiaCabin.service");

const getXepLichCabin = async (req, res) => {
  try {
    const { khoa, hoTen, chuaHoc } = req.query;

    const filters = {
      khoa,
      hoTen,
      chuaHoc: chuaHoc === undefined ? undefined : chuaHoc === "true",
    };

    const data = await cabinService.buildCabinSchedule(filters);
    return res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error("[cabinController] Lỗi:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getXepLichCabin };
