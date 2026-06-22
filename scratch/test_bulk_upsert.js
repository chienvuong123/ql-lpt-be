const connectSQL = require("../src/configs/sql");
const mssql = require("mssql");

async function testBulkUpsert() {
  try {
    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    const start = Date.now();

    // Create 15,000 mock records
    console.log("Generating 15,000 mock records...");
    const mockData = [];
    for (let i = 0; i < 15000; i++) {
      mockData.push({
        cccd: `MOCK_${i.toString().padStart(7, '0')}`,
        stt_n: String(i),
        thoi_gian: "20/06/2026 10:00:00",
        email: `test${i}@gmail.com`,
        co_so: "CS 1",
        ten_hoc_vien: `Học Viên Test ${i}`,
        ngay_sinh: "01/01/1990",
        dien_thoai: "0900000001",
        dia_chi: "Hà Nội",
        loai: "LK",
        hang: "B2",
        nguoi_tuyen_sinh: "Giáo Viên Test",
        ctv: "",
        cccd_pho_to: true,
        dat_coc: "500000",
        ma_anh: "M1",
        ghi_chu: "Bulk test"
      });
    }
    console.log(`Generation took ${Date.now() - start}ms`);

    const startDb = Date.now();
    // 1. Create table object
    const table = new mssql.Table('#temp_stage');
    table.create = true;
    table.columns.add('cccd', mssql.VarChar(50), { nullable: false });
    table.columns.add('stt_n', mssql.NVarChar(50), { nullable: true });
    table.columns.add('thoi_gian', mssql.NVarChar(100), { nullable: true });
    table.columns.add('email', mssql.NVarChar(255), { nullable: true });
    table.columns.add('co_so', mssql.NVarChar(255), { nullable: true });
    table.columns.add('ten_hoc_vien', mssql.NVarChar(255), { nullable: true });
    table.columns.add('ngay_sinh', mssql.NVarChar(100), { nullable: true });
    table.columns.add('dien_thoai', mssql.NVarChar(50), { nullable: true });
    table.columns.add('dia_chi', mssql.NVarChar(mssql.MAX), { nullable: true });
    table.columns.add('loai', mssql.NVarChar(100), { nullable: true });
    table.columns.add('hang', mssql.NVarChar(50), { nullable: true });
    table.columns.add('nguoi_tuyen_sinh', mssql.NVarChar(255), { nullable: true });
    table.columns.add('ctv', mssql.NVarChar(255), { nullable: true });
    table.columns.add('cccd_pho_to', mssql.Bit, { nullable: true });
    table.columns.add('dat_coc', mssql.NVarChar(255), { nullable: true });
    table.columns.add('ma_anh', mssql.NVarChar(255), { nullable: true });
    table.columns.add('ghi_chu', mssql.NVarChar(mssql.MAX), { nullable: true });

    for (const item of mockData) {
      table.rows.add(
        item.cccd,
        item.stt_n || null,
        item.thoi_gian || null,
        item.email || null,
        item.co_so || null,
        item.ten_hoc_vien || null,
        item.ngay_sinh || null,
        item.dien_thoai || null,
        item.dia_chi || null,
        item.loai || null,
        item.hang || null,
        item.nguoi_tuyen_sinh || null,
        item.ctv || null,
        item.cccd_pho_to ? 1 : 0,
        item.dat_coc || null,
        item.ma_anh || null,
        item.ghi_chu || null
      );
    }

    // 2. Perform bulk insert to temp table
    const req1 = new mssql.Request(transaction);
    console.log("Inserting 15,000 rows to #temp_stage via bulk...");
    await req1.bulk(table);

    // 3. Perform Merge
    const req2 = new mssql.Request(transaction);
    console.log("Merging #temp_stage to google_sheet_data...");
    const mergeQuery = `
      MERGE INTO google_sheet_data AS target
      USING #temp_stage AS source
      ON target.cccd = source.cccd
      WHEN MATCHED THEN
        UPDATE SET 
          stt_n = source.stt_n,
          thoi_gian = source.thoi_gian,
          email = source.email,
          co_so = source.co_so,
          ten_hoc_vien = source.ten_hoc_vien,
          ngay_sinh = source.ngay_sinh,
          dien_thoai = source.dien_thoai,
          dia_chi = source.dia_chi,
          loai = source.loai,
          hang = source.hang,
          nguoi_tuyen_sinh = source.nguoi_tuyen_sinh,
          ctv = source.ctv,
          cccd_pho_to = source.cccd_pho_to,
          dat_coc = source.dat_coc,
          ma_anh = source.ma_anh,
          ghi_chu = source.ghi_chu,
          updated_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (
          cccd, stt_n, thoi_gian, email, co_so, ten_hoc_vien, ngay_sinh, 
          dien_thoai, dia_chi, loai, hang, nguoi_tuyen_sinh, ctv, 
          cccd_pho_to, dat_coc, ma_anh, ghi_chu, updated_at
        )
        VALUES (
          source.cccd, source.stt_n, source.thoi_gian, source.email, source.co_so, source.ten_hoc_vien, source.ngay_sinh, 
          source.dien_thoai, source.dia_chi, source.loai, source.hang, source.nguoi_tuyen_sinh, source.ctv, 
          source.cccd_pho_to, source.dat_coc, source.ma_anh, source.ghi_chu, GETDATE()
        );
    `;
    await req2.query(mergeQuery);

    await transaction.commit();
    console.log(`Success! DB operations took: ${Date.now() - startDb}ms`);

    // Cleanup mock data
    console.log("Cleaning up mock records...");
    await pool.request().query("DELETE FROM google_sheet_data WHERE cccd LIKE 'MOCK_%'");
    console.log("Cleanup done.");

    process.exit(0);
  } catch (err) {
    console.error("Bulk upsert test failed:", err);
    process.exit(1);
  }
}

testBulkUpsert();
