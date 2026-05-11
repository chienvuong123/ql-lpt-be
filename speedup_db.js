const mssql = require("mssql");
const connectSQL = require("./src/configs/sql");

async function createIndexes() {
  try {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);
    
    console.log("=== STARTING INDEX CREATION ===");
    
    const queries = [
      // Table: hoc_bu_new
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_bu_new_ma_dk') CREATE NONCLUSTERED INDEX IX_hoc_bu_new_ma_dk ON [dbo].[hoc_bu_new] (ma_dk);",
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_bu_new_ma_khoa') CREATE NONCLUSTERED INDEX IX_hoc_bu_new_ma_khoa ON [dbo].[hoc_bu_new] (ma_khoa);",
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_bu_new_trang_thai') CREATE NONCLUSTERED INDEX IX_hoc_bu_new_trang_thai ON [dbo].[hoc_bu_new] (trang_thai);",
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_bu_new_loai') CREATE NONCLUSTERED INDEX IX_hoc_bu_new_loai ON [dbo].[hoc_bu_new] (loai);",
      
      // Table: hoc_vien
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_vien_ma_dk') CREATE NONCLUSTERED INDEX IX_hoc_vien_ma_dk ON [dbo].[hoc_vien] (ma_dk);",
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_vien_ho_ten') CREATE NONCLUSTERED INDEX IX_hoc_vien_ho_ten ON [dbo].[hoc_vien] (ho_ten);",
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_hoc_vien_cccd') CREATE NONCLUSTERED INDEX IX_hoc_vien_cccd ON [dbo].[hoc_vien] (cccd);",
      
      // Table: dang_ky_xe_gv
      "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_dang_ky_xe_gv_ma_dk') CREATE NONCLUSTERED INDEX IX_dang_ky_xe_gv_ma_dk ON [dbo].[dang_ky_xe_gv] (ma_dk);"
    ];
    
    for (const q of queries) {
      console.log(`Executing: ${q}`);
      await request.query(q);
    }
    
    console.log("=== INDEX CREATION COMPLETED ===");
    process.exit(0);
  } catch (err) {
    console.error("INDEX CREATION FAILED:", err);
    process.exit(1);
  }
}

createIndexes();
