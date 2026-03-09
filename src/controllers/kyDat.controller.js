const model = require("../models/kyDAT.model");

const ALLOWED_FIELDS = [
  "ten_hoc_vien",
  "ngay_sinh",
  "khoa_hoc",
  "ma_khoa",
  "hang_dao_tao",
  "gv_dat",
  "anh",
  "can_cuoc",
  "trang_thai",
  "ghi_chu_1",
  "ghi_chu_2",
];

async function luuDatKy(req, res) {
  try {
    const { maDk } = req.params;
    const fields = req.body;
    const updatedBy = req.headers["x-user"] || null;

    if (!maDk) {
      return res.status(400).json({ success: false, message: "Thieu ma_dk" });
    }

    const invalidFields = Object.keys(fields).filter(
      (f) => !ALLOWED_FIELDS.includes(f),
    );
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Field khong hop le: ${invalidFields.join(", ")}`,
        allowedFields: ALLOWED_FIELDS,
      });
    }

    if (fields.ngay_sinh) {
      const parsed = new Date(fields.ngay_sinh);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "ngay_sinh khong dung dinh dang (YYYY-MM-DD)",
        });
      }
    }

    const data = await model.upsert(maDk, fields, updatedBy);
    return res.json({ success: true, message: "Luu thanh cong", data });
  } catch (err) {
    console.error("[luuDatKy]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getDanhSach(req, res) {
  try {
    const { maKhoa, keyword } = req.query;
    const data = await model.getAll({ maKhoa, keyword });
    return res.json({ success: true, total: data.length, data });
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
    const data = await model.getByMaDk(maDk);
    return res.json({ success: true, data: data || {} });
  } catch (err) {
    console.error("[getChiTiet]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

module.exports = { luuDatKy, getDanhSach, getChiTiet };
