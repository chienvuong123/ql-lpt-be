const model = require("../models/lopLyThuyet.model");

function normalizeStatusTime(item) {
  if (!item) return {};
  const data = { ...item };
  const raw = data.thoi_gian_thay_doi_trang_thai;
  if (!raw) {
    data.status_updated_at = null;
    data.status_updated_at_local = null;
    return data;
  }

  const dt = new Date(raw);
  data.status_updated_at = dt.toISOString();
  data.status_updated_at_local = `${dt.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  })} GMT+7`;
  return data;
}

async function getDanhSach(req, res) {
  try {
    const { maKhoa } = req.query;
    const data = (await model.getAll({ maKhoa })).map(normalizeStatusTime);
    return res.json({
      success: true,
      total: data.length,
      filter: { maKhoa: maKhoa || null },
      data,
    });
  } catch (err) {
    console.error("[getDanhSach]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getChiTiet(req, res) {
  try {
    const { maDk } = req.params;
    const item = await model.getByMaDk(maDk);

    return res.json({
      success: true,
      data: item ? normalizeStatusTime(item) : {},
    });
  } catch (err) {
    console.error("[getChiTiet]", err);
    return res.status(500).json({
      success: false,
      message: "Loi server",
      error: err.message,
    });
  }
}

async function capNhatTrangThai(req, res) {
  try {
    const { maDk } = req.params;
    const fields = req.body;
    const updatedBy = req.headers["x-user"] || null;

    // Validate fields
    const invalidFields = Object.keys(fields).filter(
      (f) =>
        !model.VALID_FIELDS.includes(f) &&
        f !== "ghi_chu" &&
        f !== "status_updated_at" &&
        f !== "ma_khoa" &&
        f !== "ten_khoa",
    );
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Field khong hop le: ${invalidFields.join(", ")}`,
        validFields: [...model.VALID_FIELDS, "ghi_chu", "status_updated_at"],
      });
    }

    if (Object.prototype.hasOwnProperty.call(fields, "status_updated_at")) {
      const parsed = new Date(fields.status_updated_at);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "status_updated_at khong dung dinh dang datetime",
        });
      }
    }

    await model.updateTrangThai(maDk, fields, updatedBy);

    const updated = await model.getByMaDkDirect(maDk);
    return res.json({
      success: true,
      message: "Cap nhat thanh cong",
      data: updated ? normalizeStatusTime(updated) : { ma_dk: maDk },
    });
  } catch (err) {
    console.error("[capNhatTrangThai]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getLichSu(req, res) {
  try {
    const { maDk } = req.params;
    const lichSu = await model.getLichSu(maDk);
    return res.json({ success: true, total: lichSu.length, data: lichSu });
  } catch (err) {
    console.error("[getLichSu]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

module.exports = { getDanhSach, getChiTiet, capNhatTrangThai, getLichSu };
