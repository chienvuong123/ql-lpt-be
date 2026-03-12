const mssql = require("mssql");
const connectSQL = require("../configs/sql");

const VALID_FIELDS = ["loai_ly_thuyet", "loai_het_mon", "dat_cabin"];

async function getAll(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  let where = "WHERE 1=1";
  if (filters.maKhoa) {
    where += " AND tt.ma_khoa = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }
  if (filters.tenKhoa) {
    where += " AND kh.ten_khoa LIKE @tenKhoa";
    request.input("tenKhoa", `%${filters.tenKhoa}%`);
  }

  const result = await request.query(`
    SELECT
      tt.ma_dk,
      tt.ma_khoa,
      tt.ho_ten,
      tt.cccd,
      tt.nam_sinh,
      kh.ten_khoa,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0) AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0) AS dat_cabin,
      tt.ghi_chu,
      tt.thoi_gian_thay_doi_trang_thai,
      tt.updated_at,
      tt.updated_by
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
    ORDER BY tt.updated_at DESC
  `);
  return result.recordset;
}

async function getByMaDk(maDk) {
  const pool = await connectSQL();

  const result = await pool.request().input("maDk", mssql.VarChar, maDk).query(`
      SELECT TOP 1 *
      FROM trang_thai_hoc_vien
      WHERE ma_dk = @maDk
    `);

  return result.recordset[0] || null;
}

async function getByMaDkDirect(maDk) {
  const pool = await connectSQL();
  const result = await pool.request().input("maDk", maDk).query(`
    SELECT
      ma_dk,
      ho_ten,
      cccd,
      nam_sinh,
      loai_ly_thuyet,
      loai_het_mon,
      dat_cabin,   
      ghi_chu,
      thoi_gian_thay_doi_trang_thai,
      updated_at,
      updated_by
    FROM trang_thai_hoc_vien
    WHERE ma_dk = @maDk
  `);
  return result.recordset[0] || null;
}

async function updateTrangThai(maDk, fields, updatedBy = null) {
  const validFields = Object.keys(fields).filter((f) =>
    VALID_FIELDS.includes(f),
  );
  const hasGhiChu = Object.prototype.hasOwnProperty.call(fields, "ghi_chu");
  const hasStatusUpdatedAt = Object.prototype.hasOwnProperty.call(
    fields,
    "status_updated_at",
  );
  const hasMaKhoa = Object.prototype.hasOwnProperty.call(fields, "ma_khoa");
  const hasTenKhoa = Object.prototype.hasOwnProperty.call(fields, "ten_khoa");

  if (
    validFields.length === 0 &&
    !hasGhiChu &&
    !hasStatusUpdatedAt &&
    !hasMaKhoa &&
    !hasTenKhoa
  ) {
    throw new Error("Khong co field hop le de cap nhat");
  }

  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();

    // UPSERT - không check FK
    const upsertReq = new mssql.Request(transaction);
    upsertReq.input("maDk", maDk);
    upsertReq.input("maKhoa", fields.ma_khoa ?? null);
    upsertReq.input("tenKhoa", fields.ten_khoa ?? null);
    await upsertReq.query(`
      IF NOT EXISTS (SELECT 1 FROM trang_thai_hoc_vien WHERE ma_dk = @maDk)
        INSERT INTO trang_thai_hoc_vien (ma_dk, ma_khoa, ten_khoa, updated_at)
        VALUES (@maDk, @maKhoa, @tenKhoa, GETDATE())
    `);

    // Lấy giá trị cũ để ghi lịch sử
    const oldReq = new mssql.Request(transaction);
    oldReq.input("maDk", maDk);
    const oldSelectFields = [...validFields];
    if (hasGhiChu) oldSelectFields.push("ghi_chu");
    const oldResult = await oldReq.query(
      `SELECT ${oldSelectFields.length ? oldSelectFields.join(", ") : "ma_dk"}
       FROM trang_thai_hoc_vien WHERE ma_dk = @maDk`,
    );
    const oldData = oldResult.recordset[0] || {};

    // Build UPDATE
    const setClauses = [];
    const updateReq = new mssql.Request(transaction);
    updateReq.input("maDk", maDk);
    updateReq.input("updatedBy", updatedBy);

    for (const field of validFields) {
      setClauses.push(`${field} = @${field}`);
      updateReq.input(field, fields[field] ? 1 : 0);
    }
    if (hasGhiChu) {
      setClauses.push("ghi_chu = @ghi_chu");
      updateReq.input("ghi_chu", fields.ghi_chu ?? null);
    }
    if (hasMaKhoa) {
      setClauses.push("ma_khoa = @ma_khoa");
      updateReq.input("ma_khoa", fields.ma_khoa ?? null);
    }
    if (hasTenKhoa) {
      setClauses.push("ten_khoa = @ten_khoa");
      updateReq.input("ten_khoa", fields.ten_khoa ?? null);
    }
    if (hasStatusUpdatedAt) {
      updateReq.input(
        "statusUpdatedAt",
        mssql.DateTime2,
        new Date(fields.status_updated_at),
      );
    }

    const timeClause = hasStatusUpdatedAt ? "@statusUpdatedAt" : "GETDATE()";
    const dynamicSet = setClauses.length > 0 ? `${setClauses.join(", ")},` : "";

    await updateReq.query(`
      UPDATE trang_thai_hoc_vien
      SET ${dynamicSet}
          thoi_gian_thay_doi_trang_thai = ${timeClause},
          updated_at = GETDATE(),
          updated_by = @updatedBy
      WHERE ma_dk = @maDk
    `);

    // Ghi lịch sử
    for (const field of validFields) {
      const oldValue = Number(oldData[field] ?? 0);
      const newValue = fields[field] ? 1 : 0;
      if (oldValue !== newValue) {
        const histReq = new mssql.Request(transaction);
        histReq.input("maDk", maDk);
        histReq.input("field", field);
        histReq.input("oldValue", oldValue);
        histReq.input("newValue", newValue);
        histReq.input("updatedBy", updatedBy);
        await histReq.query(`
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

async function updateHocVien(maDk, fields) {
  const allowed = ["ho_ten", "cccd", "nam_sinh"];
  const validFields = Object.keys(fields).filter((f) => allowed.includes(f));
  if (validFields.length === 0) return false;

  const pool = await connectSQL();
  const req = pool.request();
  req.input("maDk", maDk);

  const setClauses = [];
  if (fields.ho_ten !== undefined) {
    setClauses.push("ho_ten = @ho_ten");
    req.input("ho_ten", fields.ho_ten ?? null);
  }
  if (fields.cccd !== undefined) {
    setClauses.push("cccd = @cccd");
    req.input("cccd", fields.cccd ?? null);
  }
  if (fields.nam_sinh !== undefined) {
    setClauses.push("nam_sinh = @nam_sinh");
    req.input("nam_sinh", fields.nam_sinh ?? null);
  }

  await req.query(`
    UPDATE trang_thai_hoc_vien
    SET ${setClauses.join(", ")}
    WHERE ma_dk = @maDk
  `);
  return true;
}

async function updateTatCaTrangThai(fields, updatedBy = null) {
  const validFields = Object.keys(fields).filter((f) =>
    VALID_FIELDS.includes(f),
  );

  if (validFields.length === 0) {
    throw new Error("Khong co field hop le de cap nhat");
  }

  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();

    // Build UPDATE tất cả rows
    const setClauses = [];
    const updateReq = new mssql.Request(transaction);
    updateReq.input("updatedBy", updatedBy);

    for (const field of validFields) {
      setClauses.push(`${field} = @${field}`);
      updateReq.input(field, fields[field] ? 1 : 0);
    }

    const result = await updateReq.query(`
      UPDATE trang_thai_hoc_vien
      SET ${setClauses.join(", ")},
          updated_at = GETDATE(),
          updated_by = @updatedBy
    `);

    const histReq = new mssql.Request(transaction);
    histReq.input("updatedBy", updatedBy);
    histReq.input("fields", JSON.stringify(fields));
    await histReq.query(`
      INSERT INTO lich_su_thay_doi
        (ma_dk, truong_thay_doi, gia_tri_cu, gia_tri_moi, nguoi_thay_doi, thoi_gian)
      VALUES ('ALL', 'bulk_update', NULL, @fields, @updatedBy, GETDATE())
    `);

    await transaction.commit();
    return { rowsAffected: result.rowsAffected[0] };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  getAll,
  getByMaDk,
  getByMaDkDirect,
  updateTrangThai,
  getLichSu,
  updateHocVien,
  updateTatCaTrangThai,
  VALID_FIELDS,
};
