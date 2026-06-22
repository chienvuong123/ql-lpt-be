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
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'ma_ke_toan'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD ma_ke_toan NVARCHAR(100);
      END

      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'ma_tinh_tien'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD ma_tinh_tien NVARCHAR(100);
      END

      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'hoc_phi'
      )
      BEGIN
        ALTER TABLE google_sheet_data ADD hoc_phi INT;
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
      table.columns.add('ma_ke_toan', mssql.NVarChar(100), { nullable: true });
      table.columns.add('ma_tinh_tien', mssql.NVarChar(100), { nullable: true });
      table.columns.add('hoc_phi', mssql.Int, { nullable: true });
 
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
          item.ghi_chu || null,
          item.ma_ke_toan || null,
          item.ma_tinh_tien || null,
          item.hoc_phi || null
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
          target.ma_ke_toan = source.ma_ke_toan,
          target.ma_tinh_tien = source.ma_tinh_tien,
          target.hoc_phi = source.hoc_phi,
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
          ISNULL(target.ghi_chu, '') <> ISNULL(source.ghi_chu, '') OR
          ISNULL(target.ma_ke_toan, '') <> ISNULL(source.ma_ke_toan, '') OR
          ISNULL(target.ma_tinh_tien, '') <> ISNULL(source.ma_tinh_tien, '') OR
          ISNULL(target.hoc_phi, 0) <> ISNULL(source.hoc_phi, 0)
      `);
 
      // 4. Insert new records
      const reqInsert = new mssql.Request(transaction);
      await reqInsert.query(`
        INSERT INTO google_sheet_data (
          cccd, stt_n, thoi_gian, email, co_so, ten_hoc_vien, ngay_sinh, 
          dien_thoai, dia_chi, loai, hang, nguoi_tuyen_sinh, ctv, 
          cccd_pho_to, dat_coc, ma_anh, ghi_chu, ma_ke_toan, ma_tinh_tien, hoc_phi, updated_at
        )
        SELECT 
          source.cccd, source.stt_n, source.thoi_gian, source.email, source.co_so, source.ten_hoc_vien, source.ngay_sinh, 
          source.dien_thoai, source.dia_chi, source.loai, source.hang, source.nguoi_tuyen_sinh, source.ctv, 
          source.cccd_pho_to, source.dat_coc, source.ma_anh, source.ghi_chu, source.ma_ke_toan, source.ma_tinh_tien, source.hoc_phi, GETDATE()
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
      SELECT * FROM google_sheet_data WITH (NOLOCK)
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

  async updateHocVien(oldCccd, data) {
    const pool = await connectSQL();
    const request = pool.request();
    
    request.input("oldCccd", mssql.VarChar, oldCccd);
    request.input("cccd", mssql.VarChar, data.cccd);
    request.input("ten_hoc_vien", mssql.NVarChar, data.ten_hoc_vien || null);
    request.input("ngay_sinh", mssql.NVarChar, data.ngay_sinh || null);
    request.input("dien_thoai", mssql.NVarChar, data.dien_thoai || null);
    request.input("co_so", mssql.NVarChar, data.co_so || null);
    request.input("hang", mssql.NVarChar, data.hang || null);
    request.input("loai", mssql.NVarChar, data.loai || null);
    request.input("dat_coc", mssql.NVarChar, data.dat_coc || null);
    request.input("nguoi_tuyen_sinh", mssql.NVarChar, data.nguoi_tuyen_sinh || null);
    request.input("ghi_chu", mssql.NVarChar, data.ghi_chu || null);
    request.input("ma_ke_toan", mssql.NVarChar, data.ma_ke_toan || null);
    request.input("ma_tinh_tien", mssql.NVarChar, data.ma_tinh_tien || null);
    request.input("hoc_phi", mssql.Int, data.hoc_phi !== undefined && data.hoc_phi !== null ? parseInt(data.hoc_phi) : null);

    const query = `
      UPDATE google_sheet_data
      SET 
        cccd = @cccd,
        ten_hoc_vien = @ten_hoc_vien,
        ngay_sinh = @ngay_sinh,
        dien_thoai = @dien_thoai,
        co_so = @co_so,
        hang = @hang,
        loai = @loai,
        dat_coc = @dat_coc,
        nguoi_tuyen_sinh = @nguoi_tuyen_sinh,
        ghi_chu = @ghi_chu,
        ma_ke_toan = @ma_ke_toan,
        ma_tinh_tien = @ma_tinh_tien,
        hoc_phi = @hoc_phi,
        updated_at = GETDATE()
      WHERE cccd = @oldCccd
    `;
    
    await request.query(query);
    return true;
  }

  async getUnassignedStudents(search) {
    const pool = await connectSQL();
    const request = pool.request();
    let where = `WHERE (hv.ma_khoa IS NULL OR TRIM(hv.ma_khoa) = '')`;
    if (search) {
      request.input("search", mssql.NVarChar, `%${search.trim()}%`);
      where += ` AND (g.ten_hoc_vien LIKE @search OR g.cccd LIKE @search OR g.dien_thoai LIKE @search)`;
    }
    const query = `
      SELECT TOP 50 g.cccd, g.ten_hoc_vien, g.dien_thoai, g.hang, g.loai, g.dat_coc, g.hoc_phi
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON g.cccd = hv.cccd
      ${where}
      ORDER BY g.ten_hoc_vien ASC
    `;
    const result = await request.query(query);
    return result.recordset;
  }

  async transferFee(sourceCccd, targetCccd) {
    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);
    try {
      await transaction.begin();

      // Verify source student is not assigned
      const checkSource = new mssql.Request(transaction);
      checkSource.input("cccd", mssql.VarChar, sourceCccd);
      const sourceRes = await checkSource.query(`
        SELECT g.ten_hoc_vien, 
               (SELECT COUNT(*) FROM [dbo].[hoc_vien] WHERE cccd = @cccd AND ma_khoa IS NOT NULL AND TRIM(ma_khoa) <> '') AS is_assigned
        FROM google_sheet_data g WITH (NOLOCK)
        WHERE g.cccd = @cccd
      `);
      if (sourceRes.recordset.length === 0) {
        throw new Error("Không tìm thấy học viên nguồn.");
      }
      if (sourceRes.recordset[0].is_assigned > 0) {
        throw new Error(`Học viên ${sourceRes.recordset[0].ten_hoc_vien} đã được xếp khóa/lớp, không thể chuyển học phí.`);
      }

      // Verify target student is not assigned
      const checkTarget = new mssql.Request(transaction);
      checkTarget.input("cccd", mssql.VarChar, targetCccd);
      const targetRes = await checkTarget.query(`
        SELECT g.ten_hoc_vien, 
               (SELECT COUNT(*) FROM [dbo].[hoc_vien] WHERE cccd = @cccd AND ma_khoa IS NOT NULL AND TRIM(ma_khoa) <> '') AS is_assigned
        FROM google_sheet_data g WITH (NOLOCK)
        WHERE g.cccd = @cccd
      `);
      if (targetRes.recordset.length === 0) {
        throw new Error("Không tìm thấy học viên nhận.");
      }
      if (targetRes.recordset[0].is_assigned > 0) {
        throw new Error(`Học viên nhận ${targetRes.recordset[0].ten_hoc_vien} đã được xếp khóa/lớp, không thể nhận học phí.`);
      }

      // Perform the swap of dat_coc and hoc_phi
      const swapReq = new mssql.Request(transaction);
      swapReq.input("sourceCccd", mssql.VarChar, sourceCccd);
      swapReq.input("targetCccd", mssql.VarChar, targetCccd);
      
      await swapReq.query(`
        DECLARE @sourceDatCoc NVARCHAR(255), @sourceHocPhi INT
        DECLARE @targetDatCoc NVARCHAR(255), @targetHocPhi INT

        SELECT @sourceDatCoc = dat_coc, @sourceHocPhi = hoc_phi 
        FROM google_sheet_data WHERE cccd = @sourceCccd

        SELECT @targetDatCoc = dat_coc, @targetHocPhi = hoc_phi 
        FROM google_sheet_data WHERE cccd = @targetCccd

        UPDATE google_sheet_data
        SET dat_coc = @targetDatCoc, hoc_phi = @targetHocPhi, updated_at = GETDATE()
        WHERE cccd = @sourceCccd

        UPDATE google_sheet_data
        SET dat_coc = @sourceDatCoc, hoc_phi = @sourceHocPhi, updated_at = GETDATE()
        WHERE cccd = @targetCccd
      `);

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new GoogleSheetModel();
