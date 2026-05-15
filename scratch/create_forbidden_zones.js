const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function createTable() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    
    console.log("Checking and creating forbidden_zones table...");
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[forbidden_zones]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[forbidden_zones] (
          id          INT IDENTITY(1,1) PRIMARY KEY,
          name        NVARCHAR(255) NOT NULL,
          lat         FLOAT NOT NULL,
          lng         FLOAT NOT NULL,
          radius_m    FLOAT NOT NULL DEFAULT 100,
          enabled     BIT NOT NULL DEFAULT 1,
          description NVARCHAR(500) NULL,
          created_by  NVARCHAR(100) NULL,
          created_at  DATETIME DEFAULT GETDATE(),
          updated_at  DATETIME DEFAULT GETDATE()
        );
        PRINT 'Table forbidden_zones created successfully.';
      END
      ELSE
      BEGIN
        PRINT 'Table forbidden_zones already exists.';
      END
    `);
    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Error creating table:", err);
    process.exit(1);
  }
}

createTable();
