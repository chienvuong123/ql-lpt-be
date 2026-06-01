const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { parsePagination, formatPagination } = require("../helpers/pagination.helper");

const createTableIfNotExists = async () => {
    const pool = await connectSQL();
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ds_nhan_gplx')
      BEGIN
        CREATE TABLE ds_nhan_gplx (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ho_ten NVARCHAR(255) NOT NULL,
          ngay_sinh NVARCHAR(100),
          so_gplx NVARCHAR(100),
          dia_chi NVARCHAR(MAX),
          da_nhan BIT DEFAULT 0,
          ngay_nhan NVARCHAR(100),
          nguoi_nhan NVARCHAR(255),
          ky_nhan NVARCHAR(100),
          ghi_chu NVARCHAR(MAX),
          ngay_thi NVARCHAR(100),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ds_nhan_gplx') AND name = 'ngay_thi')
        BEGIN
          ALTER TABLE ds_nhan_gplx ADD ngay_thi NVARCHAR(100);
        END
      END
    `;
    await pool.request().query(query);
    console.log("[DsNhanGplxRepository] Đảm bảo bảng ds_nhan_gplx đã tồn tại và đồng bộ cột ngay_thi.");
};

const searchDsNhanGplxSql = async (filters = {}, rawPage, rawLimit) => {
    await createTableIfNotExists(); // Tự động tạo bảng nếu chưa có
    const pool = await connectSQL();
    const req = pool.request();
    const { page, limit, offset } = parsePagination(rawPage, rawLimit);

    let conditions = [];

    if (filters.search && filters.search.trim() !== "") {
        const trimmed = filters.search.trim();
        req.input('searchUnicode', mssql.NVarChar, `%${trimmed}%`);
        conditions.push("(g.ho_ten LIKE @searchUnicode OR g.so_gplx LIKE @searchUnicode OR g.dia_chi LIKE @searchUnicode)");
    }

    const hoTen = filters.ho_ten || filters.ten_hoc_vien || filters.hoTen;
    if (hoTen && hoTen.trim() !== "") {
        const trimmed = hoTen.trim();
        req.input('hoTenFilter', mssql.NVarChar, `%${trimmed}%`);
        conditions.push("g.ho_ten LIKE @hoTenFilter");
    }

    const daNhan = filters.da_nhan !== undefined ? filters.da_nhan : filters.daNhan;
    if (daNhan !== undefined && daNhan !== null && daNhan !== "none" && daNhan !== "") {
        req.input('daNhan', mssql.Bit, (daNhan === 'true' || daNhan === true || daNhan === 1) ? 1 : 0);
        conditions.push("g.da_nhan = @daNhan");
    }

    const ngayThi = filters.ngay_thi || filters.ngayThi;
    if (ngayThi && ngayThi.trim() !== "") {
        const trimmed = ngayThi.trim();
        req.input('ngayThiFilter', mssql.NVarChar, trimmed);
        conditions.push("g.ngay_thi = @ngayThiFilter");
    }

    let whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const startRow = offset + 1;
    const endRow = offset + limit;

    req.input('start_row', mssql.Int, startRow)
       .input('end_row', mssql.Int, endRow);

    const tenExpression = `CASE WHEN CHARINDEX(' ', LTRIM(RTRIM(ho_ten))) > 0 THEN RIGHT(LTRIM(RTRIM(ho_ten)), CHARINDEX(' ', REVERSE(LTRIM(RTRIM(ho_ten)))) - 1) ELSE LTRIM(RTRIM(ho_ten)) END`;
    const isDauMoiSort = filters.dau_moi === true || filters.dau_moi === "true";
    const sortOrder = isDauMoiSort ? `dau_moi ASC, ${tenExpression} ASC, ho_ten ASC` : `${tenExpression} ASC, ho_ten ASC`;

    const queryStr = `
        ;WITH BaseData AS (
            SELECT 
                g.*,
                (
                    SELECT TOP 1 gs.nguoi_tuyen_sinh 
                    FROM google_sheet_data gs 
                    WHERE LOWER(LTRIM(RTRIM(gs.ten_hoc_vien))) = LOWER(LTRIM(RTRIM(g.ho_ten))) 
                      AND (LOWER(LTRIM(RTRIM(gs.ngay_sinh))) = LOWER(LTRIM(RTRIM(g.ngay_sinh))) OR (gs.ngay_sinh IS NULL AND g.ngay_sinh IS NULL))
                ) AS dau_moi
            FROM ds_nhan_gplx g WITH (NOLOCK)
            ${whereClause}
        ),
        OrderedData AS (
            SELECT 
                *,
                ROW_NUMBER() OVER (ORDER BY ${sortOrder}) AS row_num,
                COUNT(*) OVER() AS total_count
            FROM BaseData
        )
        SELECT *
        FROM OrderedData
        WHERE row_num BETWEEN @start_row AND @end_row
        ORDER BY ${sortOrder};
    `;

    const result = await req.query(queryStr);
    const recordset = result.recordset;
    const total = recordset[0]?.total_count ?? 0;

    return {
        data: recordset,
        pagination: formatPagination(total, page, limit),
    };
};

const findExistingRecord = async (pool, ho_ten, ngay_sinh, so_gplx) => {
    const req = pool.request();
    req.input('ho_ten', mssql.NVarChar, ho_ten);
    req.input('ngay_sinh', mssql.NVarChar, ngay_sinh || null);
    req.input('so_gplx', mssql.NVarChar, so_gplx || null);
    
    let query = "SELECT * FROM ds_nhan_gplx WHERE 1=0"; // fallback
    if (so_gplx) {
        query = "SELECT * FROM ds_nhan_gplx WHERE so_gplx = @so_gplx";
    } else if (ho_ten) {
        query = `
            SELECT * FROM ds_nhan_gplx 
            WHERE LOWER(LTRIM(RTRIM(ho_ten))) = LOWER(LTRIM(RTRIM(@ho_ten))) 
              AND (LOWER(LTRIM(RTRIM(ngay_sinh))) = LOWER(LTRIM(RTRIM(@ngay_sinh))) OR (ngay_sinh IS NULL AND @ngay_sinh IS NULL))
        `;
    }
    const result = await req.query(query);
    return result.recordset[0] || null;
};

const insertRecord = async (pool, record) => {
    const req = pool.request();
    req.input('ho_ten', mssql.NVarChar, record.ho_ten)
       .input('ngay_sinh', mssql.NVarChar, record.ngay_sinh || null)
       .input('so_gplx', mssql.NVarChar, record.so_gplx || null)
       .input('dia_chi', mssql.NVarChar, record.dia_chi || null)
       .input('da_nhan', mssql.Bit, record.da_nhan ? 1 : 0)
       .input('ngay_nhan', mssql.NVarChar, record.ngay_nhan || null)
       .input('nguoi_nhan', mssql.NVarChar, record.nguoi_nhan || null)
       .input('ky_nhan', mssql.NVarChar, record.ky_nhan || null)
       .input('ghi_chu', mssql.NVarChar, record.ghi_chu || null)
       .input('ngay_thi', mssql.NVarChar, record.ngay_thi || null);
    
    await req.query(`
        INSERT INTO ds_nhan_gplx (ho_ten, ngay_sinh, so_gplx, dia_chi, da_nhan, ngay_nhan, nguoi_nhan, ky_nhan, ghi_chu, ngay_thi)
        VALUES (@ho_ten, @ngay_sinh, @so_gplx, @dia_chi, @da_nhan, @ngay_nhan, @nguoi_nhan, @ky_nhan, @ghi_chu, @ngay_thi)
    `);
};

const updateRecord = async (pool, id, record) => {
    const req = pool.request();
    req.input('id', mssql.Int, id)
       .input('ho_ten', mssql.NVarChar, record.ho_ten)
       .input('ngay_sinh', mssql.NVarChar, record.ngay_sinh || null)
       .input('so_gplx', mssql.NVarChar, record.so_gplx || null)
       .input('dia_chi', mssql.NVarChar, record.dia_chi || null)
       .input('da_nhan', mssql.Bit, record.da_nhan ? 1 : 0)
       .input('ngay_nhan', mssql.NVarChar, record.ngay_nhan || null)
       .input('nguoi_nhan', mssql.NVarChar, record.nguoi_nhan || null)
       .input('ky_nhan', mssql.NVarChar, record.ky_nhan || null)
       .input('ghi_chu', mssql.NVarChar, record.ghi_chu || null)
       .input('ngay_thi', mssql.NVarChar, record.ngay_thi || null);
    
    await req.query(`
        UPDATE ds_nhan_gplx
        SET ho_ten = @ho_ten,
            ngay_sinh = @ngay_sinh,
            so_gplx = @so_gplx,
            dia_chi = @dia_chi,
            da_nhan = @da_nhan,
            ngay_nhan = @ngay_nhan,
            nguoi_nhan = @nguoi_nhan,
            ky_nhan = @ky_nhan,
            ghi_chu = @ghi_chu,
            ngay_thi = @ngay_thi,
            updated_at = GETDATE()
        WHERE id = @id
    `);
};

const updateDaNhan = async (ids, status) => {
    await createTableIfNotExists();
    const pool = await connectSQL();
    const req = pool.request();
    req.input('status', mssql.Bit, status ? 1 : 0);
    
    const placeholders = ids.map((id, index) => {
        req.input(`id_${index}`, mssql.Int, id);
        return `@id_${index}`;
    }).join(', ');

    await req.query(`
        UPDATE ds_nhan_gplx
        SET da_nhan = @status,
            updated_at = GETDATE()
        WHERE id IN (${placeholders})
    `);
};

const getDistinctDatesSql = async () => {
    await createTableIfNotExists();
    const pool = await connectSQL();
    const result = await pool.request().query(`
        SELECT DISTINCT ngay_thi 
        FROM ds_nhan_gplx WITH (NOLOCK) 
        WHERE ngay_thi IS NOT NULL AND ngay_thi <> '' 
        ORDER BY ngay_thi DESC
    `);
    return result.recordset.map(row => row.ngay_thi);
};

module.exports = {
    createTableIfNotExists,
    searchDsNhanGplxSql,
    findExistingRecord,
    insertRecord,
    updateRecord,
    updateDaNhan,
    getDistinctDatesSql,
};
