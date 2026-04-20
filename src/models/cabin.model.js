const mssql = require("mssql");
const connectSQL = require("../configs/sql");

async function getDatCabin(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const offset = (page - 1) * limit;

  let where = "WHERE tt.dat_cabin = 1";
  if (filters.maKhoa) {
    where += " AND tt.ma_khoa = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }
  if (filters.tenKhoa) {
    where += " AND kh.ten_khoa LIKE @tenKhoa";
    request.input("tenKhoa", `%${filters.tenKhoa}%`);
  }
  if (filters.hoTen) {
    where += " AND tt.ho_ten LIKE @hoTen";
    request.input("hoTen", `%${filters.hoTen}%`);
  }

  // đếm tổng - copy inputs sang request riêng
  const countReq = pool.request();
  if (filters.maKhoa) countReq.input("maKhoa", filters.maKhoa);
  if (filters.tenKhoa) countReq.input("tenKhoa", `%${filters.tenKhoa}%`);
  if (filters.hoTen) countReq.input("hoTen", `%${filters.hoTen}%`);

  const countResult = await countReq.query(`
    SELECT COUNT(*) AS total
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
  `);
  const total = countResult.recordset[0].total;

  request.input("offset", mssql.Int, offset);
  request.input("limit", mssql.Int, limit);

  const result = await request.query(`
    SELECT
      tt.ma_dk,
      tt.ma_khoa,
      tt.ho_ten,
      tt.cccd,
      tt.nam_sinh,
      kh.ten_khoa,
      ISNULL(tt.loai_ly_thuyet, 0) AS loai_ly_thuyet,
      ISNULL(tt.loai_het_mon,  0)  AS loai_het_mon,
      ISNULL(tt.dat_cabin,     0)  AS dat_cabin,
      tt.ghi_chu,
      tt.thoi_gian_thay_doi_trang_thai,
      tt.updated_at,
      tt.updated_by
    FROM trang_thai_hoc_vien tt
    LEFT JOIN khoa_hoc kh ON kh.ma_khoa = tt.ma_khoa
    ${where}
    ORDER BY tt.updated_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  return { data: result.recordset, total, page, limit };
}

async function createOrUpdate({
  ma_dk,
  ten_hoc_vien,
  ghi_chu,
  ma_khoa,
  ten_khoa,
}) {
  const pool = await connectSQL();

  await pool
    .request()
    .input("maDk", ma_dk)
    .input("tenHocVien", ten_hoc_vien ?? null)
    .input("ghiChu", ghi_chu ?? null)
    .input("maKhoa", ma_khoa ?? null)
    .input("tenKhoa", ten_khoa ?? null).query(`
      IF EXISTS (SELECT 1 FROM cabin_note WHERE ma_dk = @maDk)
        UPDATE cabin_note
        SET ten_hoc_vien = @tenHocVien,
            ghi_chu      = @ghiChu,
            ma_khoa      = @maKhoa,
            ten_khoa     = @tenKhoa,
            updated_at   = GETDATE()
        WHERE ma_dk = @maDk
      ELSE
        INSERT INTO cabin_note (ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at)
        VALUES (@maDk, @tenHocVien, @ghiChu, @maKhoa, @tenKhoa, GETDATE(), GETDATE())
    `);

  const updated = await pool
    .request()
    .input("maDk", ma_dk)
    .query(`SELECT * FROM cabin_note WHERE ma_dk = @maDk`);

  return updated.recordset[0] || null;
}

async function getAll({ page = 1, limit = 20, ma_khoa, ten_hoc_vien } = {}) {
  const pool = await connectSQL();
  const offset = (Number(page) - 1) * Number(limit);

  const whereClauses = [];
  const filterParams = {};

  if (ma_khoa) {
    whereClauses.push("ma_khoa = @maKhoa");
    filterParams.maKhoa = ma_khoa;
  }
  if (ten_hoc_vien) {
    whereClauses.push("ten_hoc_vien LIKE @tenHocVien");
    filterParams.tenHocVien = `%${ten_hoc_vien}%`;
  }

  const whereSQL =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const dataReq = pool.request();
  const countReq = pool.request();

  if (filterParams.maKhoa) {
    dataReq.input("maKhoa", filterParams.maKhoa);
    countReq.input("maKhoa", filterParams.maKhoa);
  }
  if (filterParams.tenHocVien) {
    dataReq.input("tenHocVien", filterParams.tenHocVien);
    countReq.input("tenHocVien", filterParams.tenHocVien);
  }

  dataReq.input("limit", Number(limit));
  dataReq.input("offset", offset);

  const [dataResult, countResult] = await Promise.all([
    dataReq.query(`
      SELECT ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa, created_at, updated_at
      FROM cabin_note
      ${whereSQL}
      ORDER BY updated_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `),
    countReq.query(`
      SELECT COUNT(*) AS total
      FROM cabin_note
      ${whereSQL}
    `),
  ]);

  const total = countResult.recordset[0]?.total ?? 0;

  return {
    data: dataResult.recordset,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
}

async function saveLichPhanBo(weekKey, assignments) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();
    const deleteRequest = new mssql.Request(transaction);
    const startDate = new Date(weekKey);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    deleteRequest.input("start", startDate);
    deleteRequest.input("end", endDate);
    await deleteRequest.query(`
      DELETE FROM cabin_lich_phan_bo 
      WHERE ngay >= @start AND ngay <= @end
    `);

    if (Array.isArray(assignments) && assignments.length > 0) {
      for (const item of assignments) {
        const isLocked = !!item.is_locked;
        const insertRequest = new mssql.Request(transaction);

        insertRequest.input("ma_dk", isLocked ? null : item.ma_dk || null);
        insertRequest.input("ngay", new Date(item.ngay));
        insertRequest.input("ca_hoc", parseInt(item.ca_hoc));
        insertRequest.input("cabin_so", parseInt(item.cabin_so));
        insertRequest.input("gio_bat_dau", item.gio_bat_dau || null);
        insertRequest.input("gio_ket_thuc", item.gio_ket_thuc || null);
        insertRequest.input("is_locked", isLocked ? 1 : 0);
        insertRequest.input("ghi_chu", item.ghi_chu || null);
        insertRequest.input("ma_khoa", isLocked ? null : item.ma_khoa || null);
        insertRequest.input("giao_vien", isLocked ? null : item.giao_vien || null);
        insertRequest.input("is_makeup", isLocked ? 0 : item.is_makeup ? 1 : 0);
        insertRequest.input(
          "is_thieu_gio",
          isLocked ? 0 : item.is_thieu_gio ? 1 : 0,
        );
        insertRequest.input(
          "thoi_gian_hoc",
          isLocked ? null : item.thoi_gian_hoc || null,
        );
        insertRequest.input(
          "thoi_gian_tong",
          isLocked ? null : item.thoi_gian_tong || null,
        );

        await insertRequest.query(`
          INSERT INTO cabin_lich_phan_bo (
            ma_dk, ngay, ca_hoc, cabin_so, gio_bat_dau, gio_ket_thuc, 
            is_locked, ghi_chu, ma_khoa, giao_vien, 
            is_makeup, is_thieu_gio, thoi_gian_hoc, thoi_gian_tong, so_lan_chia
          )
          VALUES (
            @ma_dk, @ngay, @ca_hoc, @cabin_so, @gio_bat_dau, @gio_ket_thuc, 
            @is_locked, @ghi_chu, @ma_khoa, @giao_vien, 
            @is_makeup, @is_thieu_gio, @thoi_gian_hoc, @thoi_gian_tong, 1
          )
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

async function getLichPhanBo(weekKey) {
  const pool = await connectSQL();
  const startDate = new Date(weekKey);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const result = await pool
    .request()
    .input("start", startDate)
    .input("end", endDate).query(`
      SELECT * FROM cabin_lich_phan_bo
      WHERE ngay >= @start AND ngay <= @end
      ORDER BY ngay, ca_hoc, cabin_so
    `);

  return result.recordset;
}

async function updateLichNote(id, ghi_chu) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("id", id)
    .input("ghi_chu", ghi_chu ?? null)
    .query(`UPDATE cabin_lich_phan_bo SET ghi_chu = @ghi_chu WHERE id = @id`);

  return true;
}

async function updateSoLanChia(id, count) {
  const pool = await connectSQL();
  await pool
    .request()
    .input("id", id)
    .input("count", mssql.Int, count)
    .query(`UPDATE cabin_lich_phan_bo SET so_lan_chia = @count WHERE id = @id`);

  return true;
}

async function getPastAssignments(maDkList) {
  if (!Array.isArray(maDkList) || maDkList.length === 0) return [];
  const pool = await connectSQL();
  const request = pool.request();
  
  // Lấy các ca học trong quá khứ chưa được đánh dấu là lỡ (so_lan_chia = 1)
  // Và chỉ lấy các bản ghi có ma_dk (đã gán học viên)
  const query = `
    SELECT id, ma_dk, ngay, ca_hoc, so_lan_chia, is_makeup
    FROM cabin_lich_phan_bo
    WHERE so_lan_chia = 1 
      AND (ngay < CAST(GETDATE() AS DATE) 
           OR (ngay = CAST(GETDATE() AS DATE) AND ca_hoc < 7)) -- Giả định ca 7 là buổi tối, hoặc đơn giản là lấy ngày < today
      AND ma_dk IN (${maDkList.map((id, index) => `@id${index}`).join(", ")})
  `;

  maDkList.forEach((id, index) => {
    request.input(`id${index}`, id);
  });

  const result = await request.query(query);
  return result.recordset;
}

async function updateSoLanChiaBatch(ids, count) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const pool = await connectSQL();
  const request = pool.request();
  
  await request.query(`
    UPDATE cabin_lich_phan_bo 
    SET so_lan_chia = ${parseInt(count)}
    WHERE id IN (${ids.join(", ")})
  `);
  return true;
}

async function getCabinStudentListSQL(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();

  let where = "WHERE tt.loai_ly_thuyet = 1 AND tt.loai_het_mon = 1";

  if (filters.maKhoa) {
    where += " AND tt.ma_khoa = @maKhoa";
    request.input("maKhoa", filters.maKhoa);
  }

  if (filters.hoTen) {
    where += " AND (hv.ho_ten LIKE @hoTen OR dk.ho_ten LIKE @hoTen)";
    request.input("hoTen", `%${filters.hoTen}%`);
  }

  const result = await request.query(`
    SELECT 
      tt.ma_dk,
      -- Lấy ma_khoa chuẩn từ bảng khoa_hoc
      ISNULL(kh.ma_khoa, tt.ma_khoa) AS ma_khoa,
      tt.code,
      tt.loai_ly_thuyet,
      tt.loai_het_mon,
      tt.dat_cabin,
      tt.ghi_chu,
      tt.updated_at AS status_updated_at,
      
      -- Thông tin từ tien_do_dao_tao
      td.ngay_khai_giang,
      td.bat_dau_cabin,
      td.ket_thuc_cabin,
      
      -- Thông tin từ hoc_vien
      hv.ho_ten,
      hv.cccd,
      hv.ngay_sinh,
      hv.gioi_tinh,
      hv.hang AS hang_gplx,
      
      -- Thông tin từ dang_ky_xe_gv
      dk.giao_vien,
      dk.xe_b1,
      dk.xe_b2,
      -- Tên khóa hiển thị chuẩn
      ISNULL(kh.ten_khoa, dk.khoa) AS ten_khoa,

      -- Thông tin chia lịch (lấy bản ghi mới nhất)
      lich.so_lan_chia,
      lich.is_makeup
    FROM trang_thai_ly_thuyet tt
    LEFT JOIN khoa_hoc kh ON tt.code = kh.code
    -- Tối ưu JOIN bằng cách sử dụng ISNULL để tránh toán tử OR
    LEFT JOIN tien_do_dao_tao td ON td.ma_khoa = ISNULL(kh.ma_khoa, tt.ma_khoa)
    LEFT JOIN hoc_vien hv ON tt.ma_dk = hv.ma_dk
    LEFT JOIN dang_ky_xe_gv dk ON tt.ma_dk = dk.ma_dk
    -- JOIN để lấy thông tin lần chia lịch gần nhất
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
}

async function getTeacherByMaDkList(maDkList) {
  if (!Array.isArray(maDkList) || maDkList.length === 0) return [];
  const pool = await connectSQL();
  const request = pool.request();

  // Tạo câu truy vấn IN với danh sách mã đăng ký
  // Lưu ý: với số lượng lớn có thể cần tối ưu, nhưng ở đây thường là danh sách học viên của 1 ca (ít)
  const query = `
    SELECT ma_dk, giao_vien 
    FROM dang_ky_xe_gv 
    WHERE ma_dk IN (${maDkList.map((id, index) => `@id${index}`).join(", ")})
  `;

  maDkList.forEach((id, index) => {
    request.input(`id${index}`, id);
  });

  const result = await request.query(query);
  return result.recordset;
}

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
  getCabinStudentListSQL,
  getTeacherByMaDkList,
};
