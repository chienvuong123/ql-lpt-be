const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class TienDoDaoTaoModel {
  /**
   * Lấy danh sách tiến độ đào tạo, có thể lọc theo mã khóa
   * @param {Object} filters { ma_khoa }
   */
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
}

module.exports = new TienDoDaoTaoModel();
