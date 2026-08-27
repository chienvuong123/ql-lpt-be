// Kiểm tra bảng khoa_hoc: có bao nhiêu khóa đang dùng ma_khoa theo định dạng "mới"
// (ví dụ tiền tố 31011... như "31011K260009") thay vì định dạng cũ (tiền tố 30004...).
// Chạy: node scripts/check_khoa_ma_khoa_moi.js
const connectSQL = require("../src/configs/sql");

async function main() {
  const pool = await connectSQL();

  const result = await pool.request().query(`
    SELECT ma_khoa, ten_khoa, code, ngay_bat_dau, ngay_ket_thuc
    FROM [dbo].[khoa_hoc]
    ORDER BY ngay_bat_dau DESC
  `);

  const rows = result.recordset;
  console.log(`Tổng số khóa trong bảng khoa_hoc: ${rows.length}\n`);

  const groups = new Map();
  rows.forEach((r) => {
    const prefix = String(r.ma_khoa || "").match(/^\d+/)?.[0] || "(không có số đầu)";
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(r);
  });

  for (const [prefix, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`Tiền tố "${prefix}": ${list.length} khóa`);
  }

  const newPrefix = "31011";
  const newOnes = rows.filter((r) => String(r.ma_khoa || "").startsWith(newPrefix));
  console.log(`\n=> Số khóa có ma_khoa định dạng MỚI (tiền tố ${newPrefix}): ${newOnes.length}`);
  newOnes.forEach((r) => console.log(`  ${r.ma_khoa}  |  ten_khoa=${r.ten_khoa}  |  code(iid)=${r.code}`));

  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi khi truy vấn:", err.message);
  process.exit(1);
});
