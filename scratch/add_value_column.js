const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function run() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    console.log("Checking if column 'value' exists in 'check_configs'...");
    const checkColResult = await request.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'check_configs' AND COLUMN_NAME = 'value'
    `);

    if (checkColResult.recordset.length === 0) {
      console.log("Column 'value' does not exist. Adding column 'value'...");
      await request.query(`
        ALTER TABLE check_configs
        ADD value NVARCHAR(MAX) NULL;
      `);
      console.log("Column 'value' added successfully.");
    } else {
      console.log("Column 'value' already exists in table.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
