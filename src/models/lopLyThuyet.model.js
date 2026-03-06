const mssql = require("mssql");
const connectSQL = require("../configs/sql");

const VALID_FIELDS = [
  "loai_ly_thuyet",
  "loai_het_mon",
];

const SELECT_COLUMNS = `
  tt.ma_dk,
  hv.id,
  hv.ho_ten,
  hv.cccd,
  hv.nam_sinh,
  hv.khoa,
  hv.ma_khoa,
  kh.ten_khoa,
  hv.avatar_url,
  ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
  ISNULL(tt.loai_het_mon,  0) AS loai_het_mon,
  tt.ghi_chu,
  tt.thoi_gian_thay_doi_trang_thai,
  tt.updated_at,
  tt.updated_by
`;

const FROM_JOINS = `
  FROM hoc_vien hv
  LEFT JOIN trang_thai_hoc_vien tt ON hv.ma_dk = tt.ma_dk
  LEFT JOIN khoa_hoc kh            ON hv.ma_khoa = kh.ma_khoa
`;

async function getAll(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  let where = "";
  if (filters.maKhoa) {
    where = "WHERE hv.ma_khoa = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }

  const result = await request.query(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS} ${where} ORDER BY hv.id ASC`,
  );
  return result.recordset;
}

async function getByMaDk(maDk) {
  const pool = await connectSQL();
  const result = await pool
    .request()
    .input("maDk", maDk)
    .query(`
      SELECT ${SELECT_COLUMNS}
      FROM trang_thai_hoc_vien tt
      LEFT JOIN hoc_vien hv ON hv.ma_dk = tt.ma_dk
      LEFT JOIN khoa_hoc kh ON hv.ma_khoa = kh.ma_khoa
      WHERE tt.ma_dk = @maDk
    `);

  return result.recordset[0] || null;
}

async function updateTrangThai(maDk, fields, updatedBy = null) {
  const validFields = Object.keys(fields).filter((field) =>
    VALID_FIELDS.includes(field),
  );
  const hasGhiChu = Object.prototype.hasOwnProperty.call(fields, "ghi_chu");
  const hasStatusUpdatedAt = Object.prototype.hasOwnProperty.call(
    fields,
    "status_updated_at",
  );
  const statusUpdatedAt = hasStatusUpdatedAt
    ? new Date(fields.status_updated_at)
    : null;

  if (validFields.length === 0 && !hasGhiChu && !hasStatusUpdatedAt) {
    throw new Error("Khong co field hop le de cap nhat");
  }

  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();

    const upsertRequest = new mssql.Request(transaction);
    upsertRequest.input("maDk", maDk);
    await upsertRequest.query(`
      IF NOT EXISTS (SELECT 1 FROM trang_thai_hoc_vien WHERE ma_dk = @maDk)
      BEGIN
        INSERT INTO trang_thai_hoc_vien (ma_dk, thoi_gian_thay_doi_trang_thai, updated_at)
        VALUES (@maDk, GETDATE(), GETDATE())
      END
    `);

    const oldRequest = new mssql.Request(transaction);
    oldRequest.input("maDk", maDk);
    const oldSelectFields = [...validFields];
    if (hasGhiChu) {
      oldSelectFields.push("ghi_chu");
    }
    const oldResult = await oldRequest.query(
      `SELECT ${oldSelectFields.join(", ")} FROM trang_thai_hoc_vien WHERE ma_dk = @maDk`,
    );
    const oldData = oldResult.recordset[0] || {};

    const setClauses = [];
    const updateRequest = new mssql.Request(transaction);
    updateRequest.input("maDk", maDk);
    updateRequest.input("updatedBy", updatedBy);

    for (const field of validFields) {
      setClauses.push(`${field} = @${field}`);
      updateRequest.input(field, fields[field] ? 1 : 0);
    }
    if (hasGhiChu) {
      setClauses.push("ghi_chu = @ghi_chu");
      updateRequest.input("ghi_chu", fields.ghi_chu ?? null);
    }
    if (hasStatusUpdatedAt) {
      updateRequest.input("statusUpdatedAt", mssql.DateTime2, statusUpdatedAt);
    }

    const dynamicSet = setClauses.length > 0 ? `${setClauses.join(", ")},` : "";

    await updateRequest.query(`
      UPDATE trang_thai_hoc_vien
      SET ${dynamicSet}
          thoi_gian_thay_doi_trang_thai = ${hasStatusUpdatedAt ? "@statusUpdatedAt" : "GETDATE()"},
          updated_at = GETDATE(),
          updated_by = @updatedBy
      WHERE ma_dk = @maDk
    `);

    for (const field of validFields) {
      const oldValue = Number(oldData[field] ?? 0);
      const newValue = fields[field] ? 1 : 0;

      if (oldValue !== newValue) {
        const historyRequest = new mssql.Request(transaction);
        historyRequest.input("maDk", maDk);
        historyRequest.input("field", field);
        historyRequest.input("oldValue", oldValue);
        historyRequest.input("newValue", newValue);
        historyRequest.input("updatedBy", updatedBy);

        await historyRequest.query(`
          INSERT INTO lich_su_thay_doi
            (ma_dk, truong_thay_doi, gia_tri_cu, gia_tri_moi, nguoi_thay_doi, thoi_gian)
          VALUES (@maDk, @field, @oldValue, @newValue, @updatedBy, GETDATE())
        `);
      }
    }

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getLichSu(maDk) {
  const pool = await connectSQL();
  const result = await pool.request().input("maDk", maDk).query(`
    SELECT TOP (50) *
    FROM lich_su_thay_doi
    WHERE ma_dk = @maDk
    ORDER BY thoi_gian DESC
  `);

  return result.recordset;
}

module.exports = {
  getAll,
  getByMaDk,
  updateTrangThai,
  getLichSu,
  VALID_FIELDS,
};
