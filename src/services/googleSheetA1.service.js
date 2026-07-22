const repository = require("../repositories/googleSheetA1.repository");
const GoogleSheetA1 = require("../models/googleSheetA1.model");
const GoogleSheetA1ExcelParser = require("../utils/googleSheetA1ExcelParser");
const connectSQL = require("../configs/sql");

const searchGoogleSheetA1 = async (filters, page, limit) => {
    const { data, pagination } = await repository.searchGoogleSheetA1Sql(filters, page, limit);

    return {
        data: GoogleSheetA1.formatList(data),
        pagination,
    };
};

const importExcel = async (fileBuffer) => {
    const records = GoogleSheetA1ExcelParser.parseExcel(fileBuffer);

    await repository.createTableIfNotExists();
    const pool = await connectSQL();
    let inserted = 0;
    let updated = 0;

    for (const record of records) {
        const existing = record.ma_phieu ? await repository.findByMaPhieu(pool, record.ma_phieu) : null;
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
    };
};

module.exports = {
    searchGoogleSheetA1,
    importExcel,
};
