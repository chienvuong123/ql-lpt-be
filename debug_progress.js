const mssql = require("mssql");
const connectSQL = require("./src/configs/sql");

async function checkData() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    
    console.log("=== CHECKING TIEN_DO_DAO_TAO ENTRIES ===");
    
    // Check the specific course the user pointed out
    const { recordset } = await request.query(`
      SELECT ma_khoa, loai, bat_dau_cabin, ket_thuc_cabin, bat_dau_ly_thuyet, ket_thuc_ly_thuyet 
      FROM [dbo].[tien_do_dao_tao] 
      WHERE ma_khoa LIKE '%2026%'
    `);
    console.table(recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
