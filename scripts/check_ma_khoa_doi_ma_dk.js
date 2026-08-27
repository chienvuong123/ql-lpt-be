// Kiểm tra: có bao nhiêu khóa (ma_khoa) có học viên đã bị đổi ma_dk (log trong bảng dk_mapping).
// Chạy: node scripts/check_ma_khoa_doi_ma_dk.js
const connectSQL = require("../src/configs/sql");

async function main() {
  const pool = await connectSQL();

  const totalResult = await pool.request().query(`
    SELECT COUNT(*) AS so_ban_ghi, COUNT(DISTINCT ma_khoa) AS so_khoa
    FROM [dbo].[dk_mapping]
  `);
  const { so_ban_ghi, so_khoa } = totalResult.recordset[0];

  console.log(`Tổng số bản ghi đổi ma_dk (dk_mapping): ${so_ban_ghi}`);
  console.log(`Số khóa (ma_khoa) khác nhau có học viên đổi ma_dk: ${so_khoa}`);

  const byKhoaResult = await pool.request().query(`
    SELECT dm.ma_khoa, kh.ten_khoa, COUNT(*) AS so_hoc_vien_doi
    FROM [dbo].[dk_mapping] dm
    LEFT JOIN [dbo].[khoa_hoc] kh ON kh.ma_khoa = dm.ma_khoa
    GROUP BY dm.ma_khoa, kh.ten_khoa
    ORDER BY so_hoc_vien_doi DESC
  `);

  console.log("\nChi tiết theo khóa:");
  byKhoaResult.recordset.forEach((row) => {
    console.log(`  ${row.ma_khoa} (${row.ten_khoa || "?"}): ${row.so_hoc_vien_doi} học viên đổi ma_dk`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi khi truy vấn:", err.message);
  process.exit(1);
});
