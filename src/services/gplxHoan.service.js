const repository = require("../repositories/gplxHoan.repository");
const GplxHoan = require("../models/gplxHoan.model");
const GplxHoanExcelParser = require("../utils/gplxHoanExcelParser");
const connectSQL = require("../configs/sql");

const searchGplxHoan = async (filters, page, limit) => {
    const { data, pagination } = await repository.searchGplxHoanSql(filters, page, limit);

    return {
        data: GplxHoan.formatList(data),
        pagination,
    };
};

const importExcel = async (fileBuffer) => {
    const { records, skipped } = GplxHoanExcelParser.parseExcel(fileBuffer);

    const pool = await connectSQL();
    let inserted = 0;
    let updated = 0;

    for (const record of records) {
        const existing = await repository.findBySoGplx(pool, record.so_gplx);
        if (existing) {
            await repository.updateRecord(pool, existing.id, record);
            updated++;
        } else {
            await repository.insertRecord(pool, record);
            inserted++;
        }
    }

    return {
        total: records.length,
        inserted,
        updated,
        skipped,
    };
};

module.exports = {
    searchGplxHoan,
    importExcel,
};
