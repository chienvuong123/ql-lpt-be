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
      request.input("ten", mssql.NVarChar, course.name);
      request.input("code", mssql.VarChar, course.code);

      // Chuyển đổi timestamp sang Date (Lotus trả về timestamp giây)
      const startDate = course.start_date ? new Date(course.start_date * 1000) : null;
      const endDate = course.end_date ? new Date(course.end_date * 1000) : null;

      request.input("ngay_bat_dau", mssql.DateTime, startDate);
      request.input("ngay_ket_thuc", mssql.DateTime, endDate);

      await request.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[khoa_hoc] WHERE ma_khoa = @ma_khoa)
        BEGIN
          UPDATE [dbo].[khoa_hoc]
          SET ten = @ten,
              code = @code,
              ngay_bat_dau = @ngay_bat_dau,
              ngay_ket_thuc = @ngay_ket_thuc
          WHERE ma_khoa = @ma_khoa
        END
        ELSE
        BEGIN
          INSERT INTO [dbo].[khoa_hoc] (ma_khoa, ten, code, ngay_bat_dau, ngay_ket_thuc)
          VALUES (@ma_khoa, @ten, @code, @ngay_bat_dau, @ngay_ket_thuc)
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
 * Upsert list of students into hoc_vien table and ensure status record exists
 * @param {Array} students 
 * @param {Object} planInfo 
 */
async function upsertHocVien(students, planInfo) {
  const pool = await connectSQL();
  const transaction = new mssql.Transaction(pool);
  const ma_khoa = planInfo.code;
  const hang = planInfo.__expand?.program?.code || null;
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
              ma_csdt = @ma_csdt
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

module.exports = {
  upsertKhoaHoc,
  upsertHocVien
};
