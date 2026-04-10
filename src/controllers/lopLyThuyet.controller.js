const model = require("../models/lopLyThuyet.model");

const HOC_VIEN_FIELDS = ["ho_ten", "can_cuoc", "nam_sinh"];

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
    // Lọc theo maKhoa và tenKhoa (tìm theo tên)
    const { maKhoa, tenKhoa } = req.query;
    const data = (await model.getAll({ maKhoa, tenKhoa })).map(
      normalizeStatusTime,
    );
    return res.json({
      success: true,
      total: data.length,
      filter: { maKhoa: maKhoa || null, tenKhoa: tenKhoa || null },
      data,
    });
  } catch (err) {
    console.error("[getDanhSach]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getDanhSachLyThuyet(req, res) {
  try {
    const { maKhoa, tenKhoa } = req.query;
    const data = (await model.getAllLyThuyet({ maKhoa, tenKhoa })).map(
      normalizeStatusTime,
    );
    return res.json({
      success: true,
      total: data.length,
      filter: { maKhoa: maKhoa || null, tenKhoa: tenKhoa || null },
      data,
    });
  } catch (err) {
    console.error("[getDanhSachLyThuyet]", err);
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

    // Tách field hoc_vien ra khỏi trang_thai
    const trangThaiFields = {};
    const hocVienFields = {};

    for (const [key, value] of Object.entries(fields)) {
      if (HOC_VIEN_FIELDS.includes(key)) {
        // map can_cuoc -> cccd cho đúng tên cột DB
        const dbKey = key === "can_cuoc" ? "cccd" : key;
        hocVienFields[dbKey] = value;
      } else {
        trangThaiFields[key] = value;
      }
    }

    // Validate trang_thai fields
    const invalidFields = Object.keys(trangThaiFields).filter(
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
        validFields: [
          ...model.VALID_FIELDS,
          "ghi_chu",
          "status_updated_at",
          ...HOC_VIEN_FIELDS,
        ],
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(trangThaiFields, "status_updated_at")
    ) {
      const parsed = new Date(trangThaiFields.status_updated_at);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "status_updated_at khong dung dinh dang datetime",
        });
      }
    }

    // Chạy song song 2 update nếu có đủ data
    const promises = [];

    if (Object.keys(trangThaiFields).length > 0) {
      promises.push(model.updateTrangThai(maDk, trangThaiFields, updatedBy));
    }
    if (Object.keys(hocVienFields).length > 0) {
      promises.push(model.updateHocVien(maDk, hocVienFields));
    }

    if (promises.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Khong co du lieu de cap nhat",
      });
    }

    await Promise.all(promises);

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

async function capNhatTatCaTrangThai(req, res) {
  try {
    const list = req.body;
    const updatedBy = req.headers["x-user"] || null;

    if (!Array.isArray(list) || list.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Danh sach rong" });
    }

    const result = await model.updateTatCaTrangThai(list, updatedBy);

    return res.json({
      success: true,
      message: `Cap nhat thanh cong ${result.rowsAffected} ban ghi`,
      data: { rowsAffected: result.rowsAffected },
    });
  } catch (err) {
    console.error("[capNhatTatCaTrangThai]", err);
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

async function capNhatTatCaTrangThaiLyThuyet(req, res) {
  try {
    const list = req.body;
    const createdBy = req.headers["x-user"] || null;

    if (!Array.isArray(list) || list.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Danh sach rong" });
    }

    const result = await model.updateTatCaTrangThaiLyThuyet(list, createdBy);

    return res.json({
      success: true,
      message: `Cap nhat trang thai ly thuyet thanh cong ${result.rowsAffected} ban ghi`,
      data: { rowsAffected: result.rowsAffected },
    });
  } catch (err) {
    console.error("[capNhatTatCaTrangThaiLyThuyet]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function capNhatHocVienLyThuyet(req, res) {
  try {
    const { maDk } = req.params;
    const fields = req.body;
    const createdBy = req.headers["x-user"] || null;

    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Khong co du lieu de cap nhat",
      });
    }

    await model.updateHocVienLyThuyet(maDk, fields, createdBy);

    return res.json({
      success: true,
      message: "Cap nhat trang thai ly thuyet hoc vien thanh cong",
    });
  } catch (err) {
    console.error("[capNhatHocVienLyThuyet]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

module.exports = {
  getDanhSach,
  getDanhSachLyThuyet,
  getChiTiet,
  capNhatTrangThai,
  getLichSu,
  capNhatTatCaTrangThai,
  capNhatTatCaTrangThaiLyThuyet,
  capNhatHocVienLyThuyet,
};
