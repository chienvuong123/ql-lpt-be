const connectSQL = require("../src/configs/sql");
const mssql = require("mssql");

async function check() {
  try {
    const pool = await connectSQL();
    const result = await pool.request()
      .input("cccd", mssql.VarChar, "030304004859")
      .query("SELECT * FROM google_sheet_data WHERE cccd = @cccd");
    
    console.log("Record for 030304004859:");
    console.log(JSON.stringify(result.recordset[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
