const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function checkUnassigned() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    
    // Check if the student is in the list of unassigned students
    const query = `
      SELECT g.cccd, g.ten_hoc_vien, g.thoi_gian_parsed, hv.ma_khoa
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON g.cccd = hv.cccd
      WHERE g.cccd = '030096003630'
    `;
    const res = await request.query(query);
    console.log("=== JOIN FOR SPECIFIC CCCD ===");
    console.table(res.recordset);

    const queryWithCondition = `
      SELECT g.cccd, g.ten_hoc_vien, g.thoi_gian_parsed, hv.ma_khoa,
             CASE WHEN (hv.ma_khoa IS NULL OR LTRIM(RTRIM(hv.ma_khoa)) = '') THEN 1 ELSE 0 END as is_unassigned
      FROM google_sheet_data g WITH (NOLOCK)
      LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON g.cccd = hv.cccd
      WHERE g.cccd = '030096003630'
    `;
    const resCond = await request.query(queryWithCondition);
    console.log("=== WITH UNASSIGNED CONDITION ===");
    console.table(resCond.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUnassigned();
