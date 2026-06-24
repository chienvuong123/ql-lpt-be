const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const googleSheetService = require("../services/googleSheet.service");

class KeToanModel {
  async createTableIfNotExists() {
    const pool = await connectSQL();
    const query = `
      -- 1. Create bang_thanh_toan table
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'bang_thanh_toan')
      BEGIN
        CREATE TABLE bang_thanh_toan (
          id INT IDENTITY(1,1) PRIMARY KEY,
          cccd VARCHAR(50) NOT NULL UNIQUE,
          so_tien_phai_nop DECIMAL(18, 2) DEFAULT 0,
          so_tien_da_nop DECIMAL(18, 2) DEFAULT 0,
          so_tien_con_lai DECIMAL(18, 2) DEFAULT 0,
          trang_thai INT DEFAULT 0, -- 0: chua_nop, 1: da_nop_mot_phan, 2: da_nop_du
          ngay_nop DATETIME,
          ghi_chu_ke_toan NVARCHAR(MAX),
          nguoi_duyet NVARCHAR(255),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_bang_thanh_toan_google_sheet_data FOREIGN KEY (cccd) REFERENCES google_sheet_data(cccd)
        )
      END
      ELSE
      BEGIN
        -- 1. Migrate column type if it is not already INT
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('bang_thanh_toan') AND name = 'trang_thai' AND system_type_id <> 56)
        BEGIN
          -- Update existing string values to convertable numbers first
          UPDATE bang_thanh_toan SET trang_thai = '0' WHERE trang_thai IS NULL OR trang_thai = 'chua_nop' OR trang_thai = '';
          UPDATE bang_thanh_toan SET trang_thai = '1' WHERE trang_thai = 'da_nop_mot_phan';
          UPDATE bang_thanh_toan SET trang_thai = '2' WHERE trang_thai = 'da_nop_du';

          -- Drop default constraint first if exists
          DECLARE @ConstraintName NVARCHAR(255)
          SELECT @ConstraintName = name
          FROM sys.default_constraints
          WHERE parent_object_id = OBJECT_ID('bang_thanh_toan') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('bang_thanh_toan'), 'trang_thai', 'ColumnId')
          
          IF @ConstraintName IS NOT NULL
          BEGIN
            EXEC('ALTER TABLE bang_thanh_toan DROP CONSTRAINT ' + @ConstraintName)
          END

          -- Alter column
          ALTER TABLE bang_thanh_toan ALTER COLUMN trang_thai INT;
          
          -- Add new default constraint
          ALTER TABLE bang_thanh_toan ADD CONSTRAINT DF_bang_thanh_toan_trang_thai DEFAULT 0 FOR trang_thai;
        END

        -- 2. Drop phuong_thuc column from bang_thanh_toan if it exists
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('bang_thanh_toan') AND name = 'phuong_thuc')
        BEGIN
          ALTER TABLE bang_thanh_toan DROP COLUMN phuong_thuc;
        END
      END

      -- 2. Create lich_su_thanh_toan table
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'lich_su_thanh_toan')
      BEGIN
        CREATE TABLE lich_su_thanh_toan (
          id INT IDENTITY(1,1) PRIMARY KEY,
          cccd VARCHAR(50) NOT NULL,
          so_tien_da_nop DECIMAL(18, 2) DEFAULT 0,
          phuong_thuc NVARCHAR(50),
          ngay_nop DATETIME,
          ghi_chu_ke_toan NVARCHAR(MAX),
          nguoi_duyet NVARCHAR(255),
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_lich_su_thanh_toan_google_sheet_data FOREIGN KEY (cccd) REFERENCES google_sheet_data(cccd)
        )
      END

      -- 3. Create index for performance
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_lich_su_thanh_toan_cccd')
      BEGIN
        CREATE NONCLUSTERED INDEX IX_lich_su_thanh_toan_cccd ON lich_su_thanh_toan(cccd);
      END
    `;
    await pool.request().query(query);
  }

  async getDanhSach({ search, co_so, trang_thai, thoi_gian, page = 1, limit = 50 } = {}) {
    await this.createTableIfNotExists();
    const pool = await connectSQL();

    // Base conditions
    let whereClauses = [];
    
    // Request for count
    const request1 = pool.request();
    if (search) {
      request1.input("search", mssql.NVarChar, `%${search.trim()}%`);
      whereClauses.push("(g.ten_hoc_vien LIKE @search OR g.cccd LIKE @search OR g.dien_thoai LIKE @search)");
    }
    if (co_so) {
      request1.input("co_so", mssql.NVarChar, co_so);
      whereClauses.push("g.co_so = @co_so");
    }
    if (trang_thai !== undefined && trang_thai !== null && trang_thai !== "") {
      const statusInt = parseInt(trang_thai);
      request1.input("trang_thai", mssql.Int, statusInt);
      if (statusInt === 0) {
        whereClauses.push("(t.trang_thai IS NULL OR t.trang_thai = 0)");
      } else {
        whereClauses.push("t.trang_thai = @trang_thai");
      }
    }
    if (thoi_gian) {
      // Check for range like "2026-06-01,2026-06-30" or "2026-06-01 to 2026-06-30"
      const parts = thoi_gian.split(/[,|]|\sto\s/);
      if (parts.length === 2) {
        const start = parts[0].trim();
        const end = parts[1].trim();
        if (start) {
          whereClauses.push("g.thoi_gian_parsed >= @thoi_gian_start");
          request1.input("thoi_gian_start", mssql.DateTime, new Date(start + " 00:00:00"));
        }
        if (end) {
          whereClauses.push("g.thoi_gian_parsed <= @thoi_gian_end");
          request1.input("thoi_gian_end", mssql.DateTime, new Date(end + " 23:59:59"));
        }
      } else {
        whereClauses.push("CONVERT(VARCHAR(10), g.thoi_gian_parsed, 120) = @thoi_gian");
        request1.input("thoi_gian", mssql.VarChar, thoi_gian.trim());
      }
    }

    const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN bang_thanh_toan t WITH (NOLOCK) ON g.cccd = t.cccd
      ${whereClauseStr}
    `;

    const countResult = await request1.query(countQuery);
    const total = countResult.recordset[0]?.total || 0;

    // Request for data query
    const request2 = pool.request();
    // Re-input params for request2
    if (search) request2.input("search", mssql.NVarChar, `%${search.trim()}%`);
    if (co_so) request2.input("co_so", mssql.NVarChar, co_so);
    if (trang_thai !== undefined && trang_thai !== null && trang_thai !== "") request2.input("trang_thai", mssql.Int, parseInt(trang_thai));
    if (thoi_gian) {
      const parts = thoi_gian.split(/[,|]|\sto\s/);
      if (parts.length === 2) {
        const start = parts[0].trim();
        const end = parts[1].trim();
        if (start) request2.input("thoi_gian_start", mssql.DateTime, new Date(start + " 00:00:00"));
        if (end) request2.input("thoi_gian_end", mssql.DateTime, new Date(end + " 23:59:59"));
      } else {
        request2.input("thoi_gian", mssql.VarChar, thoi_gian.trim());
      }
    }

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    request2.input("offset", mssql.Int, offset);
    request2.input("limit", mssql.Int, parseInt(limit));

    const dataQuery = `
      SELECT g.cccd, g.ten_hoc_vien, g.ngay_sinh, g.dien_thoai, g.email, g.dia_chi,
             g.co_so, g.loai, g.hang, g.nguoi_tuyen_sinh, g.ctv, g.dat_coc,
             CASE WHEN UPPER(LTRIM(RTRIM(g.hang))) = 'B2' THEN 'B' + g.cccd
                  WHEN UPPER(LTRIM(RTRIM(g.hang))) = 'C1' THEN 'C' + g.cccd
                  ELSE g.cccd
             END AS ma_ke_toan,
             CASE WHEN g.hang IS NOT NULL AND g.loai IS NOT NULL 
                  THEN UPPER(LTRIM(RTRIM(g.hang))) + UPPER(LTRIM(RTRIM(g.loai)))
                  ELSE ''
             END AS ma_tinh_tien,
             CASE 
                 WHEN UPPER(LTRIM(RTRIM(g.hang))) IN ('B2', 'B1') THEN
                     CASE 
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'TT' THEN 16000000
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'LK' THEN 4200000
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'CBNV' THEN 12000000
                         ELSE NULL
                     END
                 WHEN UPPER(LTRIM(RTRIM(g.hang))) = 'C1' THEN
                     CASE 
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'TT' THEN 18000000
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'LK' THEN 4700000
                         WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'CBNV' THEN 14000000
                         ELSE NULL
                     END
                 ELSE NULL
             END AS hoc_phi,
             g.thoi_gian_parsed, g.ghi_chu,
             t.id AS thanh_toan_id,
             t.so_tien_phai_nop,
             t.so_tien_da_nop,
             t.so_tien_con_lai,
             COALESCE(t.trang_thai, 0) AS trang_thai_thanh_toan,
             t.ngay_nop,
             t.ghi_chu_ke_toan,
             t.nguoi_duyet,
             t.created_at AS thanh_toan_created_at,
             t.updated_at AS thanh_toan_updated_at
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN bang_thanh_toan t WITH (NOLOCK) ON g.cccd = t.cccd
      ${whereClauseStr}
      ORDER BY g.thoi_gian_parsed DESC
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

  async getStudentByCccd(cccd) {
    const pool = await connectSQL();
    const result = await pool.request()
      .input("cccd", mssql.VarChar, cccd)
      .query("SELECT * FROM google_sheet_data WITH (NOLOCK) WHERE cccd = @cccd");
    return result.recordset[0] || null;
  }

  async getPaymentByCccd(cccd) {
    const pool = await connectSQL();
    const result = await pool.request()
      .input("cccd", mssql.VarChar, cccd)
      .query("SELECT * FROM bang_thanh_toan WITH (NOLOCK) WHERE cccd = @cccd");
    return result.recordset[0] || null;
  }

  async duyetThanhToan({ cccd, so_tien_da_nop, phuong_thuc, ngay_nop, ghi_chu_ke_toan, nguoi_duyet }) {
    await this.createTableIfNotExists();
    const pool = await connectSQL();
    
    // 1. Fetch student info to get total tuition
    const student = await this.getStudentByCccd(cccd);
    if (!student) {
      throw new Error(`Học viên với CCCD ${cccd} không tồn tại trong hệ thống.`);
    }

    const transaction = new mssql.Transaction(pool);
    try {
      await transaction.begin();

      // Retrieve existing payment record
      const checkReq = new mssql.Request(transaction);
      checkReq.input("cccd", mssql.VarChar, cccd);
      const checkResult = await checkReq.query("SELECT * FROM bang_thanh_toan WHERE cccd = @cccd");
      const existingPayment = checkResult.recordset[0] || null;

      // Determine required fee
      const so_tien_phai_nop = googleSheetService.getHocPhi(student.hang, student.loai) || 0;
      
      // Calculate updated paid and remaining amount
      const amountPaidThisTime = parseFloat(so_tien_da_nop) || 0;
      const new_so_tien_da_nop = (existingPayment ? parseFloat(existingPayment.so_tien_da_nop) : 0) + amountPaidThisTime;
      const new_so_tien_con_lai = so_tien_phai_nop - new_so_tien_da_nop;
      
      // Determine status
      let trang_thai = 0;
      if (new_so_tien_da_nop > 0) {
        if (new_so_tien_con_lai > 0) {
          trang_thai = 1;
        } else {
          trang_thai = 2;
        }
      }

      const parsedNgayNop = ngay_nop ? new Date(ngay_nop) : new Date();

      // 2. Create or Update bang_thanh_toan
      const upsertReq = new mssql.Request(transaction);
      upsertReq.input("cccd", mssql.VarChar, cccd);
      upsertReq.input("so_tien_phai_nop", mssql.Decimal(18, 2), so_tien_phai_nop);
      upsertReq.input("so_tien_da_nop", mssql.Decimal(18, 2), new_so_tien_da_nop);
      upsertReq.input("so_tien_con_lai", mssql.Decimal(18, 2), new_so_tien_con_lai);
      upsertReq.input("trang_thai", mssql.Int, trang_thai);
      upsertReq.input("ngay_nop", mssql.DateTime, parsedNgayNop);
      upsertReq.input("ghi_chu_ke_toan", mssql.NVarChar, ghi_chu_ke_toan || null);
      upsertReq.input("nguoi_duyet", mssql.NVarChar, nguoi_duyet);

      if (existingPayment) {
        await upsertReq.query(`
          UPDATE bang_thanh_toan
          SET so_tien_phai_nop = @so_tien_phai_nop,
              so_tien_da_nop = @so_tien_da_nop,
              so_tien_con_lai = @so_tien_con_lai,
              trang_thai = @trang_thai,
              ngay_nop = @ngay_nop,
              ghi_chu_ke_toan = @ghi_chu_ke_toan,
              nguoi_duyet = @nguoi_duyet,
              updated_at = GETDATE()
          WHERE cccd = @cccd
        `);
      } else {
        await upsertReq.query(`
          INSERT INTO bang_thanh_toan 
            (cccd, so_tien_phai_nop, so_tien_da_nop, so_tien_con_lai, trang_thai, ngay_nop, ghi_chu_ke_toan, nguoi_duyet, created_at, updated_at)
          VALUES
            (@cccd, @so_tien_phai_nop, @so_tien_da_nop, @so_tien_con_lai, @trang_thai, @ngay_nop, @ghi_chu_ke_toan, @nguoi_duyet, GETDATE(), GETDATE())
        `);
      }

      // 3. Write log in lich_su_thanh_toan
      const logReq = new mssql.Request(transaction);
      logReq.input("cccd", mssql.VarChar, cccd);
      logReq.input("so_tien_da_nop", mssql.Decimal(18, 2), amountPaidThisTime);
      logReq.input("phuong_thuc", mssql.NVarChar, phuong_thuc || null);
      logReq.input("ngay_nop", mssql.DateTime, parsedNgayNop);
      logReq.input("ghi_chu_ke_toan", mssql.NVarChar, ghi_chu_ke_toan || null);
      logReq.input("nguoi_duyet", mssql.NVarChar, nguoi_duyet);

      await logReq.query(`
        INSERT INTO lich_su_thanh_toan
          (cccd, so_tien_da_nop, phuong_thuc, ngay_nop, ghi_chu_ke_toan, nguoi_duyet, created_at)
        VALUES
          (@cccd, @so_tien_da_nop, @phuong_thuc, @ngay_nop, @ghi_chu_ke_toan, @nguoi_duyet, GETDATE())
      `);

      await transaction.commit();
      return {
        cccd,
        so_tien_phai_nop,
        so_tien_da_nop: new_so_tien_da_nop,
        so_tien_con_lai: new_so_tien_con_lai,
        trang_thai
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getBaoCao() {
    await this.createTableIfNotExists();
    const pool = await connectSQL();

    // 1. Get daily revenue (last 30 days)
    const dailyResult = await pool.query(`
      SELECT TOP 30
          CONVERT(VARCHAR(10), ngay_nop, 120) AS ngay,
          SUM(so_tien_da_nop) AS tong_thu
      FROM lich_su_thanh_toan WITH (NOLOCK)
      GROUP BY CONVERT(VARCHAR(10), ngay_nop, 120)
      ORDER BY ngay DESC
    `);

    // 2. Get monthly revenue (last 12 months)
    const monthlyResult = await pool.query(`
      SELECT TOP 12
          CONVERT(VARCHAR(7), ngay_nop, 120) AS thang,
          SUM(so_tien_da_nop) AS tong_thu
      FROM lich_su_thanh_toan WITH (NOLOCK)
      GROUP BY CONVERT(VARCHAR(7), ngay_nop, 120)
      ORDER BY thang DESC
    `);

    // 3. Count students by payment status
    const statusResult = await pool.query(`
      SELECT 
          COALESCE(t.trang_thai, 0) AS trang_thai,
          COUNT(*) AS so_luong
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN bang_thanh_toan t WITH (NOLOCK) ON g.cccd = t.cccd
      GROUP BY COALESCE(t.trang_thai, 0)
    `);

    // 4. Sum required tuition vs actual collection
    const summaryResult = await pool.query(`
      SELECT 
          SUM(CAST(
              ISNULL(
                  CASE 
                      WHEN UPPER(LTRIM(RTRIM(g.hang))) IN ('B2', 'B1') THEN
                          CASE 
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'TT' THEN 16000000
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'LK' THEN 4200000
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'CBNV' THEN 12000000
                              ELSE NULL
                          END
                      WHEN UPPER(LTRIM(RTRIM(g.hang))) = 'C1' THEN
                          CASE 
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'TT' THEN 18000000
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'LK' THEN 4700000
                              WHEN UPPER(LTRIM(RTRIM(g.loai))) = 'CBNV' THEN 14000000
                              ELSE NULL
                          END
                      ELSE NULL
                  END, 0
              ) AS DECIMAL(18, 2))) AS tong_phai_thu,
          SUM(ISNULL(t.so_tien_da_nop, 0)) AS tong_thuc_thu
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN bang_thanh_toan t WITH (NOLOCK) ON g.cccd = t.cccd
    `);

    const summary = summaryResult.recordset[0] || { tong_phai_thu: 0, tong_thuc_thu: 0 };
    const tong_phai_thu = summary.tong_phai_thu || 0;
    const tong_thuc_thu = summary.tong_thuc_thu || 0;
    const tong_con_lai = tong_phai_thu - tong_thuc_thu;

    return {
      tong_phai_thu,
      tong_thuc_thu,
      tong_con_lai,
      doanh_thu_theo_ngay: dailyResult.recordset,
      doanh_thu_theo_thang: monthlyResult.recordset,
      so_luong_theo_trang_thai: statusResult.recordset
    };
  }
}

module.exports = new KeToanModel();
