const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function run() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    console.log("Cleaning up test config records...");
    await request.query(`
      DELETE FROM check_configs
      WHERE check_key IN ('checkTestPhienNghi_14', 'checkTestPhienNghi_20phut')
    `);
    console.log("Cleanup completed successfully.");

    process.exit(0);
  } catch (err) {
    console.error("Cleanup failed:", err);
    process.exit(1);
  }
}

run();
