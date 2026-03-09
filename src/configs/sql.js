const sql = require("mssql");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function connectSQL() {
  try {
    const pool = await sql.connect(config);
    console.log(
      `[SQL] Connected: ${config.server}:${config.port} | DB=${config.database} | User=${config.user}`,
    );
    return pool;
  } catch (err) {
    console.error(
      `[SQL] Connection failed: ${config.server}:${config.port} | DB=${config.database} | User=${config.user} | Error=${err.message}`,
    );
    throw err;
  }
}

module.exports = connectSQL;
