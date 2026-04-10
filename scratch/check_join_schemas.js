const connectSQL = require('../src/configs/sql');
async function run() {
  try {
    const pool = await connectSQL();
    const hvColumns = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'hoc_vien'");
    console.log('hoc_vien columns:', JSON.stringify(hvColumns.recordset, null, 2));
    
    const khColumns = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'khoa_hoc'");
    console.log('khoa_hoc columns:', JSON.stringify(khColumns.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
