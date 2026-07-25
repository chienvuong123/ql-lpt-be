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

const importExcel = async (fileBuffer, options = {}) => {
    const { records, skipped } = GoogleSheetA1ExcelParser.parseExcel(fileBuffer, options);

    await repository.createTableIfNotExists();
    const pool = await connectSQL();
    let inserted = 0;
    let updated = 0;

    // Đếm mã phiếu bị trùng NGAY TRONG file đang import — nếu 2 dòng cùng mã phiếu, dòng sau sẽ
    // ghi đè dòng trước (update chứ không insert mới), làm số bản ghi thực nhận được ít hơn số
    // dòng dữ liệu trong file. Đây là số liệu để chẩn đoán, không phải lỗi.
    const maPhieuSeen = new Set();
    let duplicateMaPhieuInFile = 0;

    for (const record of records) {
        if (record.ma_phieu) {
            if (maPhieuSeen.has(record.ma_phieu)) {
                duplicateMaPhieuInFile++;
            }
            maPhieuSeen.add(record.ma_phieu);
        }

        // CCCD đáng tin cậy hơn mã phiếu để đối chiếu trùng lặp (mã phiếu có thể bị đọc lệch cột
        // ở một phần dữ liệu, còn CCCD khi có luôn là duy nhất cho từng người) — ưu tiên CCCD trước.
        const existing = record.cccd
            ? await repository.findByCccd(pool, record.cccd)
            : record.ma_phieu
                ? await repository.findByMaPhieu(pool, record.ma_phieu)
                : null;

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
        duplicateMaPhieuInFile,
    };
};

module.exports = {
    searchGoogleSheetA1,
    importExcel,
};
