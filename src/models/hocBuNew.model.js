const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class HocBuNewModel {
  constructor() {
    this.tableInitialized = false;
  }

  /**
   * Khởi tạo bảng hoc_bu_new nếu chưa tồn tại
   */
  async initTable() {
    if (this.tableInitialized) return;
    try {
      const pool = await connectSQL();
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[hoc_bu_new]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[hoc_bu_new] (
              [id]                          INT IDENTITY(1,1) PRIMARY KEY,
              [ma_dk]                       NVARCHAR(100) NULL,
              [ma_khoa]                     NVARCHAR(100) NULL,
              [loai]                        NVARCHAR(20)  NULL,
              [khoa_bu_ly_thuyet]           NVARCHAR(100) NULL,
              [thoi_gian_xep_ly_thuyet]     DATETIME      NULL,
              [trang_thai_ly_thuyet]        INT           NULL,
              [nguoi_duyet_ly_thuyet]       NVARCHAR(100) NULL,
              [thoi_gian_duyet_ly_thuyet]   DATETIME      NULL,
              [loai_thuc_hanh]              NVARCHAR(20)  NULL,
              [khoa_bu_thuc_hanh]           NVARCHAR(100) NULL,
              [thoi_gian_xep_thuc_hanh]     DATETIME      NULL,
              [trang_thai_thuc_hanh]        INT           NULL,
              [nguoi_duyet_thuc_hanh]       NVARCHAR(100) NULL,
              [thoi_gian_duyet_thuc_hanh]   DATETIME      NULL,
              [trang_thai]                  INT           NULL,
              [ghi_chu]                     NVARCHAR(MAX) NULL,
              [nguoi_tao]                   NVARCHAR(100) NULL,
              [created_at]                  DATETIME      NULL,
              [nguoi_update]                NVARCHAR(100) NULL,
              [updated_at]                  DATETIME      NULL
          )
        END
      `);
      this.tableInitialized = true;
      console.log("[HocBuNew] Table hoc_bu_new initialized successfully");
    } catch (err) {
      console.error("[HocBuNew] Error initializing table:", err.message);
    }
  }

  /**
   * Tạo hoặc cập nhật đơn học bù (UPSERT theo ma_dk)
   */
  async create(data) {
    await this.initTable();
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    request.input("ma_dk", mssql.NVarChar, data.ma_dk);
    request.input("ma_khoa", mssql.NVarChar, data.ma_khoa);
    request.input("loai", mssql.NVarChar, data.loai);
    request.input("trang_thai", mssql.Int, data.trang_thai);
    request.input("trang_thai_ly_thuyet", mssql.Int, data.trang_thai_ly_thuyet || null);
    request.input("trang_thai_thuc_hanh", mssql.Int, data.trang_thai_thuc_hanh || null);
    request.input("loai_thuc_hanh", mssql.NVarChar, data.loai_thuc_hanh || null);
    request.input("ghi_chu", mssql.NVarChar, data.ghi_chu || null);
    request.input("nguoi_tao", mssql.NVarChar, data.nguoi_tao || null);

    const query = `
      IF EXISTS (SELECT 1 FROM [dbo].[hoc_bu_new] WHERE ma_dk = @ma_dk)
      BEGIN
        UPDATE [dbo].[hoc_bu_new]
        SET ma_khoa = @ma_khoa,
            loai = @loai,
            trang_thai = @trang_thai,
            trang_thai_ly_thuyet = @trang_thai_ly_thuyet,
            trang_thai_thuc_hanh = @trang_thai_thuc_hanh,
            loai_thuc_hanh = @loai_thuc_hanh,
            ghi_chu = @ghi_chu,
            nguoi_tao = @nguoi_tao,
            updated_at = GETDATE()
        WHERE ma_dk = @ma_dk;
        
        SELECT id FROM [dbo].[hoc_bu_new] WHERE ma_dk = @ma_dk;
      END
      ELSE
      BEGIN
        INSERT INTO [dbo].[hoc_bu_new] (
          ma_dk, ma_khoa, loai, trang_thai, trang_thai_ly_thuyet, 
          trang_thai_thuc_hanh, loai_thuc_hanh, ghi_chu, nguoi_tao, created_at
        )
        OUTPUT INSERTED.id
        VALUES (
          @ma_dk, @ma_khoa, @loai, @trang_thai, @trang_thai_ly_thuyet, 
          @trang_thai_thuc_hanh, @loai_thuc_hanh, @ghi_chu, @nguoi_tao, GETDATE()
        );
      END
    `;

    const result = await request.query(query);
    return result.recordset[0]?.id;
  }

  /**
   * Lấy đơn học bù theo ID
   */
  async getById(id) {
    await this.initTable();
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    request.input("id", mssql.Int, id);

    const result = await request.query(`
      SELECT h.*, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.anh, hv.hang,
             dk.khoa, dk.giao_vien, dk.xe_b1, dk.xe_b2
      FROM [dbo].[hoc_bu_new] h
      LEFT JOIN [dbo].[hoc_vien] hv ON h.ma_dk = hv.ma_dk
      LEFT JOIN [dbo].[dang_ky_xe_gv] dk ON h.ma_dk = dk.ma_dk
      WHERE h.id = @id
    `);
    return result.recordset[0];
  }

  /**
   * Cập nhật thông tin đơn học bù
   */
  async update(id, data) {
    await this.initTable();
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    request.input("id", mssql.Int, id);

    const updateFields = [];
    for (const [key, value] of Object.entries(data)) {
      request.input(key, this.getMssqlType(value), value);
      updateFields.push(`[${key}] = @${key}`);
    }
    updateFields.push("[updated_at] = GETDATE()");

    const query = `
      UPDATE [dbo].[hoc_bu_new]
      SET ${updateFields.join(", ")}
      WHERE id = @id
    `;

    const result = await request.query(query);
    return result.rowsAffected[0];
  }

  /**
   * Xóa đơn học bù
   */
  async delete(id) {
    await this.initTable();
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    request.input("id", mssql.Int, id);

    const result = await request.query("DELETE FROM [dbo].[hoc_bu_new] WHERE id = @id");
    return result.rowsAffected[0];
  }

  /**
   * Lấy danh sách đơn học bù kèm bộ lọc
   */
  async list(filters = {}) {
    await this.initTable();
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    let selectClause = `SELECT TOP 1000 h.*, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.anh, hv.hang,
             dk.khoa, dk.giao_vien, dk.xe_b1, dk.xe_b2`;
             
    if (filters.page && filters.limit) {
      selectClause = `SELECT h.*, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.anh, hv.hang,
             dk.khoa, dk.giao_vien, dk.xe_b1, dk.xe_b2, COUNT(*) OVER() AS total_count`;
    }

    let query = `
      ${selectClause}
      FROM [dbo].[hoc_bu_new] h WITH (NOLOCK)
      LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON h.ma_dk = hv.ma_dk
      LEFT JOIN [dbo].[dang_ky_xe_gv] dk WITH (NOLOCK) ON h.ma_dk = dk.ma_dk
      WHERE 1=1
    `;

    if (filters.ma_khoa && filters.ma_khoa !== 'undefined' && filters.ma_khoa !== 'null' && String(filters.ma_khoa).trim() !== '') {
      request.input("ma_khoa", mssql.NVarChar, String(filters.ma_khoa));
      query += " AND h.ma_khoa = @ma_khoa";
    }

    // 1. Xử lý bộ lọc loai
    if (filters.loai) {
      if (Array.isArray(filters.loai)) {
        const types = filters.loai.map(t => String(t).trim().toLowerCase()).filter(t => t !== '' && t !== 'undefined' && t !== 'null');
        if (types.length > 0) {
          const processedTypes = [];
          types.forEach(t => {
            if (t === 'thuc_hanh' || t === 'thuc-hanh') {
              processedTypes.push('thuc_hanh', 'cabin', 'dat');
            } else {
              processedTypes.push(t);
            }
          });
          const typeStrings = processedTypes.map(t => `'${t.replace(/'/g, "''")}'`).join(",");
          query += ` AND h.loai IN (${typeStrings})`;
        }
      } else if (filters.loai !== 'undefined' && filters.loai !== 'null' && String(filters.loai).trim() !== '') {
        const singleLoai = String(filters.loai).trim().toLowerCase();
        if (singleLoai === 'thuc_hanh' || singleLoai === 'thuc-hanh') {
          query += " AND h.loai IN ('thuc_hanh', 'cabin', 'dat')";
        } else {
          request.input("loai", mssql.NVarChar, singleLoai);
          query += " AND h.loai = @loai";
        }
      }
    }

    // 2. Xử lý bộ lọc trang_thai kèm theo logic đặc biệt cho Chờ xếp lớp (2 và 5)
    if (filters.trang_thai) {
      if (Array.isArray(filters.trang_thai)) {
        const statuses = filters.trang_thai.map(Number).filter(n => !isNaN(n));
        if (statuses.length > 0) {
          const has2 = statuses.includes(2);
          const has5 = statuses.includes(5);
          
          if (has2 || has5) {
            let statusConditions = [];
            const basicStatuses = statuses.filter(s => s !== 2 && s !== 5);
            if (basicStatuses.length > 0) {
              statusConditions.push(`h.trang_thai IN (${basicStatuses.join(",")})`);
            }
            if (has2) {
              statusConditions.push("(h.trang_thai = 2 AND h.loai = 'ly_thuyet')");
            }
            if (has5) {
              statusConditions.push("(h.trang_thai = 5 OR (h.trang_thai = 4 AND h.loai = 'ly_thuyet'))");
            }
            query += ` AND (${statusConditions.join(" OR ")})`;
          } else {
            query += ` AND h.trang_thai IN (${statuses.join(",")})`;
          }
        }
      } else {
        const statusVal = Number(filters.trang_thai);
        if (!isNaN(statusVal)) {
          request.input("trang_thai", mssql.Int, statusVal);
          query += " AND h.trang_thai = @trang_thai";
        }
      }
    }

    if (filters.loai_thuc_hanh && filters.loai_thuc_hanh !== 'undefined' && filters.loai_thuc_hanh !== 'null' && String(filters.loai_thuc_hanh).trim() !== '') {
      request.input("loai_thuc_hanh", mssql.NVarChar, String(filters.loai_thuc_hanh).trim().toLowerCase());
      query += " AND h.loai_thuc_hanh = @loai_thuc_hanh";
    }

    if (filters.khoa_bu_ly_thuyet && filters.khoa_bu_ly_thuyet !== 'undefined' && filters.khoa_bu_ly_thuyet !== 'null' && String(filters.khoa_bu_ly_thuyet).trim() !== '') {
      request.input("khoa_bu_ly_thuyet", mssql.NVarChar, String(filters.khoa_bu_ly_thuyet));
      query += " AND h.khoa_bu_ly_thuyet = @khoa_bu_ly_thuyet";
    }

    if (filters.khoa_bu_thuc_hanh && filters.khoa_bu_thuc_hanh !== 'undefined' && filters.khoa_bu_thuc_hanh !== 'null' && String(filters.khoa_bu_thuc_hanh).trim() !== '') {
      request.input("khoa_bu_thuc_hanh", mssql.NVarChar, String(filters.khoa_bu_thuc_hanh));
      query += " AND h.khoa_bu_thuc_hanh = @khoa_bu_thuc_hanh";
    }

    if (filters.search) {
      request.input("search", mssql.NVarChar, `%${filters.search}%`);
      query += " AND (h.ma_dk LIKE @search OR hv.ho_ten LIKE @search OR hv.cccd LIKE @search)";
    }

    query += " ORDER BY h.created_at DESC";

    if (filters.page && filters.limit) {
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const offset = (page - 1) * limit;
      
      request.input("offset", mssql.Int, offset);
      request.input("limit", mssql.Int, limit);
      
      query += " OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    }

    const result = await request.query(query);
    const data = result.recordset;
    
    if (filters.page && filters.limit) {
      const total = data.length > 0 ? data[0].total_count : 0;
      data.total = total; // Đính kèm total vào array để trả về
      // (Tùy chọn) Xóa cột total_count khỏi mỗi row nếu không cần thiết:
      // data.forEach(row => delete row.total_count);
    }
    
    return data;
  }

  /**
   * Upsert danh sách nhiều bản ghi học bù
   * @param {Array} records Danh sách các Object chứa các trường dữ liệu (ma_dk là bắt buộc)
   */
  async upsertMany(records) {
    if (!Array.isArray(records) || records.length === 0) return { success: 0, total: 0 };
    await this.initTable();
    const pool = await connectSQL();
    
    let successCount = 0;
    for (const record of records) {
      try {
        const request = new mssql.Request(pool);
        const ma_dk = record.ma_dk;
        if (!ma_dk) continue;

        const cleanRecord = {};
        for (const [k, v] of Object.entries(record)) {
          if (v !== undefined) cleanRecord[k] = v;
        }

        const updateFields = [];
        const insertColumns = ["created_at"];
        const insertValues = ["GETDATE()"];

        for (const [key, value] of Object.entries(cleanRecord)) {
          request.input(key, this.getMssqlType(value), value);
          if (key !== "ma_dk") {
            updateFields.push(`[${key}] = @${key}`);
          }
          insertColumns.push(`[${key}]`);
          insertValues.push(`@${key}`);
        }
        updateFields.push("[updated_at] = GETDATE()");

        const query = `
          IF EXISTS (SELECT 1 FROM [dbo].[hoc_bu_new] WHERE ma_dk = @ma_dk)
          BEGIN
            UPDATE [dbo].[hoc_bu_new] SET ${updateFields.join(", ")} WHERE ma_dk = @ma_dk;
          END
          ELSE
          BEGIN
            INSERT INTO [dbo].[hoc_bu_new] (${insertColumns.join(", ")}) VALUES (${insertValues.join(", ")});
          END
        `;
        
        await request.query(query);
        successCount++;
      } catch (err) {
        console.error(`[HocBuNewModel] Upsert failed for ${record.ma_dk}:`, err.message);
      }
    }
    return { success: successCount, total: records.length };
  }

  /**
   * Helper xác định kiểu dữ liệu cho mssql request input
   */
  getMssqlType(value) {
    if (typeof value === "number") {
      return Number.isInteger(value) ? mssql.Int : mssql.Decimal;
    }
    if (value instanceof Date) {
      return mssql.DateTime;
    }
    if (typeof value === "boolean") {
      return mssql.Bit;
    }
    return mssql.NVarChar;
  }
}

module.exports = new HocBuNewModel();
