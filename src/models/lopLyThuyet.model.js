const mssql = require("mssql");
const connectSQL = require("../configs/sql");

const VALID_FIELDS = ["loai_ly_thuyet", "loai_het_mon", "dat_cabin"];

async function getAll(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  let where = "WHERE 1=1";
  if (filters.maKhoa) {
    where += " AND tt.code = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }

  const result = await request.query(`
    SELECT
      tt.ma_dk,
      tt.ma_khoa,
      tt.code,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0) AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0) AS dat_cabin,
      tt.ghi_chu,
      tt.updated_at
    FROM trang_thai_ly_thuyet tt
    ${where}
    ORDER BY tt.updated_at DESC
  `);
  return result.recordset;
}

async function getAllLyThuyet(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  let where = "WHERE 1=1";

  // Normalize ma_khoa / maKhoa
  const maKhoaValue = filters.maKhoa || filters.ma_khoa;

  if (maKhoaValue) {
    if (
      typeof maKhoaValue === "object" &&
      Array.isArray(maKhoaValue.$in) &&
      maKhoaValue.$in.length > 0
    ) {
      // Xử lý toán tử $in
      const inValues = maKhoaValue.$in;
      const inParams = inValues.map((val, idx) => `@mk${idx}`);
      where += ` AND tt.ma_khoa IN (${inParams.join(", ")})`;
      inValues.forEach((val, idx) => {
        request.input(`mk${idx}`, val);
      });
    } else if (typeof maKhoaValue === "string") {
      where += " AND tt.ma_khoa = @maKhoa";
      request.input("maKhoa", maKhoaValue);
    }
  }

  if (filters.tenKhoa) {
    where += " AND kh.ten_khoa LIKE @tenKhoa";
    request.input("tenKhoa", `%${filters.tenKhoa}%`);
  }

  // Handle limit if present in filters (e.g. from Dashboard controller)
  const limitClause = filters.limit ? `TOP ${parseInt(filters.limit)}` : "";

  const result = await request.query(`
    SELECT ${limitClause}
      tt.ma_dk,
      tt.ma_khoa,
      tt.code,
      hv.ho_ten,
      hv.cccd,
      YEAR(hv.ngay_sinh) AS nam_sinh,
      kh.ten_khoa,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0) AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0) AS dat_cabin,
      tt.ghi_chu,
      tt.updated_at,
      -- Backward compatibility for controller
      tt.updated_at AS thoi_gian_thay_doi_trang_thai,
      tt.created_by AS updated_by
    FROM trang_thai_ly_thuyet tt
    LEFT JOIN hoc_vien hv ON hv.ma_dk = tt.ma_dk
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
    ORDER BY tt.updated_at DESC
  `);
  return result.recordset;
}


async function getByMaDk(maDk) {
  const pool = await connectSQL();

  const result = await pool.request().input("maDk", mssql.VarChar, maDk).query(`
      SELECT TOP 1 *
      FROM trang_thai_hoc_vien
      WHERE ma_dk = @maDk
    `);

  return result.recordset[0] || null;
}

async function getLichSu(maDk) {
  const pool = await connectSQL();
  const result = await pool.request().input("maDk", maDk).query(`
    SELECT TOP (50) *
    FROM lich_su_thay_doi
    WHERE ma_dk = @maDk
    ORDER BY thoi_gian DESC
  `);
  return result.recordset;
}

async function updateTatCaTrangThaiLyThuyet(list, createdBy = null) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();
    let totalAffected = 0;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const {
        ma_dk,
        ma_khoa,
        loai_ly_thuyet,
        loai_het_mon,
        ghi_chu,
        code,
      } = item;

      const loaiLyThuyet = !!loai_ly_thuyet;
      const loaiHetMon = !!loai_het_mon;
      const datCabin = loaiLyThuyet && loaiHetMon; // BE handles this logic

      const req = new mssql.Request(transaction);
      req.input("ma_dk", mssql.VarChar, ma_dk);
      req.input("ma_khoa", mssql.VarChar, ma_khoa ?? null);
      req.input("loai_ly_thuyet", mssql.Bit, loaiLyThuyet);
      req.input("loai_het_mon", mssql.Bit, loaiHetMon);
      req.input("dat_cabin", mssql.Bit, datCabin);
      req.input("ghi_chu", mssql.NVarChar, ghi_chu ?? null);
      req.input("code", mssql.VarChar, code ?? null);
      req.input("createdBy", mssql.NVarChar, createdBy);

      const result = await req.query(`
        -- Tự động lấy code từ bảng khoa_hoc nếu FE không gửi
        DECLARE @actualCode VARCHAR(150) = @code;
        IF @actualCode IS NULL AND @ma_khoa IS NOT NULL
        BEGIN
            SELECT TOP 1 @actualCode = code FROM khoa_hoc WHERE ma_khoa = @ma_khoa;
        END

        IF EXISTS (SELECT 1 FROM trang_thai_ly_thuyet WHERE ma_dk = @ma_dk)
          UPDATE trang_thai_ly_thuyet
          SET
            ma_khoa = @ma_khoa,
            loai_ly_thuyet = @loai_ly_thuyet,
            loai_het_mon = @loai_het_mon,
            dat_cabin = @dat_cabin,
            ghi_chu = @ghi_chu,
            code = @actualCode,
            updated_at = GETDATE(),
            created_by = @createdBy
          WHERE ma_dk = @ma_dk
        ELSE
          INSERT INTO trang_thai_ly_thuyet
            (ma_dk, ma_khoa, loai_ly_thuyet, loai_het_mon, dat_cabin, ghi_chu, code, updated_at, created_by)
          VALUES
            (@ma_dk, @ma_khoa, @loai_ly_thuyet, @loai_het_mon, @dat_cabin, @ghi_chu, @actualCode, GETDATE(), @createdBy)
      `);

      totalAffected += result.rowsAffected[0];
    }

    await transaction.commit();
    return { rowsAffected: totalAffected };
  } catch (err) {
    if (transaction) await transaction.rollback();
    throw err;
  }
}

async function updateHocVienLyThuyet(maDk, fields, createdBy = null) {
  const pool = await connectSQL();
  const req = pool.request();

  const loaiLyThuyet = !!fields.loai_ly_thuyet;
  const loaiHetMon = !!fields.loai_het_mon;
  const datCabin = loaiLyThuyet && loaiHetMon;

  req.input("maDk", mssql.VarChar, maDk);
  req.input("maKhoa", mssql.VarChar, fields.ma_khoa ?? null);
  req.input("loaiLyThuyet", mssql.Bit, loaiLyThuyet);
  req.input("loaiHetMon", mssql.Bit, loaiHetMon);
  req.input("datCabin", mssql.Bit, datCabin);
  req.input("ghiChu", mssql.NVarChar, fields.ghi_chu ?? null);
  req.input("code", mssql.VarChar, fields.code ?? null);
  req.input("createdBy", mssql.NVarChar, createdBy);

  await req.query(`
    -- Tự động lấy code từ bảng khoa_hoc nếu FE không gửi
    DECLARE @actualCode VARCHAR(150) = @code;
    IF @actualCode IS NULL AND @maKhoa IS NOT NULL
    BEGIN
        SELECT TOP 1 @actualCode = code FROM khoa_hoc WHERE ma_khoa = @maKhoa;
    END

    IF EXISTS (SELECT 1 FROM trang_thai_ly_thuyet WHERE ma_dk = @maDk)
      UPDATE trang_thai_ly_thuyet
      SET
        ma_khoa = @maKhoa,
        loai_ly_thuyet = @loaiLyThuyet,
        loai_het_mon = @loaiHetMon,
        dat_cabin = @datCabin,
        ghi_chu = @ghiChu,
        code = @actualCode,
        updated_at = GETDATE(),
        created_by = @createdBy
      WHERE ma_dk = @maDk
    ELSE
      INSERT INTO trang_thai_ly_thuyet
        (ma_dk, ma_khoa, loai_ly_thuyet, loai_het_mon, dat_cabin, ghi_chu, code, updated_at, created_by)
      VALUES
        (@maDk, @maKhoa, @loaiLyThuyet, @loaiHetMon, @datCabin, @ghiChu, @actualCode, GETDATE(), @createdBy)
  `);
  return true;
}

module.exports = {
  getAll,
  getAllLyThuyet,
  getByMaDk,
  getLichSu,
  updateTatCaTrangThaiLyThuyet,
  updateHocVienLyThuyet,
  VALID_FIELDS,
};
