const sql = require("mssql");
const connectSQL = require("../configs/sql");

async function findAll() {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .query("SELECT * FROM hoc_vien_da_tot_nghiep ORDER BY id");
  return result.recordset;
}

async function findByMaSo(ma_dk) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .query("SELECT id FROM hoc_vien_da_tot_nghiep WHERE ma_dk = @ma_dk");
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
async function deleteAll() {
  const pool = await connectSQL();
  await pool.request().query("TRUNCATE TABLE hoc_vien_da_tot_nghiep");
}

module.exports = { findAll, findByMaSo, insertOne, deleteAll };
