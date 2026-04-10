const connectSQL = require('../src/configs/sql');
async function run() {
  try {
    const pool = await connectSQL();
    const res = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'trang_thai_hoc_vien'");
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
