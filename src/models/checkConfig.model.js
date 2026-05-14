const connectSQL = require("../configs/sql");

async function getAll() {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT check_key, enabled, start_date, description
    FROM check_configs
  `);
  return result.recordset;
}

async function updateConfig(checkKey, enabled, startDate) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("checkKey", checkKey)
    .input("enabled", enabled)
    .input("startDate", startDate || null)
    .query(`
      UPDATE check_configs
      SET enabled = @enabled,
          start_date = @startDate,
          updated_at = GETDATE()
      WHERE check_key = @checkKey
    `);
  return true;
}

async function create(checkKey, enabled, startDate, description) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("checkKey", checkKey)
    .input("enabled", enabled)
    .input("startDate", startDate || null)
    .input("description", description || null)
    .query(`
      INSERT INTO check_configs (check_key, enabled, start_date, description, created_at, updated_at)
      VALUES (@checkKey, @enabled, @startDate, @description, GETDATE(), GETDATE())
    `);
  return true;
}

async function findByKey(checkKey) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("checkKey", checkKey)
    .query(`
      SELECT * FROM check_configs WHERE check_key = @checkKey
    `);
  return result.recordset[0] || null;
}

module.exports = {
  getAll,
  updateConfig,
  create,
  findByKey,
};
