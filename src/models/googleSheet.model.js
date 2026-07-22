const mssql = require("mssql");
const connectSQL = require("../configs/sql");

class GoogleSheetModel {
  async createTableIfNotExists() {
    const pool = await connectSQL();
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'google_sheet_data')
      BEGIN
        CREATE TABLE google_sheet_data (
          cccd VARCHAR(50) PRIMARY KEY,
          stt_n NVARCHAR(50),
          thoi_gian NVARCHAR(100),
          email NVARCHAR(255),
          co_so NVARCHAR(255),
          ten_hoc_vien NVARCHAR(255),
          ngay_sinh NVARCHAR(100),
          dien_thoai NVARCHAR(50),
          dia_chi NVARCHAR(MAX),
          loai NVARCHAR(100),
          hang NVARCHAR(50),
          nguoi_tuyen_sinh NVARCHAR(255),
          ctv NVARCHAR(255),
          cccd_pho_to BIT,
          dat_coc NVARCHAR(255),
          ma_anh NVARCHAR(255),
          ghi_chu NVARCHAR(MAX),
          updated_at DATETIME DEFAULT GETDATE()
        )
      END
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'ten_hoc_vien_clean'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD ten_hoc_vien_clean AS REPLACE(ten_hoc_vien, ' ', '') PERSISTED;
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'IX_google_sheet_data_ten_hoc_vien_clean'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_google_sheet_data_ten_hoc_vien_clean 
        ON google_sheet_data (ten_hoc_vien_clean) 
        INCLUDE (nguoi_tuyen_sinh, dia_chi, ngay_sinh);
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'IX_google_sheet_data_updated_at'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_google_sheet_data_updated_at 
        ON google_sheet_data (updated_at DESC);
      END

      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'thoi_gian_parsed'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD thoi_gian_parsed AS TRY_CONVERT(DATETIME, thoi_gian, 103) PERSISTED;
      END

      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'dau_moi'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD dau_moi AS nguoi_tuyen_sinh PERSISTED;
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'IX_google_sheet_data_thoi_gian_parsed'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_google_sheet_data_thoi_gian_parsed 
        ON google_sheet_data (thoi_gian_parsed DESC);
      END
    `;
    await pool.request().query(query);
    console.log("[GoogleSheetModel] Đảm bảo bảng google_sheet_data và các chỉ mục đã tồn tại.");
  }

  async upsertGoogleSheetData(data) {
    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);
    try {
      await transaction.begin();
 
      // 1. Create temporary staging table schema
      const table = new mssql.Table('#temp_stage');
      table.create = true;
      table.columns.add('cccd', mssql.VarChar(50), { nullable: false });
      table.columns.add('stt_n', mssql.NVarChar(50), { nullable: true });
      table.columns.add('thoi_gian', mssql.NVarChar(100), { nullable: true });
      table.columns.add('email', mssql.NVarChar(255), { nullable: true });
      table.columns.add('co_so', mssql.NVarChar(255), { nullable: true });
      table.columns.add('ten_hoc_vien', mssql.NVarChar(255), { nullable: true });
      table.columns.add('ngay_sinh', mssql.NVarChar(100), { nullable: true });
      table.columns.add('dien_thoai', mssql.NVarChar(50), { nullable: true });
      table.columns.add('dia_chi', mssql.NVarChar(mssql.MAX), { nullable: true });
      table.columns.add('loai', mssql.NVarChar(100), { nullable: true });
      table.columns.add('hang', mssql.NVarChar(50), { nullable: true });
      table.columns.add('nguoi_tuyen_sinh', mssql.NVarChar(255), { nullable: true });
      table.columns.add('ctv', mssql.NVarChar(255), { nullable: true });
      table.columns.add('cccd_pho_to', mssql.Bit, { nullable: true });
      table.columns.add('dat_coc', mssql.NVarChar(255), { nullable: true });
      table.columns.add('ma_anh', mssql.NVarChar(255), { nullable: true });
      table.columns.add('ghi_chu', mssql.NVarChar(mssql.MAX), { nullable: true });
 
      for (const item of data) {
        table.rows.add(
          item.cccd,
          item.stt_n || null,
          item.thoi_gian || null,
          item.email || null,
          item.co_so || null,
          item.ten_hoc_vien || null,
          item.ngay_sinh || null,
          item.dien_thoai || null,
          item.dia_chi || null,
          item.loai || null,
          item.hang || null,
          item.nguoi_tuyen_sinh || null,
          item.ctv || null,
          item.cccd_pho_to ? 1 : 0,
          item.dat_coc || null,
          item.ma_anh || null,
          item.ghi_chu || null
        );
      }
 
      // 2. Bulk insert into #temp_stage
      const reqBulk = new mssql.Request(transaction);
      await reqBulk.bulk(table);
 
      // 3. Update existing records with changes detected
      const reqUpdate = new mssql.Request(transaction);
      await reqUpdate.query(`
        UPDATE target
        SET 
          target.stt_n = source.stt_n,
          target.thoi_gian = source.thoi_gian,
          target.email = source.email,
          target.co_so = source.co_so,
          target.ten_hoc_vien = source.ten_hoc_vien,
          target.ngay_sinh = source.ngay_sinh,
          target.dien_thoai = source.dien_thoai,
          target.dia_chi = source.dia_chi,
          target.loai = source.loai,
          target.hang = source.hang,
          target.nguoi_tuyen_sinh = source.nguoi_tuyen_sinh,
          target.ctv = source.ctv,
          target.cccd_pho_to = source.cccd_pho_to,
          target.dat_coc = source.dat_coc,
          target.ma_anh = source.ma_anh,
          target.ghi_chu = source.ghi_chu,
          target.updated_at = GETDATE()
        FROM google_sheet_data target
        INNER JOIN #temp_stage source ON target.cccd = source.cccd
        WHERE 
          ISNULL(target.stt_n, '') <> ISNULL(source.stt_n, '') OR
          ISNULL(target.thoi_gian, '') <> ISNULL(source.thoi_gian, '') OR
          ISNULL(target.email, '') <> ISNULL(source.email, '') OR
          ISNULL(target.co_so, '') <> ISNULL(source.co_so, '') OR
          ISNULL(target.ten_hoc_vien, '') <> ISNULL(source.ten_hoc_vien, '') OR
          ISNULL(target.ngay_sinh, '') <> ISNULL(source.ngay_sinh, '') OR
          ISNULL(target.dien_thoai, '') <> ISNULL(source.dien_thoai, '') OR
          ISNULL(target.dia_chi, '') <> ISNULL(source.dia_chi, '') OR
          ISNULL(target.loai, '') <> ISNULL(source.loai, '') OR
          ISNULL(target.hang, '') <> ISNULL(source.hang, '') OR
          ISNULL(target.nguoi_tuyen_sinh, '') <> ISNULL(source.nguoi_tuyen_sinh, '') OR
          ISNULL(target.ctv, '') <> ISNULL(source.ctv, '') OR
          ISNULL(target.cccd_pho_to, 0) <> ISNULL(source.cccd_pho_to, 0) OR
          ISNULL(target.dat_coc, '') <> ISNULL(source.dat_coc, '') OR
          ISNULL(target.ma_anh, '') <> ISNULL(source.ma_anh, '') OR
          ISNULL(target.ghi_chu, '') <> ISNULL(source.ghi_chu, '')
      `);
 
      // 4. Insert new records
      const reqInsert = new mssql.Request(transaction);
      await reqInsert.query(`
        INSERT INTO google_sheet_data (
          cccd, stt_n, thoi_gian, email, co_so, ten_hoc_vien, ngay_sinh, 
          dien_thoai, dia_chi, loai, hang, nguoi_tuyen_sinh, ctv, 
          cccd_pho_to, dat_coc, ma_anh, ghi_chu, updated_at
        )
        SELECT 
          source.cccd, source.stt_n, source.thoi_gian, source.email, source.co_so, source.ten_hoc_vien, source.ngay_sinh, 
          source.dien_thoai, source.dia_chi, source.loai, source.hang, source.nguoi_tuyen_sinh, source.ctv, 
          source.cccd_pho_to, source.dat_coc, source.ma_anh, source.ghi_chu, GETDATE()
        FROM #temp_stage source
        LEFT JOIN google_sheet_data target WITH (NOLOCK) ON target.cccd = source.cccd
        WHERE target.cccd IS NULL
      `);
 
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getAllDataByCccdList(cccdList) {
    if (!cccdList || cccdList.length === 0) return [];
    const pool = await connectSQL();
    const request = pool.request();
    
    const params = cccdList.map((cccd, i) => `@c${i}`);
    cccdList.forEach((cccd, i) => {
      request.input(`c${i}`, mssql.VarChar, cccd);
    });

    const result = await request.query(`
      SELECT * FROM google_sheet_data 
      WHERE cccd IN (${params.join(", ")})
    `);
    return result.recordset;
  }

  async getAllData({ search, co_so, hang, nguoi_tuyen_sinh, page = 1, limit = 50 } = {}) {
    const pool = await connectSQL();
    
    // 1. Run count query with its own request
    const request1 = pool.request();
    let whereClauses1 = [];
    if (search) {
      request1.input("search", mssql.NVarChar, `%${search.trim()}%`);
      whereClauses1.push("(ten_hoc_vien LIKE @search OR cccd LIKE @search OR dien_thoai LIKE @search OR nguoi_tuyen_sinh LIKE @search)");
    }
    if (co_so) {
      request1.input("co_so", mssql.NVarChar, co_so);
      whereClauses1.push("co_so = @co_so");
    }
    if (hang) {
      request1.input("hang", mssql.NVarChar, hang);
      whereClauses1.push("hang = @hang");
    }
    if (nguoi_tuyen_sinh) {
      request1.input("nguoi_tuyen_sinh", mssql.NVarChar, `%${nguoi_tuyen_sinh.trim()}%`);
      whereClauses1.push("nguoi_tuyen_sinh LIKE @nguoi_tuyen_sinh");
    }
    const whereClauseStr1 = whereClauses1.length > 0 ? `WHERE ${whereClauses1.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) AS total FROM google_sheet_data WITH (NOLOCK) ${whereClauseStr1}`;
    
    const countResult = await request1.query(countQuery);
    const total = countResult.recordset[0]?.total || 0;

    // 2. Run data query with a new request
    const request2 = pool.request();
    let whereClauses2 = [];
    if (search) {
      request2.input("search", mssql.NVarChar, `%${search.trim()}%`);
      whereClauses2.push("(ten_hoc_vien LIKE @search OR cccd LIKE @search OR dien_thoai LIKE @search OR nguoi_tuyen_sinh LIKE @search)");
    }
    if (co_so) {
      request2.input("co_so", mssql.NVarChar, co_so);
      whereClauses2.push("co_so = @co_so");
    }
    if (hang) {
      request2.input("hang", mssql.NVarChar, hang);
      whereClauses2.push("hang = @hang");
    }
    if (nguoi_tuyen_sinh) {
      request2.input("nguoi_tuyen_sinh", mssql.NVarChar, `%${nguoi_tuyen_sinh.trim()}%`);
      whereClauses2.push("nguoi_tuyen_sinh LIKE @nguoi_tuyen_sinh");
    }
    const whereClauseStr2 = whereClauses2.length > 0 ? `WHERE ${whereClauses2.join(" AND ")}` : "";

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    request2.input("offset", mssql.Int, offset);
    request2.input("limit", mssql.Int, parseInt(limit));

    const dataQuery = `
      SELECT *,
             CASE WHEN UPPER(LTRIM(RTRIM(hang))) = 'B2' THEN 'B' + cccd
                  WHEN UPPER(LTRIM(RTRIM(hang))) = 'C1' THEN 'C' + cccd
                  ELSE cccd
             END AS ma_ke_toan,
             CASE WHEN hang IS NOT NULL AND loai IS NOT NULL 
                  THEN UPPER(LTRIM(RTRIM(hang))) + UPPER(LTRIM(RTRIM(loai)))
                  ELSE ''
             END AS ma_tinh_tien,
             CASE 
                 WHEN UPPER(LTRIM(RTRIM(hang))) IN ('B2', 'B1') THEN
                     CASE 
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'TT' THEN 16000000
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'LK' THEN 4200000
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'CBNV' THEN 12000000
                         ELSE NULL
                     END
                 WHEN UPPER(LTRIM(RTRIM(hang))) = 'C1' THEN
                     CASE 
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'TT' THEN 18000000
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'LK' THEN 4700000
                         WHEN UPPER(LTRIM(RTRIM(loai))) = 'CBNV' THEN 14000000
                         ELSE NULL
                     END
                 ELSE NULL
             END AS hoc_phi
      FROM google_sheet_data WITH (NOLOCK)
      ${whereClauseStr2}
      ORDER BY thoi_gian_parsed DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const dataResult = await request2.query(dataQuery);

    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: dataResult.recordset
    };
  }

  async getRankStats({ year } = {}) {
    const pool = await connectSQL();
    const request = pool.request();
    
    let query = `
      SELECT 
        UPPER(LTRIM(RTRIM(hang))) AS hang,
        COUNT(*) AS total
      FROM google_sheet_data WITH (NOLOCK)
      WHERE UPPER(LTRIM(RTRIM(hang))) IN ('B1', 'B2', 'C1')
    `;

    if (year) {
      request.input("year", mssql.Int, parseInt(year));
      query += ` AND YEAR(thoi_gian_parsed) = @year`;
    }

    query += ` GROUP BY UPPER(LTRIM(RTRIM(hang)))`;

    const result = await request.query(query);
    
    const stats = { B1: 0, B2: 0, C1: 0 };
    result.recordset.forEach(row => {
      if (row.hang && stats[row.hang] !== undefined) {
        stats[row.hang] = row.total;
      }
    });
    
    return stats;
  }
}

module.exports = new GoogleSheetModel();
