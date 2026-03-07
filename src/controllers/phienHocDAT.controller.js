const PhienHocModel = require("../models/phienHocDAT.model");

const getPhienHocDAT = async (req, res) => {
  try {
    const ma_dk = req.params.maDK || req.params.ma_dk;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thieu ma_dk" });
    }

    const phien_hoc_list = await PhienHocModel.getPhienHocDATByMaDK(ma_dk);
    if (!phien_hoc_list.length) {
      return res
        .status(404)
        .json({ success: false, message: "Khong tim thay phien hoc" });
    }

    return res.status(200).json({
      success: true,
      ma_dk,
      total: phien_hoc_list.length,
      phien_hoc_list,
    });
  } catch (err) {
    console.error("[getPhienHocDAT]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
};

const updateTrangThaiDAT = async (req, res) => {
  try {
    const {
      ma_dk,
      phien_hoc_id,
      trang_thai,
      nguoi_thay_doi,
      ngay,
      bien_so,
      gio_vao,
      gio_ra,
      thoi_gian,
      tong_km,
      ma_hoc_vien,
    } = req.body;

    if (!ma_dk || !phien_hoc_id || !trang_thai) {
      return res.status(400).json({
        success: false,
        message: "Thieu thong tin bat buoc: ma_dk, phien_hoc_id, trang_thai",
      });
    }

    const VALID = ["DUYET", "HUY", "CHO_DUYET"];
    if (!VALID.includes(String(trang_thai).toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `trang_thai khong hop le. Chi nhan: ${VALID.join(", ")}`,
      });
    }

    const { rowsAffected, action } =
      await PhienHocModel.updateTrangThaiPhienHocDAT({
        ma_dk,
        phien_hoc_id: Number(phien_hoc_id),
        trang_thai: String(trang_thai).toUpperCase(),
        nguoi_thay_doi: nguoi_thay_doi || "SYSTEM",
        ma_hoc_vien: ma_hoc_vien || null,
        ngay: ngay || null,
        gio_tu: gio_vao || null,
        gio_den: gio_ra || null,
        bien_so_xe: bien_so || null,
        so_km: tong_km ?? null,
        thoi_gian: thoi_gian ?? null,
      });

    if (rowsAffected === 0) {
      return res
        .status(500)
        .json({ success: false, message: "Upsert that bai" });
    }

    return res.status(200).json({
      success: true,
      message: `${action === "inserted" ? "Them moi" : "Cap nhat"} trang thai ${String(trang_thai).toUpperCase()} thanh cong`,
      data: {
        ma_dk,
        phien_hoc_id: Number(phien_hoc_id),
        trang_thai: String(trang_thai).toUpperCase(),
        action,
      },
    });
  } catch (err) {
    console.error("[updateTrangThaiDAT]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
};

module.exports = { getPhienHocDAT, updateTrangThaiDAT };
