const connectSQL = require("../configs/sql");
const sql = require("mssql");
const { logChanges } = require("../utils/logChanges");

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
        ly_do_tong,
        ly_do_td,
        ly_do_dem,  
        duyet_tong,
        duyet_tu_dong,
        duyet_dem, 
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
    SELECT TOP 1 *
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

      await logChanges(transaction, {
        ma_dk,
        loai: "phien_hoc_dat",
        ref_id: phien_hoc_id,
        oldData: existing,
        newData: {
          trang_thai,
          ngay: toNullableString(ngay) ?? existing.ngay,
          gio_tu: toNullableString(gio_tu) ?? existing.gio_tu,
          gio_den: toNullableString(gio_den) ?? existing.gio_den,
          bien_so_xe: toNullableString(bien_so_xe) ?? existing.bien_so_xe,
          so_km: so_km ?? existing.so_km,
          thoi_gian: toNullableString(thoi_gian) ?? existing.thoi_gian,
          ma_hoc_vien: toNullableString(ma_hoc_vien) ?? existing.ma_hoc_vien,
        },
        nguoi_thay_doi,
      });
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

      await logChanges(transaction, {
        ma_dk,
        loai: "phien_hoc_dat",
        ref_id: phien_hoc_id,
        oldData: null,
        newData: {
          trang_thai,
          ngay: toNullableString(ngay),
          gio_tu: toNullableString(gio_tu),
          gio_den: toNullableString(gio_den),
          bien_so_xe: toNullableString(bien_so_xe),
          so_km: so_km ?? null,
          thoi_gian: toNullableString(thoi_gian),
          ma_hoc_vien: toNullableString(ma_hoc_vien),
        },
        nguoi_thay_doi,
      });
    }

    await transaction.commit();
    return { rowsAffected, action };
  } catch (err) {
    if (!transaction._aborted) await transaction.rollback();
    throw err;
  }
};

const updateDuyetByMaDK = async ({
  ma_dk,
  duyet_tong,
  duyet_tu_dong,
  duyet_dem,
  ly_do_tong,
  ly_do_td,
  ly_do_dem,
  nguoi_thay_doi,
}) => {
  const pool = await connectSQL();

  const result = await pool
    .request()
    .input("ma_dk", sql.VarChar, ma_dk)
    .input("duyet_tong", sql.Bit, duyet_tong ?? null)
    .input("duyet_tu_dong", sql.Bit, duyet_tu_dong ?? null)
    .input("duyet_dem", sql.Bit, duyet_dem ?? null)
    .input("ly_do_tong", sql.NVarChar, ly_do_tong ?? null)
    .input("ly_do_td", sql.NVarChar, ly_do_td ?? null)
    .input("ly_do_dem", sql.NVarChar, ly_do_dem ?? null)
    .input("nguoi_thay_doi", sql.NVarChar, nguoi_thay_doi || "SYSTEM").query(`
      UPDATE phien_hoc_dat
      SET duyet_tong         = COALESCE(@duyet_tong, duyet_tong),
          duyet_tu_dong      = COALESCE(@duyet_tu_dong, duyet_tu_dong),
          duyet_dem          = COALESCE(@duyet_dem, duyet_dem),
          ly_do_tong         = COALESCE(@ly_do_tong, ly_do_tong),
          ly_do_td           = COALESCE(@ly_do_td, ly_do_td),
          ly_do_dem          = COALESCE(@ly_do_dem, ly_do_dem),
          nguoi_thay_doi     = @nguoi_thay_doi,
          thoi_gian_thay_doi = SYSDATETIME(),
          updated_at         = SYSDATETIME()
      WHERE ma_dk = @ma_dk
    `);

  return {
    rowsAffected: result.rowsAffected[0] || 0,
    action: "updated_all_by_ma_dk",
  };
};

module.exports = {
  getPhienHocDATByMaDK,
  updateTrangThaiPhienHocDAT,
  updateDuyetByMaDK,
};
