const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const fs = require("fs");
const path = require("path");

function saveBase64Image(base64String, maDk) {
  if (!base64String) return null;

  const matches = base64String.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  const base64Data = matches ? matches[2] : base64String;
  const ext = matches ? matches[1].split("/")[1] : "jpg";

  const uploadDir = path.join(__dirname, "../uploads/anh-hoc-vien");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${maDk.replace(/[^a-zA-Z0-9-]/g, "_")}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  fs.writeFileSync(filePath, base64Data, "base64");

  //   return `/uploads/anh-hoc-vien/${fileName}`;
  return;
}

async function upsert(maDk, fields, updatedBy = null) {
  // Xử lý ảnh: nếu là base64 thì lưu file, lấy path; nếu đã là path thì giữ nguyên
  let anhValue = fields.anh ?? null;
  if (anhValue && anhValue.startsWith("data:")) {
    // anhValue = saveBase64Image(anhValue, maDk);
    anhValue = null;
  }

  const pool = await connectSQL();
  const request = pool.request();

  request.input("maDk", maDk);
  request.input("tenHocVien", fields.ten_hoc_vien ?? null);
  request.input(
    "ngaySinh",
    fields.ngay_sinh ? new Date(fields.ngay_sinh) : null,
  );
  request.input("khoaHoc", fields.khoa_hoc ?? null);
  request.input("maKhoa", fields.ma_khoa ?? null);
  request.input("hangDaoTao", fields.hang_dao_tao ?? null);
  request.input("gvDat", fields.gv_dat ?? null);
  request.input("trangThai", fields.trang_thai ?? null);
  request.input("ghiChu1", fields.ghi_chu_1 ?? null);
  request.input("ghiChu2", fields.ghi_chu_2 ?? null);
  request.input("anh", anhValue); // path hoặc null
  request.input("canCuoc", fields.can_cuoc ?? null);
  request.input("updatedBy", updatedBy);

  await request.query(`
    IF NOT EXISTS (SELECT 1 FROM ky_dat WHERE ma_dk = @maDk)
      INSERT INTO ky_dat (
        ma_dk, ten_hoc_vien, ngay_sinh, khoa_hoc, ma_khoa,
        hang_dao_tao, gv_dat, trang_thai, ghi_chu_1, ghi_chu_2,
        anh, can_cuoc, updated_by
      )
      VALUES (
        @maDk, @tenHocVien, @ngaySinh, @khoaHoc, @maKhoa,
        @hangDaoTao, @gvDat, @trangThai, @ghiChu1, @ghiChu2,
        @anh, @canCuoc, @updatedBy
      )
    ELSE
      UPDATE ky_dat
      SET
        ten_hoc_vien = @tenHocVien,
        ngay_sinh    = @ngaySinh,
        khoa_hoc     = @khoaHoc,
        ma_khoa      = @maKhoa,
        hang_dao_tao = @hangDaoTao,
        gv_dat       = @gvDat,
        trang_thai   = @trangThai,
        ghi_chu_1    = @ghiChu1,
        ghi_chu_2    = @ghiChu2,
        anh          = CASE WHEN @anh IS NOT NULL THEN @anh ELSE anh END,
        can_cuoc     = @canCuoc,
        updated_at   = GETDATE(),
        updated_by   = @updatedBy
      WHERE ma_dk = @maDk
  `);

  return getByMaDk(maDk);
}

async function getAll(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  const conditions = ["1=1"];

  if (filters.maKhoa) {
    conditions.push("ma_khoa = @maKhoa");
    request.input("maKhoa", filters.maKhoa);
  }

  if (filters.keyword) {
    conditions.push("ten_hoc_vien LIKE @keyword");
    request.input("keyword", `%${filters.keyword}%`);
  }

  const where = "WHERE " + conditions.join(" AND ");

  const result = await request.query(`
    SELECT *
    FROM ky_dat
    ${where}
    ORDER BY updated_at DESC
  `);

  return result.recordset;
}

async function getByMaDk(maDk) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("maDk", maDk)
    .query(`SELECT * FROM ky_dat WHERE ma_dk = @maDk`);

  return result.recordset[0] || null;
}

async function exportKyDat({ ma_khoa, ten_hoc_vien }) {
  const pool = await connectSQL();
  const request = pool.request();

  const conditions = [];

  if (ma_khoa) {
    request.input("maKhoa", ma_khoa);
    conditions.push("kd.ma_khoa = @maKhoa");
  }
  if (ten_hoc_vien) {
    request.input("tenHocVien", `%${ten_hoc_vien}%`);
    conditions.push("kd.ten_hoc_vien LIKE @tenHocVien");
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      ROW_NUMBER() OVER (ORDER BY kd.updated_at DESC) AS stt,
      kd.ma_dk,
      kd.ten_hoc_vien,
      kd.can_cuoc,
      CONVERT(varchar, kd.ngay_sinh, 103) AS ngay_sinh,
      kd.khoa_hoc,
      kd.hang_dao_tao,
      kd.gv_dat,
      kd.trang_thai,
      kd.updated_at
    FROM [QUAN_LY_LPT].[dbo].[ky_dat] kd
    ${whereClause}
    ORDER BY kd.updated_at DESC
  `);

  return result.recordset;
}

module.exports = { upsert, getAll, getByMaDk, exportKyDat };
