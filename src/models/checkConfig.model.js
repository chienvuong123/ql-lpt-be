const connectSQL = require("../configs/sql");

function parseValue(val) {
  if (val === null || val === undefined) return null;
  try {
    return JSON.parse(val);
  } catch (e) {
    if (!isNaN(val) && val.trim() !== "") {
      return Number(val);
    }
    return val;
  }
}

function serializeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

async function getAll() {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT check_key, enabled, start_date, description, value
    FROM check_configs
  `);
  
  return result.recordset.map(row => ({
    ...row,
    value: parseValue(row.value)
  }));
}

async function updateConfig(checkKey, enabled, startDate, value) {
  const pool = await connectSQL();
  const request = pool.request()
    .input("checkKey", checkKey)
    .input("enabled", enabled)
    .input("startDate", startDate || null);

  let query = `
    UPDATE check_configs
    SET enabled = @enabled,
        start_date = @startDate,
        updated_at = GETDATE()
  `;

  if (value !== undefined) {
    request.input("value", serializeValue(value));
    query += `, value = @value`;
  }

  query += ` WHERE check_key = @checkKey`;
  await request.query(query);
  return true;
}

async function create(checkKey, enabled, startDate, description, value) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("checkKey", checkKey)
    .input("enabled", enabled)
    .input("startDate", startDate || null)
    .input("description", description || null)
    .input("value", serializeValue(value))
    .query(`
      INSERT INTO check_configs (check_key, enabled, start_date, description, value, created_at, updated_at)
      VALUES (@checkKey, @enabled, @startDate, @description, @value, GETDATE(), GETDATE())
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
  
  const record = result.recordset[0];
  if (!record) return null;

  return {
    ...record,
    value: parseValue(record.value)
  };
}

module.exports = {
  getAll,
  updateConfig,
  create,
  findByKey,
};

