const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { parsePagination, formatPagination } = require("../helpers/pagination.helper");

const getAllSql = async (filters = {}) => {
    const pool = await connectSQL();
    const request = new mssql.Request(pool);

    let query = `
      SELECT t.*, k.ten_khoa 
      FROM [dbo].[tien_do_dao_tao] t
      LEFT JOIN [dbo].[khoa_hoc] k ON t.ma_khoa = k.ma_khoa
      WHERE 1=1
    `;

    if (filters.ma_khoa) {
      request.input("ma_khoa", mssql.NVarChar, filters.ma_khoa);
      query += ` AND t.ma_khoa = @ma_khoa`;
    }

    query += ` ORDER BY t.updated_at DESC, t.ma_khoa ASC`;

    const result = await request.query(query);
    return result.recordset;
};

const getTheoryExpiredYesterdaySql = async () => {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_ly_thuyet AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
};

const getCabinExpiredYesterdaySql = async () => {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_cabin AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
};

const getDatExpiredYesterdaySql = async () => {
    const pool = await connectSQL();
    const result = await pool.request().query(`
      SELECT ma_khoa 
      FROM [dbo].[tien_do_dao_tao]
      WHERE CAST(ket_thuc_dat AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);
    return result.recordset.map((row) => row.ma_khoa);
};

const getStudentsAndTheoryProgressSql = async (ma_khoa, { page = 1, limit = 10, search = "", giao_vien = "" } = {}) => {
    const { offset, limit: limitVal } = parsePagination(page, limit);
    const pool = await connectSQL();

    let countQuery = `
      SELECT COUNT(*) as total 
      FROM [dbo].[hoc_vien] hv WITH (NOLOCK)
      LEFT JOIN [dbo].[dang_ky_xe_gv] dg WITH (NOLOCK) ON hv.ma_dk = dg.ma_dk
      WHERE hv.ma_khoa = @ma_khoa
    `;

    let dataQuery = `
      SELECT 
        hv.ma_dk,
        hv.ho_ten,
        hv.cccd,
        hv.hang,
        hv.anh,
        ISNULL(dg.giao_vien, N'Chưa phân công') AS giao_vien,
        dg.xe_b1,
        dg.xe_b2,
        hvt.progress AS theory_progress,
        hvt.total_hour_learned AS theory_hours,
        hvt.passed AS theory_passed
      FROM [dbo].[hoc_vien] hv WITH (NOLOCK)
      LEFT JOIN [dbo].[dang_ky_xe_gv] dg WITH (NOLOCK) ON hv.ma_dk = dg.ma_dk
      LEFT JOIN [BACK_UP].[dbo].[hoc_vien_hoc_tap] hvt WITH (NOLOCK) ON hv.ma_dk = hvt.ma_dk
      WHERE hv.ma_khoa = @ma_khoa
    `;

    const request = pool.request();
    request.input("ma_khoa", mssql.NVarChar, ma_khoa);

    if (search) {
      const searchParam = `%${search.trim()}%`;
      request.input("search", mssql.NVarChar, searchParam);
      countQuery += ` AND (hv.ho_ten LIKE @search OR hv.cccd LIKE @search OR hv.ma_dk LIKE @search)`;
      dataQuery += ` AND (hv.ho_ten LIKE @search OR hv.cccd LIKE @search OR hv.ma_dk LIKE @search)`;
    }

    if (giao_vien) {
      const gvParam = `%${giao_vien.trim()}%`;
      request.input("giao_vien", mssql.NVarChar, gvParam);
      countQuery += ` AND dg.giao_vien LIKE @giao_vien`;
      dataQuery += ` AND dg.giao_vien LIKE @giao_vien`;
    }

    // Get total count
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0]?.total || 0;

    // Add pagination to data query
    request.input("offset", mssql.Int, offset);
    request.input("limit", mssql.Int, limitVal);
    dataQuery += `
      ORDER BY ISNULL(dg.giao_vien, N'Chưa phân công') ASC, hv.ho_ten ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const dataResult = await request.query(dataQuery);
    return {
        data: dataResult.recordset,
        pagination: formatPagination(total, page, limit)
    };
};

const getDatSessionsByKhoaSql = async (ma_khoa) => {
    const pool = await connectSQL();
    const result = await pool.request()
      .input("ma_khoa", mssql.NVarChar, ma_khoa)
      .query(`
        SELECT 
          ma_dk,
          so_km,
          thoi_gian,
          trang_thai
        FROM [dbo].[phien_hoc_dat] WITH (NOLOCK)
        WHERE ma_dk IN (SELECT ma_dk FROM [dbo].[hoc_vien] WHERE ma_khoa = @ma_khoa)
      `);
    return result.recordset;
};

const getDatSessionsByMaDksSql = async (maDks) => {
    if (!maDks || maDks.length === 0) return [];
    const pool = await connectSQL();
    const request = pool.request();

    const inParams = maDks.map((maDk, idx) => {
        const paramName = `maDk${idx}`;
        request.input(paramName, mssql.VarChar, maDk);
        return `@${paramName}`;
    }).join(", ");

    const query = `
      SELECT 
        ma_dk,
        so_km,
        thoi_gian,
        trang_thai
      FROM [dbo].[phien_hoc_dat] WITH (NOLOCK)
      WHERE ma_dk IN (${inParams})
    `;

    const result = await request.query(query);
    return result.recordset;
};

module.exports = {
    getAllSql,
    getTheoryExpiredYesterdaySql,
    getCabinExpiredYesterdaySql,
    getDatExpiredYesterdaySql,
    getStudentsAndTheoryProgressSql,
    getDatSessionsByKhoaSql,
    getDatSessionsByMaDksSql
};

