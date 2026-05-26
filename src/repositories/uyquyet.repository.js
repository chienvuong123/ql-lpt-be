const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const { buildSetClause } = require("../helpers/base.helper");
const { parsePagination, formatPagination, toLikeParam } = require("../helpers/pagination.helper");

const normalizePlate = (plate) => {
    if (!plate) return "";
    return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Helper function to dynamically update the "uy_quyen" status in the "xe" table
const updateVehicleUyQuyenStatus = async (conn, bien_so_xe) => {
    const cleanPlate = normalizePlate(bien_so_xe);
    if (!cleanPlate) return;

    // Count remaining authorizations for this vehicle
    const countReq = new mssql.Request(conn);
    countReq.input('cleanPlate', cleanPlate);
    const countResult = await countReq.query(`
        SELECT COUNT(*) as total 
        FROM uy_quyen 
        WHERE UPPER(REPLACE(REPLACE(REPLACE(bien_so_xe, '-', ''), '.', ''), ' ', '')) = @cleanPlate
    `);
    const hasUyQuyen = countResult.recordset[0].total > 0 ? 1 : 0;
    
    // Update the "uy_quyen" field in the "xe" table
    const updateReq = new mssql.Request(conn);
    updateReq.input('cleanPlate', cleanPlate)
             .input('hasUyQuyen', hasUyQuyen);
    await updateReq.query(`
        UPDATE xe 
        SET uy_quyen = @hasUyQuyen
        WHERE UPPER(REPLACE(REPLACE(REPLACE(bien_so_xe, '-', ''), '.', ''), ' ', '')) = @cleanPlate
    `);
}

const countUyQuyen = async (pool, search) => {
    const req = pool.request();
    req.input('search', search ? toLikeParam(search) : '%');

    const result = await req.query(`
        SELECT COUNT(*) as total
        FROM uy_quyen
        WHERE bien_so_xe LIKE @search 
           OR nguoi_ky_hd LIKE @search 
           OR chu_xe LIKE @search 
           OR scccd_hd LIKE @search
    `);
    return result.recordset[0].total;
}

const getListUyQuyenSql = async (search, rawPage, rawLimit) => {
    const pool = await connectSQL();
    const req = pool.request();

    const { page, limit, offset } = parsePagination(rawPage, rawLimit);
    req.input('search', search ? toLikeParam(search) : '%')
        .input('limit', limit)
        .input('offset', offset);

    const result = await req.query(`
        SELECT *
        FROM uy_quyen
        WHERE bien_so_xe LIKE @search 
           OR nguoi_ky_hd LIKE @search 
           OR chu_xe LIKE @search 
           OR scccd_hd LIKE @search
        ORDER BY id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = await countUyQuyen(pool, search);
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
        SELECT * FROM uy_quyen WHERE id = @id
    `);
    return result.recordset[0] || null;
}

const getByBienSoXe = async (bien_so_xe) => {
    const pool = await connectSQL();
    const req = pool.request();
    req.input('bien_so_xe', bien_so_xe);
    const result = await req.query(`
        SELECT * FROM uy_quyen WHERE bien_so_xe = @bien_so_xe
    `);
    return result.recordset[0] || null;
}

const getByBienSoXeAll = async (bien_so_xe) => {
    const pool = await connectSQL();
    const req = pool.request();
    const cleanPlate = normalizePlate(bien_so_xe);
    req.input('cleanPlate', cleanPlate);
    const result = await req.query(`
        SELECT * 
        FROM uy_quyen 
        WHERE UPPER(REPLACE(REPLACE(REPLACE(bien_so_xe, '-', ''), '.', ''), ' ', '')) = @cleanPlate
        ORDER BY id DESC
    `);
    return result.recordset;
}

const createUyQuyenSql = async (data) => {
    const pool = await connectSQL();
    const req = pool.request();

    req.input('bien_so_xe', data.bien_so_xe)
        .input('nguoi_ky_hd', data.nguoi_ky_hd || null)
        .input('scccd_hd', data.scccd_hd || null)
        .input('ngay_cap_cc_hd', data.ngay_cap_cc_hd || null)
        .input('noi_cap_hd', data.noi_cap_hd || null)
        .input('dia_chi_nguoi_ky', data.dia_chi_nguoi_ky || null)
        .input('chu_xe', data.chu_xe || null)
        .input('dia_chi_chu_xe', data.dia_chi_chu_xe || null)
        .input('thoi_han_uy_quyen', data.thoi_han_uy_quyen || null);

    const result = await req.query(`
        INSERT INTO uy_quyen (
            bien_so_xe, nguoi_ky_hd, scccd_hd, ngay_cap_cc_hd, noi_cap_hd,
            dia_chi_nguoi_ky, chu_xe, dia_chi_chu_xe, thoi_han_uy_quyen, created_at, updated_at
        ) VALUES (
            @bien_so_xe, @nguoi_ky_hd, @scccd_hd, @ngay_cap_cc_hd, @noi_cap_hd,
            @dia_chi_nguoi_ky, @chu_xe, @dia_chi_chu_xe, @thoi_han_uy_quyen, GETDATE(), GETDATE()
        );
        SELECT SCOPE_IDENTITY() AS id;
    `);
    const newId = result.recordset[0].id;
    
    // Automatically flag "uy_quyen" status for the matched vehicle
    await updateVehicleUyQuyenStatus(pool, data.bien_so_xe);
    
    return newId;
}

const editUyQuyenSql = async (id, data) => {
    const pool = await connectSQL();
    const oldRecord = await getById(id);

    const req = pool.request();
    req.input('id', id);

    const updateFields = {
        bien_so_xe: data.bien_so_xe,
        nguoi_ky_hd: data.nguoi_ky_hd,
        scccd_hd: data.scccd_hd,
        ngay_cap_cc_hd: data.ngay_cap_cc_hd,
        noi_cap_hd: data.noi_cap_hd,
        dia_chi_nguoi_ky: data.dia_chi_nguoi_ky,
        chu_xe: data.chu_xe,
        dia_chi_chu_xe: data.dia_chi_chu_xe,
        thoi_han_uy_quyen: data.thoi_han_uy_quyen,
        updated_at: new Date()
    };

    const setClause = buildSetClause(req, updateFields);

    await req.query(`
        UPDATE uy_quyen
        SET ${setClause}
        WHERE id = @id
    `);

    // Sync old and new vehicle "uy_quyen" status flags
    await updateVehicleUyQuyenStatus(pool, data.bien_so_xe);
    if (oldRecord && normalizePlate(oldRecord.bien_so_xe) !== normalizePlate(data.bien_so_xe)) {
        await updateVehicleUyQuyenStatus(pool, oldRecord.bien_so_xe);
    }
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
                .input('nguoi_ky_hd', data.nguoi_ky_hd || null)
                .input('scccd_hd', data.scccd_hd || null)
                .input('ngay_cap_cc_hd', data.ngay_cap_cc_hd || null)
                .input('noi_cap_hd', data.noi_cap_hd || null)
                .input('dia_chi_nguoi_ky', data.dia_chi_nguoi_ky || null)
                .input('chu_xe', data.chu_xe || null)
                .input('dia_chi_chu_xe', data.dia_chi_chu_xe || null)
                .input('thoi_han_uy_quyen', data.thoi_han_uy_quyen || null);

            const result = await req.query(`
                IF EXISTS (SELECT 1 FROM uy_quyen WHERE bien_so_xe = @bien_so_xe AND scccd_hd = @scccd_hd)
                BEGIN
                    UPDATE uy_quyen
                    SET nguoi_ky_hd = @nguoi_ky_hd,
                        ngay_cap_cc_hd = @ngay_cap_cc_hd,
                        noi_cap_hd = @noi_cap_hd,
                        dia_chi_nguoi_ky = @dia_chi_nguoi_ky,
                        chu_xe = @chu_xe,
                        dia_chi_chu_xe = @dia_chi_chu_xe,
                        thoi_han_uy_quyen = @thoi_han_uy_quyen,
                        updated_at = GETDATE()
                    WHERE bien_so_xe = @bien_so_xe AND scccd_hd = @scccd_hd;
                    SELECT 'UPDATE' AS action;
                END
                ELSE
                BEGIN
                    INSERT INTO uy_quyen (
                        bien_so_xe, nguoi_ky_hd, scccd_hd, ngay_cap_cc_hd, noi_cap_hd,
                        dia_chi_nguoi_ky, chu_xe, dia_chi_chu_xe, thoi_han_uy_quyen, created_at, updated_at
                    ) VALUES (
                        @bien_so_xe, @nguoi_ky_hd, @scccd_hd, @ngay_cap_cc_hd, @noi_cap_hd,
                        @dia_chi_nguoi_ky, @chu_xe, @dia_chi_chu_xe, @thoi_han_uy_quyen, GETDATE(), GETDATE()
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

        // Sync vehicle statuses for all imported plates
        const distinctPlates = [...new Set(records.map(r => r.bien_so_xe))];
        for (const plate of distinctPlates) {
            await updateVehicleUyQuyenStatus(transaction, plate);
        }

        await transaction.commit();
        return { insertedCount, updatedCount };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

const deleteUyQuyenSql = async (id) => {
    const pool = await connectSQL();
    const oldRecord = await getById(id);
    if (oldRecord) {
        const req = pool.request();
        req.input('id', id);
        await req.query(`
            DELETE FROM uy_quyen WHERE id = @id
        `);
        
        // Update vehicle status
        await updateVehicleUyQuyenStatus(pool, oldRecord.bien_so_xe);
    }
}

module.exports = {
    countUyQuyen,
    getListUyQuyenSql,
    getById,
    getByBienSoXe,
    getByBienSoXeAll,
    createUyQuyenSql,
    editUyQuyenSql,
    upsertMany,
    deleteUyQuyenSql
};
