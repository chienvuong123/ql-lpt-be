const connectSQL = require("../configs/sql");
const sql = require("mssql");

const getByMaDK = async (ma_dk, trang_thai = null) => {
  const pool = await connectSQL();
  let query = `
    SELECT id, phien_hoc_dat_id, ma_dk, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet
    FROM phien_hoc_duyet_log
    WHERE ma_dk = @ma_dk
  `;
  const request = pool.request().input("ma_dk", sql.NVarChar, ma_dk);

  if (trang_thai !== null && trang_thai !== undefined) {
    request.input("trang_thai", sql.TinyInt, trang_thai);
    query += " AND trang_thai = @trang_thai";
  }

  query += " ORDER BY thoi_gian_duyet DESC";

  const result = await request.query(query);
  return result.recordset;
};

const upsert = async (phien_hoc_dat_id, { trang_thai, ly_do, nguoi_duyet, ma_dk }) => {
  const pool = await connectSQL();

  // Ensure the record with id = phien_hoc_dat_id exists in phien_hoc_dat to prevent Foreign Key errors
  const checkPhienResult = await pool
    .request()
    .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
    .query(`
      SELECT TOP 1 id FROM phien_hoc_dat WHERE id = @phien_hoc_dat_id
    `);

  const phienExists = checkPhienResult.recordset.length > 0;
  
  // Map trang_thai (0, 1, 2) to string status for phien_hoc_dat
  let statusString = "CHO_DUYET";
  if (trang_thai === 1) statusString = "DUYET";
  else if (trang_thai === 2) statusString = "HUY";

  if (!phienExists) {
    // INSERT into phien_hoc_dat using IDENTITY_INSERT
    await pool
      .request()
      .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
      .input("ma_dk", sql.NVarChar, ma_dk)
      .input("trang_thai", sql.NVarChar, statusString)
      .input("nguoi_thay_doi", sql.NVarChar, nguoi_duyet)
      .query(`
        SET IDENTITY_INSERT phien_hoc_dat ON;
        INSERT INTO phien_hoc_dat (id, ma_dk, trang_thai, nguoi_thay_doi, thoi_gian_thay_doi, updated_at, created_at)
        VALUES (@phien_hoc_dat_id, @ma_dk, @trang_thai, @nguoi_thay_doi, SYSDATETIME(), SYSDATETIME(), SYSDATETIME());
        SET IDENTITY_INSERT phien_hoc_dat OFF;
      `);
  } else {
    // UPDATE phien_hoc_dat
    await pool
      .request()
      .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
      .input("trang_thai", sql.NVarChar, statusString)
      .input("nguoi_thay_doi", sql.NVarChar, nguoi_duyet)
      .query(`
        UPDATE phien_hoc_dat
        SET trang_thai = @trang_thai,
            nguoi_thay_doi = @nguoi_thay_doi,
            thoi_gian_thay_doi = SYSDATETIME(),
            updated_at = SYSDATETIME()
        WHERE id = @phien_hoc_dat_id
      `);
  }

  // Check if existing record in phien_hoc_duyet_log
  const checkResult = await pool
    .request()
    .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
    .query(`
      SELECT TOP 1 *
      FROM phien_hoc_duyet_log
      WHERE phien_hoc_dat_id = @phien_hoc_dat_id
    `);

  const existing = checkResult.recordset[0] || null;

  if (existing) {
    // UPDATE
    await pool
      .request()
      .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
      .input("trang_thai", sql.TinyInt, trang_thai)
      .input("ly_do", sql.NVarChar, ly_do || null)
      .input("nguoi_duyet", sql.NVarChar, nguoi_duyet)
      .input("ma_dk", sql.NVarChar, ma_dk)
      .query(`
        UPDATE phien_hoc_duyet_log
        SET trang_thai = @trang_thai,
            ly_do = @ly_do,
            nguoi_duyet = @nguoi_duyet,
            ma_dk = @ma_dk,
            thoi_gian_duyet = SYSDATETIME()
        WHERE phien_hoc_dat_id = @phien_hoc_dat_id
      `);
  } else {
    // INSERT
    await pool
      .request()
      .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
      .input("trang_thai", sql.TinyInt, trang_thai)
      .input("ly_do", sql.NVarChar, ly_do || null)
      .input("nguoi_duyet", sql.NVarChar, nguoi_duyet)
      .input("ma_dk", sql.NVarChar, ma_dk)
      .query(`
        INSERT INTO phien_hoc_duyet_log
          (phien_hoc_dat_id, ma_dk, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet)
        VALUES
          (@phien_hoc_dat_id, @ma_dk, @trang_thai, @ly_do, @nguoi_duyet, SYSDATETIME())
      `);
  }

  // Retrieve and return the updated/inserted record
  const result = await pool
    .request()
    .input("phien_hoc_dat_id", sql.Int, phien_hoc_dat_id)
    .query(`
      SELECT id, phien_hoc_dat_id, ma_dk, trang_thai, ly_do, nguoi_duyet, thoi_gian_duyet
      FROM phien_hoc_duyet_log
      WHERE phien_hoc_dat_id = @phien_hoc_dat_id
    `);

  return result.recordset[0];
};

module.exports = {
  getByMaDK,
  upsert,
};
