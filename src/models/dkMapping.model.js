const sql = require("mssql");
const connectSQL = require("../configs/sql");

// Toàn bộ bảng đang lưu ma_dk (hoặc ma_hoc_vien) làm định danh học viên —
// khi đổi ma_dk phải cascade update đồng thời để không gãy các JOIN hiện có.
const CASCADE_TARGETS = [
  { table: "hoc_vien", column: "ma_dk" },
  { table: "dang_ky_xe_gv", column: "ma_dk" },
  { table: "cabin_lich_phan_bo", column: "ma_dk" },
  { table: "cabin_note", column: "ma_dk" },
  { table: "hoc_bu", column: "ma_dk" },
  { table: "hoc_bu_new", column: "ma_dk" },
  { table: "hoc_vien_da_tot_nghiep", column: "ma_dk" },
  { table: "hoc_vien_duyet_log", column: "ma_dk" },
  { table: "hocvien_checks", column: "ma_hoc_vien" },
  { table: "ky_dat", column: "ma_dk" },
  { table: "lich_su_thay_doi", column: "ma_dk" },
  { table: "phien_hoc_dat", column: "ma_dk" },
  { table: "phien_hoc_dat", column: "ma_hoc_vien" },
  { table: "phien_hoc_duyet_log", column: "ma_dk" },
  { table: "trang_thai_hoc_vien", column: "ma_dk" },
  { table: "trang_thai_ly_thuyet", column: "ma_dk" },
];

// Lấy roster học viên local (có id, ma_dk cũ, cccd) của các khóa theo tên khóa (ten_khoa)
// — dùng làm nguồn đối chiếu CCCD + khóa với dữ liệu từ /api/hoc-vien-th.
async function getHocVienForCourses(tenKhoaList) {
  if (!Array.isArray(tenKhoaList) || tenKhoaList.length === 0) return [];

  const pool = await connectSQL();
  const request = new sql.Request(pool);
  const placeholders = tenKhoaList.map((_, idx) => {
    const name = `tenKhoa${idx}`;
    request.input(name, sql.NVarChar, tenKhoaList[idx]);
    return `@${name}`;
  });

  const query = `
    SELECT hv.id, hv.ma_dk, hv.cccd, hv.ho_ten, hv.ma_khoa, kh.ten_khoa
    FROM [dbo].[hoc_vien] hv WITH (NOLOCK)
    INNER JOIN [dbo].[khoa_hoc] kh WITH (NOLOCK) ON kh.ma_khoa = hv.ma_khoa
    WHERE kh.ten_khoa IN (${placeholders.join(", ")})
      AND hv.cccd IS NOT NULL AND hv.cccd <> ''
  `;

  const result = await request.query(query);
  return result.recordset;
}

// Cache tên bảng thực tế có trong DB đang kết nối — vì schema có thể khác nhau giữa các server
// (VD server khác có thể chưa có bảng hocvien_checks). Chỉ cascade update vào bảng thực sự tồn tại.
let existingTablesCache = null;

async function getExistingTables(pool) {
  if (existingTablesCache) return existingTablesCache;
  const result = await pool.request().query("SELECT name FROM sys.tables");
  existingTablesCache = new Set(result.recordset.map((r) => r.name));
  return existingTablesCache;
}

// Đổi ma_dk cũ -> ma_dk mới cho 1 học viên, cascade toàn bộ CASCADE_TARGETS trong 1 transaction.
// Đồng thời ghi log vào dk_mapping để có lịch sử đối chiếu.
async function applyMaDkChange({ hoc_vien_id, ma_khoa, ma_dk_cu, ma_dk_moi }) {
  const pool = await connectSQL();
  const existingTables = await getExistingTables(pool);
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const logReq = new sql.Request(transaction);
    logReq.input("hoc_vien_id", sql.Int, hoc_vien_id ?? null);
    logReq.input("ma_khoa", sql.VarChar, ma_khoa || null);
    logReq.input("ma_dk_cu", sql.VarChar, ma_dk_cu);
    logReq.input("ma_dk_moi", sql.VarChar, ma_dk_moi);
    await logReq.query(`
      INSERT INTO [dbo].[dk_mapping] (hoc_vien_id, ma_khoa, ma_dk_cu, ma_dk_moi)
      VALUES (@hoc_vien_id, @ma_khoa, @ma_dk_cu, @ma_dk_moi)
    `);

    for (const { table, column } of CASCADE_TARGETS) {
      if (!existingTables.has(table)) continue; // bảng không tồn tại trên server này -> bỏ qua

      const req = new sql.Request(transaction);
      req.input("ma_dk_moi", sql.NVarChar, ma_dk_moi);
      req.input("ma_dk_cu", sql.NVarChar, ma_dk_cu);
      await req.query(
        `UPDATE [dbo].[${table}] SET ${column} = @ma_dk_moi WHERE ${column} = @ma_dk_cu`
      );
    }

    await transaction.commit();
  } catch (err) {
    if (!transaction._aborted) await transaction.rollback();
    throw err;
  }
}

module.exports = { getHocVienForCourses, applyMaDkChange, CASCADE_TARGETS };
