const hocVienTHService = require("../services/hocVienTH.service");

async function getHocVienTHList(req, res) {
  try {
    const data = await hocVienTHService.getHocVienTHByFixedCourses();
    return res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (err) {
    console.error("[HocVienTHController] getHocVienTHList error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách học viên.",
      error: err.message,
    });
  }
}

module.exports = { getHocVienTHList };
