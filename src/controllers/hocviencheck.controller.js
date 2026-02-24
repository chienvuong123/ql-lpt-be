// controllers/hocvienCheck.controller.js
"use strict";

const HocVienCheck = require("../models/hocviencheck.model");

async function upsertCheck(req, res) {
  try {
    const { maHocVien } = req.params;
    const { dat_confirmed, public_note, internal_note } = req.body;

    // ── Validate ──────────────────────────────────────────────
    if (!maHocVien?.trim()) {
      return res.status(400).json({
        success: false,
        message: "maHocVien không hợp lệ.",
      });
    }

    if (typeof dat_confirmed !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "dat_confirmed phải là boolean (true/false).",
      });
    }

    if (internal_note !== undefined && typeof internal_note !== "string") {
      return res.status(400).json({
        success: false,
        message: "ghiChu phải là string.",
      });
    }

    if (public_note !== undefined && typeof public_note !== "string") {
      return res.status(400).json({
        success: false,
        message: "ghiChu phải là string.",
      });
    }

    // ── Upsert ────────────────────────────────────────────────
    const updatePayload = {
      dat_confirmed,
      updatedBy: req.user?.username ?? req.user?.id ?? null,
    };

    // Chỉ cập nhật internal_note nếu client truyền lên
    if (internal_note !== undefined) {
      updatePayload.internal_note = internal_note.trim() || null;
    }

    // Chỉ cập nhật public_note nếu client truyền lên
    if (public_note !== undefined) {
      updatePayload.public_note = public_note.trim() || null;
    }

    const record = await HocVienCheck.findOneAndUpdate(
      { maHocVien: maHocVien.trim() },
      {
        $set: updatePayload,
        $setOnInsert: {
          maHocVien: maHocVien.trim(),
          createdBy: req.user?.username ?? req.user?.id ?? null,
        },
      },
      {
        upsert: true, // tạo mới nếu chưa có
        new: true, // trả về document sau khi update
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: dat_confirmed
        ? "Đã đánh dấu học viên."
        : "Đã bỏ đánh dấu học viên.",
      data: formatRecord(record),
    });
  } catch (err) {
    console.error("[upsertCheck] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function getCheck(req, res) {
  try {
    const { maHocVien } = req.params;

    if (!maHocVien?.trim()) {
      return res.status(400).json({
        success: false,
        message: "maHocVien không hợp lệ.",
      });
    }

    const record = await HocVienCheck.findOne({
      maHocVien: maHocVien.trim(),
    }).lean();

    // Chưa có bản ghi → trả về mặc định
    if (!record) {
      return res.status(200).json({
        success: true,
        data: {
          maHocVien: maHocVien.trim(),
          dat_confirmed: false,
          internal_note: null,
          public_note: null,
          updatedAt: null,
          updatedBy: null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: formatRecord(record),
    });
  } catch (err) {
    console.error("[getCheck] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function formatRecord(record) {
  return {
    maHocVien: record.maHocVien,
    dat_confirmed: record.dat_confirmed ?? false,
    internal_note: record.internal_note ?? null,
    public_note: record.public_note ?? null,
    updatedAt: record.updatedAt ?? null,
    updatedBy: record.updatedBy ?? null,
    createdAt: record.createdAt ?? null,
  };
}

module.exports = { upsertCheck, getCheck };
