const XLSX = require("xlsx");
const model = require("../models/kiemTraTotNghiep.model");

async function getAllStudents() {
  return await model.findAll();
}

async function importFromExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Row 0 là header, bỏ qua
  const dataRows = rows.slice(1).filter((row) => String(row[0]).trim());

  let inserted = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const student = {
      ma_dk: String(row[0] || "").trim(),
      ho_ten: String(row[1] || "").trim(),
      ngay_sinh: String(row[2] || "").trim(),
      can_cuoc: String(row[3] || "").trim(),
      ma_khoa: String(row[4] || "").trim(),
    };

    if (!student.ma_dk) {
      skipped++;
      continue;
    }

    const existing = await model.findByMaSo(student.ma_dk);
    if (existing) {
      skipped++;
      continue;
    }

    await model.insertOne(student);
    inserted++;
  }

  return {
    total_processed: dataRows.length,
    inserted,
    skipped,
  };
}

module.exports = { getAllStudents, importFromExcel };
