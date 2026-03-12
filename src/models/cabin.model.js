const mssql = require("mssql");
const connectSQL = require("../configs/sql");

async function getDatCabin(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const offset = (page - 1) * limit;

  let where = "WHERE tt.dat_cabin = 1";
  if (filters.maKhoa) {
    where += " AND tt.ma_khoa = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }
  if (filters.tenKhoa) {
    where += " AND kh.ten_khoa LIKE @tenKhoa";
    request.input("tenKhoa", `%${filters.tenKhoa}%`);
  }
  if (filters.hoTen) {
    where += " AND tt.ho_ten LIKE @hoTen";
    request.input("hoTen", `%${filters.hoTen}%`);
  }

  // đếm tổng - copy inputs sang request riêng
  const countReq = pool.request();
  if (filters.maKhoa) countReq.input("maKhoa", filters.maKhoa);
  if (filters.tenKhoa) countReq.input("tenKhoa", `%${filters.tenKhoa}%`);
  if (filters.hoTen) countReq.input("hoTen", `%${filters.hoTen}%`);

  const countResult = await countReq.query(`
    SELECT COUNT(*) AS total
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
  `);
  const total = countResult.recordset[0].total;

  request.input("offset", mssql.Int, offset);
  request.input("limit", mssql.Int, limit);

  const result = await request.query(`
    SELECT
      tt.ma_dk,
      tt.ma_khoa,
      tt.ho_ten,
      tt.cccd,
      tt.nam_sinh,
      kh.ten_khoa,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0)  AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0)  AS dat_cabin,
      tt.ghi_chu,
      tt.thoi_gian_thay_doi_trang_thai,
      tt.updated_at,
      tt.updated_by
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
    ORDER BY tt.updated_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  return { data: result.recordset, total, page, limit };
}

async function createOrUpdate({
  ma_dk,
  ten_hoc_vien,
  ghi_chu,
  ma_khoa,
  ten_khoa,
}) {
  const pool = await connectSQL();

  await pool
    .request()
    .input("maDk", ma_dk)
    .input("tenHocVien", ten_hoc_vien ?? null)
    .input("ghiChu", ghi_chu ?? null)
    .input("maKhoa", ma_khoa ?? null)
    .input("tenKhoa", ten_khoa ?? null).query(`
      IF EXISTS (SELECT 1 FROM cabin_note WHERE ma_dk = @maDk)
        UPDATE cabin_note
        SET ten_hoc_vien = @tenHocVien,
            ghi_chu      = @ghiChu,
            ma_khoa      = @maKhoa,
            ten_khoa     = @tenKhoa,
            updated_at   = GETDATE()
        WHERE ma_dk = @maDk
      ELSE
        INSERT INTO cabin_note (ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at)
        VALUES (@maDk, @tenHocVien, @ghiChu, @maKhoa, @tenKhoa, GETDATE(), GETDATE())
    `);

  const updated = await pool
    .request()
    .input("maDk", ma_dk)
    .query(`SELECT * FROM cabin_note WHERE ma_dk = @maDk`);

  return updated.recordset[0] || null;
}

async function getAll({ page = 1, limit = 20, ma_khoa, ten_hoc_vien } = {}) {
  const pool = await connectSQL();
  const offset = (Number(page) - 1) * Number(limit);

  const whereClauses = [];
  const filterParams = {};

  if (ma_khoa) {
    whereClauses.push("ma_khoa = @maKhoa");
    filterParams.maKhoa = ma_khoa;
  }
  if (ten_hoc_vien) {
    whereClauses.push("ten_hoc_vien LIKE @tenHocVien");
    filterParams.tenHocVien = `%${ten_hoc_vien}%`;
  }

  const whereSQL =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const dataReq = pool.request();
  const countReq = pool.request();

  if (filterParams.maKhoa) {
    dataReq.input("maKhoa", filterParams.maKhoa);
    countReq.input("maKhoa", filterParams.maKhoa);
  }
  if (filterParams.tenHocVien) {
    dataReq.input("tenHocVien", filterParams.tenHocVien);
    countReq.input("tenHocVien", filterParams.tenHocVien);
  }

  dataReq.input("limit", Number(limit));
  dataReq.input("offset", offset);

  const [dataResult, countResult] = await Promise.all([
    dataReq.query(`
      SELECT ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at
      FROM cabin_note
      ${whereSQL}
      ORDER BY updated_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `),
    countReq.query(`
      SELECT COUNT(*) AS total
      FROM cabin_note
      ${whereSQL}
    `),
  ]);

  const total = countResult.recordset[0]?.total ?? 0;

  return {
    data: dataResult.recordset,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
}

module.exports = { getDatCabin, createOrUpdate, getAll };
