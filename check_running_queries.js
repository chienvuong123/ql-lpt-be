const connectSQL = require("./src/configs/sql");

async function check() {
  try {
    const pool = await connectSQL();
    
    console.log("=== ACTIVE RUNNING QUERIES ===");
    const resQueries = await pool.request().query(`
      SELECT 
        r.session_id,
        r.status,
        r.command,
        r.cpu_time,
        r.total_elapsed_time,
        t.text AS sql_text
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.session_id <> @@SPID;
    `);
    console.log(resQueries.recordset);

    console.log("=== CONNECTION COUNT BY STATE ===");
    const resConns = await pool.request().query(`
      SELECT 
        status, 
        COUNT(*) as count
      FROM sys.dm_exec_sessions
      WHERE is_user_process = 1
      GROUP BY status;
    `);
    console.log(resConns.recordset);

    process.exit(0);
  } catch (err) {
    console.error("FAILED TO CHECK ACTIVE QUERIES:", err);
    process.exit(1);
  }
}

check();
