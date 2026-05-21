const connectSQL = require("../configs/sql");
const { parsePagination, formatPagination } = require("../helpers/pagination.helper");

const countXeGiaoVien = async (pool, khoa) => {
    const result = await pool.request()
        .input('khoa', khoa)
        .query(`
            SELECT COUNT(*) as total
            FROM dang_ky_xe_gv 
            WHERE khoa LIKE @khoa OR giao_vien LIKE @khoa
        `);
    return result.recordset[0].total;
}

const getListXeVaGiaoVienSql = async (khoa, rawPage, rawLimit) => {
    const pool = await connectSQL();
    const req = pool.request();

    const { page, limit, offset } = parsePagination(rawPage, rawLimit);
    req.input('khoa', khoa)
        .input('limit', limit)
        .input('offset', offset);

    const result = await req.query(`
        SELECT *
        FROM dang_ky_xe_gv 
        WHERE khoa LIKE @khoa OR giao_vien LIKE @khoa
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = await countXeGiaoVien(pool, khoa);

    return {
        data: result.recordset,
        pagination: formatPagination(total, page, limit),
    }
}


module.exports = {
    getListXeVaGiaoVienSql,
};