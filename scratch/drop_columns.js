const connectSQL = require("../src/configs/sql");
const mssql = require("mssql");

async function dropColumns() {
  console.log("Connecting to database...");
  const pool = await connectSQL();
  console.log("Connected. Dropping columns...");

  const query = `
    -- Check if columns exist and drop them
    IF EXISTS (
      SELECT * FROM sys.columns 
      WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'ma_ke_toan'
    )
    BEGIN
      ALTER TABLE google_sheet_data DROP COLUMN ma_ke_toan;
      PRINT 'Dropped column ma_ke_toan';
    END
    ELSE
    BEGIN
      PRINT 'Column ma_ke_toan does not exist';
    END

    IF EXISTS (
      SELECT * FROM sys.columns 
      WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'ma_tinh_tien'
    )
    BEGIN
      ALTER TABLE google_sheet_data DROP COLUMN ma_tinh_tien;
      PRINT 'Dropped column ma_tinh_tien';
    END
    ELSE
    BEGIN
      PRINT 'Column ma_tinh_tien does not exist';
    END

    IF EXISTS (
      SELECT * FROM sys.columns 
      WHERE object_id = OBJECT_ID('google_sheet_data') AND name = 'hoc_phi'
    )
    BEGIN
      ALTER TABLE google_sheet_data DROP COLUMN hoc_phi;
      PRINT 'Dropped column hoc_phi';
    END
    ELSE
    BEGIN
      PRINT 'Column hoc_phi does not exist';
    END
  `;

  try {
    const request = pool.request();
    // Enable info message event to capture PRINT statements
    request.on('info', (msg) => {
      console.log('SQL Server PRINT:', msg.message);
    });
    
    await request.query(query);
    console.log("Columns drop script execution completed successfully.");
  } catch (error) {
    console.error("Error executing columns drop script:", error);
  } finally {
    await mssql.close();
    console.log("Database connection closed.");
  }
}

dropColumns();
