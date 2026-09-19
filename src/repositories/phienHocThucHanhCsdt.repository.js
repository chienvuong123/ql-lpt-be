const connectSQL = require("../configs/sql");
const sql = require("mssql");
const { isKhaDung } = require("../utils/phienHocThucHanhCsdtExcelParser");

const createTableIfNotExists = async () => {
  const pool = await connectSQL();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'phien_hoc_thuc_hanh_csdt')
    BEGIN
      CREATE TABLE phien_hoc_thuc_hanh_csdt (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ma_phien_hoc NVARCHAR(200) NOT NULL,
        thoi_gian_bat_dau DATETIME2(0) NULL,
        thoi_gian_ket_thuc DATETIME2(0) NULL,
        thoi_gian_thuc_hanh_gio FLOAT NULL,
        quang_duong_thuc_hanh_km FLOAT NULL,
        ma_giao_vien NVARCHAR(100) NULL,
        ho_ten_giao_vien NVARCHAR(255) NULL,
        ma_hoc_vien NVARCHAR(150) NULL,
        ho_ten_hoc_vien NVARCHAR(255) NULL,
        ma_khoa_hoc NVARCHAR(150) NULL,
        hang_dao_tao NVARCHAR(100) NULL,
        bien_so_xe NVARCHAR(50) NULL,
        so_xay_dung NVARCHAR(255) NULL,
        co_so_dao_tao NVARCHAR(255) NULL,
        don_vi_truyen_du_lieu NVARCHAR(255) NULL,
        thoi_gian_truyen_du_lieu DATETIME2(0) NULL,
        thoi_gian_may_chu_nhan DATETIME2(0) NULL,
        trang_thai NVARCHAR(100) NULL,
        ngay_import DATE NULL,
        created_at DATETIME2(0) DEFAULT SYSDATETIME(),
        updated_at DATETIME2(0) DEFAULT SYSDATETIME()
      )
    END

    IF NOT EXISTS (
      SELECT * FROM sys.indexes
      WHERE object_id = OBJECT_ID('phien_hoc_thuc_hanh_csdt') AND name = 'UX_phien_hoc_thuc_hanh_csdt_ma_phien_hoc'
    )
    BEGIN
      CREATE UNIQUE NONCLUSTERED INDEX UX_phien_hoc_thuc_hanh_csdt_ma_phien_hoc
        ON phien_hoc_thuc_hanh_csdt (ma_phien_hoc);
    END

    -- Tự nới rộng các cột NVARCHAR hẹp còn sót lại từ bản schema cũ (gây lỗi
    -- "String or binary data would be truncated" khi dữ liệu CSĐT dài hơn dự kiến).
    -- COL_LENGTH trả về số byte, NVARCHAR(n) chiếm 2*n byte nên so sánh theo 2*n.
    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'ma_phien_hoc') < 400
    BEGIN
      IF EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('phien_hoc_thuc_hanh_csdt') AND name = 'UX_phien_hoc_thuc_hanh_csdt_ma_phien_hoc')
        DROP INDEX UX_phien_hoc_thuc_hanh_csdt_ma_phien_hoc ON phien_hoc_thuc_hanh_csdt;
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN ma_phien_hoc NVARCHAR(200) NOT NULL;
      CREATE UNIQUE NONCLUSTERED INDEX UX_phien_hoc_thuc_hanh_csdt_ma_phien_hoc ON phien_hoc_thuc_hanh_csdt (ma_phien_hoc);
    END

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'ma_giao_vien') < 200
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN ma_giao_vien NVARCHAR(100) NULL;

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'ma_hoc_vien') < 300
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN ma_hoc_vien NVARCHAR(150) NULL;

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'ma_khoa_hoc') < 300
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN ma_khoa_hoc NVARCHAR(150) NULL;

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'hang_dao_tao') < 200
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN hang_dao_tao NVARCHAR(100) NULL;

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'bien_so_xe') < 100
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN bien_so_xe NVARCHAR(50) NULL;

    IF COL_LENGTH('phien_hoc_thuc_hanh_csdt', 'trang_thai') < 200
      ALTER TABLE phien_hoc_thuc_hanh_csdt ALTER COLUMN trang_thai NVARCHAR(100) NULL;
  `);
};

const findByMaPhienHoc = async (pool, maPhienHoc) => {
  const req = pool.request();
  req.input("ma_phien_hoc", sql.NVarChar, maPhienHoc);
  const result = await req.query(
    "SELECT * FROM phien_hoc_thuc_hanh_csdt WHERE ma_phien_hoc = @ma_phien_hoc",
  );
  return result.recordset[0] || null;
};

// Ghi 1 bản ghi: giữ nguyên bản ghi cũ nếu nó đang "Khả dụng" mà bản ghi mới thì không —
// tránh 1 lần import sau (dữ liệu lỗi/không khả dụng) ghi đè mất bản ghi Khả dụng đã có.
const upsertRecord = async (pool, record, ngayImport) => {
  const existing = await findByMaPhienHoc(pool, record.ma_phien_hoc);

  if (existing && isKhaDung(existing.trang_thai) && !isKhaDung(record.trang_thai)) {
    return { action: "skipped_existing_kha_dung" };
  }

  const req = pool.request();
  req.input("ma_phien_hoc", sql.NVarChar, record.ma_phien_hoc);
  req.input("thoi_gian_bat_dau", sql.DateTime2, record.thoi_gian_bat_dau);
  req.input("thoi_gian_ket_thuc", sql.DateTime2, record.thoi_gian_ket_thuc);
  req.input("thoi_gian_thuc_hanh_gio", sql.Float, record.thoi_gian_thuc_hanh_gio);
  req.input("quang_duong_thuc_hanh_km", sql.Float, record.quang_duong_thuc_hanh_km);
  req.input("ma_giao_vien", sql.NVarChar, record.ma_giao_vien);
  req.input("ho_ten_giao_vien", sql.NVarChar, record.ho_ten_giao_vien);
  req.input("ma_hoc_vien", sql.NVarChar, record.ma_hoc_vien);
  req.input("ho_ten_hoc_vien", sql.NVarChar, record.ho_ten_hoc_vien);
  req.input("ma_khoa_hoc", sql.NVarChar, record.ma_khoa_hoc);
  req.input("hang_dao_tao", sql.NVarChar, record.hang_dao_tao);
  req.input("bien_so_xe", sql.NVarChar, record.bien_so_xe);
  req.input("so_xay_dung", sql.NVarChar, record.so_xay_dung);
  req.input("co_so_dao_tao", sql.NVarChar, record.co_so_dao_tao);
  req.input("don_vi_truyen_du_lieu", sql.NVarChar, record.don_vi_truyen_du_lieu);
  req.input("thoi_gian_truyen_du_lieu", sql.DateTime2, record.thoi_gian_truyen_du_lieu);
  req.input("thoi_gian_may_chu_nhan", sql.DateTime2, record.thoi_gian_may_chu_nhan);
  req.input("trang_thai", sql.NVarChar, record.trang_thai);
  req.input("ngay_import", sql.Date, ngayImport || null);

  if (existing) {
    await req.query(`
      UPDATE phien_hoc_thuc_hanh_csdt
      SET thoi_gian_bat_dau = @thoi_gian_bat_dau,
          thoi_gian_ket_thuc = @thoi_gian_ket_thuc,
          thoi_gian_thuc_hanh_gio = @thoi_gian_thuc_hanh_gio,
          quang_duong_thuc_hanh_km = @quang_duong_thuc_hanh_km,
          ma_giao_vien = @ma_giao_vien,
          ho_ten_giao_vien = @ho_ten_giao_vien,
          ma_hoc_vien = @ma_hoc_vien,
          ho_ten_hoc_vien = @ho_ten_hoc_vien,
          ma_khoa_hoc = @ma_khoa_hoc,
          hang_dao_tao = @hang_dao_tao,
          bien_so_xe = @bien_so_xe,
          so_xay_dung = @so_xay_dung,
          co_so_dao_tao = @co_so_dao_tao,
          don_vi_truyen_du_lieu = @don_vi_truyen_du_lieu,
          thoi_gian_truyen_du_lieu = @thoi_gian_truyen_du_lieu,
          thoi_gian_may_chu_nhan = @thoi_gian_may_chu_nhan,
          trang_thai = @trang_thai,
          ngay_import = COALESCE(@ngay_import, ngay_import),
          updated_at = SYSDATETIME()
      WHERE ma_phien_hoc = @ma_phien_hoc
    `);
    return { action: "updated" };
  }

  await req.query(`
    INSERT INTO phien_hoc_thuc_hanh_csdt
      (ma_phien_hoc, thoi_gian_bat_dau, thoi_gian_ket_thuc, thoi_gian_thuc_hanh_gio,
       quang_duong_thuc_hanh_km, ma_giao_vien, ho_ten_giao_vien, ma_hoc_vien, ho_ten_hoc_vien,
       ma_khoa_hoc, hang_dao_tao, bien_so_xe, so_xay_dung, co_so_dao_tao,
       don_vi_truyen_du_lieu, thoi_gian_truyen_du_lieu, thoi_gian_may_chu_nhan, trang_thai,
       ngay_import, created_at, updated_at)
    VALUES
      (@ma_phien_hoc, @thoi_gian_bat_dau, @thoi_gian_ket_thuc, @thoi_gian_thuc_hanh_gio,
       @quang_duong_thuc_hanh_km, @ma_giao_vien, @ho_ten_giao_vien, @ma_hoc_vien, @ho_ten_hoc_vien,
       @ma_khoa_hoc, @hang_dao_tao, @bien_so_xe, @so_xay_dung, @co_so_dao_tao,
       @don_vi_truyen_du_lieu, @thoi_gian_truyen_du_lieu, @thoi_gian_may_chu_nhan, @trang_thai,
       @ngay_import, SYSDATETIME(), SYSDATETIME())
  `);
  return { action: "inserted" };
};

// Trả về TẤT CẢ bản ghi CSĐT tìm thấy theo mã phiên học, bất kể trạng thái —
// kể cả trạng thái không phải "Khả dụng" (vd "Vi phạm...", "Chờ phê duyệt") cũng cần trả về để
// hiển thị đúng trạng thái CSĐT ghi nhận cho phiên đó, thay vì báo nhầm thành "chưa có dữ liệu".
// Việc có dùng dữ liệu để so khớp từng trường (thời gian/km/xe/GV) hay không do phía frontend
// quyết định dựa trên trang_thai trả về.
const getByMaPhienHocList = async (pool, maPhienHocList) => {
  if (!Array.isArray(maPhienHocList) || maPhienHocList.length === 0) return [];

  const req = pool.request();
  const placeholders = maPhienHocList.map((id, idx) => {
    const name = `mph${idx}`;
    req.input(name, sql.NVarChar, id);
    return `@${name}`;
  });

  const result = await req.query(`
    SELECT * FROM phien_hoc_thuc_hanh_csdt
    WHERE ma_phien_hoc IN (${placeholders.join(",")})
  `);
  return result.recordset;
};

module.exports = {
  createTableIfNotExists,
  findByMaPhienHoc,
  upsertRecord,
  getByMaPhienHocList,
};
