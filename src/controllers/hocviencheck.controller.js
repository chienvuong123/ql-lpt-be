// controllers/hocvienCheck.controller.js
"use strict";

const connectSQL = require("../configs/sql");
const mssql = require("mssql");

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

    // ── Upsert in SQL Server ───────────────────────────────────
    const pool = await connectSQL();
    const request = pool.request();
    
    const user = req.user?.username ?? req.user?.id ?? null;
    request.input("maHocVien", mssql.VarChar, maHocVien.trim());
    request.input("dat_confirmed", mssql.Bit, dat_confirmed ? 1 : 0);
    request.input("internal_note", mssql.NVarChar, internal_note !== undefined ? (internal_note?.trim() || null) : null);
    request.input("public_note", mssql.NVarChar, public_note !== undefined ? (public_note?.trim() || null) : null);
    request.input("user", mssql.NVarChar, user);

    const query = `
      IF EXISTS (SELECT 1 FROM [dbo].[hocvien_checks] WHERE ma_hoc_vien = @maHocVien)
      BEGIN
        UPDATE [dbo].[hocvien_checks]
        SET dat_confirmed = @dat_confirmed,
            ${internal_note !== undefined ? "internal_note = @internal_note," : ""}
            ${public_note !== undefined ? "public_note = @public_note," : ""}
            updated_by = @user,
            updated_at = GETDATE()
        WHERE ma_hoc_vien = @maHocVien;
      END
      ELSE
      BEGIN
        INSERT INTO [dbo].[hocvien_checks] (ma_hoc_vien, dat_confirmed, internal_note, public_note, created_by, updated_by, created_at, updated_at)
        VALUES (@maHocVien, @dat_confirmed, @internal_note, @public_note, @user, @user, GETDATE(), GETDATE());
      END

      SELECT * FROM [dbo].[hocvien_checks] WHERE ma_hoc_vien = @maHocVien;
    `;

    const result = await request.query(query);
    const record = result.recordset[0];

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

    const pool = await connectSQL();
    const result = await pool.request()
      .input("maHocVien", mssql.VarChar, maHocVien.trim())
      .query(`SELECT * FROM [dbo].[hocvien_checks] WHERE ma_hoc_vien = @maHocVien`);

    const record = result.recordset[0];

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
    maHocVien: record.ma_hoc_vien,
    dat_confirmed: record.dat_confirmed === true || record.dat_confirmed === 1,
    internal_note: record.internal_note ?? null,
    public_note: record.public_note ?? null,
    updatedAt: record.updated_at ?? null,
    updatedBy: record.updated_by ?? null,
    createdAt: record.created_at ?? null,
  };
}

module.exports = { upsertCheck, getCheck };
