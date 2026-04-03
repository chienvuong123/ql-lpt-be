const sql = require("mssql");
const connectSQL = require("../configs/sql");

async function findAll(query = {}) {
  const pool = await connectSQL();
  let sqlQuery = "SELECT * FROM hoc_vien_da_tot_nghiep";
  let request = pool.request();

  const conditions = [];

  if (query.filterType === 'latest') {
    // Lấy trong vòng 5 phút của đợt nhập mới nhất
    conditions.push("created_at >= DATEADD(minute, -5, (SELECT MAX(created_at) FROM hoc_vien_da_tot_nghiep))");
  } else if (query.filterType === 'dateRange') {
    if (query.fromDate) {
      conditions.push("created_at >= @fromDate");
      request.input("fromDate", sql.DateTime, new Date(query.fromDate));
    }
    if (query.toDate) {
      conditions.push("created_at <= @toDate");
      request.input("toDate", sql.DateTime, new Date(query.toDate));
    }
  }

  if (conditions.length > 0) {
    sqlQuery += " WHERE " + conditions.join(" AND ");
  }

  sqlQuery += " ORDER BY id";

  const result = await request.query(sqlQuery);
  return result.recordset;
}

async function findByMaSo(ma_dk) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .query("SELECT * FROM hoc_vien_da_tot_nghiep WHERE ma_dk = @ma_dk");
  return result.recordset[0] || null;
}

async function insertOne({ ma_dk, ho_ten, ngay_sinh, can_cuoc, ma_khoa, iid }) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .input("ho_ten", sql.NVarChar, ho_ten)
    .input("ngay_sinh", sql.NVarChar, ngay_sinh)
    .input("can_cuoc", sql.NVarChar, can_cuoc)
    .input("ma_khoa", sql.NVarChar, ma_khoa)
    .input("iid", sql.Int, iid || null).query(`
      INSERT INTO hoc_vien_da_tot_nghiep (ma_dk, ho_ten, ngay_sinh, can_cuoc, ma_khoa, iid)
      VALUES (@ma_dk, @ho_ten, @ngay_sinh, @can_cuoc, @ma_khoa, @iid)
    `);
}

async function updateOne({ ma_dk, ho_ten, ngay_sinh, can_cuoc, ma_khoa, iid }) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .input("ho_ten", sql.NVarChar, ho_ten)
    .input("ngay_sinh", sql.NVarChar, ngay_sinh)
    .input("can_cuoc", sql.NVarChar, can_cuoc)
    .input("ma_khoa", sql.NVarChar, ma_khoa)
    .input("iid", sql.Int, iid || null).query(`
      UPDATE hoc_vien_da_tot_nghiep
      SET ho_ten = @ho_ten,
          ngay_sinh = @ngay_sinh,
          can_cuoc = @can_cuoc,
          ma_khoa = @ma_khoa,
          iid = @iid,
          created_at = GETDATE()
      WHERE ma_dk = @ma_dk
    `);
}

async function deleteAll() {
  const pool = await connectSQL();
  await pool.request().query("TRUNCATE TABLE hoc_vien_da_tot_nghiep");
}

module.exports = { findAll, findByMaSo, insertOne, updateOne, deleteAll };
