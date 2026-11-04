const connectSQL = require("../configs/sql");
const sql = require("mssql");

// Cột điểm theo từng phần thi (L/M/H/D trong file XML)
const COT_DIEM = {
  L: { diem: "diem_ly_thuyet", chuan: "chuan_ly_thuyet", file: "ly_thuyet" },
  M: { diem: "diem_mo_phong", chuan: "chuan_mo_phong", file: "mo_phong" },
  H: { diem: "diem_sa_hinh", chuan: "chuan_sa_hinh", file: "sa_hinh" },
  D: { diem: "diem_duong_truong", chuan: "chuan_duong_truong", file: "duong_truong" },
};

const LOAI_FILE = ["danh_sach", "ly_thuyet", "mo_phong", "sa_hinh", "duong_truong"];

// Các cột trả về cho danh sách — bỏ cột ảnh cho nhẹ
const COT_THI_SINH = `
  ts.id, ts.ma_ky_sh, ts.ma_dk, ts.so_bao_danh, ts.ho_ten, ts.gioi_tinh, ts.ngay_sinh, ts.so_cmt,
  ts.hang_gplx, ts.ma_khoa_hoc, ts.ma_csdt, ts.noi_dung_sh, ts.so_ho_so,
  ts.diem_ly_thuyet, ts.chuan_ly_thuyet, ts.diem_mo_phong, ts.chuan_mo_phong,
  ts.diem_sa_hinh, ts.chuan_sa_hinh, ts.diem_duong_truong, ts.chuan_duong_truong,
  CAST(CASE WHEN ts.anh_jp2 IS NULL AND ts.anh_jpeg IS NULL THEN 0 ELSE 1 END AS BIT) AS co_anh,
  ts.updated_at
`;

const createTableIfNotExists = async () => {
  const pool = await connectSQL();
  const fileCols = LOAI_FILE.map((f) => `ten_file_${f} NVARCHAR(255) NULL, thoi_gian_${f} DATETIME2(0) NULL`).join(",\n        ");
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sat_hach_ky')
    BEGIN
      CREATE TABLE sat_hach_ky (
        ma_ky_sh NVARCHAR(50) NOT NULL PRIMARY KEY,
        ten_ky_sh NVARCHAR(100) NULL,
        ma_ttsh NVARCHAR(50) NULL,
        ngay_sh DATE NULL,
        gio_sh NVARCHAR(10) NULL,
        so_qd NVARCHAR(100) NULL,
        ngay_qd DATE NULL,
        chu_tich_hdsh NVARCHAR(255) NULL,
        ${fileCols},
        created_at DATETIME2(0) DEFAULT SYSDATETIME(),
        updated_at DATETIME2(0) DEFAULT SYSDATETIME()
      )
    END

    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sat_hach_thi_sinh')
    BEGIN
      CREATE TABLE sat_hach_thi_sinh (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ma_ky_sh NVARCHAR(50) NOT NULL,
        ma_dk NVARCHAR(100) NOT NULL,
        so_bao_danh INT NULL,
        ho_ten NVARCHAR(255) NULL,
        gioi_tinh NVARCHAR(5) NULL,
        ngay_sinh DATE NULL,
        so_cmt NVARCHAR(30) NULL,
        hang_gplx NVARCHAR(20) NULL,
        ma_khoa_hoc NVARCHAR(100) NULL,
        ma_csdt NVARCHAR(20) NULL,
        noi_dung_sh INT NULL,
        so_ho_so NVARCHAR(50) NULL,
        diem_ly_thuyet INT NULL,
        chuan_ly_thuyet INT NULL,
        diem_mo_phong INT NULL,
        chuan_mo_phong INT NULL,
        diem_sa_hinh INT NULL,
        chuan_sa_hinh INT NULL,
        diem_duong_truong INT NULL,
        chuan_duong_truong INT NULL,
        anh_jp2 VARBINARY(MAX) NULL,
        anh_jpeg VARBINARY(MAX) NULL,
        created_at DATETIME2(0) DEFAULT SYSDATETIME(),
        updated_at DATETIME2(0) DEFAULT SYSDATETIME()
      )
      CREATE UNIQUE NONCLUSTERED INDEX UX_sat_hach_thi_sinh_ky_dk ON sat_hach_thi_sinh (ma_ky_sh, ma_dk);
      CREATE NONCLUSTERED INDEX IX_sat_hach_thi_sinh_so_cmt ON sat_hach_thi_sinh (so_cmt);
    END
  `);
};

// Ghi thông tin kỳ: chỉ ghi đè các trường có giá trị mới
const upsertKy = async (tx, ky) => {
  const req = new sql.Request(tx);
  req.input("ma_ky_sh", sql.NVarChar, ky.ma_ky_sh);
  req.input("ten_ky_sh", sql.NVarChar, ky.ten_ky_sh || null);
  req.input("ma_ttsh", sql.NVarChar, ky.ma_ttsh || null);
  req.input("ngay_sh", sql.Date, ky.ngay_sh || null);
  req.input("ngay_sh_du_phong", sql.Date, ky.ngay_sh_du_phong || null);
  req.input("gio_sh", sql.NVarChar, ky.gio_sh || null);
  req.input("so_qd", sql.NVarChar, ky.so_qd || null);
  req.input("ngay_qd", sql.Date, ky.ngay_qd || null);
  req.input("chu_tich_hdsh", sql.NVarChar, ky.chu_tich_hdsh || null);
  await req.query(`
    MERGE sat_hach_ky AS t
    USING (SELECT @ma_ky_sh AS ma_ky_sh) AS s ON t.ma_ky_sh = s.ma_ky_sh
    WHEN MATCHED THEN UPDATE SET
      ten_ky_sh = COALESCE(@ten_ky_sh, t.ten_ky_sh),
      ma_ttsh = COALESCE(@ma_ttsh, t.ma_ttsh),
      ngay_sh = COALESCE(@ngay_sh, t.ngay_sh, @ngay_sh_du_phong),
      gio_sh = COALESCE(@gio_sh, t.gio_sh),
      so_qd = COALESCE(@so_qd, t.so_qd),
      ngay_qd = COALESCE(@ngay_qd, t.ngay_qd),
      chu_tich_hdsh = COALESCE(@chu_tich_hdsh, t.chu_tich_hdsh),
      updated_at = SYSDATETIME()
    WHEN NOT MATCHED THEN INSERT
      (ma_ky_sh, ten_ky_sh, ma_ttsh, ngay_sh, gio_sh, so_qd, ngay_qd, chu_tich_hdsh)
      VALUES (@ma_ky_sh, @ten_ky_sh, @ma_ttsh, COALESCE(@ngay_sh, @ngay_sh_du_phong), @gio_sh, @so_qd, @ngay_qd, @chu_tich_hdsh);
  `);
};

const markFileImported = async (tx, maKySh, loaiFile, tenFile) => {
  if (!LOAI_FILE.includes(loaiFile)) return;
  const req = new sql.Request(tx);
  req.input("ma_ky_sh", sql.NVarChar, maKySh);
  req.input("ten_file", sql.NVarChar, tenFile || null);
  await req.query(`
    UPDATE sat_hach_ky
    SET ten_file_${loaiFile} = @ten_file, thoi_gian_${loaiFile} = SYSDATETIME(), updated_at = SYSDATETIME()
    WHERE ma_ky_sh = @ma_ky_sh
  `);
};

/**
 * Ghi 1 thí sinh.
 * - overwriteBase: file danh sách là nguồn chuẩn cho thông tin cá nhân → ghi đè;
 *   file kết quả chỉ bổ sung các trường đang trống.
 * - parts: các phần thi (L/M/H/D) mà file này mang điểm → ghi đè điểm các phần đó.
 */
const upsertThiSinh = async (tx, rec, { overwriteBase, parts }) => {
  const req = new sql.Request(tx);
  req.input("ma_ky_sh", sql.NVarChar, rec.ma_ky_sh);
  req.input("ma_dk", sql.NVarChar, rec.ma_dk);
  req.input("so_bao_danh", sql.Int, rec.so_bao_danh ?? null);
  req.input("ho_ten", sql.NVarChar, rec.ho_ten || null);
  req.input("gioi_tinh", sql.NVarChar, rec.gioi_tinh || null);
  req.input("ngay_sinh", sql.Date, rec.ngay_sinh || null);
  req.input("so_cmt", sql.NVarChar, rec.so_cmt || null);
  req.input("hang_gplx", sql.NVarChar, rec.hang_gplx || null);
  req.input("ma_khoa_hoc", sql.NVarChar, rec.ma_khoa_hoc || null);
  req.input("ma_csdt", sql.NVarChar, rec.ma_csdt || null);
  req.input("noi_dung_sh", sql.Int, rec.noi_dung_sh ?? null);
  req.input("so_ho_so", sql.NVarChar, rec.so_ho_so || null);
  req.input("anh_jp2", sql.VarBinary(sql.MAX), rec.anh_jp2 || null);

  const baseCols = ["so_bao_danh", "ho_ten", "gioi_tinh", "ngay_sinh", "so_cmt", "hang_gplx", "ma_khoa_hoc", "ma_csdt", "noi_dung_sh", "so_ho_so"];
  const setBase = baseCols.map((c) =>
    overwriteBase ? `${c} = COALESCE(@${c}, t.${c})` : `${c} = COALESCE(t.${c}, @${c})`,
  );

  // Ảnh: danh sách ghi đè (và xoá ảnh JPEG đã chuyển đổi để chuyển lại), file kết quả chỉ bổ sung khi chưa có
  const setAnh = overwriteBase
    ? [
      "anh_jpeg = CASE WHEN @anh_jp2 IS NULL THEN t.anh_jpeg ELSE NULL END",
      "anh_jp2 = COALESCE(@anh_jp2, t.anh_jp2)",
    ]
    : ["anh_jp2 = COALESCE(t.anh_jp2, @anh_jp2)"];

  const diemCols = [];
  for (const p of parts) {
    const col = COT_DIEM[p];
    const d = rec.diem?.[p];
    req.input(col.diem, sql.Int, d?.diem ?? null);
    req.input(col.chuan, sql.Int, d?.chuan ?? null);
    diemCols.push(col.diem, col.chuan);
  }
  const setDiem = diemCols.map((c) => `${c} = @${c}`);

  const insertCols = ["ma_ky_sh", "ma_dk", ...baseCols, "anh_jp2", ...diemCols];

  const result = await req.query(`
    MERGE sat_hach_thi_sinh AS t
    USING (SELECT @ma_ky_sh AS ma_ky_sh, @ma_dk AS ma_dk) AS s
      ON t.ma_ky_sh = s.ma_ky_sh AND t.ma_dk = s.ma_dk
    WHEN MATCHED THEN UPDATE SET
      ${[...setBase, ...setAnh, ...setDiem, "updated_at = SYSDATETIME()"].join(",\n      ")}
    WHEN NOT MATCHED THEN INSERT (${insertCols.join(", ")})
      VALUES (${insertCols.map((c) => `@${c}`).join(", ")})
    OUTPUT $action AS action;
  `);
  return result.recordset?.[0]?.action === "INSERT" ? "inserted" : "updated";
};

const getKyList = async () => {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT k.*, ISNULL(c.so_thi_sinh, 0) AS so_thi_sinh
    FROM sat_hach_ky k
    LEFT JOIN (
      SELECT ma_ky_sh, COUNT(*) AS so_thi_sinh FROM sat_hach_thi_sinh GROUP BY ma_ky_sh
    ) c ON c.ma_ky_sh = k.ma_ky_sh
    ORDER BY k.ngay_sh DESC, k.ma_ky_sh DESC
  `);
  return result.recordset;
};

const getKy = async (maKySh) => {
  const pool = await connectSQL();
  const result = await pool.request()
    .input("ma_ky_sh", sql.NVarChar, maKySh)
    .query("SELECT * FROM sat_hach_ky WHERE ma_ky_sh = @ma_ky_sh");
  return result.recordset[0] || null;
};

const getThiSinhByKy = async (maKyList) => {
  if (!Array.isArray(maKyList) || maKyList.length === 0) return [];
  const pool = await connectSQL();
  const req = pool.request();
  const placeholders = maKyList.map((ma, idx) => {
    req.input(`ky${idx}`, sql.NVarChar, ma);
    return `@ky${idx}`;
  });
  const result = await req.query(`
    SELECT ${COT_THI_SINH}
    FROM sat_hach_thi_sinh ts
    WHERE ts.ma_ky_sh IN (${placeholders.join(",")})
    ORDER BY ts.so_bao_danh, ts.ho_ten
  `);
  return result.recordset;
};

// Lịch sử thi của 1 người qua các kỳ (khớp theo CCCD hoặc mã đăng ký)
const getLichSu = async ({ soCmt, maDk }) => {
  const pool = await connectSQL();
  const req = pool.request();
  req.input("so_cmt", sql.NVarChar, soCmt || null);
  req.input("ma_dk", sql.NVarChar, maDk || null);
  const result = await req.query(`
    SELECT ${COT_THI_SINH}, k.ten_ky_sh, k.ngay_sh
    FROM sat_hach_thi_sinh ts
    LEFT JOIN sat_hach_ky k ON k.ma_ky_sh = ts.ma_ky_sh
    WHERE (@so_cmt IS NOT NULL AND ts.so_cmt = @so_cmt)
       OR (@ma_dk IS NOT NULL AND ts.ma_dk = @ma_dk)
    ORDER BY k.ngay_sh DESC, ts.ma_ky_sh DESC
  `);
  return result.recordset;
};

const getAnh = async (maKySh, maDk) => {
  const pool = await connectSQL();
  const result = await pool.request()
    .input("ma_ky_sh", sql.NVarChar, maKySh)
    .input("ma_dk", sql.NVarChar, maDk)
    .query("SELECT id, anh_jp2, anh_jpeg FROM sat_hach_thi_sinh WHERE ma_ky_sh = @ma_ky_sh AND ma_dk = @ma_dk");
  return result.recordset[0] || null;
};

const saveAnhJpeg = async (id, jpeg) => {
  const pool = await connectSQL();
  await pool.request()
    .input("id", sql.Int, id)
    .input("anh_jpeg", sql.VarBinary(sql.MAX), jpeg)
    .query("UPDATE sat_hach_thi_sinh SET anh_jpeg = @anh_jpeg WHERE id = @id");
};

module.exports = {
  COT_DIEM,
  createTableIfNotExists,
  upsertKy,
  markFileImported,
  upsertThiSinh,
  getKyList,
  getKy,
  getThiSinhByKy,
  getLichSu,
  getAnh,
  saveAnhJpeg,
};
