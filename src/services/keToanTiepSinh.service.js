"use strict";

/**
 * Phòng kế toán — thu học phí hồ sơ tiếp sinh đã được tổ tiếp sinh "Nộp KT".
 *
 *  - Phải thu = số tiền chốt lúc nộp kế toán (nop_kt_so_tien). Chưa có giá -> lần thu đầu tiên chốt luôn số phải thu.
 *  - Mỗi lần thu = 1 phiếu thu (số PTyyyyMMxxx, đánh số lại theo tháng).
 *  - Trạng thái: Chờ thu phí (chưa thu đồng nào) / Công nợ (thu thiếu) / Đã thu (đủ).
 */

const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const tiepSinh = require("./tiepSinh.service");

const { ensureTables: ensureTiepSinh, TABLE, LOG_TABLE, NOP_KT_TABLE, NOP_KT_COLUMNS, httpError, trongGiaoDich, rowNopKt, getCauHinh } = tiepSinh._internal;
const PHIEU_TABLE = "phieu_thu_tiep_sinh";
const HINH_THUC = { tien_mat: "Tiền mặt", chuyen_khoan: "Chuyển khoản" };

let _initPromise = null;
function ensureTables() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await ensureTiepSinh();
    const pool = await connectSQL();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${PHIEU_TABLE}')
      BEGIN
        CREATE TABLE ${PHIEU_TABLE} (
          id INT IDENTITY(1,1) PRIMARY KEY,
          so_phieu VARCHAR(30) NOT NULL,
          ho_so_id INT NOT NULL,
          so_tien INT NOT NULL,
          hinh_thuc VARCHAR(20) NOT NULL DEFAULT 'tien_mat',
          ghi_chu NVARCHAR(500) NULL,
          nguoi_thu NVARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_${PHIEU_TABLE}_ho_so ON ${PHIEU_TABLE}(ho_so_id);
        CREATE INDEX IX_${PHIEU_TABLE}_created ON ${PHIEU_TABLE}(created_at) INCLUDE (so_tien, ho_so_id);
      END
      -- Duyệt thu theo đợt: 1 phiếu thu (1 số phiếu) cho nhiều hồ sơ -> bỏ UNIQUE trên so_phieu
      DECLARE @uq NVARCHAR(255) = (
        SELECT TOP 1 kc.name FROM sys.key_constraints kc
        JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE kc.parent_object_id = OBJECT_ID('${PHIEU_TABLE}') AND kc.type = 'UQ' AND c.name = 'so_phieu');
      IF @uq IS NOT NULL EXEC('ALTER TABLE ${PHIEU_TABLE} DROP CONSTRAINT ' + @uq);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_${PHIEU_TABLE}_so_phieu')
        CREATE INDEX IX_${PHIEU_TABLE}_so_phieu ON ${PHIEU_TABLE}(so_phieu);
    `);
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

// Số đã thu của từng hồ sơ
const DA_THU_APPLY = `OUTER APPLY (SELECT ISNULL(SUM(p.so_tien), 0) AS da_thu, MAX(p.created_at) AS lan_thu_cuoi
  FROM ${PHIEU_TABLE} p WITH (NOLOCK) WHERE p.ho_so_id = h.id) t`;
const TRANG_THAI_SQL = {
  cho_thu: "t.da_thu = 0",
  cong_no: "t.da_thu > 0 AND t.da_thu < ISNULL(h.nop_kt_so_tien, 0)",
  da_thu: "t.da_thu > 0 AND t.da_thu >= ISNULL(h.nop_kt_so_tien, 0)",
};
const trangThaiThu = (r) =>
  !r.da_thu ? "cho_thu" : r.da_thu < (r.phai_thu || 0) ? "cong_no" : "da_thu";

const ROW_COLUMNS = `h.id, h.ma_ho_so, h.ho_ten, h.cccd, h.hang, h.loai_hinh, h.dien_thoai, h.dia_chi, h.gioi_tinh,
  CONVERT(varchar(10), h.ngay_sinh, 23) AS ngay_sinh, h.kham_suc_khoe, h.dau_moi, h.gplx_hang,
  h.nop_kt_so_tien AS phai_thu, t.da_thu,
  CONVERT(varchar(19), h.duyet_at, 120) AS duyet_at,
  CONVERT(varchar(19), h.nop_kt_at, 120) AS nop_kt_at,
  CONVERT(varchar(19), t.lan_thu_cuoi, 120) AS lan_thu_cuoi`;

const withTrangThai = (r) => ({ ...r, trang_thai_thu: trangThaiThu(r), con_lai: r.phai_thu === null ? null : Math.max(0, r.phai_thu - r.da_thu) });

/**
 * Hồ sơ đã gửi nhưng kế toán CHƯA duyệt: tiếp sinh vẫn sửa được (đổi loại hình, GPLX, chuyển tiền...)
 * -> cập nhật lại số phải thu theo dữ liệu hiện tại trước khi kế toán xem.
 */
async function dongBoPhaiThu() {
  const pool = await connectSQL();
  const [r, cfg] = await Promise.all([
    pool.request().query(`SELECT ${NOP_KT_COLUMNS}, nop_kt_so_tien FROM ${TABLE} WITH (NOLOCK) WHERE nop_kt_at IS NOT NULL AND kt_duyet_at IS NULL`),
    getCauHinh(),
  ]);
  for (const hs of r.recordset) {
    const moi = rowNopKt(hs, cfg).so_tien;
    if (moi === hs.nop_kt_so_tien) continue;
    await pool.request().input("id", mssql.Int, hs.id).input("st", mssql.Int, moi)
      .query(`UPDATE ${TABLE} SET nop_kt_so_tien = @st WHERE id = @id AND kt_duyet_at IS NULL`);
  }
}

async function danhSach(query = {}) {
  await ensureTables();
  await dongBoPhaiThu();
  const pool = await connectSQL();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 10));
  const base = ["h.nop_kt_at IS NOT NULL"];
  const req = pool.request();
  if (query.search && String(query.search).trim()) {
    req.input("q", mssql.NVarChar(255), `%${String(query.search).trim()}%`);
    base.push("(h.ho_ten LIKE @q OR h.cccd LIKE @q OR h.ma_ho_so LIKE @q OR h.dien_thoai LIKE @q)");
  }
  const where = [...base];
  if (TRANG_THAI_SQL[query.tab]) where.push(TRANG_THAI_SQL[query.tab]);
  req.input("offset", mssql.Int, (page - 1) * limit).input("limit", mssql.Int, limit);
  const r = await req.query(`
    SELECT
      COUNT(*) AS tat_ca,
      SUM(CASE WHEN ${TRANG_THAI_SQL.cho_thu} THEN 1 ELSE 0 END) AS cho_thu,
      SUM(CASE WHEN ${TRANG_THAI_SQL.cong_no} THEN 1 ELSE 0 END) AS cong_no,
      SUM(CASE WHEN ${TRANG_THAI_SQL.da_thu} THEN 1 ELSE 0 END) AS da_thu
    FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${base.join(" AND ")};

    SELECT COUNT(*) AS total FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${where.join(" AND ")};

    SELECT ${ROW_COLUMNS} FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY}
    WHERE ${where.join(" AND ")}
    ORDER BY h.duyet_at, h.id
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);
  const dem = r.recordsets[0][0] || {};
  const total = r.recordsets[1][0]?.total || 0;
  return {
    data: r.recordsets[2].map(withTrangThai),
    dem: { tat_ca: dem.tat_ca || 0, cho_thu: dem.cho_thu || 0, cong_no: dem.cong_no || 0, da_thu: dem.da_thu || 0 },
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function thongKe() {
  await ensureTables();
  await dongBoPhaiThu();
  const pool = await connectSQL();
  const r = await pool.request().query(`
    DECLARE @d DATE = CAST(GETDATE() AS DATE);
    DECLARE @d1 DATE = DATEADD(day, 1, @d);
    DECLARE @y DATE = DATEADD(day, -1, @d);
    DECLARE @m0 DATE = DATEFROMPARTS(YEAR(@d), MONTH(@d), 1);
    DECLARE @pm0 DATE = DATEADD(month, -1, @m0);
    DECLARE @pmCut DATETIME = DATEADD(month, -1, GETDATE());

    -- 0: thẻ hồ sơ
    SELECT
      COUNT(*) AS da_duyet,
      SUM(CASE WHEN h.nop_kt_at >= @d THEN 1 ELSE 0 END) AS da_duyet_hom_nay,
      SUM(CASE WHEN t.da_thu = 0 THEN 1 ELSE 0 END) AS cho_thu,
      SUM(CASE WHEN t.da_thu = 0 AND h.nop_kt_at >= @d THEN 1 ELSE 0 END) AS cho_thu_hom_nay,
      SUM(CASE WHEN t.da_thu > 0 AND t.da_thu < ISNULL(h.nop_kt_so_tien, 0) THEN 1 ELSE 0 END) AS cong_no,
      -- tổng quan thu phí (footer)
      ISNULL(SUM(CAST(h.nop_kt_so_tien AS BIGINT)), 0) AS tq_phai_thu,
      SUM(CASE WHEN ${TRANG_THAI_SQL.da_thu} THEN 1 ELSE 0 END) AS tq_hv_da_thu,
      ISNULL(SUM(CAST(t.da_thu AS BIGINT)), 0) AS tq_da_thu,
      SUM(CASE WHEN ${TRANG_THAI_SQL.da_thu} THEN 0 ELSE 1 END) AS tq_hv_con_lai,
      ISNULL(SUM(CASE WHEN ISNULL(h.nop_kt_so_tien, 0) > t.da_thu THEN CAST(h.nop_kt_so_tien - t.da_thu AS BIGINT) ELSE 0 END), 0) AS tq_con_lai
    FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE h.nop_kt_at IS NOT NULL;

    -- 1: tiền thu
    SELECT
      COUNT(DISTINCT CASE WHEN created_at >= @d THEN ho_so_id END) AS hv_thu_hom_nay,
      COUNT(DISTINCT CASE WHEN created_at >= @y AND created_at < @d THEN ho_so_id END) AS hv_thu_hom_qua,
      ISNULL(SUM(CASE WHEN created_at >= @d THEN CAST(so_tien AS BIGINT) END), 0) AS tien_hom_nay,
      ISNULL(SUM(CASE WHEN created_at >= @y AND created_at < @d THEN CAST(so_tien AS BIGINT) END), 0) AS tien_hom_qua,
      ISNULL(SUM(CASE WHEN created_at >= @m0 THEN CAST(so_tien AS BIGINT) END), 0) AS tien_thang,
      ISNULL(SUM(CASE WHEN created_at >= @pm0 AND created_at < @pmCut THEN CAST(so_tien AS BIGINT) END), 0) AS tien_thang_truoc_cung_ky
    FROM ${PHIEU_TABLE} WITH (NOLOCK) WHERE created_at >= @pm0;

    -- 2: tiền thu theo ngày trong tháng (biểu đồ)
    SELECT CONVERT(varchar(10), CAST(created_at AS DATE), 23) AS ngay, SUM(CAST(so_tien AS BIGINT)) AS tien
    FROM ${PHIEU_TABLE} WITH (NOLOCK) WHERE created_at >= @m0
    GROUP BY CAST(created_at AS DATE) ORDER BY ngay;

    -- 3: khoá học (loại hình) nhiều hồ sơ nhất
    SELECT TOP 1 ISNULL(loai_hinh, hang) AS ten, COUNT(*) AS so_luong,
      (SELECT COUNT(*) FROM ${TABLE} WITH (NOLOCK) WHERE nop_kt_at IS NOT NULL) AS tong
    FROM ${TABLE} WITH (NOLOCK) WHERE nop_kt_at IS NOT NULL
    GROUP BY ISNULL(loai_hinh, hang) ORDER BY COUNT(*) DESC;
  `);
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const tien = r.recordsets[1][0] || {};
  const top = r.recordsets[3][0] || null;
  const the = r.recordsets[0][0] || {};
  return {
    ...the,
    tq_phai_thu: Number(the.tq_phai_thu || 0),
    tq_da_thu: Number(the.tq_da_thu || 0),
    tq_con_lai: Number(the.tq_con_lai || 0),
    ...tien,
    tien_hom_nay: Number(tien.tien_hom_nay || 0),
    tien_thang: Number(tien.tien_thang || 0),
    pct_hv_thu: pct(tien.hv_thu_hom_nay, tien.hv_thu_hom_qua),
    pct_tien: pct(Number(tien.tien_hom_nay), Number(tien.tien_hom_qua)),
    pct_thang: pct(Number(tien.tien_thang), Number(tien.tien_thang_truoc_cung_ky)),
    bieu_do: r.recordsets[2].map((x) => ({ ngay: x.ngay, tien: Number(x.tien) })),
    top_khoa: top ? { ten: top.ten, so_luong: top.so_luong, ty_le: top.tong ? Math.round((top.so_luong / top.tong) * 100) : 0 } : null,
    cap_nhat: new Date().toISOString(),
  };
}

/** Số phiếu kế tiếp trong tháng: PT + yyyyMM + 3 số */
async function soPhieuTiep(reqOrPool) {
  const now = new Date();
  const prefix = `PT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const r = await reqOrPool
    .input("pf", mssql.VarChar(20), `${prefix}%`)
    .query(`SELECT TOP 1 so_phieu FROM ${PHIEU_TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE so_phieu LIKE @pf ORDER BY so_phieu DESC`);
  const last = r.recordset[0]?.so_phieu;
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

async function xemSoPhieu() {
  await ensureTables();
  const pool = await connectSQL();
  return { so_phieu: await soPhieuTiep(pool.request()) };
}

async function layHoSoKt(id, req) {
  const r = await req
    .input("hid", mssql.Int, Number(id))
    .query(`SELECT ${ROW_COLUMNS} FROM ${TABLE} h ${DA_THU_APPLY} WHERE h.id = @hid`);
  const hs = r.recordset[0];
  if (!hs) throw httpError(404, "Không tìm thấy hồ sơ");
  return withTrangThai(hs);
}

async function chiTiet(id) {
  await ensureTables();
  const pool = await connectSQL();
  const hs = await layHoSoKt(id, pool.request());
  const [anh, phieu, chuyen] = await Promise.all([
    pool.request().input("id", mssql.Int, Number(id))
      .query(`SELECT anh_chan_dung, trang_thai, CONVERT(varchar(19), bo_hoc_at, 120) AS bo_hoc_at FROM ${TABLE} WHERE id = @id`),
    danhSachPhieu(id, pool),
    // Chuyển học phí / phí khám giữa các học viên (nghiệp vụ bên tiếp sinh)
    pool.request().input("id", mssql.Int, Number(id)).query(`
      SELECT l.id, l.hanh_dong, l.noi_dung, l.so_tien, l.nguoi, CONVERT(varchar(19), l.created_at, 120) AS created_at,
        d.ma_ho_so AS doi_tac_ma, d.ho_ten AS doi_tac_ten
      FROM ${LOG_TABLE} l WITH (NOLOCK) LEFT JOIN ${TABLE} d WITH (NOLOCK) ON d.id = l.doi_tac_id
      WHERE l.ho_so_id = @id
        AND l.hanh_dong IN ('chuyen_hoc_phi_di', 'chuyen_hoc_phi_den', 'chuyen_phi_kham_di', 'chuyen_phi_kham_den', 'hoan_phi_kham')
      ORDER BY l.id DESC`),
  ]);
  const a = anh.recordset[0] || {};
  return {
    ...hs,
    anh_chan_dung: a.anh_chan_dung || null,
    trang_thai: a.trang_thai,
    bo_hoc_at: a.bo_hoc_at,
    phieu_thu: phieu,
    chuyen_tien: chuyen.recordset,
  };
}

async function danhSachPhieu(id, pool) {
  const r = await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .query(`SELECT id, so_phieu, so_tien, hinh_thuc, ghi_chu, nguoi_thu, CONVERT(varchar(19), created_at, 120) AS created_at
            FROM ${PHIEU_TABLE} WITH (NOLOCK) WHERE ho_so_id = @id ORDER BY id DESC`);
  return r.recordset;
}

/** Thu phí: { so_tien, hinh_thuc, ghi_chu } -> phiếu thu mới + hồ sơ sau khi thu */
async function thuPhi(id, body = {}, nguoi) {
  await ensureTables();
  const soTien = Number(String(body.so_tien ?? "").replace(/[^\d]/g, "")) || 0;
  if (soTien <= 0) throw httpError(400, "Số tiền thu phải lớn hơn 0");
  const hinhThuc = HINH_THUC[body.hinh_thuc] ? body.hinh_thuc : "tien_mat";
  const ghiChu = String(body.ghi_chu || "").trim().slice(0, 500) || null;

  await dongBoPhaiThu();
  const phieu = await trongGiaoDich(async (tx, log) => {
    const hs = await layHoSoKt(id, new mssql.Request(tx));
    if (!hs.nop_kt_at) throw httpError(400, "Hồ sơ chưa được tổ tiếp sinh gửi lên kế toán");
    // Kế toán thu tiền = đã duyệt -> khoá dữ liệu hồ sơ bên tiếp sinh
    await new mssql.Request(tx).input("id", mssql.Int, hs.id).input("ng", mssql.NVarChar(255), nguoi || null)
      .query(`UPDATE ${TABLE} SET kt_duyet_at = ISNULL(kt_duyet_at, GETDATE()), kt_nguoi_duyet = ISNULL(kt_nguoi_duyet, @ng) WHERE id = @id`);
    if (hs.phai_thu !== null && hs.con_lai <= 0) throw httpError(400, "Học viên đã đóng đủ học phí");
    if (hs.phai_thu !== null && soTien > hs.con_lai) {
      throw httpError(400, `Số tiền thu vượt số còn phải thu (${hs.con_lai.toLocaleString("vi-VN")} đ)`);
    }
    // Chưa có giá lúc nộp -> lần thu đầu chốt số phải thu
    if (hs.phai_thu === null) {
      await new mssql.Request(tx).input("id", mssql.Int, hs.id).input("st", mssql.Int, soTien)
        .query(`UPDATE ${TABLE} SET nop_kt_so_tien = @st WHERE id = @id`);
    }
    const soPhieu = await soPhieuTiep(new mssql.Request(tx));
    const ins = await new mssql.Request(tx)
      .input("sp", mssql.VarChar(30), soPhieu)
      .input("id", mssql.Int, hs.id)
      .input("st", mssql.Int, soTien)
      .input("ht", mssql.VarChar(20), hinhThuc)
      .input("gc", mssql.NVarChar(500), ghiChu)
      .input("ng", mssql.NVarChar(255), nguoi || null)
      .query(`INSERT INTO ${PHIEU_TABLE}(so_phieu, ho_so_id, so_tien, hinh_thuc, ghi_chu, nguoi_thu)
              OUTPUT INSERTED.id, INSERTED.so_phieu, INSERTED.so_tien, INSERTED.hinh_thuc, INSERTED.ghi_chu, INSERTED.nguoi_thu,
                     CONVERT(varchar(19), INSERTED.created_at, 120) AS created_at
              VALUES (@sp, @id, @st, @ht, @gc, @ng)`);
    await log(hs.id, "thu_phi", `Kế toán thu ${soTien.toLocaleString("vi-VN")} đ (${HINH_THUC[hinhThuc]}) — phiếu ${soPhieu}${ghiChu ? ` — ${ghiChu}` : ""}`, nguoi, { soTien });
    return ins.recordset[0];
  });
  return { phieu, ho_so: await chiTiet(id) };
}

// ─── Đợt gửi từ Phòng Tiếp sinh: kế toán duyệt thu theo đợt ─────────────
async function danhSachDot() {
  await ensureTables();
  await dongBoPhaiThu();
  const pool = await connectSQL();
  const r = await pool.request().query(`
    SELECT d.id, ISNULL(d.ma_dot, CONCAT('TS', FORMAT(d.created_at, 'yyMMddHHmmss'))) AS ma_dot, d.nguoi, d.ghi_chu,
      CONVERT(varchar(19), d.created_at, 120) AS created_at,
      COUNT(h.id) AS so_hv,
      SUM(CASE WHEN h.kt_duyet_at IS NULL THEN 1 ELSE 0 END) AS cho_duyet,
      SUM(CASE WHEN h.kt_duyet_at IS NOT NULL THEN 1 ELSE 0 END) AS da_duyet,
      ISNULL(SUM(CAST(h.nop_kt_so_tien AS BIGINT)), 0) AS tong_tien
    FROM ${NOP_KT_TABLE} d WITH (NOLOCK)
    LEFT JOIN ${TABLE} h WITH (NOLOCK) ON h.nop_kt_dot = d.id
    GROUP BY d.id, d.ma_dot, d.nguoi, d.ghi_chu, d.created_at
    HAVING COUNT(h.id) > 0
    ORDER BY CASE WHEN SUM(CASE WHEN h.kt_duyet_at IS NULL THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END, d.created_at DESC`);
  return r.recordset.map((d) => ({ ...d, tong_tien: Number(d.tong_tien) }));
}

const DOT_COLUMNS = `${NOP_KT_COLUMNS}, dia_chi,
  nop_kt_so_tien, CONVERT(varchar(19), kt_duyet_at, 120) AS kt_duyet_at, kt_nguoi_duyet`;

/** Dòng của đợt: chưa duyệt -> số tiền theo dữ liệu hiện tại; đã duyệt -> số đã chốt */
function rowDot(hs, cfg, phieu) {
  const base = rowNopKt(hs, cfg);
  return {
    ...base,
    dia_chi: hs.dia_chi,
    so_tien: hs.kt_duyet_at ? hs.nop_kt_so_tien : base.so_tien,
    kt_duyet_at: hs.kt_duyet_at,
    kt_nguoi_duyet: hs.kt_nguoi_duyet,
    bo_hoc: hs.trang_thai === "bo_hoc",
    phieu_thu: phieu.filter((p) => p.ho_so_id === hs.id),
  };
}

async function layDot(pool, id) {
  const d = await pool.request().input("id", mssql.Int, Number(id)).query(`
    SELECT id, ISNULL(ma_dot, CONCAT('TS', FORMAT(created_at, 'yyMMddHHmmss'))) AS ma_dot, nguoi, ghi_chu,
      CONVERT(varchar(10), tu_ngay, 23) AS tu_ngay, CONVERT(varchar(10), den_ngay, 23) AS den_ngay,
      CONVERT(varchar(19), created_at, 120) AS created_at
    FROM ${NOP_KT_TABLE} WHERE id = @id`);
  if (!d.recordset[0]) throw httpError(404, "Không tìm thấy đợt gửi");
  return d.recordset[0];
}

async function chiTietDot(id) {
  await ensureTables();
  const pool = await connectSQL();
  const dot = await layDot(pool, id);
  const [r, cfg, ph] = await Promise.all([
    pool.request().input("id", mssql.Int, Number(id))
      .query(`SELECT ${DOT_COLUMNS} FROM ${TABLE} WITH (NOLOCK) WHERE nop_kt_dot = @id ORDER BY duyet_at, id`),
    getCauHinh(),
    pool.request().input("id", mssql.Int, Number(id)).query(`
      SELECT p.id, p.ho_so_id, p.so_phieu, p.so_tien, p.hinh_thuc, p.ghi_chu, p.nguoi_thu, CONVERT(varchar(19), p.created_at, 120) AS created_at
      FROM ${PHIEU_TABLE} p WITH (NOLOCK) JOIN ${TABLE} h WITH (NOLOCK) ON h.id = p.ho_so_id
      WHERE h.nop_kt_dot = @id ORDER BY p.id DESC`),
  ]);
  const data = r.recordset.map((hs) => rowDot(hs, cfg, ph.recordset));
  return {
    dot,
    data,
    tong_hv: data.length,
    cho_duyet: data.filter((x) => !x.kt_duyet_at).length,
    da_duyet: data.filter((x) => x.kt_duyet_at).length,
    tong_tien: data.reduce((s, x) => s + (x.so_tien || 0), 0),
  };
}

/**
 * Kế toán duyệt thu các học viên đã chọn trong đợt: chốt số phải thu, lập phiếu thu (thu đủ phần còn lại),
 * khoá dữ liệu hồ sơ bên tiếp sinh. Trả về phiếu để in.
 */
async function duyetDot(id, body = {}, nguoi) {
  await ensureTables();
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw httpError(400, "Chưa chọn học viên nào để duyệt");
  const pool = await connectSQL();
  const dot = await layDot(pool, id);
  const cfg = await getCauHinh();

  const ketQua = await trongGiaoDich(async (tx, log) => {
    const r = await new mssql.Request(tx).input("dot", mssql.Int, dot.id).query(`
      SELECT ${DOT_COLUMNS},
        (SELECT ISNULL(SUM(so_tien), 0) FROM ${PHIEU_TABLE} p WHERE p.ho_so_id = h.id) AS da_thu
      FROM ${TABLE} h WITH (UPDLOCK) WHERE nop_kt_dot = @dot AND id IN (${ids.join(",")})`);
    const byId = new Map(r.recordset.map((x) => [x.id, x]));
    const loi = [];
    for (const hid of ids) {
      const hs = byId.get(hid);
      if (!hs) loi.push(`#${hid}: không thuộc đợt ${dot.ma_dot}`);
      else if (hs.kt_duyet_at) loi.push(`${hs.ho_ten} (${hs.ma_ho_so}): đã duyệt trước đó`);
      else if (hs.trang_thai === "bo_hoc") loi.push(`${hs.ho_ten} (${hs.ma_ho_so}): đã bỏ học`);
      else if (rowNopKt(hs, cfg).so_tien === null) loi.push(`${hs.ho_ten} (${hs.ma_ho_so}): chưa có giá`);
    }
    if (loi.length) throw httpError(400, `Không duyệt được: ${loi.slice(0, 5).join("; ")}${loi.length > 5 ? "…" : ""}`);

    // Cả lần duyệt dùng chung 1 số phiếu thu (Phòng tiếp sinh nộp theo danh sách mã hồ sơ)
    let soPhieu = null;
    const out = [];
    for (const hid of ids) {
      const hs = byId.get(hid);
      const phaiThu = rowNopKt(hs, cfg).so_tien;
      await new mssql.Request(tx).input("id", mssql.Int, hid).input("st", mssql.Int, phaiThu).input("ng", mssql.NVarChar(255), nguoi || null)
        .query(`UPDATE ${TABLE} SET nop_kt_so_tien = @st, kt_duyet_at = GETDATE(), kt_nguoi_duyet = @ng WHERE id = @id`);
      const canThu = phaiThu - (hs.da_thu || 0);
      let phieu = null;
      if (canThu > 0) {
        if (!soPhieu) soPhieu = await soPhieuTiep(new mssql.Request(tx));
        const ins = await new mssql.Request(tx)
          .input("sp", mssql.VarChar(30), soPhieu).input("id", mssql.Int, hid).input("st", mssql.Int, canThu)
          .input("gc", mssql.NVarChar(500), `Đợt ${dot.ma_dot}`).input("ng", mssql.NVarChar(255), nguoi || null)
          .query(`INSERT INTO ${PHIEU_TABLE}(so_phieu, ho_so_id, so_tien, hinh_thuc, ghi_chu, nguoi_thu)
                  OUTPUT INSERTED.id, INSERTED.ho_so_id, INSERTED.so_phieu, INSERTED.so_tien, INSERTED.hinh_thuc, INSERTED.ghi_chu, INSERTED.nguoi_thu,
                         CONVERT(varchar(19), INSERTED.created_at, 120) AS created_at
                  VALUES (@sp, @id, @st, 'tien_mat', @gc, @ng)`);
        phieu = ins.recordset[0];
      }
      await log(hid, "kt_duyet_thu",
        `Kế toán duyệt thu (đợt ${dot.ma_dot}) — phải thu ${phaiThu.toLocaleString("vi-VN")} đ${phieu ? `, phiếu ${phieu.so_phieu}` : ""}. Dữ liệu hồ sơ đã khoá`,
        nguoi, { soTien: phieu?.so_tien ?? null });
      out.push({ id: hid, phieu });
    }
    return out;
  });

  const chiTiet = await chiTietDot(dot.id);
  const byId = new Map(chiTiet.data.map((x) => [x.id, x]));
  const vuaDuyet = ketQua.map((k) => ({ ho_so: byId.get(k.id), phieu: k.phieu }));
  const coPhieu = vuaDuyet.filter((x) => x.phieu);
  return {
    ...chiTiet,
    vua_duyet: vuaDuyet,
    // phiếu thu chung để in
    phieu_chung: coPhieu.length
      ? {
          so_phieu: coPhieu[0].phieu.so_phieu,
          created_at: coPhieu[0].phieu.created_at,
          nguoi_thu: coPhieu[0].phieu.nguoi_thu,
          so_tien: coPhieu.reduce((s, x) => s + x.phieu.so_tien, 0),
          ho_so: coPhieu.map((x) => ({ ...x.ho_so, so_tien_thu: x.phieu.so_tien })),
        }
      : null,
  };
}

module.exports = { danhSach, thongKe, xemSoPhieu, chiTiet, thuPhi, danhSachDot, chiTietDot, duyetDot, HINH_THUC };
