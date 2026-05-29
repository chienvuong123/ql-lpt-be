const sql = require("mssql");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT || 1433),
  requestTimeout: 60000,
  connectionTimeout: 30000,
  options: { encrypt: false, trustServerCertificate: true },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 10000,
    acquireTimeoutMillis: 15000
  },
};

let pool = null;
let connectingPromise = null; // <-- thêm cái này

async function connectSQL() {
  // Pool đã sẵn sàng → dùng luôn
  if (pool) return pool;

  // Đang có request khác đang kết nối → chờ chung promise đó
  if (connectingPromise) return connectingPromise;

  // Lần đầu tiên → tạo promise và cache nó ngay lập tức (sync, trước await)
  connectingPromise = sql.connect(config).then((p) => {
    pool = p;
    connectingPromise = null;

    pool.on("error", (err) => {
      console.error("[SQL] Pool error:", err.message);
      pool = null;
      connectingPromise = null;
    });

    console.log(`[SQL] Connected: ${config.server}:${config.port} | DB=${config.database}`);
    return pool;
  }).catch((err) => {
    pool = null;
    connectingPromise = null;
    console.error(`[SQL] Connection failed: ${err.message}`);
    throw err;
  });

  return connectingPromise;
}

module.exports = connectSQL;