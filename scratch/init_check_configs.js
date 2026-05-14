const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function run() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    console.log("Creating table if not exists...");
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[check_configs]') AND type in (N'U'))
      BEGIN
        CREATE TABLE check_configs (
          id          INT IDENTITY(1,1) PRIMARY KEY,
          check_key   VARCHAR(100) NOT NULL UNIQUE,
          enabled     BIT NOT NULL DEFAULT 0,
          start_date  DATE NULL,
          description NVARCHAR(255) NULL,
          created_at  DATETIME DEFAULT GETDATE(),
          updated_at  DATETIME DEFAULT GETDATE()
        );
      END
    `);
    console.log("Table created.");

    console.log("Seeding initial data...");
    const initialData = [
      { key: "checkTocDo", enabled: 1, desc: "Cảnh báo và loại bỏ các phiên học có tốc độ trung bình < 18 km/h." },
      { key: "checkKhungGioTuDong", enabled: 1, desc: "Xe tự động bắt đầu ngoài khung giờ quy định (Sáng: 04:45 - 07:00; Chiều: từ 17:00)." },
      { key: "checkNghiGiuaPhien", enabled: 1, desc: "Thời gian nghỉ giữa hai phiên liên tiếp dưới 15 phút thì phiên sau không hợp lệ." },
      { key: "checkSaiGiaoVien", enabled: 1, desc: "Tên giáo viên của phiên khác với giáo viên đăng ký hoặc không đồng nhất." },
      { key: "checkSaiXe", enabled: 1, desc: "Biển số xe học viên thực hành khác biển đăng ký xe B1/B2." },
      { key: "checkDungNghi", enabled: 1, desc: "Kiểm tra dữ liệu tọa độ GPS, cảnh báo nếu phương tiện đứng im liên tục từ 10 phút trở lên." },
      { key: "checkPhienNgan", enabled: 1, desc: "Cảnh báo đối với các phiên học có tổng thời gian dưới 5 phút." },
    ];

    for (const row of initialData) {
      await request.query(`
        IF NOT EXISTS (SELECT 1 FROM check_configs WHERE check_key = '${row.key}')
        BEGIN
          INSERT INTO check_configs (check_key, enabled, start_date, description)
          VALUES ('${row.key}', ${row.enabled}, NULL, N'${row.desc}');
        END
      `);
    }
    console.log("Seeding completed.");
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
