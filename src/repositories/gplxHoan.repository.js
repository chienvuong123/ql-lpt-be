const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { parsePagination, formatPagination } = require("../helpers/pagination.helper");

const createTableIfNotExists = async () => {
    const pool = await connectSQL();
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'gplx_hoan')
      BEGIN
        CREATE TABLE gplx_hoan (
          id INT IDENTITY(1,1) PRIMARY KEY,
          so_gplx NVARCHAR(100) NOT NULL,
          ho_ten NVARCHAR(255) NOT NULL,
          ngay_sinh NVARCHAR(50),
          hang NVARCHAR(20),
          ngay_cap NVARCHAR(50),
          thoi_han NVARCHAR(50),
          dia_chi NVARCHAR(255),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'IX_gplx_hoan_so_gplx'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_gplx_hoan_so_gplx ON gplx_hoan (so_gplx);
      END

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'ngay_nhan_buu_dien')
      BEGIN
        ALTER TABLE gplx_hoan ADD ngay_nhan_buu_dien DATE NULL;
      END

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'trang_thai')
      BEGIN
        ALTER TABLE gplx_hoan ADD trang_thai NVARCHAR(20) NOT NULL CONSTRAINT DF_gplx_hoan_trang_thai DEFAULT 'cho_nhap_kho';
      END

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'ngay_nhap_kho')
      BEGIN
        ALTER TABLE gplx_hoan ADD ngay_nhap_kho DATETIME NULL;
      END

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'ngay_xuat_kho')
      BEGIN
        ALTER TABLE gplx_hoan ADD ngay_xuat_kho DATETIME NULL;
      END

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'IX_gplx_hoan_ngay_trangthai'
      )
      BEGIN
        CREATE NONCLUSTERED INDEX IX_gplx_hoan_ngay_trangthai ON gplx_hoan (ngay_nhan_buu_dien, trang_thai);
      END

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gplx_hoan') AND name = 'dau_moi')
      BEGIN
        ALTER TABLE gplx_hoan ADD dau_moi NVARCHAR(255) NULL;
      END
    `;
    await pool.request().query(query);
};

// Đối chiếu theo họ tên (bỏ khoảng trắng) + ngày sinh (chấp nhận nhiều định dạng, kể cả lệch ngày/tháng)
// với bảng google_sheet_data để lấy người tuyển sinh làm "đầu mối" — cùng cách đối chiếu đang dùng ở ds_nhan_gplx.
const findDauMoiByHoTenNgaySinh = async (pool, hoTen, ngaySinh) => {
    if (!hoTen || !hoTen.trim()) return null;

    const req = pool.request();
    req.input("ho_ten_clean", mssql.NVarChar, hoTen.replace(/\s+/g, ""));
    req.input("ngay_sinh", mssql.NVarChar, ngaySinh || null);

    const result = await req.query(`
        SELECT TOP 1 nguoi_tuyen_sinh
        FROM google_sheet_data WITH (NOLOCK)
        WHERE ten_hoc_vien_clean = @ho_ten_clean
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

    return result.recordset[0]?.nguoi_tuyen_sinh || null;
};

const searchGplxHoanSql = async (filters = {}, rawPage, rawLimit) => {
    await createTableIfNotExists();
    const pool = await connectSQL();
    const req = pool.request();
    const { page, limit, offset } = parsePagination(rawPage, rawLimit);

    let conditions = [];

    if (filters.search && filters.search.trim() !== "") {
        const trimmed = filters.search.trim();
        req.input("searchUnicode", mssql.NVarChar, `%${trimmed}%`);
        conditions.push("(ho_ten LIKE @searchUnicode OR so_gplx LIKE @searchUnicode OR hang LIKE @searchUnicode OR dia_chi LIKE @searchUnicode)");
    }

    if (filters.ho_ten && filters.ho_ten.trim() !== "") {
        const trimmed = filters.ho_ten.trim();
        req.input("hoTenFilter", mssql.NVarChar, `%${trimmed}%`);
        conditions.push("ho_ten LIKE @hoTenFilter");
    }

    if (filters.so_gplx && filters.so_gplx.trim() !== "") {
        const trimmed = filters.so_gplx.trim();
        req.input("soGplxFilter", mssql.NVarChar, `%${trimmed}%`);
        conditions.push("so_gplx LIKE @soGplxFilter");
    }

    if (filters.hang && filters.hang.trim() !== "") {
        const trimmed = filters.hang.trim();
        req.input("hangFilter", mssql.NVarChar, `%${trimmed}%`);
        conditions.push("hang LIKE @hangFilter");
    }

    if (filters.ngay_nhan_buu_dien) {
        req.input("ngayNhanBuuDienFilter", mssql.Date, filters.ngay_nhan_buu_dien);
        conditions.push("ngay_nhan_buu_dien = @ngayNhanBuuDienFilter");
    }

    if (filters.trang_thai) {
        req.input("trangThaiFilter", mssql.NVarChar, filters.trang_thai);
        conditions.push("trang_thai = @trangThaiFilter");
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
            FROM gplx_hoan WITH (NOLOCK)
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

const findBySoGplx = async (pool, so_gplx) => {
    const req = pool.request();
    req.input("so_gplx", mssql.NVarChar, so_gplx);
    const result = await req.query("SELECT * FROM gplx_hoan WHERE so_gplx = @so_gplx");
    return result.recordset[0] || null;
};

const findById = async (pool, id) => {
    const req = pool.request();
    req.input("id", mssql.Int, id);
    const result = await req.query("SELECT * FROM gplx_hoan WHERE id = @id");
    return result.recordset[0] || null;
};

const insertRecord = async (pool, record, ngayNhanBuuDien, dauMoi) => {
    const req = pool.request();
    req.input("so_gplx", mssql.NVarChar, record.so_gplx)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("hang", mssql.NVarChar, record.hang || null)
        .input("ngay_cap", mssql.NVarChar, record.ngay_cap || null)
        .input("thoi_han", mssql.NVarChar, record.thoi_han || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null)
        .input("ngay_nhan_buu_dien", mssql.Date, ngayNhanBuuDien || null)
        .input("dau_moi", mssql.NVarChar, dauMoi || null);

    await req.query(`
        INSERT INTO gplx_hoan (so_gplx, ho_ten, ngay_sinh, hang, ngay_cap, thoi_han, dia_chi, ngay_nhan_buu_dien, trang_thai, dau_moi)
        VALUES (@so_gplx, @ho_ten, @ngay_sinh, @hang, @ngay_cap, @thoi_han, @dia_chi, @ngay_nhan_buu_dien, 'cho_nhap_kho', @dau_moi)
    `);
};

const updateRecord = async (pool, id, record, ngayNhanBuuDien, dauMoi) => {
    const req = pool.request();
    req.input("id", mssql.Int, id)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("hang", mssql.NVarChar, record.hang || null)
        .input("ngay_cap", mssql.NVarChar, record.ngay_cap || null)
        .input("thoi_han", mssql.NVarChar, record.thoi_han || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null)
        .input("ngay_nhan_buu_dien", mssql.Date, ngayNhanBuuDien || null)
        .input("dau_moi", mssql.NVarChar, dauMoi || null);

    await req.query(`
        UPDATE gplx_hoan
        SET ho_ten = @ho_ten,
            ngay_sinh = @ngay_sinh,
            hang = @hang,
            ngay_cap = @ngay_cap,
            thoi_han = @thoi_han,
            dia_chi = @dia_chi,
            ngay_nhan_buu_dien = @ngay_nhan_buu_dien,
            trang_thai = 'cho_nhap_kho',
            ngay_nhap_kho = NULL,
            ngay_xuat_kho = NULL,
            dau_moi = @dau_moi,
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

const getDistinctNgayNhanBuuDien = async (pool) => {
    await createTableIfNotExists();
    const req = pool.request();
    const result = await req.query(`
        SELECT ngay_nhan_buu_dien, COUNT(*) AS so_luong
        FROM gplx_hoan
        WHERE ngay_nhan_buu_dien IS NOT NULL
        GROUP BY ngay_nhan_buu_dien
        ORDER BY ngay_nhan_buu_dien DESC
    `);
    return result.recordset;
};

const updateTrangThai = async (pool, id, trangThaiMoi, timestampColumn) => {
    const req = pool.request();
    req.input("id", mssql.Int, id).input("trang_thai", mssql.NVarChar, trangThaiMoi);
    await req.query(`
        UPDATE gplx_hoan
        SET trang_thai = @trang_thai,
            ${timestampColumn} = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

// Đặt thẳng trạng thái (dùng cho nút bấm thủ công, chuyển tới hoặc lùi lại 1 bước) —
// khác với updateTrangThai (chỉ tiến 1 chiều dựa theo trạng thái hiện tại khi quét).
const setTrangThai = async (pool, id, trangThaiMoi) => {
    const req = pool.request();
    req.input("id", mssql.Int, id).input("trang_thai", mssql.NVarChar, trangThaiMoi);

    let extraSet = "";
    if (trangThaiMoi === "cho_nhap_kho") {
        extraSet = ", ngay_nhap_kho = NULL, ngay_xuat_kho = NULL";
    } else if (trangThaiMoi === "da_nhap_kho") {
        extraSet = ", ngay_nhap_kho = ISNULL(ngay_nhap_kho, GETDATE()), ngay_xuat_kho = NULL";
    } else if (trangThaiMoi === "da_xuat_kho") {
        extraSet = ", ngay_xuat_kho = GETDATE()";
    }

    await req.query(`
        UPDATE gplx_hoan
        SET trang_thai = @trang_thai${extraSet},
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

module.exports = {
    createTableIfNotExists,
    searchGplxHoanSql,
    findBySoGplx,
    findById,
    findDauMoiByHoTenNgaySinh,
    insertRecord,
    updateRecord,
    getDistinctNgayNhanBuuDien,
    updateTrangThai,
    setTrangThai,
};
