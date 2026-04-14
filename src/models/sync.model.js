const mssql = require("mssql");
const connectSQL = require("../configs/sql");

/**
 * Upsert list of courses (enrolment plans) into khoa_hoc table
 * @param {Array} courses 
 */
async function upsertKhoaHoc(courses) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);

  try {
    await transaction.begin();
    for (const course of courses) {
      const request = new mssql.Request(transaction);
      request.input("ma_khoa", mssql.VarChar, course.code);
      request.input("ten_khoa", mssql.NVarChar, course.name);
      request.input("code", mssql.VarChar, String(course.iid));

      // Chuyển đổi timestamp sang Date (Lotus trả về timestamp giây)
      const startDate = course.start_date ? new Date(course.start_date * 1000) : null;
      const endDate = course.end_date ? new Date(course.end_date * 1000) : null;

      request.input("ngay_bat_dau", mssql.DateTime, startDate);
      request.input("ngay_ket_thuc", mssql.DateTime, endDate);
      request.input("total_member", mssql.Int, course.__expand?.learning_stats?.total_member || 0);

      await request.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[khoa_hoc] WHERE ma_khoa = @ma_khoa)
        BEGIN
          UPDATE [dbo].[khoa_hoc]
          SET ten_khoa = @ten_khoa,
              code = @code,
              ngay_bat_dau = @ngay_bat_dau,
              ngay_ket_thuc = @ngay_ket_thuc,
              total_member = @total_member,
              updated_at = GETDATE()
          WHERE ma_khoa = @ma_khoa
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[khoa_hoc] (ma_khoa, ten_khoa, code, ngay_bat_dau, ngay_ket_thuc, total_member)
          VALUES (@ma_khoa, @ten_khoa, @code, @ngay_bat_dau, @ngay_ket_thuc, @total_member)
        END
      `);
    }
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

function getRankFromCode(ma_khoa, currentRank) {
  // Loại bỏ các giá trị lỗi như bold, bold2, B.01old2 (do replace nhầm B thành B.01 trong chữ bold)
  if (currentRank && !/bold|old/i.test(currentRank)) {
    return currentRank.toUpperCase();
  }

  if (!ma_khoa) return currentRank;

  const code = ma_khoa.toUpperCase();
  if (code.includes("B01")) return "B1";
  if (/K\d+B/i.test(code)) return "B";
  if (/K\d+C/i.test(code)) return "C1";

  return currentRank;
}

async function upsertHocVien(students, planInfo) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);
  const ma_khoa = planInfo.code;

  // Use helper to detect correct rank
  const originalHang = planInfo.__expand?.program?.code || null;
  const hang = getRankFromCode(ma_khoa, originalHang);
  const hang_gplx = hang;

  try {
    await transaction.begin();
    for (const student of students) {
      const { user } = student;
      if (!user || !user.admission_code) continue;

      const request = new mssql.Request(transaction);
      request.input("ma_dk", mssql.VarChar, user.admission_code);
      request.input("ho_ten", mssql.NVarChar, user.name);
      request.input("ho", mssql.NVarChar, user.last_name || null);
      request.input("ten", mssql.NVarChar, user.first_name || null);
      request.input("cccd", mssql.VarChar, user.identification_card || null);

      const birthDay = user.birthday ? new Date(user.birthday * 1000) : null;
      request.input("ngay_sinh", mssql.DateTime, birthDay);

      request.input("gioi_tinh", mssql.NVarChar, user.sex || null);
      request.input("anh", mssql.NVarChar, user.avatar || null);
      request.input("ma_khoa", mssql.VarChar, ma_khoa);
      request.input("hang_gplx", mssql.NVarChar, hang_gplx);
      request.input("hang", mssql.NVarChar, hang);

      // Các trường khác nếu có trong DB nhưng chưa rõ mapping từ Lotus có thể để null hoặc default
      request.input("dia_chi", mssql.NVarChar, null);
      request.input("ma_csdt", mssql.NVarChar, "30004"); // Mã cơ sở đào tạo mặc định

      // Upsert hoc_vien
      await request.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[hoc_vien] WHERE ma_dk = @ma_dk)
        BEGIN
          UPDATE [dbo].[hoc_vien]
          SET ho_ten = @ho_ten,
              ho = @ho,
              ten = @ten,
              cccd = @cccd,
              ngay_sinh = @ngay_sinh,
              gioi_tinh = @gioi_tinh,
              anh = @anh,
              ma_khoa = @ma_khoa,
              hang_gplx = @hang_gplx,
              hang = @hang,
              ma_csdt = @ma_csdt,
              updated_at = GETDATE()
          WHERE ma_dk = @ma_dk
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[hoc_vien] 
            (ma_dk, ho_ten, ho, ten, cccd, ngay_sinh, gioi_tinh, anh, ma_khoa, hang_gplx, hang, ma_csdt)
          VALUES 
            (@ma_dk, @ho_ten, @ho, @ten, @cccd, @ngay_sinh, @gioi_tinh, @anh, @ma_khoa, @hang_gplx, @hang, @ma_csdt)
        END

        -- Ensure trang_thai_hoc_vien record exists
        IF NOT EXISTS (SELECT 1 FROM [dbo].[trang_thai_hoc_vien] WHERE ma_dk = @ma_dk)
        BEGIN
          INSERT INTO [dbo].[trang_thai_hoc_vien] (ma_dk, updated_at)
          VALUES (@ma_dk, GETDATE())
        END
      `);
    }
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Upsert training progress into tien_do_dao_tao table
 * @param {Object} data 
 */
async function upsertTienDoDaoTao(data) {
  const pool = await connectSQL();
  const request = new mssql.Request(pool);

  request.input("ma_khoa", mssql.NVarChar, data.ma_khoa);
  request.input("ngay_khai_giang", mssql.Date, data.ngay_khai_giang ? new Date(data.ngay_khai_giang) : null);
  request.input("bat_dau_ly_thuyet", mssql.Date, data.bat_dau_ly_thuyet ? new Date(data.bat_dau_ly_thuyet) : null);
  request.input("ket_thuc_ly_thuyet", mssql.Date, data.ket_thuc_ly_thuyet ? new Date(data.ket_thuc_ly_thuyet) : null);
  request.input("kiem_tra_het_mon", mssql.Date, data.kiem_tra_het_mon ? new Date(data.kiem_tra_het_mon) : null);
  request.input("bat_dau_cabin", mssql.Date, data.bat_dau_cabin ? new Date(data.bat_dau_cabin) : null);
  request.input("ket_thuc_cabin", mssql.Date, data.ket_thuc_cabin ? new Date(data.ket_thuc_cabin) : null);
  request.input("bat_dau_dat", mssql.Date, data.bat_dau_dat ? new Date(data.bat_dau_dat) : null);
  request.input("ket_thuc_dat", mssql.Date, data.ket_thuc_dat ? new Date(data.ket_thuc_dat) : null);
  request.input("tot_nghiep", mssql.Date, data.tot_nghiep ? new Date(data.tot_nghiep) : null);
  request.input("ghep_tot_nghiep", mssql.Date, data.ghep_tot_nghiep ? new Date(data.ghep_tot_nghiep) : null);
  request.input("be_giang", mssql.Date, data.be_giang ? new Date(data.be_giang) : null);
  request.input("luu_luong", mssql.Int, data.luu_luong || 0);
  request.input("so_luong_dat", mssql.Int, data.so_luong_dat || 0);
  request.input("so_luong_truot", mssql.Int, data.so_luong_truot || 0);
  request.input("ghi_chu", mssql.NVarChar, data.ghi_chu || null);

  await request.query(`
    IF EXISTS (SELECT 1 FROM [dbo].[tien_do_dao_tao] WHERE ma_khoa = @ma_khoa)
    BEGIN
      UPDATE [dbo].[tien_do_dao_tao]
      SET ngay_khai_giang = @ngay_khai_giang,
          bat_dau_ly_thuyet = @bat_dau_ly_thuyet,
          ket_thuc_ly_thuyet = @ket_thuc_ly_thuyet,
          kiem_tra_het_mon = @kiem_tra_het_mon,
          bat_dau_cabin = @bat_dau_cabin,
          ket_thuc_cabin = @ket_thuc_cabin,
          bat_dau_dat = @bat_dau_dat,
          ket_thuc_dat = @ket_thuc_dat,
          tot_nghiep = @tot_nghiep,
          ghep_tot_nghiep = @ghep_tot_nghiep,
          be_giang = @be_giang,
          luu_luong = @luu_luong,
          so_luong_dat = @so_luong_dat,
          so_luong_truot = @so_luong_truot,
          ghi_chu = @ghi_chu,
          updated_at = GETDATE()
      WHERE ma_khoa = @ma_khoa
    END
    ELSE
    BEGIN
      INSERT INTO [dbo].[tien_do_dao_tao] (
        ma_khoa, ngay_khai_giang, bat_dau_ly_thuyet, ket_thuc_ly_thuyet, 
        kiem_tra_het_mon, bat_dau_cabin, ket_thuc_cabin, bat_dau_dat, 
        ket_thuc_dat, tot_nghiep, ghep_tot_nghiep, be_giang, 
        luu_luong, so_luong_dat, so_luong_truot, ghi_chu
      )
      VALUES (
        @ma_khoa, @ngay_khai_giang, @bat_dau_ly_thuyet, @ket_thuc_ly_thuyet, 
        @kiem_tra_het_mon, @bat_dau_cabin, @ket_thuc_cabin, @bat_dau_dat, 
        @ket_thuc_dat, @tot_nghiep, @ghep_tot_nghiep, @be_giang, 
        @luu_luong, @so_luong_dat, @so_luong_truot, @ghi_chu
      )
    END
  `);
  return true;
}

/**
 * Get list of training progress with filters
 * @param {Object} filters 
 */
async function getTienDoDaoTaoList(filters = {}) {
  const pool = await connectSQL();
  const request = new mssql.Request(pool);

  let query = `
    SELECT t.*, k.ten_khoa 
    FROM [dbo].[tien_do_dao_tao] t
    LEFT JOIN [dbo].[khoa_hoc] k ON t.ma_khoa = k.ma_khoa
    WHERE 1=1
  `;

  if (filters.ma_khoa) {
    request.input("ma_khoa", mssql.NVarChar, `%${filters.ma_khoa}%`);
    query += ` AND (t.ma_khoa LIKE @ma_khoa OR k.ten_khoa LIKE @ma_khoa)`; // Search in both as per previous request "khóa, tên"
  }

  if (filters.tot_nghiep) {
    request.input("tot_nghiep", mssql.Date, filters.tot_nghiep);
    query += ` AND t.tot_nghiep = @tot_nghiep`;
  }

  query += ` ORDER BY t.updated_at DESC, t.ma_khoa ASC`;

  const result = await request.query(query);
  return result.recordset;
}

/**
 * Get all courses from khoa_hoc table
 */
async function getKhoaHocList() {
  const pool = await connectSQL();
  const result = await pool.request().query("SELECT * FROM [dbo].[khoa_hoc] ORDER BY updated_at DESC, ma_khoa ASC");
  return result.recordset;
}

/**
 * Search students by name/ma_dk and course
 * @param {Object} filters { search, ma_khoa }
 */
async function getHocVienSearch(filters = {}) {
  const pool = await connectSQL();
  const request = new mssql.Request(pool);

  let query = `
    SELECT TOP 200 hv.*, kh.ten_khoa 
    FROM [dbo].[hoc_vien] hv
    LEFT JOIN [dbo].[khoa_hoc] kh ON hv.ma_khoa = kh.ma_khoa
    WHERE 1=1
  `;

  if (filters.search) {
    request.input("search", mssql.NVarChar, `%${filters.search}%`);
    query += ` AND (hv.ho_ten LIKE @search OR hv.ma_dk LIKE @search)`;
  }

  if (filters.ma_khoa) {
    request.input("ma_khoa", mssql.VarChar, filters.ma_khoa);
    query += ` AND hv.ma_khoa = @ma_khoa`;
  }

  query += ` ORDER BY hv.ho_ten ASC`;

  const result = await request.query(query);
  return result.recordset;
}

module.exports = {
  upsertKhoaHoc,
  upsertHocVien,
  upsertTienDoDaoTao,
  getTienDoDaoTaoList,
  getKhoaHocList,
  getHocVienSearch
};
