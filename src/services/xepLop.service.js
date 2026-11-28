"use strict";

/**
 * Đào tạo — xếp lớp học viên.
 *
 *  - Chỉ học viên đã được Phòng kế toán thu ĐỦ tiền (đã thu >= phải thu) và chưa bỏ học mới đủ điều kiện.
 *  - "Tạo lớp": lớp dự kiến (hạng, khoá, ngày khai giảng, cơ sở, sức chứa) để nhặt tạm học viên vào.
 *  - Chọn trong danh sách hoặc quét QR mã hồ sơ -> học viên vào lớp đang chọn.
 *  - "Vào khoá": chốt lớp -> lớp chuyển sang mục "Danh sách lớp", học viên được đánh dấu đã vào khoá.
 */

const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const tiepSinh = require("./tiepSinh.service");

const { ensureTables: ensureTiepSinh, TABLE, LOG_TABLE, httpError, trongGiaoDich } = tiepSinh._internal;
const LOP_TABLE = "lop_hoc_du_kien";
const PHIEU_TABLE = "phieu_thu_tiep_sinh";
const DAU_MOI_TABLE = "tiep_sinh_dau_moi";
const TT_LOP = { DU_KIEN: "du_kien", VAO_KHOA: "da_vao_khoa" };

let _initPromise = null;
function ensureTables() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await ensureTiepSinh();
    const pool = await connectSQL();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${LOP_TABLE}')
      BEGIN
        CREATE TABLE ${LOP_TABLE} (
          id INT IDENTITY(1,1) PRIMARY KEY,
          hang NVARCHAR(20) NOT NULL,
          khoa NVARCHAR(50) NOT NULL,
          ngay_khai_giang DATE NULL,
          co_so NVARCHAR(255) NULL,
          suc_chua INT NOT NULL DEFAULT 40,
          ghi_chu NVARCHAR(500) NULL,
          trang_thai VARCHAR(20) NOT NULL DEFAULT '${TT_LOP.DU_KIEN}',
          nguoi_tao NVARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT GETDATE(),
          vao_khoa_at DATETIME NULL,
          nguoi_vao_khoa NVARCHAR(255) NULL
        );
      END
      IF COL_LENGTH('${TABLE}', 'lop_id') IS NULL ALTER TABLE ${TABLE} ADD lop_id INT NULL;
      IF COL_LENGTH('${TABLE}', 'xep_lop_at') IS NULL ALTER TABLE ${TABLE} ADD xep_lop_at DATETIME NULL;
      -- Thời gian khám sức khoẻ (có giờ) — nhập lúc quét QR xếp lớp
      IF COL_LENGTH('${TABLE}', 'thoi_gian_kham') IS NULL ALTER TABLE ${TABLE} ADD thoi_gian_kham DATETIME NULL;
      IF COL_LENGTH('${DAU_MOI_TABLE}', 'dien_thoai') IS NULL ALTER TABLE ${DAU_MOI_TABLE} ADD dien_thoai VARCHAR(20) NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_${TABLE}_lop_id')
        CREATE INDEX IX_${TABLE}_lop_id ON ${TABLE}(lop_id);
    `);
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

// Tiền đã thu + ngày thu đủ (lần thu cuối) của từng hồ sơ
const DA_THU_APPLY = `OUTER APPLY (SELECT ISNULL(SUM(p.so_tien), 0) AS da_thu, MAX(p.created_at) AS lan_thu_cuoi
  FROM ${PHIEU_TABLE} p WITH (NOLOCK) WHERE p.ho_so_id = h.id) t`;
// Đủ điều kiện xếp lớp: kế toán đã thu đủ, chưa bỏ học
const DU_DIEU_KIEN = `h.nop_kt_at IS NOT NULL AND h.nop_kt_so_tien IS NOT NULL AND t.da_thu > 0
  AND t.da_thu >= h.nop_kt_so_tien AND h.bo_hoc_at IS NULL`;

const HV_COLUMNS = `h.id, h.ma_ho_so, h.ho_ten, CONVERT(varchar(10), h.ngay_sinh, 23) AS ngay_sinh, h.cccd, h.dien_thoai,
  h.dia_chi, h.hang, h.dau_moi, h.dia_diem_hoc AS co_so, h.nguoi_tiep_nhan, h.lop_id,
  CONVERT(varchar(19), t.lan_thu_cuoi, 120) AS ngay_du_dk,
  CONVERT(varchar(19), h.nop_kt_at, 120) AS ngay_nop,
  CONVERT(varchar(19), h.xep_lop_at, 120) AS xep_lop_at`;

const LOP_COLUMNS = `l.id, l.hang, l.khoa, CONVERT(varchar(10), l.ngay_khai_giang, 23) AS ngay_khai_giang, l.co_so, l.suc_chua,
  l.ghi_chu, l.trang_thai, l.nguoi_tao, CONVERT(varchar(19), l.created_at, 120) AS created_at,
  CONVERT(varchar(19), l.vao_khoa_at, 120) AS vao_khoa_at, l.nguoi_vao_khoa,
  (SELECT COUNT(*) FROM ${TABLE} x WITH (NOLOCK) WHERE x.lop_id = l.id) AS si_so`;

const chuoi = (v, max = 255) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

async function layLop(pool, id) {
  const r = await pool.request().input("id", mssql.Int, Number(id))
    .query(`SELECT ${LOP_COLUMNS} FROM ${LOP_TABLE} l WHERE l.id = @id`);
  const lop = r.recordset[0];
  if (!lop) throw httpError(404, "Không tìm thấy lớp");
  return lop;
}

function canDuKien(lop) {
  if (lop.trang_thai !== TT_LOP.DU_KIEN) throw httpError(400, `Lớp ${lop.hang} - ${lop.khoa} đã vào khoá, không thay đổi được nữa`);
}

/** Danh sách lớp: trang_thai = du_kien (mặc định) | da_vao_khoa | tat_ca */
async function danhSachLop(query = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const tt = query.trang_thai || TT_LOP.DU_KIEN;
  const req = pool.request();
  const where = [];
  if (tt !== "tat_ca") {
    req.input("tt", mssql.VarChar(20), tt);
    where.push("l.trang_thai = @tt");
  }
  const r = await req.query(`SELECT ${LOP_COLUMNS} FROM ${LOP_TABLE} l
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CASE WHEN l.trang_thai = '${TT_LOP.DU_KIEN}' THEN 0 ELSE 1 END, l.ngay_khai_giang, l.id`);
  return r.recordset;
}

function docLop(body = {}) {
  const hang = chuoi(body.hang, 20);
  const khoa = chuoi(body.khoa, 50);
  if (!hang) throw httpError(400, "Vui lòng chọn hạng");
  if (!khoa) throw httpError(400, "Vui lòng nhập tên khoá (vd K25)");
  const sucChua = parseInt(body.suc_chua, 10);
  if (!sucChua || sucChua < 1 || sucChua > 500) throw httpError(400, "Sức chứa phải từ 1 đến 500 học viên");
  const ngay = chuoi(body.ngay_khai_giang, 10);
  if (ngay && !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) throw httpError(400, "Ngày khai giảng không hợp lệ");
  return { hang: hang.toUpperCase(), khoa, sucChua, ngay, coSo: chuoi(body.co_so), ghiChu: chuoi(body.ghi_chu, 500) };
}

async function taoLop(body = {}, nguoi = null) {
  await ensureTables();
  const d = docLop(body);
  const pool = await connectSQL();
  const r = await pool.request()
    .input("hang", mssql.NVarChar(20), d.hang)
    .input("khoa", mssql.NVarChar(50), d.khoa)
    .input("ngay", mssql.VarChar(10), d.ngay)
    .input("co_so", mssql.NVarChar(255), d.coSo)
    .input("sc", mssql.Int, d.sucChua)
    .input("gc", mssql.NVarChar(500), d.ghiChu)
    .input("nguoi", mssql.NVarChar(255), nguoi)
    .query(`INSERT INTO ${LOP_TABLE} (hang, khoa, ngay_khai_giang, co_so, suc_chua, ghi_chu, nguoi_tao)
            OUTPUT INSERTED.id
            VALUES (@hang, @khoa, CONVERT(date, @ngay, 23), @co_so, @sc, @gc, @nguoi)`);
  return layLop(pool, r.recordset[0].id);
}

async function suaLop(id, body = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  canDuKien(lop);
  const d = docLop(body);
  if (d.sucChua < lop.si_so) throw httpError(400, `Lớp đang có ${lop.si_so} học viên, sức chứa không được nhỏ hơn`);
  if (d.hang !== lop.hang && lop.si_so > 0) throw httpError(400, "Lớp đã có học viên, không đổi hạng được");
  await pool.request().input("id", mssql.Int, lop.id)
    .input("hang", mssql.NVarChar(20), d.hang)
    .input("khoa", mssql.NVarChar(50), d.khoa)
    .input("ngay", mssql.VarChar(10), d.ngay)
    .input("co_so", mssql.NVarChar(255), d.coSo)
    .input("sc", mssql.Int, d.sucChua)
    .input("gc", mssql.NVarChar(500), d.ghiChu)
    .query(`UPDATE ${LOP_TABLE} SET hang = @hang, khoa = @khoa, ngay_khai_giang = CONVERT(date, @ngay, 23),
              co_so = @co_so, suc_chua = @sc, ghi_chu = @gc WHERE id = @id`);
  return layLop(pool, lop.id);
}

/** Xoá lớp dự kiến: trả học viên về danh sách đủ điều kiện */
async function xoaLop(id) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  canDuKien(lop);
  await trongGiaoDich(async (tx) => {
    await new mssql.Request(tx).input("id", mssql.Int, lop.id)
      .query(`UPDATE ${TABLE} SET lop_id = NULL, xep_lop_at = NULL WHERE lop_id = @id;
              DELETE FROM ${LOP_TABLE} WHERE id = @id`);
  });
  return { id: lop.id };
}

/** Học viên đủ điều kiện, chưa xếp lớp — kèm bộ lọc + số liệu nhanh */
async function duDieuKien(query = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 10));
  const req = pool.request();
  const where = [DU_DIEU_KIEN, "h.lop_id IS NULL"];
  if (chuoi(query.search)) {
    req.input("q", mssql.NVarChar(255), `%${chuoi(query.search)}%`);
    where.push("(h.ho_ten LIKE @q OR h.cccd LIKE @q OR h.ma_ho_so LIKE @q OR h.dien_thoai LIKE @q)");
  }
  for (const [k, col] of [["co_so", "h.dia_diem_hoc"], ["hang", "h.hang"], ["dau_moi", "h.dau_moi"]]) {
    if (chuoi(query[k])) {
      req.input(k, mssql.NVarChar(255), chuoi(query[k]));
      where.push(`${col} = @${k}`);
    }
  }
  req.input("offset", mssql.Int, (page - 1) * limit).input("limit", mssql.Int, limit);
  const w = where.join(" AND ");
  const r = await req.query(`
    SELECT COUNT(*) AS total FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${w};

    SELECT ${HV_COLUMNS} FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY}
    WHERE ${w}
    ORDER BY t.lan_thu_cuoi DESC, h.id DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    -- Bộ lọc + số liệu nhanh (toàn bộ học viên đủ điều kiện, không theo bộ lọc)
    SELECT DISTINCT h.dia_diem_hoc AS v FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${DU_DIEU_KIEN} AND h.dia_diem_hoc IS NOT NULL;
    SELECT DISTINCT h.hang AS v FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${DU_DIEU_KIEN} AND h.hang IS NOT NULL;
    SELECT DISTINCT h.dau_moi AS v FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${DU_DIEU_KIEN} AND h.dau_moi IS NOT NULL;
    SELECT COUNT(*) AS tong,
        SUM(CASE WHEN h.lop_id IS NULL THEN 1 ELSE 0 END) AS chua_xep,
        SUM(CASE WHEN h.lop_id IS NOT NULL THEN 1 ELSE 0 END) AS da_vao_lop,
        (SELECT COUNT(*) FROM ${LOP_TABLE} WHERE trang_thai = '${TT_LOP.VAO_KHOA}') AS lop_dang_hoc,
        (SELECT COUNT(*) FROM ${LOP_TABLE} WHERE trang_thai = '${TT_LOP.DU_KIEN}') AS lop_du_kien
      FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE ${DU_DIEU_KIEN};
  `);
  const ds = (i) => r.recordsets[i].map((x) => x.v).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "vi"));
  const tk = r.recordsets[5][0] || {};
  const total = r.recordsets[0][0]?.total || 0;
  return {
    data: r.recordsets[1],
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    bo_loc: { co_so: ds(2), hang: ds(3), dau_moi: ds(4) },
    thong_ke: { tong: tk.tong || 0, chua_xep: tk.chua_xep || 0, da_vao_lop: tk.da_vao_lop || 0, lop_dang_hoc: tk.lop_dang_hoc || 0, lop_du_kien: tk.lop_du_kien || 0 },
  };
}

async function chiTietLop(id) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  const r = await pool.request().input("id", mssql.Int, lop.id)
    .query(`SELECT ${HV_COLUMNS} FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE h.lop_id = @id ORDER BY h.xep_lop_at, h.id`);
  return { lop, hoc_vien: r.recordset };
}

/** Thêm học viên vào lớp (chọn trong danh sách hoặc quét QR) */
async function themVaoLop(id, ids = [], nguoi = null) {
  await ensureTables();
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))];
  if (!list.length) throw httpError(400, "Chưa chọn học viên");
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  canDuKien(lop);

  const req = pool.request();
  list.forEach((v, i) => req.input(`i${i}`, mssql.Int, v));
  const r = await req.query(`SELECT h.id, h.ma_ho_so, h.ho_ten, h.hang, h.lop_id, h.bo_hoc_at, h.nop_kt_so_tien, t.da_thu,
      CASE WHEN ${DU_DIEU_KIEN} THEN 1 ELSE 0 END AS du_dk
    FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE h.id IN (${list.map((_, i) => `@i${i}`).join(",")})`);
  const loi = [];
  for (const hv of r.recordset) {
    const ten = `${hv.ho_ten} (${hv.ma_ho_so})`;
    if (!hv.du_dk) loi.push(`${ten} chưa đủ điều kiện (chưa đóng đủ học phí hoặc đã bỏ học)`);
    else if (hv.lop_id === lop.id) loi.push(`${ten} đã ở trong lớp này`);
    else if (hv.lop_id) loi.push(`${ten} đã được xếp vào lớp khác`);
    else if (String(hv.hang || "").toUpperCase() !== lop.hang) loi.push(`${ten} học hạng ${hv.hang || "—"}, không khớp lớp hạng ${lop.hang}`);
  }
  if (r.recordset.length < list.length) loi.push("Có học viên không tồn tại");
  if (loi.length) throw httpError(400, loi.join("; "));
  if (lop.si_so + list.length > lop.suc_chua) {
    throw httpError(400, `Lớp chỉ còn ${Math.max(0, lop.suc_chua - lop.si_so)} chỗ trống (sức chứa ${lop.suc_chua})`);
  }

  await trongGiaoDich(async (tx, log) => {
    const u = new mssql.Request(tx).input("lop", mssql.Int, lop.id);
    list.forEach((v, i) => u.input(`i${i}`, mssql.Int, v));
    await u.query(`UPDATE ${TABLE} SET lop_id = @lop, xep_lop_at = GETDATE()
                   WHERE lop_id IS NULL AND id IN (${list.map((_, i) => `@i${i}`).join(",")})`);
    for (const hvId of list) await log(hvId, "xep_lop", `Xếp vào lớp dự kiến ${lop.hang} - ${lop.khoa}`, nguoi);
  });
  return chiTietLop(lop.id);
}

/** Tra cứu hồ sơ theo mã (nội dung QR = mã hồ sơ) để xem lại trước khi đưa vào lớp */
async function traCuu(ma) {
  await ensureTables();
  const maHs = chuoi(ma, 50);
  if (!maHs) throw httpError(400, "Không đọc được mã hồ sơ");
  const pool = await connectSQL();
  const r = await pool.request().input("ma", mssql.VarChar(50), maHs).query(`
    SELECT TOP 1 ${HV_COLUMNS}, h.kham_suc_khoe, CONVERT(varchar(10), h.ngay_kham, 23) AS ngay_kham,
      CONVERT(varchar(16), h.thoi_gian_kham, 120) AS thoi_gian_kham, dm.dien_thoai AS dau_moi_sdt,
      h.nop_kt_so_tien AS phai_thu, t.da_thu, h.bo_hoc_at,
      CASE WHEN ${DU_DIEU_KIEN} THEN 1 ELSE 0 END AS du_dk,
      l.hang AS lop_hang, l.khoa AS lop_khoa
    FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY}
    LEFT JOIN ${DAU_MOI_TABLE} dm WITH (NOLOCK) ON dm.ten = h.dau_moi
    LEFT JOIN ${LOP_TABLE} l WITH (NOLOCK) ON l.id = h.lop_id
    WHERE h.ma_ho_so = @ma`);
  const hv = r.recordset[0];
  if (!hv) throw httpError(404, `Không tìm thấy hồ sơ mã ${maHs}`);
  let canh_bao = null;
  if (hv.bo_hoc_at) canh_bao = "Học viên đã bỏ học";
  else if (!hv.du_dk) canh_bao = hv.phai_thu === null || !hv.da_thu ? "Học viên chưa đóng học phí" : "Học viên chưa đóng đủ học phí";
  else if (hv.lop_id) canh_bao = `Học viên đã được xếp vào lớp ${hv.lop_hang} - ${hv.lop_khoa}`;
  return { ...hv, du_dk: !!hv.du_dk, canh_bao };
}

/** Xác nhận sau khi quét QR: lưu thời gian khám sức khoẻ (nếu có) rồi đưa vào lớp */
async function quetQr(id, ma, nguoi = null, body = {}) {
  const hv = await traCuu(ma);
  const tgk = chuoi(body.thoi_gian_kham, 16);
  if (tgk && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(tgk)) throw httpError(400, "Thời gian khám sức khoẻ không hợp lệ");
  const kq = await themVaoLop(id, [hv.id], nguoi);
  if (tgk && tgk !== hv.thoi_gian_kham) {
    const pool = await connectSQL();
    await pool.request().input("id", mssql.Int, hv.id).input("t", mssql.VarChar(16), tgk)
      .query(`UPDATE ${TABLE} SET thoi_gian_kham = CONVERT(datetime, @t, 120) WHERE id = @id`);
  }
  return { ...kq, vua_them: kq.hoc_vien.find((h) => h.id === hv.id) };
}

async function boKhoiLop(id, ids = [], nguoi = null) {
  await ensureTables();
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))];
  if (!list.length) throw httpError(400, "Chưa chọn học viên");
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  canDuKien(lop);
  await trongGiaoDich(async (tx, log) => {
    const u = new mssql.Request(tx).input("lop", mssql.Int, lop.id);
    list.forEach((v, i) => u.input(`i${i}`, mssql.Int, v));
    await u.query(`UPDATE ${TABLE} SET lop_id = NULL, xep_lop_at = NULL
                   WHERE lop_id = @lop AND id IN (${list.map((_, i) => `@i${i}`).join(",")})`);
    for (const hvId of list) await log(hvId, "bo_xep_lop", `Bỏ khỏi lớp dự kiến ${lop.hang} - ${lop.khoa}`, nguoi);
  });
  return chiTietLop(lop.id);
}

/** Vào khoá: chốt lớp, chuyển sang "Danh sách lớp" */
async function vaoKhoa(id, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  canDuKien(lop);
  if (!lop.si_so) throw httpError(400, "Lớp chưa có học viên nào");
  await trongGiaoDich(async (tx, log) => {
    const req = new mssql.Request(tx).input("id", mssql.Int, lop.id).input("nguoi", mssql.NVarChar(255), nguoi);
    const r = await req.query(`
      UPDATE ${LOP_TABLE} SET trang_thai = '${TT_LOP.VAO_KHOA}', vao_khoa_at = GETDATE(), nguoi_vao_khoa = @nguoi WHERE id = @id;
      UPDATE ${TABLE} SET da_vao_khoa = 1 OUTPUT INSERTED.id WHERE lop_id = @id;`);
    for (const { id: hvId } of r.recordset) await log(hvId, "vao_khoa", `Vào khoá ${lop.hang} - ${lop.khoa}`, nguoi);
  });
  return chiTietLop(lop.id);
}

module.exports = { danhSachLop, taoLop, suaLop, xoaLop, duDieuKien, chiTietLop, themVaoLop, traCuu, quetQr, boKhoiLop, vaoKhoa, LOG_TABLE };
