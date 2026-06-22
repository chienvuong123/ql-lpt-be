const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function inspectStudent() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    
    console.log("=== Querying google_sheet_data ===");
    const gsRes = await request.query(`
      SELECT cccd, len(cccd) as cccd_len, ten_hoc_vien, thoi_gian, thoi_gian_parsed 
      FROM google_sheet_data 
      WHERE cccd LIKE '%030096003630%' OR ten_hoc_vien LIKE N'%Văn Trình%'
    `);
    console.table(gsRes.recordset);

    console.log("=== Querying hoc_vien ===");
    const hvRes = await request.query(`
      SELECT cccd, len(cccd) as cccd_len, ho_ten, ma_khoa 
      FROM [dbo].[hoc_vien] 
      WHERE cccd LIKE '%030096003630%' OR ho_ten LIKE N'%Văn Trình%'
    `);
    console.table(hvRes.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspectStudent();
