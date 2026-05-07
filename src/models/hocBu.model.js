const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class HocBuModel {
  /**
   * Chuyển học viên vào danh sách học bù
   * @param {Array} students Danh sách các đối tượng { ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao, trang_thai_hoc_bu }
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
        request.input("trang_thai", mssql.Int, student.trang_thai || 1); // 1: Tạo, 2: Chờ duyệt, 3: Đã duyệt
        request.input("nguoi_tao", mssql.NVarChar, student.nguoi_tao || null);
        request.input("trang_thai_hoc_bu", mssql.Int, student.trang_thai_hoc_bu !== undefined ? student.trang_thai_hoc_bu : null); // null: Chưa học bù, 1: Đang đăng ký, 2: Lần 1, 3: Lần 2...

        // Sử dụng NOT EXISTS để tránh lỗi Duplicate Key nếu đã chạy trước đó
        const result = await request.query(`
          IF NOT EXISTS (SELECT 1 FROM hoc_bu WHERE ma_dk = @ma_dk AND ma_khoa = @ma_khoa AND loai = @loai)
          BEGIN
            INSERT INTO hoc_bu (ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao, trang_thai_hoc_bu, created_at)
            VALUES (@ma_dk, @ma_khoa, @loai, @ghi_chu, @trang_thai, @nguoi_tao, @trang_thai_hoc_bu, GETDATE())
          END
          ELSE
          BEGIN
            UPDATE hoc_bu
            SET ghi_chu = @ghi_chu,
                trang_thai = @trang_thai,
                trang_thai_hoc_bu = @trang_thai_hoc_bu,
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
   * Cập nhật trạng thái học bù
   * @param {number} id ID của bản ghi học bù
   * @param {Object} data { trang_thai, nguoi_update, trang_thai_hoc_bu, khoa_bu, thoi_gian_xep }
   */
  async updateHocBu(id, data) {
    const pool = await connectSQL();

    // Migration to ensure khoa_bu, thoi_gian_xep, and trang_thai_duyet exist
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[hoc_bu]') AND name = N'khoa_bu')
        BEGIN
          ALTER TABLE [dbo].[hoc_bu] ADD [khoa_bu] NVARCHAR(255) NULL;
        END

        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[hoc_bu]') AND name = N'thoi_gian_xep')
        BEGIN
          ALTER TABLE [dbo].[hoc_bu] ADD [thoi_gian_xep] DATETIME NULL;
        END

        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[hoc_bu]') AND name = N'trang_thai_duyet')
        BEGIN
          ALTER TABLE [dbo].[hoc_bu] ADD [trang_thai_duyet] NVARCHAR(255) NULL;
        END
      `);
    } catch (err) {
      console.error("Lỗi khi kiểm tra/thêm cột vào bảng hoc_bu:", err.message);
    }

    const request = new mssql.Request(pool);
    request.input("id", mssql.Int, id);
    request.input("trang_thai", mssql.Int, data.trang_thai);
    request.input("nguoi_update", mssql.NVarChar, data.nguoi_update || null);
    request.input("trang_thai_hoc_bu", mssql.Int, data.trang_thai_hoc_bu || null);
    request.input("khoa_bu", mssql.NVarChar, data.khoa_bu || null);
    request.input("thoi_gian_xep", mssql.DateTime, data.thoi_gian_xep ? new Date(data.thoi_gian_xep) : null);

    let trangThaiDuyetVal = null;
    if (data.trang_thai_duyet !== undefined && data.trang_thai_duyet !== null) {
      trangThaiDuyetVal = typeof data.trang_thai_duyet === "string" ? data.trang_thai_duyet : JSON.stringify(data.trang_thai_duyet);
    }
    request.input("trang_thai_duyet", mssql.NVarChar, trangThaiDuyetVal);

    let updateFields = [];
    if (data.trang_thai !== undefined && data.trang_thai !== null) updateFields.push("trang_thai = @trang_thai");
    if (data.nguoi_update !== undefined) updateFields.push("nguoi_update = @nguoi_update");
    if (data.trang_thai_hoc_bu !== undefined && data.trang_thai_hoc_bu !== null) updateFields.push("trang_thai_hoc_bu = @trang_thai_hoc_bu");
    if (data.khoa_bu !== undefined) updateFields.push("khoa_bu = @khoa_bu");
    if (data.thoi_gian_xep !== undefined) updateFields.push("thoi_gian_xep = @thoi_gian_xep");
    if (data.trang_thai_duyet !== undefined) updateFields.push("trang_thai_duyet = @trang_thai_duyet");
    updateFields.push("updated_at = GETDATE()");

    const query = `
      UPDATE hoc_bu 
      SET ${updateFields.join(", ")}
      WHERE id = @id
    `;

    const result = await request.query(query);
    return result.rowsAffected[0];
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
      if (Array.isArray(filters.loai)) {
        const types = filters.loai.map(Number).filter(n => !isNaN(n));
        if (types.length > 0) {
          query += ` AND h.loai IN (${types.join(",")})`;
        }
      } else {
        request.input("loai", mssql.Int, filters.loai);
        query += " AND h.loai = @loai";
      }
    }

    if (filters.trang_thai) {
      if (Array.isArray(filters.trang_thai)) {
        const statuses = filters.trang_thai.map(Number).filter(n => !isNaN(n));
        if (statuses.length > 0) {
          query += ` AND h.trang_thai IN (${statuses.join(",")})`;
        }
      } else {
        request.input("trang_thai", mssql.Int, filters.trang_thai);
        query += " AND h.trang_thai = @trang_thai";
      }
    }

    if (filters.trang_thai_hoc_bu) {
      if (Array.isArray(filters.trang_thai_hoc_bu)) {
        const hbtypes = filters.trang_thai_hoc_bu.map(Number).filter(n => !isNaN(n));
        if (hbtypes.length > 0) {
          query += ` AND h.trang_thai_hoc_bu IN (${hbtypes.join(",")})`;
        }
      } else {
        request.input("trang_thai_hoc_bu", mssql.Int, filters.trang_thai_hoc_bu);
        query += " AND h.trang_thai_hoc_bu = @trang_thai_hoc_bu";
      }
    }

    if (filters.is_dang_hoc_bu === true || filters.is_dang_hoc_bu === "true") {
      query += " AND h.khoa_bu IS NOT NULL AND h.khoa_bu <> '' AND h.thoi_gian_xep IS NOT NULL";
    }

    if (filters.exclude_loai_1 === true || filters.exclude_loai_1 === "true") {
      query += " AND (h.loai IS NULL OR h.loai <> 1)";
    }

    if (filters.chua_xep === true || filters.chua_xep === "true") {
      query += " AND h.khoa_bu IS NULL";
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
