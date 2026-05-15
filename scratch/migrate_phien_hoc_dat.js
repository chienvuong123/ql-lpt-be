const sql = require("mssql");
const connectSQL = require("../src/configs/sql");

async function migrate() {
  try {
    const pool = await connectSQL();
    const request = new sql.Request(pool);

    console.log("=== BẮT ĐẦU CẬP NHẬT CẤU TRÚC BẢNG phien_hoc_dat ===");

    const alterations = [
      { col: "phien_hoc_id", type: "INT NULL" },
      { col: "ma_khoa", type: "NVARCHAR(100) NULL" },
      { col: "ly_do_tong", type: "NVARCHAR(500) NULL" },
      { col: "ly_do_td", type: "NVARCHAR(500) NULL" },
      { col: "ly_do_dem", type: "NVARCHAR(500) NULL" },
      { col: "ly_do_so_san", type: "NVARCHAR(500) NULL" },
      { col: "duyet_tong", type: "BIT NULL" },
      { col: "duyet_tu_dong", type: "BIT NULL" },
      { col: "duyet_dem", type: "BIT NULL" },
      { col: "duyet_so_san", type: "BIT NULL" },
      { col: "id_gv", type: "NVARCHAR(100) NULL" },
      { col: "ho_ten_gv", type: "NVARCHAR(255) NULL" },
      { col: "ho_ten_hv", type: "NVARCHAR(255) NULL" },
      { col: "thoi_gian_dem", type: "FLOAT NULL" },
      { col: "quang_duong_dem", type: "FLOAT NULL" },
      { col: "tile", type: "FLOAT NULL" },
      { col: "guid_session_id", type: "NVARCHAR(200) NULL" },
      { col: "created_at", type: "DATETIME2(0) NULL" }
    ];

    for (const item of alterations) {
      const query = `
        IF COL_LENGTH(N'dbo.phien_hoc_dat', N'${item.col}') IS NULL
        BEGIN
          ALTER TABLE dbo.phien_hoc_dat ADD ${item.col} ${item.type};
          PRINT 'Đã thêm cột ${item.col}';
        END
        ELSE
        BEGIN
          PRINT 'Cột ${item.col} đã tồn tại';
        END
      `;
      
      try {
        await request.query(query);
        console.log(`✅ Kiểm tra/Thêm cột: ${item.col} - OK`);
      } catch (err) {
        console.error(`❌ Lỗi khi thêm cột ${item.col}:`, err.message);
      }
    }

    console.log("=== HOÀN TẤT CẬP NHẬT CẤU TRÚC BẢNG ===");
    process.exit(0);
  } catch (err) {
    console.error("❌ LỖI MIGRATION:", err);
    process.exit(1);
  }
}

migrate();
