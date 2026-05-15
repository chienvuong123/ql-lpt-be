const connectSQL = require("../configs/sql");
const mssql = require("mssql");

const getAll = async () => {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT * FROM [dbo].[forbidden_zones]
    ORDER BY updated_at DESC, id DESC
  `);
  return result.recordset;
};

const getById = async (id) => {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("id", mssql.Int, id)
    .query(`SELECT * FROM [dbo].[forbidden_zones] WHERE id = @id`);
  return result.recordset[0] || null;
};

const create = async ({ name, lat, lng, radius_m, enabled, description, created_by }) => {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("name", mssql.NVarChar, name)
    .input("lat", mssql.Float, lat)
    .input("lng", mssql.Float, lng)
    .input("radius_m", mssql.Float, radius_m ?? 100)
    .input("enabled", mssql.Bit, enabled ?? 1)
    .input("description", mssql.NVarChar, description ?? null)
    .input("created_by", mssql.NVarChar, created_by ?? null)
    .query(`
      INSERT INTO [dbo].[forbidden_zones]
        (name, lat, lng, radius_m, enabled, description, created_by, created_at, updated_at)
      OUTPUT INSERTED.*
      VALUES
        (@name, @lat, @lng, @radius_m, @enabled, @description, @created_by, GETDATE(), GETDATE())
    `);
  return result.recordset[0];
};

const update = async (id, { name, lat, lng, radius_m, enabled, description }) => {
  const pool = await connectSQL();
  const request = pool.request().input("id", mssql.Int, id);

  let updateFields = [];
  if (name !== undefined) {
    request.input("name", mssql.NVarChar, name);
    updateFields.push("name = @name");
  }
  if (lat !== undefined) {
    request.input("lat", mssql.Float, lat);
    updateFields.push("lat = @lat");
  }
  if (lng !== undefined) {
    request.input("lng", mssql.Float, lng);
    updateFields.push("lng = @lng");
  }
  if (radius_m !== undefined) {
    request.input("radius_m", mssql.Float, radius_m);
    updateFields.push("radius_m = @radius_m");
  }
  if (enabled !== undefined) {
    request.input("enabled", mssql.Bit, enabled);
    updateFields.push("enabled = @enabled");
  }
  if (description !== undefined) {
    request.input("description", mssql.NVarChar, description);
    updateFields.push("description = @description");
  }

  if (updateFields.length === 0) return null;

  updateFields.push("updated_at = GETDATE()");

  const query = `
    UPDATE [dbo].[forbidden_zones]
    SET ${updateFields.join(", ")}
    OUTPUT INSERTED.*
    WHERE id = @id
  `;
  const result = await request.query(query);
  return result.recordset[0] || null;
};

const remove = async (id) => {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("id", mssql.Int, id)
    .query("DELETE FROM [dbo].[forbidden_zones] WHERE id = @id");
  return result.rowsAffected[0] > 0;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};
