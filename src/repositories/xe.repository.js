const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { buildSetClause } = require("../helpers/base.helper");
const { parsePagination, formatPagination, toLikeParam } = require("../helpers/pagination.helper");

const countXe = async (pool, search) => {
    const req = pool.request();
    req.input('search', search ? toLikeParam(search) : '%');

    const result = await req.query(`
        SELECT COUNT(*) as total
        FROM xe
        WHERE bien_so_xe LIKE @search 
           OR so_dang_ky_xe LIKE @search 
           OR so_gpxtl LIKE @search 
           OR nhan_hieu LIKE @search
    `);
    return result.recordset[0].total;
}

const getListXeSql = async (search, rawPage, rawLimit) => {
    const pool = await connectSQL();
    const req = pool.request();

    const { page, limit, offset } = parsePagination(rawPage, rawLimit);
    req.input('search', search ? toLikeParam(search) : '%')
        .input('limit', limit)
        .input('offset', offset);

    const result = await req.query(`
        SELECT *
        FROM xe
        WHERE bien_so_xe LIKE @search 
           OR so_dang_ky_xe LIKE @search 
           OR so_gpxtl LIKE @search 
           OR nhan_hieu LIKE @search
        ORDER BY id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = await countXe(pool, search);
    return {
        data: result.recordset,
        pagination: formatPagination(total, page, limit),
    }
}

const getById = async (id) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('id', id);
    const result = await req.query(`
        SELECT * FROM xe WHERE id = @id
    `);
    return result.recordset[0] || null;
}

const getByBienSo = async (bien_so_xe) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('bien_so_xe', bien_so_xe);
    const result = await req.query(`
        SELECT * FROM xe WHERE bien_so_xe = @bien_so_xe
    `);
    return result.recordset[0] || null;
}

const createXeSql = async (data) => {
    const pool = await connectSQL();
    const req = pool.request();

    req.input('bien_so_xe', data.bien_so_xe)
        .input('so_dang_ky_xe', data.so_dang_ky_xe || null)
        .input('mau_sac', data.mau_sac || null)
        .input('so_gpxtl', data.so_gpxtl || null)
        .input('nam_san_xuat', data.nam_san_xuat ? Number(data.nam_san_xuat) : null)
        .input('ngay_cap_gpxtl', data.ngay_cap_gpxtl || null)
        .input('ngay_het_han_gpxtl', data.ngay_het_han_gpxtl || null)
        .input('ngay_cap_gcn_kiem_dinh', data.ngay_cap_gcn_kiem_dinh || null)
        .input('ngay_het_han_gcn_kiem_dinh', data.ngay_het_han_gcn_kiem_dinh || null)
        .input('co_quan_cap_gpxtl', data.co_quan_cap_gpxtl || null)
        .input('so_huu', data.so_huu || null)
        .input('hang_xe_tap_lai', data.hang_xe_tap_lai || null)
        .input('so_khung', data.so_khung || null)
        .input('so_may', data.so_may || null)
        .input('loai_xe', data.loai_xe || null)
        .input('nhan_hieu', data.nhan_hieu || null)
        .input('anh_xe_tap_lai', data.anh_xe_tap_lai || null)
        .input('ghi_chu', data.ghi_chu || null);

    const result = await req.query(`
        INSERT INTO xe (
            bien_so_xe, so_dang_ky_xe, mau_sac, so_gpxtl, nam_san_xuat,
            ngay_cap_gpxtl, ngay_het_han_gpxtl, ngay_cap_gcn_kiem_dinh, ngay_het_han_gcn_kiem_dinh,
            co_quan_cap_gpxtl, so_huu, hang_xe_tap_lai, so_khung, so_may,
            loai_xe, nhan_hieu, anh_xe_tap_lai, ghi_chu, created_at, updated_at
        ) VALUES (
            @bien_so_xe, @so_dang_ky_xe, @mau_sac, @so_gpxtl, @nam_san_xuat,
            @ngay_cap_gpxtl, @ngay_het_han_gpxtl, @ngay_cap_gcn_kiem_dinh, @ngay_het_han_gcn_kiem_dinh,
            @co_quan_cap_gpxtl, @so_huu, @hang_xe_tap_lai, @so_khung, @so_may,
            @loai_xe, @nhan_hieu, @anh_xe_tap_lai, @ghi_chu, GETDATE(), GETDATE()
        );
        SELECT SCOPE_IDENTITY() AS id;
    `);
    return result.recordset[0].id;
}

const editXeSql = async (id, data) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('id', id);

    const updateFields = {
        bien_so_xe: data.bien_so_xe,
        so_dang_ky_xe: data.so_dang_ky_xe,
        mau_sac: data.mau_sac,
        so_gpxtl: data.so_gpxtl,
        nam_san_xuat: data.nam_san_xuat ? Number(data.nam_san_xuat) : null,
        ngay_cap_gpxtl: data.ngay_cap_gpxtl,
        ngay_het_han_gpxtl: data.ngay_het_han_gpxtl,
        ngay_cap_gcn_kiem_dinh: data.ngay_cap_gcn_kiem_dinh,
        ngay_het_han_gcn_kiem_dinh: data.ngay_het_han_gcn_kiem_dinh,
        co_quan_cap_gpxtl: data.co_quan_cap_gpxtl,
        so_huu: data.so_huu,
        hang_xe_tap_lai: data.hang_xe_tap_lai,
        so_khung: data.so_khung,
        so_may: data.so_may,
        loai_xe: data.loai_xe,
        nhan_hieu: data.nhan_hieu,
        anh_xe_tap_lai: data.anh_xe_tap_lai,
        ghi_chu: data.ghi_chu,
        updated_at: new Date()
    };

    const setClause = buildSetClause(req, updateFields);

    await req.query(`
        UPDATE xe
        SET ${setClause}
        WHERE id = @id
    `);
}

const upsertMany = async (records) => {
    const pool = await connectSQL();
    const transaction = new mssql.Transaction(pool);
    try {
        await transaction.begin();
        let insertedCount = 0;
        let updatedCount = 0;

        for (const data of records) {
            const req = new mssql.Request(transaction);
            req.input('bien_so_xe', data.bien_so_xe)
                .input('so_dang_ky_xe', data.so_dang_ky_xe || null)
                .input('mau_sac', data.mau_sac || null)
                .input('so_gpxtl', data.so_gpxtl || null)
                .input('nam_san_xuat', data.nam_san_xuat ? Number(data.nam_san_xuat) : null)
                .input('ngay_cap_gpxtl', data.ngay_cap_gpxtl || null)
                .input('ngay_het_han_gpxtl', data.ngay_het_han_gpxtl || null)
                .input('ngay_cap_gcn_kiem_dinh', data.ngay_cap_gcn_kiem_dinh || null)
                .input('ngay_het_han_gcn_kiem_dinh', data.ngay_het_han_gcn_kiem_dinh || null)
                .input('co_quan_cap_gpxtl', data.co_quan_cap_gpxtl || null)
                .input('so_huu', data.so_huu || null)
                .input('hang_xe_tap_lai', data.hang_xe_tap_lai || null)
                .input('so_khung', data.so_khung || null)
                .input('so_may', data.so_may || null)
                .input('loai_xe', data.loai_xe || null)
                .input('nhan_hieu', data.nhan_hieu || null)
                .input('anh_xe_tap_lai', data.anh_xe_tap_lai || null)
                .input('ghi_chu', data.ghi_chu || null);

            const result = await req.query(`
                IF EXISTS (SELECT 1 FROM xe WHERE bien_so_xe = @bien_so_xe)
                BEGIN
                    UPDATE xe
                    SET so_dang_ky_xe = @so_dang_ky_xe,
                        mau_sac = @mau_sac,
                        so_gpxtl = @so_gpxtl,
                        nam_san_xuat = @nam_san_xuat,
                        ngay_cap_gpxtl = @ngay_cap_gpxtl,
                        ngay_het_han_gpxtl = @ngay_het_han_gpxtl,
                        ngay_cap_gcn_kiem_dinh = @ngay_cap_gcn_kiem_dinh,
                        ngay_het_han_gcn_kiem_dinh = @ngay_het_han_gcn_kiem_dinh,
                        co_quan_cap_gpxtl = @co_quan_cap_gpxtl,
                        so_huu = @so_huu,
                        hang_xe_tap_lai = @hang_xe_tap_lai,
                        so_khung = @so_khung,
                        so_may = @so_may,
                        loai_xe = @loai_xe,
                        nhan_hieu = @nhan_hieu,
                        anh_xe_tap_lai = @anh_xe_tap_lai,
                        ghi_chu = @ghi_chu,
                        updated_at = GETDATE()
                    WHERE bien_so_xe = @bien_so_xe;
                    SELECT 'UPDATE' AS action;
                END
                ELSE
                BEGIN
                    INSERT INTO xe (
                        bien_so_xe, so_dang_ky_xe, mau_sac, so_gpxtl, nam_san_xuat,
                        ngay_cap_gpxtl, ngay_het_han_gpxtl, ngay_cap_gcn_kiem_dinh, ngay_het_han_gcn_kiem_dinh,
                        co_quan_cap_gpxtl, so_huu, hang_xe_tap_lai, so_khung, so_may,
                        loai_xe, nhan_hieu, anh_xe_tap_lai, ghi_chu, created_at, updated_at
                    ) VALUES (
                        @bien_so_xe, @so_dang_ky_xe, @mau_sac, @so_gpxtl, @nam_san_xuat,
                        @ngay_cap_gpxtl, @ngay_het_han_gpxtl, @ngay_cap_gcn_kiem_dinh, @ngay_het_han_gcn_kiem_dinh,
                        @co_quan_cap_gpxtl, @so_huu, @hang_xe_tap_lai, @so_khung, @so_may,
                        @loai_xe, @nhan_hieu, @anh_xe_tap_lai, @ghi_chu, GETDATE(), GETDATE()
                    );
                    SELECT 'INSERT' AS action;
                END
            `);

            if (result.recordset[0].action === 'INSERT') {
                insertedCount++;
            } else {
                updatedCount++;
            }
        }

        await transaction.commit();
        return { insertedCount, updatedCount };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

const deleteXeSql = async (id) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('id', id);
    await req.query(`
        DELETE FROM xe WHERE id = @id
    `);
}

module.exports = {
    countXe,
    getListXeSql,
    getById,
    getByBienSo,
    createXeSql,
    editXeSql,
    upsertMany,
    deleteXeSql
};
