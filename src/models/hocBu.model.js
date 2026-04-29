const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class HocBuModel {
  /**
   * Chuyển học viên vào danh sách học bù
   * @param {Array} students Danh sách các đối tượng { ma_dk, ma_khoa, loai, ghi_chu }
   */
  async moveToHocBu(students) {
    if (!Array.isArray(students) || students.length === 0) return 0;

    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);

    try {
      await transaction.begin();
      let count = 0;

      for (const student of students) {
        const request = new mssql.Request(transaction);
        request.input("ma_dk", mssql.VarChar, student.ma_dk);
        request.input("ma_khoa", mssql.VarChar, student.ma_khoa);
        request.input("loai", mssql.Int, student.loai);
        request.input("ghi_chu", mssql.NVarChar, student.ghi_chu);

        // Sử dụng NOT EXISTS để tránh lỗi Duplicate Key nếu đã chạy trước đó
        const result = await request.query(`
          IF NOT EXISTS (SELECT 1 FROM hoc_bu WHERE ma_dk = @ma_dk AND ma_khoa = @ma_khoa AND loai = @loai)
          BEGIN
            INSERT INTO hoc_bu (ma_dk, ma_khoa, loai, ghi_chu, created_at)
            VALUES (@ma_dk, @ma_khoa, @loai, @ghi_chu, GETDATE())
          END
          ELSE
          BEGIN
            UPDATE hoc_bu
            SET ghi_chu = @ghi_chu,
                created_at = GETDATE()
            WHERE ma_dk = @ma_dk AND ma_khoa = @ma_khoa AND loai = @loai
          END
        `);
        count += result.rowsAffected[0];
      }

      await transaction.commit();
      return count;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /**
   * Lấy danh sách học bù
   * @param {Object} filters { ma_khoa, loai }
   */
  async getHocBuList(filters = {}) {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    let query = `
      SELECT 
        h.*, 
        hv.ho,
        hv.ten,
        hv.ho_ten, 
        hv.cccd, 
        hv.ngay_sinh, 
        hv.anh,
        hv.hang
      FROM hoc_bu h
      LEFT JOIN hoc_vien hv ON h.ma_dk = hv.ma_dk
      WHERE 1=1
    `;

    if (filters.ma_khoa) {
      request.input("ma_khoa", mssql.VarChar, filters.ma_khoa);
      query += " AND h.ma_khoa = @ma_khoa";
    }

    if (filters.loai) {
      request.input("loai", mssql.Int, filters.loai);
      query += " AND h.loai = @loai";
    }

    if (filters.search) {
      request.input("search", mssql.NVarChar, `%${filters.search}%`);
      query += " AND (h.ma_dk LIKE @search OR hv.ho_ten LIKE @search OR hv.cccd LIKE @search)";
    }

    query += " ORDER BY h.created_at DESC";

    const result = await request.query(query);
    return result.recordset;
  }

  /**
   * Lấy danh sách ma_dk đã có trong bảng học bù theo khóa và loại
   * @param {string} ma_khoa 
   * @param {Array} loaiList 
   */
  async getMaDkByKhoaAndLoai(ma_khoa, loaiList = []) {
    if (!ma_khoa) return new Set();

    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    request.input("ma_khoa", mssql.VarChar, ma_khoa);

    let query = "SELECT ma_dk FROM hoc_bu WHERE ma_khoa = @ma_khoa";
    
    if (loaiList.length > 0) {
      query += ` AND loai IN (${loaiList.join(",")})`;
    }

    const result = await request.query(query);
    return new Set(result.recordset.map(row => row.ma_dk));
  }
}

module.exports = new HocBuModel();
