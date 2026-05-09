const connectSQL = require("../src/configs/sql");

async function run() {
  try {
    const pool = await connectSQL();
    const result = await pool.request().query("SELECT TOP 10 * FROM [dbo].[hoc_bu_new]");
    console.log("RECORDS:");
    console.log(JSON.stringify(result.recordset, null, 2));

    const counts = await pool.request().query("SELECT loai, COUNT(*) as count FROM [dbo].[hoc_bu_new] GROUP BY loai");
    console.log("COUNTS:");
    console.log(JSON.stringify(counts.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
