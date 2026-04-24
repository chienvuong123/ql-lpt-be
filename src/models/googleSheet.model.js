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
    `;
    await pool.request().query(query);
    console.log("[GoogleSheetModel] Đảm bảo bảng google_sheet_data đã tồn tại.");
  }

  async upsertGoogleSheetData(data) {
    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);
    try {
      await transaction.begin();
      for (const item of data) {
        const request = new mssql.Request(transaction);
        
        // Map fields and handle types
        request.input("cccd", mssql.VarChar, item.cccd);
        request.input("stt_n", mssql.NVarChar, item.stt_n || null);
        request.input("thoi_gian", mssql.NVarChar, item.thoi_gian || null);
        request.input("email", mssql.NVarChar, item.email || null);
        request.input("co_so", mssql.NVarChar, item.co_so || null);
        request.input("ten_hoc_vien", mssql.NVarChar, item.ten_hoc_vien || null);
        request.input("ngay_sinh", mssql.NVarChar, item.ngay_sinh || null);
        request.input("dien_thoai", mssql.NVarChar, item.dien_thoai || null);
        request.input("dia_chi", mssql.NVarChar, item.dia_chi || null);
        request.input("loai", mssql.NVarChar, item.loai || null);
        request.input("hang", mssql.NVarChar, item.hang || null);
        request.input("nguoi_tuyen_sinh", mssql.NVarChar, item.nguoi_tuyen_sinh || null);
        request.input("ctv", mssql.NVarChar, item.ctv || null);
        request.input("cccd_pho_to", mssql.Bit, item.cccd_pho_to ? 1 : 0);
        request.input("dat_coc", mssql.NVarChar, item.dat_coc || null);
        request.input("ma_anh", mssql.NVarChar, item.ma_anh || null);
        request.input("ghi_chu", mssql.NVarChar, item.ghi_chu || null);

        await request.query(`
          IF EXISTS (SELECT 1 FROM google_sheet_data WHERE cccd = @cccd)
          BEGIN
            UPDATE google_sheet_data SET
              stt_n = @stt_n,
              thoi_gian = @thoi_gian,
              email = @email,
              co_so = @co_so,
              ten_hoc_vien = @ten_hoc_vien,
              ngay_sinh = @ngay_sinh,
              dien_thoai = @dien_thoai,
              dia_chi = @dia_chi,
              loai = @loai,
              hang = @hang,
              nguoi_tuyen_sinh = @nguoi_tuyen_sinh,
              ctv = @ctv,
              cccd_pho_to = @cccd_pho_to,
              dat_coc = @dat_coc,
              ma_anh = @ma_anh,
              ghi_chu = @ghi_chu,
              updated_at = GETDATE()
            WHERE cccd = @cccd
          END
          ELSE
          BEGIN
            INSERT INTO google_sheet_data (
              cccd, stt_n, thoi_gian, email, co_so, ten_hoc_vien, ngay_sinh, 
              dien_thoai, dia_chi, loai, hang, nguoi_tuyen_sinh, ctv, 
              cccd_pho_to, dat_coc, ma_anh, ghi_chu, updated_at
            ) VALUES (
              @cccd, @stt_n, @thoi_gian, @email, @co_so, @ten_hoc_vien, @ngay_sinh, 
              @dien_thoai, @dia_chi, @loai, @hang, @nguoi_tuyen_sinh, @ctv, 
              @cccd_pho_to, @dat_coc, @ma_anh, @ghi_chu, GETDATE()
            )
          END
        `);
      }
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
}

module.exports = new GoogleSheetModel();
