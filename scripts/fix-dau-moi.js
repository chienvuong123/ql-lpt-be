// Script bảo trì 1 lần: chạy trên server nào thì sửa dữ liệu của server đó (dùng .env cục bộ).
//
// Chạy: node scripts/fix-dau-moi.js
//
// Làm 2 việc:
// 1. Chuẩn hoá lại các ngày sinh bị lưu sai định dạng trong google_sheet_data (vd "1/6/84"
//    thay vì "01/06/1984") — dữ liệu cũ import trước khi có bản sửa ngày sinh vẫn còn sai.
// 2. Tính lại "đầu mối" cho các bản ghi gplx_hoan đang thiếu (dau_moi IS NULL), áp dụng cho
//    CẢ 3 trạng thái (chờ nhập kho / đã nhập kho / đã xuất kho) — không cần import lại file gốc.
const mssql = require("mssql");
const connectSQL = require("../src/configs/sql");
const { normalizeVietnameseDate } = require("../src/utils/date.util");
const gplxRepo = require("../src/repositories/gplxHoan.repository");
const googleSheetA1Repo = require("../src/repositories/googleSheetA1.repository");

async function fixNgaySinhGoogleSheetData(pool) {
    console.log("\n[1/2] Chuẩn hoá ngày sinh trong google_sheet_data...");

    const result = await pool.request().query(`
        SELECT cccd, ngay_sinh FROM google_sheet_data
        WHERE ngay_sinh NOT LIKE '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]'
          AND ngay_sinh IS NOT NULL AND ngay_sinh <> ''
    `);
    console.log(`  Số dòng cần kiểm tra: ${result.recordset.length}`);

    let updated = 0;
    for (const row of result.recordset) {
        const normalized = normalizeVietnameseDate(row.ngay_sinh);
        if (!normalized || normalized === row.ngay_sinh) continue;

        const req = pool.request();
        req.input("cccd", mssql.VarChar, row.cccd);
        req.input("ngay_sinh", mssql.NVarChar, normalized);
        await req.query("UPDATE google_sheet_data SET ngay_sinh = @ngay_sinh WHERE cccd = @cccd");
        updated++;
    }
    console.log(`  Đã chuẩn hoá: ${updated} dòng`);
}

async function fixDauMoiGplxHoan(pool) {
    console.log("\n[2/2] Tính lại đầu mối cho gplx_hoan đang thiếu...");

    const rows = await pool.request().query("SELECT id, ho_ten, ngay_sinh FROM gplx_hoan WHERE dau_moi IS NULL");
    console.log(`  Số bản ghi đang thiếu đầu mối: ${rows.recordset.length}`);

    let filled = 0;
    for (const row of rows.recordset) {
        let dauMoi = await gplxRepo.findDauMoiByHoTenNgaySinh(pool, row.ho_ten, row.ngay_sinh);
        if (!dauMoi) {
            dauMoi = await googleSheetA1Repo.findDauMoiByHoTenNgaySinh(pool, row.ho_ten, row.ngay_sinh);
        }
        if (dauMoi) {
            const req = pool.request();
            req.input("id", mssql.Int, row.id);
            req.input("dau_moi", mssql.NVarChar, dauMoi);
            await req.query("UPDATE gplx_hoan SET dau_moi = @dau_moi WHERE id = @id");
            filled++;
        }
    }
    console.log(`  Đã điền thêm đầu mối cho: ${filled} / ${rows.recordset.length} bản ghi`);
}

async function main() {
    const pool = await connectSQL();
    await fixNgaySinhGoogleSheetData(pool);
    await fixDauMoiGplxHoan(pool);
    console.log("\nHoàn tất.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Lỗi khi chạy script:", err.message);
    process.exit(1);
});
