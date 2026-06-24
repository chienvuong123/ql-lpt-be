const connectSQL = require("../src/configs/sql");
const mssql = require("mssql");

async function checkStatus() {
  const pool = await connectSQL();
  const codes = [
    '30004-20250704090408843',
    '30004-20250515111847027',
    '30004-20250415142048953'
  ];

  try {
    const req = pool.request();
    codes.forEach((code, i) => req.input(`c_${i}`, mssql.NVarChar, code));
    
    const query = `
      SELECT ma_dk, loai, trang_thai, trang_thai_ly_thuyet, trang_thai_thuc_hanh
      FROM [dbo].[hoc_bu_new]
      WHERE ma_dk IN (${codes.map((_, i) => `@c_${i}`).join(",")})
    `;
    
    const res = await req.query(query);
    console.log("Database records:", res.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    await mssql.close();
  }
}

checkStatus();
