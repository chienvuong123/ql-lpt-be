const repository = require("../repositories/dsNhanGplx.repository");
const DsNhanGplx = require("../models/dsNhanGplx.model");
const DsNhanGplxExcelParser = require("../utils/dsNhanGplxExcelParser");
const connectSQL = require("../configs/sql");

const searchDsNhanGplx = async (filters, page, limit) => {
    const { data, pagination } = await repository.searchDsNhanGplxSql(filters, page, limit);

    return {
        data: DsNhanGplx.formatList(data),
        pagination,
    };
};

const importExcel = async (fileBuffer, ngay_thi) => {
    const parsedRecords = DsNhanGplxExcelParser.parseExcel(fileBuffer);

    const pool = await connectSQL();
    let inserted = 0;
    let updated = 0;

    for (const record of parsedRecords) {
        if (ngay_thi) {
            record.ngay_thi = ngay_thi;
        }

        const existing = await repository.findExistingRecord(pool, record.ho_ten, record.ngay_sinh, record.so_gplx);
        if (existing) {
            await repository.updateRecord(pool, existing.id, record);
            updated++;
        } else {
            await repository.insertRecord(pool, record);
            inserted++;
        }
    }

    return {
        total: parsedRecords.length,
        inserted,
        updated,
    };
};

const updateDaNhanStatus = async (ids, status) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("Danh sách ID không hợp lệ");
    }
    await repository.updateDaNhan(ids, status);
    return true;
};

const getDistinctDates = async () => {
    return await repository.getDistinctDatesSql();
};

module.exports = {
    searchDsNhanGplx,
    importExcel,
    updateDaNhanStatus,
    getDistinctDates,
};
