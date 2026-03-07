const connectSQL = require("../configs/sql");
const sql = require("mssql");

const toNullableString = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

const getPhienHocDATByMaDK = async (ma_dk) => {
  const pool = await connectSQL();
  const result = await pool.request().input("ma_dk", sql.VarChar, ma_dk).query(`
      SELECT
        id,
        phien_hoc_id,
        ma_dk,
        ma_hoc_vien,
        ngay,
        gio_tu      AS gio_vao,
        gio_den     AS gio_ra,
        bien_so_xe,
        so_km       AS tong_km,
        thoi_gian,
        trang_thai,
        nguoi_thay_doi,
        thoi_gian_thay_doi,
        updated_at
      FROM phien_hoc_dat
      WHERE ma_dk = @ma_dk
      ORDER BY ngay DESC, gio_tu DESC
    `);
  return result.recordset;
};

const updateTrangThaiPhienHocDAT = async ({
  ma_dk,
  phien_hoc_id,
  trang_thai,
  nguoi_thay_doi,
  ngay,
  gio_tu,
  gio_den,
  bien_so_xe,
  so_km,
  thoi_gian,
  ma_hoc_vien,
}) => {
  const pool = await connectSQL();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Kiểm tra bản ghi đã tồn tại chưa
    const checkResult = await transaction
      .request()
      .input("ma_dk", sql.VarChar, ma_dk)
      .input("phien_hoc_id", sql.Int, phien_hoc_id).query(`
        SELECT TOP 1 id, trang_thai
        FROM phien_hoc_dat
        WHERE ma_dk = @ma_dk AND phien_hoc_id = @phien_hoc_id
      `);

    const existing = checkResult.recordset[0] || null;
    let rowsAffected = 0;
    let action = "";

    if (existing) {
      // UPDATE
      const updateResult = await transaction
        .request()
        .input("ma_dk", sql.VarChar, ma_dk)
        .input("phien_hoc_id", sql.Int, phien_hoc_id)
        .input("trang_thai", sql.NVarChar, trang_thai)
        .input("nguoi_thay_doi", sql.NVarChar, nguoi_thay_doi)
        .input("ngay", sql.VarChar, toNullableString(ngay))
        .input("gio_tu", sql.VarChar, toNullableString(gio_tu))
        .input("gio_den", sql.VarChar, toNullableString(gio_den))
        .input("bien_so_xe", sql.VarChar, toNullableString(bien_so_xe))
        .input("so_km", sql.Float, so_km ?? null)
        .input("thoi_gian", sql.NVarChar, toNullableString(thoi_gian))
        .input("ma_hoc_vien", sql.NVarChar, toNullableString(ma_hoc_vien))
        .query(`
          UPDATE phien_hoc_dat
          SET trang_thai         = @trang_thai,
              nguoi_thay_doi     = @nguoi_thay_doi,
              thoi_gian_thay_doi = SYSDATETIME(),
              updated_at         = SYSDATETIME(),
              ngay               = COALESCE(@ngay,       ngay),
              gio_tu             = COALESCE(@gio_tu,     gio_tu),
              gio_den            = COALESCE(@gio_den,    gio_den),
              bien_so_xe         = COALESCE(@bien_so_xe, bien_so_xe),
              so_km              = COALESCE(@so_km,      so_km),
              thoi_gian          = COALESCE(@thoi_gian,  thoi_gian),
              ma_hoc_vien        = COALESCE(@ma_hoc_vien, ma_hoc_vien)
          WHERE ma_dk = @ma_dk AND phien_hoc_id = @phien_hoc_id
        `);
      rowsAffected = updateResult.rowsAffected[0];
      action = "updated";
    } else {
      // INSERT
      const insertResult = await transaction
        .request()
        .input("phien_hoc_id", sql.Int, phien_hoc_id)
        .input("ma_dk", sql.VarChar, ma_dk)
        .input("trang_thai", sql.NVarChar, trang_thai)
        .input("nguoi_thay_doi", sql.NVarChar, nguoi_thay_doi)
        .input("ngay", sql.VarChar, toNullableString(ngay))
        .input("gio_tu", sql.VarChar, toNullableString(gio_tu))
        .input("gio_den", sql.VarChar, toNullableString(gio_den))
        .input("bien_so_xe", sql.VarChar, toNullableString(bien_so_xe))
        .input("so_km", sql.Float, so_km ?? null)
        .input("thoi_gian", sql.NVarChar, toNullableString(thoi_gian))
        .input("ma_hoc_vien", sql.NVarChar, toNullableString(ma_hoc_vien))
        .query(`
          INSERT INTO phien_hoc_dat
            (phien_hoc_id, ma_dk, ma_hoc_vien, ngay, gio_tu, gio_den,
             bien_so_xe, so_km, thoi_gian, trang_thai,
             nguoi_thay_doi, thoi_gian_thay_doi, updated_at)
          VALUES
            (@phien_hoc_id, @ma_dk, @ma_hoc_vien, @ngay, @gio_tu, @gio_den,
             @bien_so_xe, @so_km, @thoi_gian, @trang_thai,
             @nguoi_thay_doi, SYSDATETIME(), SYSDATETIME())
        `);
      rowsAffected = insertResult.rowsAffected[0];
      action = "inserted";
    }

    // Ghi lịch sử
    // await transaction
    //   .request()
    //   .input("ma_dk", sql.VarChar, ma_dk)
    //   .input("truong_thay_doi", sql.VarChar, "trang_thai")
    //   .input("gia_tri_cu", sql.NVarChar, existing?.trang_thai || null)
    //   .input("gia_tri_moi", sql.NVarChar, trang_thai)
    //   .input("nguoi_thay_doi", sql.NVarChar, nguoi_thay_doi).query(`
    //     IF OBJECT_ID(N'dbo.lich_su_thay_doi', N'U') IS NOT NULL
    //     BEGIN
    //       INSERT INTO lich_su_thay_doi (ma_dk, truong_thay_doi, gia_tri_cu, gia_tri_moi, nguoi_thay_doi)
    //       VALUES (@ma_dk, @truong_thay_doi, @gia_tri_cu, @gia_tri_moi, @nguoi_thay_doi)
    //     END
    //   `);

    await transaction.commit();
    return { rowsAffected, action };
  } catch (err) {
    if (!transaction._aborted) await transaction.rollback();
    throw err;
  }
};

module.exports = { getPhienHocDATByMaDK, updateTrangThaiPhienHocDAT };
