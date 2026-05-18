const HocVienDuyetLog = require("../models/hocVienDuyetLog.model");

const getHocVienDuyet = async (req, res) => {
  try {
    const { ma_dk } = req.params;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    const data = await HocVienDuyetLog.getByMaDK(ma_dk);
    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (err) {
    console.error("[getHocVienDuyet] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message
    });
  }
};

const updateHocVienDuyet = async (req, res) => {
  try {
    const { ma_dk, loai_duyet } = req.params;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    const VALID_LOAI_DUYET = ["tong", "dem", "tu_dong", "so_san"];
    if (!VALID_LOAI_DUYET.includes(loai_duyet)) {
      return res.status(400).json({
        success: false,
        message: `loai_duyet không hợp lệ. Chỉ nhận: ${VALID_LOAI_DUYET.join(", ")}`
      });
    }

    const { trang_thai, ly_do, nguoi_duyet } = req.body;

    if (trang_thai === undefined || trang_thai === null) {
      return res.status(400).json({ success: false, message: "Thiếu trang_thai" });
    }

    const parsedTrangThai = parseInt(trang_thai);
    if (![0, 1, 2].includes(parsedTrangThai)) {
      return res.status(400).json({ success: false, message: "trang_thai chỉ nhận 0, 1, 2" });
    }

    if (!nguoi_duyet) {
      return res.status(400).json({ success: false, message: "Thiếu nguoi_duyet" });
    }

    const data = await HocVienDuyetLog.upsert(ma_dk, loai_duyet, {
      trang_thai: parsedTrangThai,
      ly_do: ly_do ?? null,
      nguoi_duyet
    });

    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (err) {
    console.error("[updateHocVienDuyet] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message
    });
  }
};

module.exports = {
  getHocVienDuyet,
  updateHocVienDuyet
};
