const connectSQL = require("../configs/sql");
const { buildSetClause } = require("../helpers/base.helper");
const { parsePagination, formatPagination, toLikeParam } = require("../helpers/pagination.helper");

const countXeGiaoVien = async (pool, khoa, search) => {
    const req = pool.request();
    req.input('khoa', khoa ? toLikeParam(khoa) : '%')
        .input('search', search ? toLikeParam(search) : '%');

    const result = await req.query(`
        SELECT COUNT(*) as total
        FROM dang_ky_xe_gv dkxgv
        LEFT JOIN hoc_vien hv ON dkxgv.ma_dk = hv.ma_dk
        WHERE (dkxgv.khoa LIKE @khoa OR dkxgv.giao_vien LIKE @khoa)
        AND (dkxgv.ma_dk LIKE @search OR dkxgv.ho_ten LIKE @search OR hv.cccd LIKE @search)
    `);
    return result.recordset[0].total;
}

const getListXeVaGiaoVienSql = async (khoa, search, rawPage, rawLimit) => {
    const pool = await connectSQL();
    const req = pool.request();

    const { page, limit, offset } = parsePagination(rawPage, rawLimit);
    req.input('khoa', khoa ? toLikeParam(khoa) : '%')
        .input('search', search ? toLikeParam(search) : '%')
        .input('limit', limit)
        .input('offset', offset);

    const result = await req.query(`
        SELECT 
            dkxgv.*,
            hv.anh,
            hv.hang
        FROM [dbo].[dang_ky_xe_gv] dkxgv
        LEFT JOIN [dbo].[hoc_vien] hv ON dkxgv.ma_dk = hv.ma_dk
        WHERE (dkxgv.khoa LIKE @khoa OR dkxgv.giao_vien LIKE @khoa)
        AND (dkxgv.ma_dk LIKE @search OR dkxgv.ho_ten LIKE @search OR hv.cccd LIKE @search)
        ORDER BY dkxgv.ma_dk
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = await countXeGiaoVien(pool, khoa, search);

    return {
        data: result.recordset,
        pagination: formatPagination(total, page, limit),
    }
}

const editXeGiaoVienSql = async (id, giao_vien, xe_b1, xe_b2) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('id', id)

    const setClause = buildSetClause(req, {
        giao_vien,
        xe_b1,
        xe_b2
    });

    await req.query(`
        UPDATE [dbo].[dang_ky_xe_gv]
        SET ${setClause}
        WHERE ma_dk = @id
    `);
}

const getById = async (id) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('id', id);
    const result = await req.query(`
        SELECT * FROM [dbo].[dang_ky_xe_gv] WHERE ma_dk = @id
    `);
    return result.recordset[0];
}


module.exports = {
    getListXeVaGiaoVienSql,
    editXeGiaoVienSql,
    getById
};