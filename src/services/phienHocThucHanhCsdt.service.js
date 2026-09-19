const connectSQL = require("../configs/sql");
const repository = require("../repositories/phienHocThucHanhCsdt.repository");
const Parser = require("../utils/phienHocThucHanhCsdtExcelParser");

const importExcel = async (fileBuffer, ngayImport) => {
  await repository.createTableIfNotExists();
  const { records, skipped, duplicatedInFile } = Parser.parseExcel(fileBuffer);

  const pool = await connectSQL();
  let inserted = 0;
  let updated = 0;
  let skippedExistingKhaDung = 0;

  for (const record of records) {
    const { action } = await repository.upsertRecord(pool, record, ngayImport);
    if (action === "inserted") inserted++;
    else if (action === "updated") updated++;
    else if (action === "skipped_existing_kha_dung") skippedExistingKhaDung++;
  }

  return {
    total: records.length,
    inserted,
    updated,
    skippedExistingKhaDung,
    duplicatedInFile,
    skippedNoMaPhienHoc: skipped,
  };
};

const getByMaPhienHocList = async (maPhienHocList) => {
  await repository.createTableIfNotExists();
  const pool = await connectSQL();
  const rows = await repository.getByMaPhienHocList(pool, maPhienHocList);

  return rows.reduce((map, row) => {
    map[row.ma_phien_hoc] = row;
    return map;
  }, {});
};

module.exports = {
  importExcel,
  getByMaPhienHocList,
};
