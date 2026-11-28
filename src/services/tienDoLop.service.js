"use strict";

/**
 * Đào tạo — quản lý tiến độ đào tạo của 1 lớp:
 *  1. Danh sách học viên của lớp
 *  2. Ghép giáo viên – xe theo nhóm (mặc định 5 học viên / 1 GV – xe), có tự động ghép đề xuất
 *  3. Tổng quan khoá học + báo cáo
 *  4. Xác thực dữ liệu (đủ điều kiện mới in báo cáo gửi Cục)
 *
 * Giáo viên / xe gợi ý lấy từ dữ liệu sẵn có: bảng `xe` (danh sách xe tập lái) + `dang_ky_xe_gv` (lịch sử phân công).
 */

const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const xepLop = require("./xepLop.service");

const { ensureTables: ensureXepLop, LOP_TABLE, TABLE, DA_THU_APPLY, HV_COLUMNS, layLop, rowKhaiGiang, chuoi, httpError, trongGiaoDich } = xepLop._internal;
const NHOM_TABLE = "lop_nhom_gv_xe";
const XE_TABLE = "xe";
const DK_TABLE = "dang_ky_xe_gv";
const HV_MOI_NHOM = 5;
const HANG_MO_TO = ["A", "A1"]; // mô tô: không bắt buộc xe tập lái

let _initPromise = null;
function ensureTables() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await ensureXepLop();
    const pool = await connectSQL();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${NHOM_TABLE}')
      BEGIN
        CREATE TABLE ${NHOM_TABLE} (
          id INT IDENTITY(1,1) PRIMARY KEY,
          lop_id INT NOT NULL,
          stt INT NOT NULL,
          giao_vien NVARCHAR(255) NULL,
          xe NVARCHAR(50) NULL,
          created_at DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_${NHOM_TABLE}_lop ON ${NHOM_TABLE}(lop_id);
      END
      IF COL_LENGTH('${LOP_TABLE}', 'ngay_ket_thuc') IS NULL ALTER TABLE ${LOP_TABLE} ADD ngay_ket_thuc DATE NULL;
      IF COL_LENGTH('${LOP_TABLE}', 'ghi_chu_tien_do') IS NULL ALTER TABLE ${LOP_TABLE} ADD ghi_chu_tien_do NVARCHAR(1000) NULL;
      IF COL_LENGTH('${LOP_TABLE}', 'xac_thuc_at') IS NULL ALTER TABLE ${LOP_TABLE} ADD xac_thuc_at DATETIME NULL;
      IF COL_LENGTH('${LOP_TABLE}', 'nguoi_xac_thuc') IS NULL ALTER TABLE ${LOP_TABLE} ADD nguoi_xac_thuc NVARCHAR(255) NULL;
    `);
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

const laMoTo = (hang) => HANG_MO_TO.includes(String(hang || "").toUpperCase());
const chuanBienSo = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Danh sách xe tập lái (theo hạng) + giáo viên kèm xe hay dùng gần nhất */
async function goiY(hang) {
  await ensureTables();
  const pool = await connectSQL();
  const req = pool.request();
  let whereXe = "";
  if (chuoi(hang, 20) && !laMoTo(hang)) {
    req.input("hang", mssql.NVarChar(20), chuoi(hang, 20));
    whereXe = "WHERE hang_xe_tap_lai = @hang";
  }
  const r = await req.query(`
    SELECT bien_so_xe, hang_xe_tap_lai AS hang, nhan_hieu, CONVERT(varchar(10), ngay_het_han_gpxtl, 23) AS het_han_gpxtl
    FROM ${XE_TABLE} WITH (NOLOCK) ${whereXe} ORDER BY bien_so_xe;

    -- Mỗi giáo viên: xe B1/B2 của lần phân công gần nhất
    SELECT g.giao_vien, x.xe_b1, x.xe_b2, g.so_hv
    FROM (
      SELECT giao_vien, MAX(id) AS id_cuoi, COUNT(*) AS so_hv
      FROM ${DK_TABLE} WITH (NOLOCK) WHERE giao_vien IS NOT NULL AND LTRIM(RTRIM(giao_vien)) <> ''
      GROUP BY giao_vien
    ) g
    JOIN ${DK_TABLE} x WITH (NOLOCK) ON x.id = g.id_cuoi
    ORDER BY g.id_cuoi DESC;`);
  return {
    xe: r.recordsets[0],
    giao_vien: r.recordsets[1].map((g) => ({ ten: g.giao_vien, xe_b1: g.xe_b1, xe_b2: g.xe_b2, so_hv: g.so_hv })),
  };
}

async function layNhom(pool, lopId) {
  const r = await pool.request().input("lop", mssql.Int, lopId).query(`
    SELECT n.id, n.stt, n.giao_vien, n.xe, CONVERT(varchar(19), n.created_at, 120) AS created_at, (SELECT COUNT(*) FROM ${TABLE} h WITH (NOLOCK) WHERE h.nhom_id = n.id) AS so_hv
    FROM ${NHOM_TABLE} n WITH (NOLOCK) WHERE n.lop_id = @lop ORDER BY n.stt`);
  return r.recordset;
}

/** Lớp khác (chưa kết thúc) có thời gian trùng mà dùng cùng giáo viên / xe */
async function trungLich(pool, lop, nhom) {
  if (!nhom.length) return [];
  const r = await pool.request().input("id", mssql.Int, lop.id).query(`
    SELECT n.giao_vien, n.xe, l.hang, l.khoa, CONVERT(varchar(10), l.ngay_khai_giang, 23) AS bd, CONVERT(varchar(10), l.ngay_ket_thuc, 23) AS kt
    FROM ${NHOM_TABLE} n WITH (NOLOCK) JOIN ${LOP_TABLE} l WITH (NOLOCK) ON l.id = n.lop_id
    WHERE n.lop_id <> @id AND (l.ngay_ket_thuc IS NULL OR l.ngay_ket_thuc >= CAST(GETDATE() AS date))`);
  const bd = lop.ngay_khai_giang || "0000-00-00";
  const kt = lop.ngay_ket_thuc || "9999-12-31";
  const out = [];
  for (const k of r.recordset) {
    const giao = (k.bd || "0000-00-00") <= kt && (k.kt || "9999-12-31") >= bd;
    if (!giao) continue;
    for (const n of nhom) {
      if (n.giao_vien && k.giao_vien && n.giao_vien.trim().toLowerCase() === k.giao_vien.trim().toLowerCase()) {
        out.push(`Giáo viên ${n.giao_vien} (nhóm ${n.stt}) đang dạy lớp ${k.hang} - ${k.khoa}`);
      }
      if (n.xe && k.xe && chuanBienSo(n.xe) === chuanBienSo(k.xe)) out.push(`Xe ${n.xe} (nhóm ${n.stt}) đang dùng cho lớp ${k.hang} - ${k.khoa}`);
    }
  }
  return [...new Set(out)];
}

/** Xe hết hạn giấy phép xe tập lái trước khi lớp kết thúc / xe không có trong danh sách xe */
async function kiemTraXe(pool, lop, nhom) {
  const ds = nhom.filter((n) => n.xe);
  if (!ds.length) return [];
  const r = await pool.request().query(`SELECT bien_so_xe, CONVERT(varchar(10), ngay_het_han_gpxtl, 23) AS het_han FROM ${XE_TABLE} WITH (NOLOCK)`);
  const map = new Map(r.recordset.map((x) => [chuanBienSo(x.bien_so_xe), x.het_han]));
  const moc = lop.ngay_ket_thuc || lop.ngay_khai_giang || new Date().toISOString().slice(0, 10);
  const out = [];
  for (const n of ds) {
    const k = chuanBienSo(n.xe);
    if (!map.has(k)) out.push(`Xe ${n.xe} (nhóm ${n.stt}) không có trong danh sách xe tập lái`);
    else if (map.get(k) && map.get(k) < moc) out.push(`Xe ${n.xe} (nhóm ${n.stt}) hết hạn giấy phép xe tập lái ngày ${map.get(k).split("-").reverse().join("/")}`);
  }
  return out;
}

async function chiTiet(id) {
  await ensureTables();
  const pool = await connectSQL();
  const goc = await layLop(pool, id);
  const ext = await pool.request().input("id", mssql.Int, goc.id).query(`
    SELECT CONVERT(varchar(10), ngay_ket_thuc, 23) AS ngay_ket_thuc, ghi_chu_tien_do,
      CONVERT(varchar(19), xac_thuc_at, 120) AS xac_thuc_at, nguoi_xac_thuc FROM ${LOP_TABLE} WHERE id = @id`);
  const lop = { ...rowKhaiGiang(goc), ...ext.recordset[0] };
  const [hv, nhom] = await Promise.all([
    pool.request().input("id", mssql.Int, lop.id).query(`
      SELECT ${HV_COLUMNS}, h.nhom_id, CONVERT(varchar(16), h.thoi_gian_kham, 120) AS thoi_gian_kham, h.gplx_so, h.gplx_hang
      FROM ${TABLE} h WITH (NOLOCK) ${DA_THU_APPLY} WHERE h.lop_id = @id ORDER BY h.ho_ten, h.id`),
    layNhom(pool, lop.id),
  ]);
  const hocVien = hv.recordset;
  const daGhep = hocVien.filter((h) => h.nhom_id).length;
  const thieuGvXe = nhom.filter((n) => !n.giao_vien || (!n.xe && !laMoTo(lop.hang)));
  const [trung, loiXe] = await Promise.all([trungLich(pool, lop, nhom), kiemTraXe(pool, lop, nhom)]);

  const canhBao = [];
  if (!nhom.length) canhBao.push({ muc: "warn", text: "Chưa có nhóm giáo viên – xe nào" });
  else if (thieuGvXe.length) canhBao.push({ muc: "warn", text: `${thieuGvXe.length} nhóm chưa đủ giáo viên${laMoTo(lop.hang) ? "" : " / xe"} (nhóm ${thieuGvXe.map((n) => n.stt).join(", ")})` });
  else if (!loiXe.length) canhBao.push({ muc: "ok", text: "Tất cả giáo viên, xe đều đủ điều kiện" });
  loiXe.forEach((t) => canhBao.push({ muc: "error", text: t }));
  if (nhom.length) {
    if (trung.length) trung.forEach((t) => canhBao.push({ muc: "error", text: `Trùng lịch: ${t}` }));
    else canhBao.push({ muc: "ok", text: "Không trùng lịch với lớp khác" });
  }
  const conLai = hocVien.length - daGhep;
  canhBao.push(conLai ? { muc: "warn", text: `Còn ${conLai} học viên chưa ghép nhóm` } : { muc: "ok", text: "Tất cả học viên đã được ghép nhóm" });
  if (!lop.ngay_ket_thuc) canhBao.push({ muc: "warn", text: "Chưa nhập ngày dự kiến kết thúc" });

  const loi = canhBao.filter((c) => c.muc !== "ok").map((c) => c.text);
  return {
    lop,
    hoc_vien: hocVien,
    nhom,
    hv_moi_nhom: HV_MOI_NHOM,
    bat_buoc_xe: !laMoTo(lop.hang),
    canh_bao: canhBao,
    du_dieu_kien_xac_thuc: hocVien.length > 0 && !loi.length,
    tong_quan: {
      tong_hv: hocVien.length,
      da_ghep: daGhep,
      giao_vien: new Set(nhom.map((n) => n.giao_vien && n.giao_vien.trim().toLowerCase()).filter(Boolean)).size,
      xe: new Set(nhom.map((n) => n.xe && chuanBienSo(n.xe)).filter(Boolean)).size,
    },
  };
}

async function canSua(pool, id) {
  const lop = await layLop(pool, id);
  const r = await pool.request().input("id", mssql.Int, lop.id).query(`SELECT xac_thuc_at FROM ${LOP_TABLE} WHERE id = @id`);
  if (r.recordset[0]?.xac_thuc_at) throw httpError(400, `Lớp ${lop.hang} - ${lop.khoa} đã xác thực dữ liệu, không sửa được nữa (bỏ xác thực trước)`);
  return lop;
}

async function luuThongTin(id, body = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await layLop(pool, id);
  const kt = chuoi(body.ngay_ket_thuc, 10);
  if (kt && !/^\d{4}-\d{2}-\d{2}$/.test(kt)) throw httpError(400, "Ngày kết thúc không hợp lệ");
  if (kt && lop.ngay_khai_giang && kt < lop.ngay_khai_giang) throw httpError(400, "Ngày kết thúc phải sau ngày khai giảng");
  await pool.request().input("id", mssql.Int, lop.id).input("kt", mssql.VarChar(10), kt).input("gc", mssql.NVarChar(1000), chuoi(body.ghi_chu_tien_do, 1000))
    .query(`UPDATE ${LOP_TABLE} SET ngay_ket_thuc = CONVERT(date, @kt, 23), ghi_chu_tien_do = @gc WHERE id = @id`);
  return chiTiet(lop.id);
}

/** Tạo / sửa nhóm: { giao_vien, xe } */
async function luuNhom(lopId, nhomId, body = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await canSua(pool, lopId);
  const gv = chuoi(body.giao_vien);
  const xe = chuoi(body.xe, 50);
  if (nhomId) {
    const r = await pool.request().input("id", mssql.Int, Number(nhomId)).input("lop", mssql.Int, lop.id)
      .input("gv", mssql.NVarChar(255), gv).input("xe", mssql.NVarChar(50), xe)
      .query(`UPDATE ${NHOM_TABLE} SET giao_vien = @gv, xe = @xe WHERE id = @id AND lop_id = @lop; SELECT @@ROWCOUNT AS n`);
    if (!r.recordset[0].n) throw httpError(404, "Không tìm thấy nhóm");
  } else {
    await pool.request().input("lop", mssql.Int, lop.id).input("gv", mssql.NVarChar(255), gv).input("xe", mssql.NVarChar(50), xe)
      .query(`INSERT INTO ${NHOM_TABLE} (lop_id, stt, giao_vien, xe)
              SELECT @lop, ISNULL(MAX(stt), 0) + 1, @gv, @xe FROM ${NHOM_TABLE} WHERE lop_id = @lop`);
  }
  return chiTiet(lop.id);
}

async function xoaNhom(lopId, nhomId) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await canSua(pool, lopId);
  await trongGiaoDich(async (tx) => {
    await new mssql.Request(tx).input("id", mssql.Int, Number(nhomId)).input("lop", mssql.Int, lop.id).query(`
      UPDATE ${TABLE} SET nhom_id = NULL WHERE nhom_id = @id AND lop_id = @lop;
      DELETE FROM ${NHOM_TABLE} WHERE id = @id AND lop_id = @lop;`);
    // đánh số lại nhóm 1..n
    await new mssql.Request(tx).input("lop", mssql.Int, lop.id).query(`
      WITH x AS (SELECT id, ROW_NUMBER() OVER (ORDER BY stt) AS rn FROM ${NHOM_TABLE} WHERE lop_id = @lop)
      UPDATE n SET stt = x.rn FROM ${NHOM_TABLE} n JOIN x ON x.id = n.id;`);
  });
  return chiTiet(lop.id);
}

/** Đưa học viên vào nhóm (nhom_id = null -> bỏ khỏi nhóm) */
async function ganNhom(lopId, body = {}) {
  await ensureTables();
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean))];
  if (!ids.length) throw httpError(400, "Chưa chọn học viên");
  const pool = await connectSQL();
  const lop = await canSua(pool, lopId);
  const nhomId = body.nhom_id ? Number(body.nhom_id) : null;
  if (nhomId) {
    const n = await pool.request().input("id", mssql.Int, nhomId).input("lop", mssql.Int, lop.id)
      .query(`SELECT id FROM ${NHOM_TABLE} WHERE id = @id AND lop_id = @lop`);
    if (!n.recordset[0]) throw httpError(404, "Không tìm thấy nhóm");
  }
  const req = pool.request().input("lop", mssql.Int, lop.id).input("nhom", mssql.Int, nhomId);
  ids.forEach((v, i) => req.input(`i${i}`, mssql.Int, v));
  await req.query(`UPDATE ${TABLE} SET nhom_id = @nhom WHERE lop_id = @lop AND id IN (${ids.map((_, i) => `@i${i}`).join(",")})`);
  return chiTiet(lop.id);
}

/**
 * Tự động ghép đề xuất: chia học viên chưa có nhóm thành nhóm 5 người.
 * Ưu tiên lấp chỗ trống nhóm có sẵn; nhóm mới lấy giáo viên + xe quen dùng (lịch sử phân công),
 * bỏ qua giáo viên / xe đã có trong lớp này hoặc đang bận lớp khác.
 */
async function tuDongGhep(lopId) {
  await ensureTables();
  const pool = await connectSQL();
  const lop = await canSua(pool, lopId);
  const ct = await chiTiet(lop.id);
  let cho = ct.hoc_vien.filter((h) => !h.nhom_id).map((h) => h.id);
  if (!cho.length) throw httpError(400, "Tất cả học viên đã được ghép nhóm");

  const ganTheo = []; // [nhomId, [hvIds]]
  for (const n of ct.nhom) {
    const trong = HV_MOI_NHOM - n.so_hv;
    if (trong > 0 && cho.length) ganTheo.push([n.id, cho.splice(0, trong)]);
  }
  const soNhomMoi = Math.ceil(cho.length / HV_MOI_NHOM);
  const nhomMoi = [];
  if (soNhomMoi) {
    const [gy, ban] = await Promise.all([
      goiY(lop.hang),
      pool.request().input("id", mssql.Int, lop.id).query(`
        SELECT n.giao_vien, n.xe FROM ${NHOM_TABLE} n JOIN ${LOP_TABLE} l ON l.id = n.lop_id
        WHERE n.lop_id = @id OR l.ngay_ket_thuc IS NULL OR l.ngay_ket_thuc >= CAST(GETDATE() AS date)`),
    ]);
    const gvBan = new Set(ban.recordset.map((b) => String(b.giao_vien || "").trim().toLowerCase()).filter(Boolean));
    const xeBan = new Set(ban.recordset.map((b) => chuanBienSo(b.xe)).filter(Boolean));
    const xeHopLe = new Map(gy.xe.map((x) => [chuanBienSo(x.bien_so_xe), x]));
    const moc = lop.ngay_ket_thuc || lop.ngay_khai_giang || new Date().toISOString().slice(0, 10);
    const xeConHan = (bs) => {
      const x = xeHopLe.get(chuanBienSo(bs));
      return x && (!x.het_han_gpxtl || x.het_han_gpxtl >= moc);
    };
    const moTo = laMoTo(lop.hang);
    const cot = String(lop.hang).toUpperCase() === "B1" ? "xe_b1" : "xe_b2";
    for (const g of gy.giao_vien) {
      if (nhomMoi.length >= soNhomMoi) break;
      if (gvBan.has(g.ten.trim().toLowerCase())) continue;
      let xe = null;
      if (!moTo) {
        xe = [g[cot], g.xe_b2, g.xe_b1].find((bs) => bs && !xeBan.has(chuanBienSo(bs)) && xeConHan(bs)) || null;
        if (!xe) continue;
        xeBan.add(chuanBienSo(xe));
      }
      gvBan.add(g.ten.trim().toLowerCase());
      nhomMoi.push({ giao_vien: g.ten, xe });
    }
    while (nhomMoi.length < soNhomMoi) nhomMoi.push({ giao_vien: null, xe: null }); // thiếu GV/xe -> để trống, phân công tay
  }

  await trongGiaoDich(async (tx) => {
    for (const [nhomId, hvIds] of ganTheo) {
      const q = new mssql.Request(tx).input("n", mssql.Int, nhomId);
      hvIds.forEach((v, i) => q.input(`i${i}`, mssql.Int, v));
      await q.query(`UPDATE ${TABLE} SET nhom_id = @n WHERE id IN (${hvIds.map((_, i) => `@i${i}`).join(",")})`);
    }
    let stt = ct.nhom.reduce((m, n) => Math.max(m, n.stt), 0);
    for (const nm of nhomMoi) {
      const hvIds = cho.splice(0, HV_MOI_NHOM);
      const r = await new mssql.Request(tx).input("lop", mssql.Int, lop.id).input("stt", mssql.Int, ++stt)
        .input("gv", mssql.NVarChar(255), nm.giao_vien).input("xe", mssql.NVarChar(50), nm.xe)
        .query(`INSERT INTO ${NHOM_TABLE} (lop_id, stt, giao_vien, xe) OUTPUT INSERTED.id VALUES (@lop, @stt, @gv, @xe)`);
      const q = new mssql.Request(tx).input("n", mssql.Int, r.recordset[0].id);
      hvIds.forEach((v, i) => q.input(`i${i}`, mssql.Int, v));
      await q.query(`UPDATE ${TABLE} SET nhom_id = @n WHERE id IN (${hvIds.map((_, i) => `@i${i}`).join(",")})`);
    }
  });
  return chiTiet(lop.id);
}

/** Xác thực dữ liệu: đủ điều kiện (không còn cảnh báo) mới cho in báo cáo gửi Cục. huy=true -> bỏ xác thực */
async function xacThuc(id, nguoi = null, huy = false) {
  await ensureTables();
  const pool = await connectSQL();
  const ct = await chiTiet(id);
  if (!huy && !ct.du_dieu_kien_xac_thuc) {
    throw httpError(400, `Chưa xác thực được: ${ct.canh_bao.filter((c) => c.muc !== "ok").map((c) => c.text).join("; ")}`);
  }
  await pool.request().input("id", mssql.Int, ct.lop.id).input("ng", mssql.NVarChar(255), huy ? null : nguoi)
    .query(`UPDATE ${LOP_TABLE} SET xac_thuc_at = ${huy ? "NULL" : "GETDATE()"}, nguoi_xac_thuc = @ng WHERE id = @id`);
  return chiTiet(ct.lop.id);
}

module.exports = { chiTiet, goiY, luuThongTin, luuNhom, xoaNhom, ganNhom, tuDongGhep, xacThuc };
