const connectSQL = require("../configs/sql");
const bcrypt = require("bcryptjs");

async function getAll() {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT u.id, u.username, u.email, u.ho_ten, u.role_id, r.name as role_name, u.is_active, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.created_at DESC
  `);
  return result.recordset;
}

async function getById(id) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("id", id)
    .query(`
      SELECT u.id, u.username, u.email, u.ho_ten, u.role_id, r.name as role_name, u.is_active, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = @id
    `);
  return result.recordset[0] || null;
}

async function findByUsername(username) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("username", username)
    .query(`
      SELECT u.*, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = @username
    `);
  return result.recordset[0] || null;
}

async function create(userData) {
  const { username, email, password, ho_ten, role_id } = userData;
  const pool = await connectSQL();
  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await pool
    .request()
    .input("username", username)
    .input("email", email || null)
    .input("password", hashedPassword)
    .input("ho_ten", ho_ten)
    .input("role_id", role_id)
    .query(`
      INSERT INTO users (username, email, password, ho_ten, role_id)
      VALUES (@username, @email, @password, @ho_ten, @role_id);
      SELECT SCOPE_IDENTITY() AS id;
    `);

  return result.recordset[0].id;
}

async function update(id, userData) {
  const { username, email, ho_ten, role_id, is_active, password } = userData;
  const pool = await connectSQL();
  const request = pool.request();
  request.input("id", id);

  let query = "UPDATE users SET updated_at = GETDATE()";

  if (username !== undefined) {
    query += ", username = @username";
    request.input("username", username);
  }
  if (email !== undefined) {
    query += ", email = @email";
    request.input("email", email);
  }
  if (ho_ten !== undefined) {
    query += ", ho_ten = @ho_ten";
    request.input("ho_ten", ho_ten);
  }
  if (role_id !== undefined) {
    query += ", role_id = @role_id";
    request.input("role_id", role_id);
  }
  if (is_active !== undefined) {
    query += ", is_active = @is_active";
    request.input("is_active", is_active);
  }
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    query += ", password = @password";
    request.input("password", hashedPassword);
  }

  query += " WHERE id = @id";
  await request.query(query);
  return true;
}

async function remove(id) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("id", id)
    .query("DELETE FROM users WHERE id = @id");
  return true;
}

module.exports = {
  getAll,
  getById,
  findByUsername,
  create,
  update,
  remove,
};
