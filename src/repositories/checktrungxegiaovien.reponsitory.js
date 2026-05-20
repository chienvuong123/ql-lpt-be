const connectSQL = require("../configs/sql");

const getXeGiaoVienSql = async (khoa) => {
    const pool = await connectSQL();
    const req = pool.request();

    req.input('khoa', khoa);

    const result = await req.query(`
        SELECT *
        FROM dang_ky_xe_gv WHERE khoa LIKE @khoa OR giao_vien LIKE @khoa
    `);
    return result.recordset;
}


module.exports = {
    getXeGiaoVienSql,
};