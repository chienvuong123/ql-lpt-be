const sql = require("mssql");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT || 1433),
  requestTimeout: 60000, // Thời gian tối đa cho 1 request (60 giây)
  connectionTimeout: 30000, // Thời gian kết nối tối đa (30 giây)
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000, // Tăng thời gian chờ pool connection
  },
};

let pool = null;

async function connectSQL() {
  if (pool) return pool;

  try {
    pool = await sql.connect(config);
    console.log(`[SQL] Connected: ${config.server}:${config.port} | DB=${config.database}`);

    // Xử lý khi pool bị lỗi thì reset để lần sau reconnect
    pool.on("error", (err) => {
      console.error("[SQL] Pool error:", err.message);
      pool = null;
    });

    return pool;
  } catch (err) {
    pool = null;
    console.error(`[SQL] Connection failed: ${err.message}`);
    throw err;
  }
}

module.exports = connectSQL;