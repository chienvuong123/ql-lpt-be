const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { parsePagination, formatPagination } = require("../helpers/pagination.helper");

const createTableIfNotExists = async () => {
    const pool = await connectSQL();
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'google_sheet_a1')
      BEGIN
        CREATE TABLE google_sheet_a1 (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ma_phieu NVARCHAR(100),
          ho_ten NVARCHAR(255) NOT NULL,
          ngay_sinh NVARCHAR(100),
          cccd VARCHAR(50),
          dien_thoai NVARCHAR(50),
          dia_chi NVARCHAR(MAX),
          dau_moi NVARCHAR(255),
          hang NVARCHAR(50),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      END

      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('google_sheet_a1') AND name = 'ho_ten_clean'
      )
      BEGIN
        ALTER TABLE google_sheet_a1 ADD ho_ten_clean AS REPLACE(ho_ten, ' ', '') PERSISTED;
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE object_id = OBJECT_ID('google_sheet_a1') AND name = 'IX_google_sheet_a1_ho_ten_clean'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_google_sheet_a1_ho_ten_clean
        ON google_sheet_a1 (ho_ten_clean)
        INCLUDE (dau_moi, ngay_sinh);
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE object_id = OBJECT_ID('google_sheet_a1') AND name = 'IX_google_sheet_a1_ma_phieu'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_google_sheet_a1_ma_phieu ON google_sheet_a1 (ma_phieu);
      END
    `;
    await pool.request().query(query);
};

const searchGoogleSheetA1Sql = async (filters = {}, rawPage, rawLimit) => {
    await createTableIfNotExists();
    const pool = await connectSQL();
    const req = pool.request();
    const { page, limit, offset } = parsePagination(rawPage, rawLimit);

    let conditions = [];

    if (filters.search && filters.search.trim() !== "") {
        const trimmed = filters.search.trim();
        req.input("searchUnicode", mssql.NVarChar, `%${trimmed}%`);
        conditions.push("(ho_ten LIKE @searchUnicode OR cccd LIKE @searchUnicode OR ma_phieu LIKE @searchUnicode OR dau_moi LIKE @searchUnicode)");
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const startRow = offset + 1;
    const endRow = offset + limit;
    req.input("start_row", mssql.Int, startRow).input("end_row", mssql.Int, endRow);

    const queryStr = `
        ;WITH OrderedData AS (
            SELECT *,
                ROW_NUMBER() OVER (ORDER BY ho_ten ASC) AS row_num,
                COUNT(*) OVER() AS total_count
            FROM google_sheet_a1 WITH (NOLOCK)
            ${whereClause}
        )
        SELECT * FROM OrderedData
        WHERE row_num BETWEEN @start_row AND @end_row
        ORDER BY row_num;
    `;

    const result = await req.query(queryStr);
    const recordset = result.recordset;
    const total = recordset[0]?.total_count ?? 0;

    return {
        data: recordset,
        pagination: formatPagination(total, page, limit),
    };
};

const findByMaPhieu = async (pool, maPhieu) => {
    if (!maPhieu) return null;
    const req = pool.request();
    req.input("ma_phieu", mssql.NVarChar, maPhieu);
    const result = await req.query("SELECT * FROM google_sheet_a1 WHERE ma_phieu = @ma_phieu");
    return result.recordset[0] || null;
};

const insertRecord = async (pool, record) => {
    const req = pool.request();
    req.input("ma_phieu", mssql.NVarChar, record.ma_phieu || null)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("cccd", mssql.VarChar, record.cccd || null)
        .input("dien_thoai", mssql.NVarChar, record.dien_thoai || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null)
        .input("dau_moi", mssql.NVarChar, record.dau_moi || null)
        .input("hang", mssql.NVarChar, record.hang || null);

    await req.query(`
        INSERT INTO google_sheet_a1
            (ma_phieu, ho_ten, ngay_sinh, cccd, dien_thoai, dia_chi, dau_moi, hang)
        VALUES
            (@ma_phieu, @ho_ten, @ngay_sinh, @cccd, @dien_thoai, @dia_chi, @dau_moi, @hang)
    `);
};

const updateRecord = async (pool, id, record) => {
    const req = pool.request();
    req.input("id", mssql.Int, id)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("cccd", mssql.VarChar, record.cccd || null)
        .input("dien_thoai", mssql.NVarChar, record.dien_thoai || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null)
        .input("dau_moi", mssql.NVarChar, record.dau_moi || null)
        .input("hang", mssql.NVarChar, record.hang || null);

    await req.query(`
        UPDATE google_sheet_a1
        SET ho_ten = @ho_ten,
            ngay_sinh = @ngay_sinh,
            cccd = @cccd,
            dien_thoai = @dien_thoai,
            dia_chi = @dia_chi,
            dau_moi = @dau_moi,
            hang = @hang,
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

// Đối chiếu theo họ tên (bỏ khoảng trắng) + ngày sinh (chấp nhận nhiều định dạng, kể cả lệch ngày/tháng)
// để lấy đầu mối của học viên A1 — dùng làm nguồn dự phòng khi không tìm thấy ở bảng học viên ô tô
// (google_sheet_data). Cùng cách đối chiếu đang dùng ở gplxHoan.repository.js/ds_nhan_gplx.
const findDauMoiByHoTenNgaySinh = async (pool, hoTen, ngaySinh) => {
    if (!hoTen || !hoTen.trim()) return null;

    await createTableIfNotExists();

    const req = pool.request();
    req.input("ho_ten_clean", mssql.NVarChar, hoTen.replace(/\s+/g, ""));
    req.input("ngay_sinh", mssql.NVarChar, ngaySinh || null);

    const result = await req.query(`
        SELECT TOP 1 dau_moi
        FROM google_sheet_a1 WITH (NOLOCK)
        WHERE ho_ten_clean = @ho_ten_clean
          AND (
            COALESCE(TRY_CONVERT(DATE, ngay_sinh, 103), TRY_CONVERT(DATE, ngay_sinh, 120), TRY_CONVERT(DATE, ngay_sinh, 105), TRY_CAST(ngay_sinh AS DATE))
            =
            COALESCE(TRY_CONVERT(DATE, @ngay_sinh, 103), TRY_CONVERT(DATE, @ngay_sinh, 120), TRY_CONVERT(DATE, @ngay_sinh, 105), TRY_CAST(@ngay_sinh AS DATE))

            OR (
              DAY(COALESCE(TRY_CONVERT(DATE, ngay_sinh, 103), TRY_CONVERT(DATE, ngay_sinh, 120), TRY_CONVERT(DATE, ngay_sinh, 105), TRY_CAST(ngay_sinh AS DATE)))
              =
              MONTH(COALESCE(TRY_CONVERT(DATE, @ngay_sinh, 103), TRY_CONVERT(DATE, @ngay_sinh, 120), TRY_CONVERT(DATE, @ngay_sinh, 105), TRY_CAST(@ngay_sinh AS DATE)))
              AND
              MONTH(COALESCE(TRY_CONVERT(DATE, ngay_sinh, 103), TRY_CONVERT(DATE, ngay_sinh, 120), TRY_CONVERT(DATE, ngay_sinh, 105), TRY_CAST(ngay_sinh AS DATE)))
              =
              DAY(COALESCE(TRY_CONVERT(DATE, @ngay_sinh, 103), TRY_CONVERT(DATE, @ngay_sinh, 120), TRY_CONVERT(DATE, @ngay_sinh, 105), TRY_CAST(@ngay_sinh AS DATE)))
              AND
              YEAR(COALESCE(TRY_CONVERT(DATE, ngay_sinh, 103), TRY_CONVERT(DATE, ngay_sinh, 120), TRY_CONVERT(DATE, ngay_sinh, 105), TRY_CAST(ngay_sinh AS DATE)))
              =
              YEAR(COALESCE(TRY_CONVERT(DATE, @ngay_sinh, 103), TRY_CONVERT(DATE, @ngay_sinh, 120), TRY_CONVERT(DATE, @ngay_sinh, 105), TRY_CAST(@ngay_sinh AS DATE)))
            )

            OR (REPLACE(ngay_sinh, ' ', '') = REPLACE(@ngay_sinh, ' ', ''))
            OR (ngay_sinh IS NULL AND @ngay_sinh IS NULL)
          )
    `);

    return result.recordset[0]?.dau_moi || null;
};

module.exports = {
    createTableIfNotExists,
    searchGoogleSheetA1Sql,
    findByMaPhieu,
    insertRecord,
    updateRecord,
    findDauMoiByHoTenNgaySinh,
};
