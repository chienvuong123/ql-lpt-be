const connectSQL = require("../configs/sql");
const sql = require("mssql");

const getByMaDK = async (ma_dk) => {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .query(`
      SELECT loai_duyet, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet
      FROM hoc_vien_duyet_log
      WHERE ma_dk = @ma_dk
    `);

  const defaultDuyet = {
    tong: { trang_thai: null, ly_do: null, nguoi_duyet: null, thoi_gian_duyet: null },
    dem: { trang_thai: null, ly_do: null, nguoi_duyet: null, thoi_gian_duyet: null },
    tu_dong: { trang_thai: null, ly_do: null, nguoi_duyet: null, thoi_gian_duyet: null },
    so_san: { trang_thai: null, ly_do: null, nguoi_duyet: null, thoi_gian_duyet: null }
  };

  result.recordset.forEach(row => {
    const { loai_duyet, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet } = row;
    if (defaultDuyet[loai_duyet] !== undefined) {
      defaultDuyet[loai_duyet] = {
        trang_thai,
        ly_do,
        nguoi_duyet,
        thoi_gian_duyet
      };
    }
  });

  return defaultDuyet;
};

const upsert = async (ma_dk, loai_duyet, { trang_thai, ly_do, nguoi_duyet }) => {
  const pool = await connectSQL();

  // 1. Update the corresponding approval column in phien_hoc_dat for the student
  let updateColumn = "";
  let reasonColumn = "";
  if (loai_duyet === "tong") {
    updateColumn = "duyet_tong";
    reasonColumn = "ly_do_tong";
  } else if (loai_duyet === "tu_dong") {
    updateColumn = "duyet_tu_dong";
    reasonColumn = "ly_do_td";
  } else if (loai_duyet === "dem") {
    updateColumn = "duyet_dem";
    reasonColumn = "ly_do_dem";
  } else if (loai_duyet === "so_san") {
    updateColumn = "duyet_so_san";
    reasonColumn = "ly_do_so_san";
  }

  if (updateColumn) {
    let bitVal = null;
    if (trang_thai === 1) bitVal = true;
    else if (trang_thai === 2) bitVal = false;

    await pool
      .request()
      .input("ma_dk", sql.NVarChar, ma_dk)
      .input("val", sql.Bit, bitVal)
      .input("ly_do", sql.NVarChar, ly_do || null)
      .input("nguoi_duyet", sql.NVarChar, nguoi_duyet)
      .query(`
        UPDATE phien_hoc_dat
        SET ${updateColumn} = @val,
            ${reasonColumn} = @ly_do,
            nguoi_thay_doi = @nguoi_duyet,
            thoi_gian_thay_doi = SYSDATETIME(),
            updated_at = SYSDATETIME()
        WHERE ma_dk = @ma_dk
      `);
  }

  // 2. Check if existing record in hoc_vien_duyet_log
  const checkResult = await pool
    .request()
    .input("ma_dk", sql.NVarChar, ma_dk)
    .input("loai_duyet", sql.NVarChar, loai_duyet)
    .query(`
      SELECT TOP 1 *
      FROM hoc_vien_duyet_log
      WHERE ma_dk = @ma_dk AND loai_duyet = @loai_duyet
    `);

  const existing = checkResult.recordset[0] || null;

  if (existing) {
    // UPDATE
    await pool
      .request()
      .input("ma_dk", sql.NVarChar, ma_dk)
      .input("loai_duyet", sql.NVarChar, loai_duyet)
      .input("trang_thai", sql.TinyInt, trang_thai)
      .input("ly_do", sql.NVarChar, ly_do || null)
      .input("nguoi_duyet", sql.NVarChar, nguoi_duyet)
      .query(`
        UPDATE hoc_vien_duyet_log
        SET trang_thai = @trang_thai,
            ly_do = @ly_do,
            nguoi_duyet = @nguoi_duyet,
            thoi_gian_duyet = SYSDATETIME()
        WHERE ma_dk = @ma_dk AND loai_duyet = @loai_duyet
      `);
  } else {
    // INSERT
    await pool
      .request()
      .input("ma_dk", sql.NVarChar, ma_dk)
      .input("loai_duyet", sql.NVarChar, loai_duyet)
      .input("trang_thai", sql.TinyInt, trang_thai)
      .input("ly_do", sql.NVarChar, ly_do || null)
      .input("nguoi_duyet", sql.NVarChar, nguoi_duyet)
      .query(`
        INSERT INTO hoc_vien_duyet_log
          (ma_dk, loai_duyet, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet)
        VALUES
          (@ma_dk, @loai_duyet, @trang_thai, @ly_do, @nguoi_duyet, SYSDATETIME())
      `);
  }

  // Return the full updated grouped approval object
  return getByMaDK(ma_dk);
};

module.exports = {
  getByMaDK,
  upsert,
};
