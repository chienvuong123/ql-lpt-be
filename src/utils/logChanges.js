const sql = require("mssql");

function toLogString(val) {
  if (val == null) return null;
  if (typeof val === "boolean") return val ? "1" : "0";
  return String(val);
}

async function logChanges(
  transaction,
  { ma_dk, loai, ref_id, oldData, newData, nguoi_thay_doi },
) {
  const fields = Object.keys(newData);

  for (const field of fields) {
    const oldVal = toLogString(oldData?.[field]);
    const newVal = toLogString(newData[field]);

    // Bỏ qua nếu không đổi
    if (oldVal === newVal) continue;

    await transaction
      .request()
      .input("ma_dk", sql.VarChar, ma_dk)
      .input("loai", sql.VarChar, loai)
      .input("ref_id", sql.Int, ref_id ?? null)
      .input("truong_thay_doi", sql.VarChar, field)
      .input("gia_tri_cu", sql.NVarChar, oldVal)
      .input("gia_tri_moi", sql.NVarChar, newVal)
      .input("nguoi_thay_doi", sql.NVarChar, nguoi_thay_doi).query(`
        INSERT INTO lich_su_thay_doi
          (ma_dk, loai, ref_id, truong_thay_doi, gia_tri_cu, gia_tri_moi, nguoi_thay_doi, thoi_gian)
        VALUES
          (@ma_dk, @loai, @ref_id, @truong_thay_doi, @gia_tri_cu, @gia_tri_moi, @nguoi_thay_doi, SYSDATETIME())
      `);
  }
}

module.exports = { logChanges };
