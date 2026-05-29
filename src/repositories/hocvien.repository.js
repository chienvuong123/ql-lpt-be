const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { parsePagination, formatPagination, toLikeParam, toStartsWithParam, toExactParam } = require("../helpers/pagination.helper");
const toContainsParam = (value) => value ? `%${value}%` : '%';
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
    const req = pool.request();
    const { page, limit, offset } = parsePagination(rawPage, rawLimit);

    const prefixedMk = ma_khoa && (ma_khoa.startsWith("30004") ? ma_khoa : "30004" + ma_khoa);

    let searchClause = "";
    if (search && search.trim() !== "") {
        const trimmed = search.trim();
        const hasSpace = trimmed.includes(" ");
        const isNumeric = /^\d+$/.test(trimmed);

        if (isNumeric) {
            req.input('searchAnsi', mssql.VarChar, `%${trimmed}%`);
            searchClause = `(ma_dk LIKE @searchAnsi OR cccd LIKE @searchAnsi) AND`;
        } else if (hasSpace) {
            req.input('searchUnicode', mssql.NVarChar, `%${trimmed}%`);
            searchClause = `(ho_ten LIKE @searchUnicode) AND`;
        } else {
            req.input('searchUnicode', mssql.NVarChar, `%${trimmed}%`);
            req.input('searchAnsi', mssql.VarChar, `%${trimmed}%`);
            searchClause = `(ho_ten LIKE @searchUnicode OR ma_dk LIKE @searchAnsi) AND`;
        }
    }

    req.input('ma_khoa', mssql.VarChar, toExactParam(ma_khoa))
        .input('prefixed_ma_khoa', mssql.VarChar, toExactParam(prefixedMk))
        .input('limit', mssql.Int, limit)
        .input('offset', mssql.Int, offset);

    const result = await req.query(`
        SELECT 
            *,
            COUNT(*) OVER() AS total_count
        FROM hoc_vien WITH (NOLOCK)
        WHERE ${searchClause} (@ma_khoa IS NULL OR ma_khoa = @ma_khoa OR ma_khoa = @prefixed_ma_khoa)
        ORDER BY ho_ten ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        OPTION (RECOMPILE); -- Đảm bảo không bị dính lỗi parameter sniffing
    `);

    const recordset = result.recordset;
    const total = recordset[0]?.total_count ?? 0;

    return {
        data: recordset,
        pagination: formatPagination(total, page, limit),
    };
};

module.exports = {
    searchHocVienSql,
};