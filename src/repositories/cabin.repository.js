const mssql = require("mssql");
const connectSQL = require("../configs/sql");

const getDatCabin = async (filters = {}) => {
  const pool = await connectSQL();
  const req = pool.request();
  
  let where = "WHERE tt.dat_cabin = 1";
  if (filters.maKhoa) { where += " AND tt.ma_khoa = @maKhoa"; req.input("maKhoa", filters.maKhoa); }
  if (filters.tenKhoa) { where += " AND kh.ten_khoa LIKE @tenKhoa"; req.input("tenKhoa", `%${filters.tenKhoa}%`); }
  if (filters.hoTen) { where += " AND tt.ho_ten LIKE @hoTen"; req.input("hoTen", `%${filters.hoTen}%`); }

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  req.input("offset", mssql.Int, (page - 1) * limit);
  req.input("limit", mssql.Int, limit);

  const { recordset } = await req.query(`
    SELECT
      tt.ma_dk, tt.ma_khoa, tt.ho_ten, tt.cccd, tt.nam_sinh, kh.ten_khoa,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0)  AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0)  AS dat_cabin,
      tt.ghi_chu, tt.thoi_gian_thay_doi_trang_thai, tt.updated_at, tt.updated_by,
      COUNT(*) OVER() AS total
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
    ORDER BY tt.updated_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const total = recordset[0]?.total || 0;
  return { data: recordset, total, page, limit };
};

const createOrUpdate = async (data) => {
  const pool = await connectSQL();
  const req = pool.request();
  req.input("maDk", data.ma_dk)
     .input("tenHocVien", data.ten_hoc_vien ?? null)
     .input("ghiChu", data.ghi_chu ?? null)
     .input("maKhoa", data.ma_khoa ?? null)
     .input("tenKhoa", data.ten_khoa ?? null);

  await req.query(`
    IF EXISTS (SELECT 1 FROM cabin_note WHERE ma_dk = @maDk)
      UPDATE cabin_note SET ten_hoc_vien = @tenHocVien, ghi_chu = @ghiChu, ma_khoa = @maKhoa, ten_khoa = @tenKhoa, updated_at = GETDATE() WHERE ma_dk = @maDk
    ELSE
      INSERT INTO cabin_note (ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at)
      VALUES (@maDk, @tenHocVien, @ghiChu, @maKhoa, @tenKhoa, GETDATE(), GETDATE())
  `);

  const result = await pool.request().input("maDk", data.ma_dk).query(`SELECT * FROM cabin_note WHERE ma_dk = @maDk`);
  return result.recordset[0] || null;
};

const getAll = async ({ page = 1, limit = 20, ma_khoa, ten_hoc_vien } = {}) => {
  const pool = await connectSQL();
  const req = pool.request();
  
  let where = "";
  const conditions = [];
  if (ma_khoa) { conditions.push("ma_khoa = @maKhoa"); req.input("maKhoa", ma_khoa); }
  if (ten_hoc_vien) { conditions.push("ten_hoc_vien LIKE @tenHocVien"); req.input("tenHocVien", `%${ten_hoc_vien}%`); }
  if (conditions.length > 0) where = `WHERE ${conditions.join(" AND ")}`;

  const offset = (Number(page) - 1) * Number(limit);
  req.input("limit", Number(limit)).input("offset", offset);

  const { recordset } = await req.query(`
    SELECT ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at,
           COUNT(*) OVER() AS total
    FROM cabin_note
    ${where}
    ORDER BY updated_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const total = recordset[0]?.total ?? 0;
  return {
    data: recordset,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

const insertSingleAssignment = async (transaction, item) => {
  const req = new mssql.Request(transaction);
  const isLocked = !!item.is_locked;
  
  const fields = {
    ma_dk: isLocked ? null : item.ma_dk || null,
    ngay: new Date(item.ngay),
    ca_hoc: parseInt(item.ca_hoc),
    cabin_so: parseInt(item.cabin_so),
    gio_bat_dau: item.gio_bat_dau || null,
    gio_ket_thuc: item.gio_ket_thuc || null,
    is_locked: isLocked ? 1 : 0,
    ghi_chu: item.ghi_chu || null,
    ma_khoa: isLocked ? null : item.ma_khoa || null,
    giao_vien: isLocked ? null : item.giao_vien || null,
    is_makeup: isLocked ? 0 : item.is_makeup ? 1 : 0,
    is_thieu_gio: isLocked ? 0 : item.is_thieu_gio ? 1 : 0,
    thoi_gian_hoc: isLocked ? null : item.thoi_gian_hoc || null,
    thoi_gian_tong: isLocked ? null : item.thoi_gian_tong || null,
    so_lan_chia: null, // Mặc định tất cả số lần chia là null khi lưu lịch mới
  };

  Object.entries(fields).forEach(([k, v]) => req.input(k, v));
  return req.query(`
    INSERT INTO cabin_lich_phan_bo (ma_dk, ngay, ca_hoc, cabin_so, gio_bat_dau, gio_ket_thuc, is_locked, ghi_chu, ma_khoa, giao_vien, is_makeup, is_thieu_gio, thoi_gian_hoc, thoi_gian_tong, so_lan_chia)
    VALUES (@ma_dk, @ngay, @ca_hoc, @cabin_so, @gio_bat_dau, @gio_ket_thuc, @is_locked, @ghi_chu, @ma_khoa, @giao_vien, @is_makeup, @is_thieu_gio, @thoi_gian_hoc, @thoi_gian_tong, @so_lan_chia)
  `);
};

const saveLichPhanBo = async (weekKey, assignments) => {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();
    const startDate = new Date(weekKey);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    await new mssql.Request(transaction).input("start", startDate).input("end", endDate)
      .query(`DELETE FROM cabin_lich_phan_bo WHERE ngay >= @start AND ngay <= @end`);

    if (Array.isArray(assignments)) {
      for (const item of assignments) {
        await insertSingleAssignment(transaction, item);
      }
    }
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const getLichPhanBo = async (weekKey) => {
  const pool = await connectSQL();
  const startDate = new Date(weekKey);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const result = await pool.request()
    .input("start", startDate)
    .input("end", endDate)
    .query(`SELECT * FROM cabin_lich_phan_bo WHERE ngay >= @start AND ngay <= @end ORDER BY ngay, ca_hoc, cabin_so`);
  return result.recordset;
};

const updateLichNote = async (id, ghi_chu) => {
  const pool = await connectSQL();
  await pool.request().input("id", id).input("ghi_chu", ghi_chu ?? null)
    .query(`UPDATE cabin_lich_phan_bo SET ghi_chu = @ghi_chu WHERE id = @id`);
  return true;
};

const updateSoLanChia = async (id, count) => {
  const pool = await connectSQL();
  await pool.request().input("id", id).input("count", mssql.Int, count)
    .query(`UPDATE cabin_lich_phan_bo SET so_lan_chia = @count WHERE id = @id`);
  return true;
};

const getPastAssignments = async (maDkList) => {
  if (!Array.isArray(maDkList) || maDkList.length === 0) return [];
  const pool = await connectSQL();
  const req = pool.request();

  const clauses = maDkList.map((id, index) => {
    req.input(`id${index}`, id);
    return `@id${index}`;
  });

  const result = await req.query(`
    SELECT id, ma_dk, ngay, ca_hoc, so_lan_chia, is_makeup
    FROM cabin_lich_phan_bo
    WHERE so_lan_chia = 1 
      AND (ngay < CAST(GETDATE() AS DATE) OR (ngay = CAST(GETDATE() AS DATE) AND ca_hoc < 7))
      AND ma_dk IN (${clauses.join(", ")})
  `);
  return result.recordset;
};

const updateSoLanChiaBatch = async (ids, count) => {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const pool = await connectSQL();
  await pool.request()
    .query(`UPDATE cabin_lich_phan_bo SET so_lan_chia = ${parseInt(count)} WHERE id IN (${ids.join(", ")})`);
  return true;
};

const incrementSoLanChiaBatch = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const pool = await connectSQL();
  await pool.request()
    .query(`UPDATE cabin_lich_phan_bo SET so_lan_chia = ISNULL(so_lan_chia, 0) + 1 WHERE id IN (${ids.join(", ")})`);
  return true;
};

const getCabinStudentListSQL = async (filters = {}) => {
  const pool = await connectSQL();
  const req = pool.request();

  let where = "WHERE tt.loai_ly_thuyet = 1 AND tt.loai_het_mon = 1 AND (ISNULL(kh.ma_khoa, tt.ma_khoa) LIKE '%K2[6-9]%' OR ISNULL(kh.ma_khoa, tt.ma_khoa) LIKE '%K[3-9]%')";
  if (filters.maKhoa) { where += " AND tt.ma_khoa = @maKhoa"; req.input("maKhoa", filters.maKhoa); }
  if (filters.hoTen) { where += " AND (hv.ho_ten LIKE @hoTen OR dk.ho_ten LIKE @hoTen)"; req.input("hoTen", `%${filters.hoTen}%`); }

  const result = await req.query(`
    SELECT 
      tt.ma_dk, ISNULL(kh.ma_khoa, tt.ma_khoa) AS ma_khoa, tt.code, tt.updated_at AS status_updated_at,
      td.ket_thuc_cabin, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.gioi_tinh, hv.hang AS hang_gplx,
      dk.giao_vien, ISNULL(kh.ten_khoa, dk.khoa) AS ten_khoa,
      lich.so_lan_chia, lich.is_makeup
    FROM trang_thai_ly_thuyet tt
    LEFT JOIN khoa_hoc kh ON tt.code = kh.code
    LEFT JOIN tien_do_dao_tao td ON td.ma_khoa = ISNULL(kh.ma_khoa, tt.ma_khoa)
    LEFT JOIN hoc_vien hv ON tt.ma_dk = hv.ma_dk
    LEFT JOIN dang_ky_xe_gv dk ON tt.ma_dk = dk.ma_dk
    LEFT JOIN (
      SELECT ma_dk, MAX(so_lan_chia) AS so_lan_chia, MAX(CAST(is_makeup AS INT)) AS is_makeup
      FROM cabin_lich_phan_bo
      WHERE ma_dk IS NOT NULL
      GROUP BY ma_dk
    ) lich ON tt.ma_dk = lich.ma_dk
    ${where}
    ORDER BY tt.updated_at DESC
  `);
  return result.recordset;
};

const getCabinMakeupStudentListSQL = async (filters = {}) => {
  const pool = await connectSQL();
  const req = pool.request();

  let where = "WHERE hb.loai_thuc_hanh = 'cabin' AND hb.khoa_bu_thuc_hanh IS NOT NULL AND hb.khoa_bu_thuc_hanh <> ''";
  if (filters.maKhoa) { where += " AND hb.khoa_bu_thuc_hanh = @maKhoa"; req.input("maKhoa", filters.maKhoa); }
  if (filters.hoTen) { where += " AND (hv.ho_ten LIKE @hoTen OR dk.ho_ten LIKE @hoTen)"; req.input("hoTen", `%${filters.hoTen}%`); }

  const result = await req.query(`
    SELECT 
      hb.ma_dk, hb.ma_khoa, kh.code, hb.updated_at AS status_updated_at,
      td.ket_thuc_cabin, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.gioi_tinh, hv.hang AS hang_gplx,
      dk.giao_vien, ISNULL(kh.ten_khoa, dk.khoa) AS ten_khoa,
      lich.so_lan_chia,
      1 AS is_makeup
    FROM [dbo].[hoc_bu_new] hb WITH (NOLOCK)
    LEFT JOIN [dbo].[khoa_hoc] kh ON hb.ma_khoa = kh.ma_khoa
    LEFT JOIN [dbo].[tien_do_dao_tao] td ON td.ma_khoa = hb.khoa_bu_thuc_hanh
    LEFT JOIN [dbo].[hoc_vien] hv ON hb.ma_dk = hv.ma_dk
    LEFT JOIN [dbo].[dang_ky_xe_gv] dk ON hb.ma_dk = dk.ma_dk
    LEFT JOIN (
      SELECT ma_dk, MAX(so_lan_chia) AS so_lan_chia
      FROM [dbo].[cabin_lich_phan_bo]
      WHERE ma_dk IS NOT NULL
      GROUP BY ma_dk
    ) lich ON hb.ma_dk = lich.ma_dk
    ${where}
    ORDER BY hb.updated_at DESC
  `);
  return result.recordset;
};

const getTeacherByMaDkList = async (maDkList) => {
  if (!Array.isArray(maDkList) || maDkList.length === 0) return [];
  const pool = await connectSQL();
  const req = pool.request();

  const clauses = maDkList.map((id, idx) => {
    req.input(`id${idx}`, id);
    return `@id${idx}`;
  });

  const result = await req.query(`SELECT ma_dk, giao_vien FROM dang_ky_xe_gv WHERE ma_dk IN (${clauses.join(", ")})`);
  return result.recordset;
};

const getAssignmentsForVerification = async ({ today, nowTime } = {}) => {
  const pool = await connectSQL();
  const req = pool.request();
  req.input("today", mssql.VarChar, today);
  req.input("now_time", mssql.VarChar, nowTime);
  const result = await req.query(`
    SELECT 
      l.id AS assignment_id,
      l.ma_dk,
      l.ngay,
      l.ca_hoc,
      l.cabin_so,
      l.so_lan_chia,
      l.is_makeup,
      l.ma_khoa,
      l.giao_vien,
      hv.ho_ten,
      hv.cccd,
      hv.ngay_sinh,
      hv.gioi_tinh,
      dk.giao_vien AS gv_dang_ky
    FROM cabin_lich_phan_bo l
    LEFT JOIN hoc_vien hv ON l.ma_dk = hv.ma_dk
    LEFT JOIN dang_ky_xe_gv dk ON l.ma_dk = dk.ma_dk
    WHERE l.ma_dk IS NOT NULL
      AND (
        l.ngay < @today 
        OR (l.ngay = @today AND l.gio_ket_thuc < @now_time)
      )
  `);
  return result.recordset;
};

module.exports = {
  getDatCabin,
  createOrUpdate,
  getAll,
  saveLichPhanBo,
  getLichPhanBo,
  updateLichNote,
  updateSoLanChia,
  getPastAssignments,
  updateSoLanChiaBatch,
  incrementSoLanChiaBatch,
  getCabinStudentListSQL,
  getCabinMakeupStudentListSQL,
  getTeacherByMaDkList,
  getAssignmentsForVerification,
};
