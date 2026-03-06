// const connectSQL = require("../configs/sql");

// async function getSanPham() {
//   try {
//     const pool = await connectSQL();
//     const result = await pool.request().query("SELECT * FROM dbo.SanPham");

//     console.log("\n📦 Dữ liệu bảng SanPham:");
//     console.table(result.recordset);
//     console.log(`✅ Tổng: ${result.recordset.length} sản phẩm`);

//     return result.recordset;
//   } catch (err) {
//     console.error("❌ Lỗi lấy dữ liệu SanPham:", err.message);
//     throw err;
//   }
// }

// module.exports = getSanPham; // ← export ra
