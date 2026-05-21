const connectSQL = require("../configs/sql");
const { parsePagination, formatPagination, toLikeParam } = require("../helpers/pagination.helper");

const countHocVien = async (pool, search, ma_khoa) => {
    const result = await pool.request()
        .input('ma_khoa', toLikeParam(ma_khoa))
        .input('search', toLikeParam(search))
        .query(`
            SELECT COUNT(*) as total
            FROM hoc_vien 
            WHERE ma_khoa LIKE @ma_khoa 
            AND (ho_ten LIKE @search OR ma_dk LIKE @search OR cccd LIKE @search)
        `);
    return result.recordset[0].total;
}

const searchHocVienSql = async (search, ma_khoa, rawPage, rawLimit) => {
    const pool = await connectSQL();
    const req = await pool.request()

    const { page, limit, offset } = parsePagination(rawPage, rawLimit);

    req.input('ma_khoa', toLikeParam(ma_khoa))
        .input('search', toLikeParam(search))
        .input('limit', limit)
        .input('offset', offset)


    const result = await req.query(`
            SELECT * FROM hoc_vien 
            WHERE (ho_ten LIKE @search 
            OR ma_dk LIKE @search 
            OR cccd LIKE @search)
            AND ma_khoa LIKE @ma_khoa 
            ORDER BY id
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

    const total = await countHocVien(pool, search, ma_khoa);

    return {
        data: result.recordset,
        pagination: formatPagination(total, page, limit),
    }
}

module.exports = {
    searchHocVienSql,
};