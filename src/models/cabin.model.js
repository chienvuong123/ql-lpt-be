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

module.exports = { getDatCabin };
