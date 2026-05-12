const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class TienDoDaoTaoModel {
  async getAll(filters = {}) {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    let query = `
      SELECT t.*, k.ten_khoa 
      FROM [dbo].[tien_do_dao_tao] t
      LEFT JOIN [dbo].[khoa_hoc] k ON t.ma_khoa = k.ma_khoa
      WHERE 1=1
    `;

    if (filters.ma_khoa) {
      request.input("ma_khoa", mssql.NVarChar, filters.ma_khoa);
      query += ` AND t.ma_khoa = @ma_khoa`;
    }

    query += ` ORDER BY t.updated_at DESC, t.ma_khoa ASC`;

    const result = await request.query(query);
    return result.recordset;
  }

  async getTheoryExpiredYesterday() {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_ly_thuyet AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
  }

  async getCabinExpiredYesterday() {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_cabin AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
  }

  async getDatExpiredYesterday() {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_dat AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
  }
}

module.exports = new TienDoDaoTaoModel();
