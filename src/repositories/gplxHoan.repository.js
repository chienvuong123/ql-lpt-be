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
    `;
    await pool.request().query(query);
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

const insertRecord = async (pool, record) => {
    const req = pool.request();
    req.input("so_gplx", mssql.NVarChar, record.so_gplx)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("hang", mssql.NVarChar, record.hang || null)
        .input("ngay_cap", mssql.NVarChar, record.ngay_cap || null)
        .input("thoi_han", mssql.NVarChar, record.thoi_han || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null);

    await req.query(`
        INSERT INTO gplx_hoan (so_gplx, ho_ten, ngay_sinh, hang, ngay_cap, thoi_han, dia_chi)
        VALUES (@so_gplx, @ho_ten, @ngay_sinh, @hang, @ngay_cap, @thoi_han, @dia_chi)
    `);
};

const updateRecord = async (pool, id, record) => {
    const req = pool.request();
    req.input("id", mssql.Int, id)
        .input("ho_ten", mssql.NVarChar, record.ho_ten)
        .input("ngay_sinh", mssql.NVarChar, record.ngay_sinh || null)
        .input("hang", mssql.NVarChar, record.hang || null)
        .input("ngay_cap", mssql.NVarChar, record.ngay_cap || null)
        .input("thoi_han", mssql.NVarChar, record.thoi_han || null)
        .input("dia_chi", mssql.NVarChar, record.dia_chi || null);

    await req.query(`
        UPDATE gplx_hoan
        SET ho_ten = @ho_ten,
            ngay_sinh = @ngay_sinh,
            hang = @hang,
            ngay_cap = @ngay_cap,
            thoi_han = @thoi_han,
            dia_chi = @dia_chi,
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

module.exports = {
    createTableIfNotExists,
    searchGplxHoanSql,
    findBySoGplx,
    insertRecord,
    updateRecord,
};
