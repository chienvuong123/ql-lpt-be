const PhienHocDuyetLog = require("../models/phienHocDuyetLog.model");

const getPhienHocDuyetList = async (req, res) => {
  try {
    const { ma_dk } = req.params;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    let trang_thai = null;
    if (req.query.trang_thai !== undefined && req.query.trang_thai !== "") {
      const parsedStatus = parseInt(req.query.trang_thai);
      if (!isNaN(parsedStatus)) {
        trang_thai = parsedStatus;
      }
    }

    const data = await PhienHocDuyetLog.getByMaDK(ma_dk, trang_thai);
    return res.status(200).json({
      success: true,
      data: data,
      total: data.length
    });
  } catch (err) {
    console.error("[getPhienHocDuyetList] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message
    });
  }
};

const updatePhienHocDuyet = async (req, res) => {
  try {
    const phien_hoc_dat_id = parseInt(req.params.phien_hoc_dat_id);
    if (isNaN(phien_hoc_dat_id)) {
      return res.status(400).json({ success: false, message: "phien_hoc_dat_id không hợp lệ" });
    }

    const { trang_thai, ly_do, nguoi_duyet, ma_dk } = req.body;

    if (trang_thai === undefined || trang_thai === null) {
      return res.status(400).json({ success: false, message: "Thiếu trang_thai" });
    }

    const parsedTrangThai = parseInt(trang_thai);
    if (![0, 1, 2].includes(parsedTrangThai)) {
      return res.status(400).json({ success: false, message: "trang_thai chỉ nhận giá trị 0, 1, 2" });
    }

    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    if (!nguoi_duyet) {
      return res.status(400).json({ success: false, message: "Thiếu nguoi_duyet" });
    }

    const updatedRecord = await PhienHocDuyetLog.upsert(phien_hoc_dat_id, {
      trang_thai: parsedTrangThai,
      ly_do: ly_do ?? null,
      nguoi_duyet,
      ma_dk
    });

    return res.status(200).json({
      success: true,
      data: updatedRecord
    });
  } catch (err) {
    console.error("[updatePhienHocDuyet] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message
    });
  }
};

module.exports = {
  getPhienHocDuyetList,
  updatePhienHocDuyet
};
