const mssql = require("mssql");
const connectSQL = require("../configs/sql");

/**
 * Sync (Upsert) multiple vehicle registration records into dang_ky_xe_gv table
 * @param {Array} records 
 */
async function upsertMany(records) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();
    
    let upsertedCount = 0;
    let modifiedCount = 0;

    for (const data of records) {
      const request = new mssql.Request(transaction);
      
      request.input("stt", mssql.Int, data.stt || null);
      request.input("ma_dk", mssql.VarChar, data.ma_dk);
      request.input("khoa", mssql.NVarChar, data.khoa || null);
      request.input("ho_ten", mssql.NVarChar, data.ho_ten || null);
      request.input("ngay_sinh", mssql.DateTime, data.ngay_sinh || null);
      request.input("gioi_tinh", mssql.NVarChar, data.gioi_tinh || null);
      request.input("cccd", mssql.VarChar, data.cccd || null);
      request.input("dia_chi", mssql.NVarChar, data.dia_chi || null);
      request.input("ngay_nhap", mssql.DateTime, data.ngay_nhap || null);
      request.input("giao_vien", mssql.NVarChar, data.giao_vien || null);
      request.input("giao_vien_thay", mssql.NVarChar, data.giao_vien_thay || null);
      request.input("xe_b1", mssql.NVarChar, data.xe_b1 || null);
      request.input("xe_b2", mssql.NVarChar, data.xe_b2 || null);
      request.input("ghi_chu", mssql.NVarChar, data.ghi_chu || null);
      request.input("ma_csdt", mssql.VarChar, "30004");

      const result = await request.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[dang_ky_xe_gv] WHERE ma_dk = @ma_dk)
        BEGIN
          UPDATE [dbo].[dang_ky_xe_gv]
          SET stt = @stt,
              khoa = @khoa,
              ho_ten = @ho_ten,
              ngay_sinh = @ngay_sinh,
              gioi_tinh = @gioi_tinh,
              cccd = @cccd,
              dia_chi = @dia_chi,
              ngay_nhap = @ngay_nhap,
              giao_vien = @giao_vien,
              giao_vien_thay = @giao_vien_thay,
              xe_b1 = @xe_b1,
              xe_b2 = @xe_b2,
              ghi_chu = @ghi_chu,
              updated_at = GETDATE()
          WHERE ma_dk = @ma_dk;
          SELECT 'UPDATE' as action;
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[dang_ky_xe_gv] 
            (stt, ma_dk, khoa, ho_ten, ngay_sinh, gioi_tinh, cccd, dia_chi, ngay_nhap, giao_vien, giao_vien_thay, xe_b1, xe_b2, ghi_chu, ma_csdt)
          VALUES 
            (@stt, @ma_dk, @khoa, @ho_ten, @ngay_sinh, @gioi_tinh, @cccd, @dia_chi, @ngay_nhap, @giao_vien, @giao_vien_thay, @xe_b1, @xe_b2, @ghi_chu, @ma_csdt);
          SELECT 'INSERT' as action;
        END
      `);

      if (result.recordset[0].action === 'INSERT') {
        upsertedCount++;
      } else {
        modifiedCount++;
      }
    }

    await transaction.commit();
    return { upsertedCount, modifiedCount };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  upsertMany
};
