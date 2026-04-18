const connectSQL = require("../src/configs/sql");
const mssql = require("mssql");

async function initDB() {
  try {
    const pool = await connectSQL();
    const request = pool.request();

    console.log("Checking for 'roles' table...");
    const checkRoles = await request.query("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'roles'");
    if (checkRoles.recordset.length === 0) {
      console.log("Creating 'roles' table...");
      await request.query(`
        CREATE TABLE roles (
            id          INT IDENTITY PRIMARY KEY,
            name        NVARCHAR(50)  NOT NULL UNIQUE,
            description NVARCHAR(255),
            is_active   BIT DEFAULT 1,
            created_at  DATETIME DEFAULT GETDATE()
        )
      `);
      console.log("'roles' table created.");
      
      console.log("Inserting default roles...");
      await request.query(`
        INSERT INTO roles (name, description) VALUES
        ('admin',        N'Quản trị hệ thống'),
        ('truong_phong', N'Trưởng phòng đào tạo'),
        ('nghiep_vu',    N'Tổ nghiệp vụ đào tạo'),
        ('ly_thuyet',    N'Tổ lý thuyết'),
        ('thuc_hanh',    N'Tổ thực hành'),
        ('cong_nghe',    N'Tổ công nghệ'),
        ('tot_nghiep',   N'Tổ tốt nghiệp'),
        ('sat_hach',     N'Tổ sát hạch')
      `);
      console.log("Default roles inserted.");
    } else {
      console.log("'roles' table already exists.");
    }

    console.log("Checking for 'users' table...");
    const checkUsers = await request.query("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'users'");
    if (checkUsers.recordset.length === 0) {
      console.log("Creating 'users' table...");
      await request.query(`
        CREATE TABLE users (
            id          INT IDENTITY PRIMARY KEY,
            username    NVARCHAR(50)  NOT NULL UNIQUE,
            password    NVARCHAR(255) NOT NULL,
            ho_ten      NVARCHAR(100) NOT NULL,
            role_id     INT REFERENCES roles(id),
            is_active   BIT DEFAULT 1,
            created_at  DATETIME DEFAULT GETDATE(),
            updated_at  DATETIME DEFAULT GETDATE()
        )
      `);
      console.log("'users' table created.");
    } else {
      console.log("'users' table already exists.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error initializing DB:", err);
    process.exit(1);
  }
}

initDB();
