const connectSQL = require("../configs/sql");

async function getAll() {
  const pool = await connectSQL();
  const result = await pool.request().query("SELECT * FROM roles WHERE is_active = 1");
  return result.recordset;
}

async function getById(id) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("id", id)
    .query("SELECT * FROM roles WHERE id = @id");
  return result.recordset[0] || null;
}

async function findByName(name) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("name", name)
    .query("SELECT * FROM roles WHERE name = @name");
  return result.recordset[0] || null;
}

module.exports = {
  getAll,
  getById,
  findByName,
};
