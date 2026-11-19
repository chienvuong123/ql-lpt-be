"use strict";

/**
 * Tổ tiếp sinh — tiếp nhận hồ sơ học viên hạng mô tô (giai đoạn 1, chưa có kế toán).
 *
 * Luồng:
 *  1. HV tự khai (quét QR biểu mẫu / máy tính tại phòng) -> Google Sheet -> đồng bộ về đây
 *     NV quét CCCD -> bổ sung trường thiếu -> lưu thẳng DB
 *  2. Hồ sơ hiển thị trên web app ở trạng thái "Chờ duyệt"
 *  3. NV tiếp sinh đối chiếu CCCD, chụp ảnh, duyệt theo thứ tự thời gian nộp
 *  4. Bấm "Duyệt in" -> in hồ sơ cho học viên ký
 */

const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const googleSheetService = require("./googleSheet.service");
const Parser = require("../utils/googleSheetA1ExcelParser");
const { normalizeCccd } = require("../utils/cccd.util");

const TABLE = "ho_so_tiep_sinh";
const LOG_TABLE = "ho_so_tiep_sinh_log";
const CFG_TABLE = "tiep_sinh_cau_hinh";

const TRANG_THAI = {
  CHO_DUYET: "cho_duyet",
  CAN_BO_SUNG: "can_bo_sung",
  DA_DUYET: "da_duyet",
  DA_IN: "da_in",
};

// Trường bắt buộc trước khi duyệt
const REQUIRED_FIELDS = [
  ["ho_ten", "Họ và tên"],
  ["ngay_sinh", "Ngày sinh"],
  ["cccd", "Số CCCD"],
  ["ngay_cap_cccd", "Ngày cấp CCCD"],
  ["dia_chi", "Địa chỉ thường trú"],
  ["hang", "Hạng đăng ký"],
  ["co_anh", "Ảnh chân dung"],
];

// Các trường được phép ghi từ client
const EDITABLE = {
  ho_ten: mssql.NVarChar(255),
  gioi_tinh: mssql.NVarChar(10),
  cccd: mssql.VarChar(20),
  cmnd_cu: mssql.VarChar(20),
  noi_cap: mssql.NVarChar(255),
  dien_thoai: mssql.VarChar(30),
  email: mssql.NVarChar(255),
  dia_chi: mssql.NVarChar(500),
  noi_o_hien_tai: mssql.NVarChar(500),
  quoc_tich: mssql.NVarChar(50),
  hang: mssql.NVarChar(10),
  khoa_hoc: mssql.NVarChar(255),
  dia_diem_hoc: mssql.NVarChar(255),
  dau_moi: mssql.NVarChar(255),
  ghi_chu: mssql.NVarChar(1000),
  // theo Google Form: "Hạng A1" | "Hạng A - Xe côn tay (A)" | "Hạng A - Xe tay ga (A.02)"
  loai_hinh: mssql.NVarChar(100),
  // "Khám theo lịch trung tâm" | "Tự khám - tự nộp"
  kham_suc_khoe: mssql.NVarChar(100),
  // số tiền phải thu nhập tay (để trống = tính theo bảng giá trong cấu hình)
  tong_thu: mssql.Int,
};
const DATE_FIELDS = ["ngay_sinh", "ngay_cap_cccd"];

let _initPromise = null;

function ensureTables() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const pool = await connectSQL();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${TABLE}')
      BEGIN
        CREATE TABLE ${TABLE} (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ma_ho_so VARCHAR(30) NULL,
          so_thu_tu INT NULL,
          ho_ten NVARCHAR(255) NOT NULL,
          ngay_sinh DATE NULL,
          gioi_tinh NVARCHAR(10) NULL,
          cccd VARCHAR(20) NULL,
          cmnd_cu VARCHAR(20) NULL,
          ngay_cap_cccd DATE NULL,
          noi_cap NVARCHAR(255) NULL,
          dien_thoai VARCHAR(30) NULL,
          email NVARCHAR(255) NULL,
          dia_chi NVARCHAR(500) NULL,
          noi_o_hien_tai NVARCHAR(500) NULL,
          quoc_tich NVARCHAR(50) NULL,
          hang NVARCHAR(10) NULL,
          khoa_hoc NVARCHAR(255) NULL,
          dia_diem_hoc NVARCHAR(255) NULL,
          dau_moi NVARCHAR(255) NULL,
          ghi_chu NVARCHAR(1000) NULL,
          nguon VARCHAR(20) NOT NULL DEFAULT 'cccd',
          nguon_ref NVARCHAR(100) NULL,
          anh_chan_dung VARCHAR(MAX) NULL,
          da_doi_chieu_cccd BIT NOT NULL DEFAULT 0,
          trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet',
          ly_do_bo_sung NVARCHAR(500) NULL,
          nguoi_tiep_nhan NVARCHAR(255) NULL,
          nguoi_duyet NVARCHAR(255) NULL,
          thoi_gian_khai DATETIME NOT NULL DEFAULT GETDATE(),
          duyet_at DATETIME NULL,
          in_at DATETIME NULL,
          so_lan_in INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT GETDATE(),
          updated_at DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_${TABLE}_cccd ON ${TABLE}(cccd);
        CREATE INDEX IX_${TABLE}_thoi_gian_khai ON ${TABLE}(thoi_gian_khai) INCLUDE (trang_thai, hang);
        CREATE INDEX IX_${TABLE}_trang_thai ON ${TABLE}(trang_thai, thoi_gian_khai);
      END

      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${LOG_TABLE}')
      BEGIN
        CREATE TABLE ${LOG_TABLE} (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ho_so_id INT NOT NULL,
          hanh_dong VARCHAR(30) NOT NULL,
          noi_dung NVARCHAR(1000) NULL,
          nguoi NVARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_${LOG_TABLE}_ho_so ON ${LOG_TABLE}(ho_so_id);
      END

      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${CFG_TABLE}')
      BEGIN
        CREATE TABLE ${CFG_TABLE} (
          khoa VARCHAR(100) PRIMARY KEY,
          gia_tri NVARCHAR(MAX) NULL,
          updated_at DATETIME NOT NULL DEFAULT GETDATE()
        );
      END

      IF COL_LENGTH('${TABLE}', 'loai_hinh') IS NULL ALTER TABLE ${TABLE} ADD loai_hinh NVARCHAR(100) NULL;
      IF COL_LENGTH('${TABLE}', 'kham_suc_khoe') IS NULL ALTER TABLE ${TABLE} ADD kham_suc_khoe NVARCHAR(100) NULL;
      IF COL_LENGTH('${TABLE}', 'tong_thu') IS NULL ALTER TABLE ${TABLE} ADD tong_thu INT NULL;
    `);
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ─── Chuẩn hoá dữ liệu ─────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "dd/mm/yyyy", "ddmmyyyy", "yyyy-mm-dd" -> "yyyy-mm-dd" | null */
function toIsoDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const dmy = Parser.parseStringDate(s);
  m = String(dmy).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Chỉ có năm sinh
  m = s.match(/^(\d{4})$/);
  if (m) return null;
  return null;
}

/** Dấu thời gian Google Form "10/11/2025 9:15:32" -> "2025-11-10 09:15:32" */
function toSqlDateTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    if (Number(mo) > 12 && Number(d) <= 12) [d, mo] = [mo, d];
    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
  }
  return null;
}

function normalizeGioiTinh(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "nữ" || s === "nu" || s === "f" || s === "female") return "Nữ";
  if (s === "nam" || s === "m" || s === "male") return "Nam";
  return String(v).trim();
}

function normalizeHang(v) {
  const raw = String(v || "").trim();
  const fromForm = raw.match(/^hạng\s*(A1|A2|A|B1|B2|B|C1|C)\b/i);
  if (fromForm) return fromForm[1].toUpperCase();
  const s = raw.toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/A1|A2|A|B1|B2|B|C1|C/);
  return m ? m[0] : s.slice(0, 10);
}

function cleanPayload(data = {}) {
  const out = {};
  for (const key of Object.keys(EDITABLE)) {
    if (data[key] === undefined) continue;
    let v = data[key];
    v = v === null ? null : String(v).trim();
    if (v === "") v = null;
    if (key === "cccd" && v) v = normalizeCccd(v).replace(/\s+/g, "");
    if (key === "gioi_tinh") v = normalizeGioiTinh(v);
    if (key === "hang") v = normalizeHang(v);
    if (key === "noi_cap" && v && /^cục cảnh sát$/i.test(v)) v = "Cục Cảnh sát QLHC về TTXH";
    if (key === "tong_thu" && v !== null) {
      const n = Number(String(v).replace(/[^\d]/g, ""));
      v = String(v).replace(/[^\d]/g, "") ? n : null;
    }
    out[key] = v;
  }
  // Hạng suy ra từ loại hình học (Google Form)
  if (out.loai_hinh && data.hang === undefined) out.hang = normalizeHang(out.loai_hinh);
  for (const key of DATE_FIELDS) {
    if (data[key] === undefined) continue;
    out[key] = data[key] ? toIsoDate(data[key]) : null;
  }
  // Form không hỏi giới tính -> suy ra từ CCCD (chữ số thứ 4: chẵn = Nam, lẻ = Nữ)
  if (!out.gioi_tinh) {
    const g = gioiTinhTuCccd(out.cccd);
    if (g) out.gioi_tinh = g;
  }
  return out;
}

function gioiTinhTuCccd(cccd) {
  const s = String(cccd || "");
  if (!/^\d{12}$/.test(s)) return null;
  return Number(s[3]) % 2 === 0 ? "Nam" : "Nữ";
}

function withThieuTruong(row) {
  if (!row) return row;
  const thieu = REQUIRED_FIELDS.filter(([k]) => {
    const v = row[k];
    if (k === "co_anh") return !v;
    if (k === "cccd") return !v || !/^\d{12}$/.test(String(v));
    return v === null || v === undefined || String(v).trim() === "";
  }).map(([, label]) => label);
  return { ...row, thieu_truong: thieu };
}

const SELECT_COLUMNS = `
  id, ma_ho_so, so_thu_tu, ho_ten,
  CONVERT(varchar(10), ngay_sinh, 23) AS ngay_sinh,
  gioi_tinh, cccd, cmnd_cu,
  CONVERT(varchar(10), ngay_cap_cccd, 23) AS ngay_cap_cccd,
  noi_cap, dien_thoai, email, dia_chi, noi_o_hien_tai, quoc_tich,
  hang, khoa_hoc, dia_diem_hoc, dau_moi, ghi_chu, nguon, nguon_ref,
  loai_hinh, kham_suc_khoe, tong_thu,
  CAST(CASE WHEN anh_chan_dung IS NULL OR anh_chan_dung = '' THEN 0 ELSE 1 END AS BIT) AS co_anh,
  da_doi_chieu_cccd, trang_thai, ly_do_bo_sung, nguoi_tiep_nhan, nguoi_duyet,
  CONVERT(varchar(19), thoi_gian_khai, 120) AS thoi_gian_khai,
  CONVERT(varchar(19), duyet_at, 120) AS duyet_at,
  CONVERT(varchar(19), in_at, 120) AS in_at,
  so_lan_in,
  CONVERT(varchar(19), created_at, 120) AS created_at,
  CONVERT(varchar(19), updated_at, 120) AS updated_at`;

async function addLog(pool, hoSoId, hanhDong, noiDung, nguoi) {
  await pool
    .request()
    .input("id", mssql.Int, hoSoId)
    .input("hd", mssql.VarChar(30), hanhDong)
    .input("nd", mssql.NVarChar(1000), noiDung ? String(noiDung).slice(0, 1000) : null)
    .input("ng", mssql.NVarChar(255), nguoi || null)
    .query(`INSERT INTO ${LOG_TABLE}(ho_so_id, hanh_dong, noi_dung, nguoi) VALUES (@id, @hd, @nd, @ng)`)
    .catch((err) => console.error("[tiepSinh] log:", err.message));
}

// ─── Đọc dữ liệu ─────────────────────────────────────
async function getById(id, { withAnh = false } = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const r = await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .query(`SELECT ${SELECT_COLUMNS}${withAnh ? ", anh_chan_dung" : ""} FROM ${TABLE} WHERE id = @id`);
  return withThieuTruong(r.recordset[0] || null);
}

async function getDetail(id) {
  const row = await getById(id, { withAnh: true });
  if (!row) throw httpError(404, "Không tìm thấy hồ sơ");
  const pool = await connectSQL();
  const logs = await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .query(`SELECT id, hanh_dong, noi_dung, nguoi, CONVERT(varchar(19), created_at, 120) AS created_at
            FROM ${LOG_TABLE} WHERE ho_so_id = @id ORDER BY id DESC`);
  return { ...row, lich_su: logs.recordset };
}

async function list(query = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const req = pool.request();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 20));
  const where = [];

  if (query.tu_ngay) {
    req.input("tu", mssql.VarChar(10), toIsoDate(query.tu_ngay));
    where.push("thoi_gian_khai >= CONVERT(date, @tu, 23)");
  }
  if (query.den_ngay) {
    req.input("den", mssql.VarChar(10), toIsoDate(query.den_ngay));
    where.push("thoi_gian_khai < DATEADD(day, 1, CONVERT(date, @den, 23))");
  }
  if (query.trang_thai) {
    req.input("tt", mssql.VarChar(20), String(query.trang_thai));
    where.push("trang_thai = @tt");
  }
  if (query.hang) {
    req.input("hang", mssql.NVarChar(10), String(query.hang));
    where.push("hang = @hang");
  }
  if (query.nguon) {
    req.input("nguon", mssql.VarChar(20), String(query.nguon));
    where.push("nguon = @nguon");
  }
  if (query.search && String(query.search).trim()) {
    req.input("q", mssql.NVarChar(255), `%${String(query.search).trim()}%`);
    where.push("(ho_ten LIKE @q OR cccd LIKE @q OR ma_ho_so LIKE @q OR dien_thoai LIKE @q)");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  req.input("offset", mssql.Int, (page - 1) * limit).input("limit", mssql.Int, limit);

  const r = await req.query(`
    SELECT COUNT(*) AS total FROM ${TABLE} WITH (NOLOCK) ${whereSql};
    SELECT ${SELECT_COLUMNS} FROM ${TABLE} WITH (NOLOCK) ${whereSql}
    ORDER BY thoi_gian_khai DESC, id DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);
  const total = r.recordsets[0][0]?.total || 0;
  return {
    data: r.recordsets[1].map(withThieuTruong),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function thongKe(query = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const ngay = toIsoDate(query.ngay) || todayStr();
  const soNgay = Math.min(90, Math.max(1, parseInt(query.so_ngay, 10) || 7));

  const r = await pool
    .request()
    .input("ngay", mssql.VarChar(10), ngay)
    .input("so_ngay", mssql.Int, soNgay)
    .query(`
      DECLARE @d DATE = CONVERT(date, @ngay, 23);
      DECLARE @d1 DATE = DATEADD(day, 1, @d);
      DECLARE @y DATE = DATEADD(day, -1, @d);
      DECLARE @from DATE = DATEADD(day, 1 - @so_ngay, @d);

      -- 0: thẻ thống kê
      SELECT
        SUM(CASE WHEN thoi_gian_khai >= @d AND thoi_gian_khai < @d1 THEN 1 ELSE 0 END) AS hom_nay,
        SUM(CASE WHEN thoi_gian_khai >= @y AND thoi_gian_khai < @d THEN 1 ELSE 0 END) AS hom_qua,
        SUM(CASE WHEN trang_thai = 'cho_duyet' THEN 1 ELSE 0 END) AS cho_duyet,
        SUM(CASE WHEN trang_thai = 'cho_duyet' AND thoi_gian_khai >= @d AND thoi_gian_khai < @d1 THEN 1 ELSE 0 END) AS cho_duyet_moi,
        SUM(CASE WHEN trang_thai = 'can_bo_sung' THEN 1 ELSE 0 END) AS can_bo_sung,
        SUM(CASE WHEN trang_thai = 'can_bo_sung' AND thoi_gian_khai >= @d AND thoi_gian_khai < @d1 THEN 1 ELSE 0 END) AS can_bo_sung_moi,
        SUM(CASE WHEN duyet_at >= @d AND duyet_at < @d1 THEN 1 ELSE 0 END) AS da_duyet,
        SUM(CASE WHEN duyet_at >= @y AND duyet_at < @d THEN 1 ELSE 0 END) AS da_duyet_hom_qua,
        SUM(CASE WHEN in_at >= @d AND in_at < @d1 THEN 1 ELSE 0 END) AS da_in,
        SUM(CASE WHEN in_at >= @y AND in_at < @d THEN 1 ELSE 0 END) AS da_in_hom_qua,
        COUNT(*) AS tong,
        SUM(CASE WHEN trang_thai IN ('da_duyet','da_in') THEN 1 ELSE 0 END) AS tong_da_xu_ly
      FROM ${TABLE} WITH (NOLOCK);

      -- 1: biểu đồ theo ngày
      ;WITH days AS (
        SELECT @from AS ngay
        UNION ALL SELECT DATEADD(day, 1, ngay) FROM days WHERE ngay < @d
      )
      SELECT CONVERT(varchar(10), days.ngay, 23) AS ngay,
        (SELECT COUNT(*) FROM ${TABLE} WITH (NOLOCK) WHERE CAST(thoi_gian_khai AS DATE) = days.ngay) AS tong,
        (SELECT COUNT(*) FROM ${TABLE} WITH (NOLOCK) WHERE CAST(duyet_at AS DATE) = days.ngay) AS da_xu_ly
      FROM days OPTION (MAXRECURSION 100);

      -- 2: tỷ lệ theo trạng thái trong khoảng
      SELECT trang_thai, COUNT(*) AS so_luong
      FROM ${TABLE} WITH (NOLOCK)
      WHERE thoi_gian_khai >= @from AND thoi_gian_khai < @d1
      GROUP BY trang_thai;

      -- 3: hàng đợi chờ duyệt (theo thời gian nộp)
      SELECT TOP 10 id, ma_ho_so, so_thu_tu, ho_ten, gioi_tinh, hang, nguon,
        CONVERT(varchar(19), thoi_gian_khai, 120) AS thoi_gian_khai,
        DATEDIFF(second, thoi_gian_khai, GETDATE()) AS cho_giay
      FROM ${TABLE} WITH (NOLOCK)
      WHERE trang_thai = 'cho_duyet'
      ORDER BY thoi_gian_khai ASC, id ASC;
    `);

  const the = r.recordsets[0][0] || {};
  const tyLe = {};
  for (const row of r.recordsets[2]) tyLe[row.trang_thai] = row.so_luong;
  return {
    ngay,
    the: Object.fromEntries(Object.entries(the).map(([k, v]) => [k, Number(v) || 0])),
    bieu_do: r.recordsets[1],
    ty_le: {
      cho_duyet: tyLe.cho_duyet || 0,
      can_bo_sung: tyLe.can_bo_sung || 0,
      da_duyet: tyLe.da_duyet || 0,
      da_in: tyLe.da_in || 0,
    },
    hang_doi: r.recordsets[3],
  };
}

// ─── Ghi dữ liệu ─────────────────────────────────────
async function insertHoSo(pool, data, { nguon, nguonRef = null, thoiGianKhai = null, nguoi = null }) {
  const req = pool.request();
  const cols = [];
  const vals = [];
  for (const [key, type] of Object.entries(EDITABLE)) {
    if (data[key] === undefined) continue;
    req.input(key, type, data[key]);
    cols.push(key);
    vals.push(`@${key}`);
  }
  for (const key of DATE_FIELDS) {
    if (data[key] === undefined) continue;
    req.input(key, mssql.VarChar(10), data[key]);
    cols.push(key);
    vals.push(`CONVERT(date, @${key}, 23)`);
  }
  req.input("nguon", mssql.VarChar(20), nguon);
  req.input("nguon_ref", mssql.NVarChar(100), nguonRef);
  req.input("nguoi", mssql.NVarChar(255), nguoi);
  req.input("tgk", mssql.VarChar(19), thoiGianKhai);
  cols.push("nguon", "nguon_ref", "nguoi_tiep_nhan", "thoi_gian_khai");
  vals.push("@nguon", "@nguon_ref", "@nguoi", "COALESCE(CONVERT(datetime, @tgk, 120), GETDATE())");

  const r = await req.query(`
    DECLARE @new TABLE (id INT);
    INSERT INTO ${TABLE} (${cols.join(", ")}) OUTPUT INSERTED.id INTO @new VALUES (${vals.join(", ")});
    DECLARE @id INT = (SELECT TOP 1 id FROM @new);
    DECLARE @ngay DATE = (SELECT CAST(thoi_gian_khai AS DATE) FROM ${TABLE} WHERE id = @id);
    DECLARE @stt INT = (
      SELECT COUNT(*) FROM ${TABLE}
      WHERE thoi_gian_khai >= @ngay AND thoi_gian_khai < DATEADD(day, 1, @ngay) AND id <= @id
    );
    UPDATE ${TABLE}
      SET so_thu_tu = @stt,
          ma_ho_so = CONCAT('HS', FORMAT(@ngay, 'yyyyMMdd'), RIGHT('000' + CAST(@stt AS VARCHAR(10)), 3))
      WHERE id = @id;
    SELECT @id AS id;
  `);
  return r.recordset[0].id;
}

async function updateFields(pool, id, data, { onlyEmpty = false } = {}) {
  const req = pool.request().input("id", mssql.Int, Number(id));
  const sets = [];
  for (const [key, type] of Object.entries(EDITABLE)) {
    if (data[key] === undefined) continue;
    req.input(key, type, data[key]);
    sets.push(onlyEmpty ? `${key} = COALESCE(NULLIF(${key}, ''), @${key})` : `${key} = @${key}`);
  }
  for (const key of DATE_FIELDS) {
    if (data[key] === undefined) continue;
    req.input(key, mssql.VarChar(10), data[key]);
    sets.push(
      onlyEmpty
        ? `${key} = COALESCE(${key}, CONVERT(date, @${key}, 23))`
        : `${key} = CONVERT(date, @${key}, 23)`,
    );
  }
  if (!sets.length) return false;
  await req.query(`UPDATE ${TABLE} SET ${sets.join(", ")}, updated_at = GETDATE() WHERE id = @id`);
  return true;
}

async function findOpenByCccd(pool, cccd) {
  if (!cccd) return null;
  const r = await pool
    .request()
    .input("cccd", mssql.VarChar(20), cccd)
    .query(`SELECT TOP 1 id, trang_thai FROM ${TABLE} WHERE cccd = @cccd ORDER BY id DESC`);
  return r.recordset[0] || null;
}

/**
 * NV tiếp nhận (quét CCCD + bổ sung). Nếu CCCD đã có hồ sơ (vd HV đã tự khai qua Google Form)
 * thì gộp vào hồ sơ đó thay vì tạo mới.
 */
async function create(body = {}, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const data = cleanPayload(body);
  if (!data.ho_ten) throw httpError(400, "Thiếu họ và tên");
  if (!data.hang) data.hang = "A1";
  if (!data.khoa_hoc) data.khoa_hoc = "Đào tạo lái xe mô tô";

  const existing = await findOpenByCccd(pool, data.cccd);
  if (existing) {
    await updateFields(pool, existing.id, data);
    if (body.da_doi_chieu_cccd) {
      await pool.request().input("id", mssql.Int, existing.id)
        .query(`UPDATE ${TABLE} SET da_doi_chieu_cccd = 1 WHERE id = @id`);
    }
    await addLog(pool, existing.id, "cap_nhat", "Quét CCCD - gộp vào hồ sơ đã có", nguoi);
    return { ...(await getById(existing.id, { withAnh: true })), da_ton_tai: true };
  }

  const id = await insertHoSo(pool, data, { nguon: body.nguon === "may_tinh" ? "may_tinh" : "cccd", nguoi });
  if (body.da_doi_chieu_cccd) {
    await pool.request().input("id", mssql.Int, id)
      .query(`UPDATE ${TABLE} SET da_doi_chieu_cccd = 1 WHERE id = @id`);
  }
  await addLog(pool, id, "tao_moi", "NV tiếp sinh nhập hồ sơ", nguoi);
  return getById(id, { withAnh: true });
}

async function update(id, body = {}, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");

  const data = cleanPayload(body);
  const changed = await updateFields(pool, id, data);

  const extra = [];
  const req = pool.request().input("id", mssql.Int, Number(id));
  if (body.da_doi_chieu_cccd !== undefined) {
    req.input("dc", mssql.Bit, body.da_doi_chieu_cccd ? 1 : 0);
    extra.push("da_doi_chieu_cccd = @dc");
  }
  // Sửa hồ sơ đã duyệt => phải duyệt lại
  if (changed && [TRANG_THAI.DA_DUYET, TRANG_THAI.DA_IN].includes(current.trang_thai)) {
    extra.push(`trang_thai = '${TRANG_THAI.CHO_DUYET}'`, "duyet_at = NULL", "nguoi_duyet = NULL");
  }
  if (extra.length) {
    await req.query(`UPDATE ${TABLE} SET ${extra.join(", ")}, updated_at = GETDATE() WHERE id = @id`);
  }
  if (changed) {
    const fields = Object.keys(data).join(", ");
    await addLog(pool, id, "cap_nhat", `Cập nhật: ${fields}`, nguoi);
  }
  return getById(id, { withAnh: true });
}

async function capNhatAnh(id, anh, nguoi = null) {
  await ensureTables();
  if (anh && !/^data:image\/(jpeg|png|webp);base64,/.test(anh)) {
    throw httpError(400, "Ảnh không hợp lệ");
  }
  if (anh && anh.length > 3 * 1024 * 1024) throw httpError(400, "Ảnh quá lớn (tối đa ~2MB)");
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .input("anh", mssql.VarChar(mssql.MAX), anh || null)
    .query(`UPDATE ${TABLE} SET anh_chan_dung = @anh, updated_at = GETDATE() WHERE id = @id`);
  await addLog(pool, id, "chup_anh", anh ? "Cập nhật ảnh chân dung" : "Xoá ảnh chân dung", nguoi);
  return getById(id, { withAnh: true });
}

async function duyet(id, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  if (current.trang_thai === TRANG_THAI.DA_IN) throw httpError(400, "Hồ sơ đã in, không cần duyệt lại");
  if (current.thieu_truong.length) {
    throw httpError(400, `Hồ sơ còn thiếu: ${current.thieu_truong.join(", ")}`);
  }
  await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .input("nguoi", mssql.NVarChar(255), nguoi)
    .query(`UPDATE ${TABLE}
            SET trang_thai = '${TRANG_THAI.DA_DUYET}', duyet_at = GETDATE(), nguoi_duyet = @nguoi,
                ly_do_bo_sung = NULL, updated_at = GETDATE()
            WHERE id = @id`);
  await addLog(pool, id, "duyet", "Duyệt hồ sơ", nguoi);
  return getById(id, { withAnh: true });
}

async function traBoSung(id, lyDo, nguoi = null) {
  await ensureTables();
  if (!lyDo || !String(lyDo).trim()) throw httpError(400, "Vui lòng nhập nội dung cần bổ sung");
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .input("ly_do", mssql.NVarChar(500), String(lyDo).trim().slice(0, 500))
    .query(`UPDATE ${TABLE}
            SET trang_thai = '${TRANG_THAI.CAN_BO_SUNG}', ly_do_bo_sung = @ly_do,
                duyet_at = NULL, nguoi_duyet = NULL, updated_at = GETDATE()
            WHERE id = @id`);
  await addLog(pool, id, "tra_bo_sung", lyDo, nguoi);
  return getById(id, { withAnh: true });
}

/** HV đã bổ sung xong -> đưa lại vào hàng chờ duyệt */
async function moLai(id, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  if (current.trang_thai !== TRANG_THAI.CAN_BO_SUNG) return current;
  await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .query(`UPDATE ${TABLE} SET trang_thai = '${TRANG_THAI.CHO_DUYET}', updated_at = GETDATE() WHERE id = @id`);
  await addLog(pool, id, "mo_lai", "Đã bổ sung, chuyển lại chờ duyệt", nguoi);
  return getById(id, { withAnh: true });
}

async function danhDauIn(id, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const current = await getById(id, { withAnh: true });
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  if (![TRANG_THAI.DA_DUYET, TRANG_THAI.DA_IN].includes(current.trang_thai)) {
    throw httpError(400, "Hồ sơ phải được duyệt trước khi in");
  }
  await pool
    .request()
    .input("id", mssql.Int, Number(id))
    .query(`UPDATE ${TABLE}
            SET trang_thai = '${TRANG_THAI.DA_IN}', in_at = COALESCE(in_at, GETDATE()),
                so_lan_in = so_lan_in + 1, updated_at = GETDATE()
            WHERE id = @id`);
  await addLog(pool, id, "in", current.so_lan_in ? `In lại lần ${current.so_lan_in + 1}` : "In hồ sơ", nguoi);
  return getById(id, { withAnh: true });
}

async function remove(id, nguoi = null) {
  await ensureTables();
  const pool = await connectSQL();
  const current = await getById(id);
  if (!current) throw httpError(404, "Không tìm thấy hồ sơ");
  if (current.trang_thai === TRANG_THAI.DA_IN) throw httpError(400, "Không xoá được hồ sơ đã in");
  await pool.request().input("id", mssql.Int, Number(id)).query(`
    DELETE FROM ${LOG_TABLE} WHERE ho_so_id = @id;
    DELETE FROM ${TABLE} WHERE id = @id;
  `);
  console.log(`[tiepSinh] ${nguoi || "?"} xoá hồ sơ ${current.ma_ho_so} (${current.ho_ten})`);
  return { id: Number(id) };
}

// ─── Cấu hình ─────────────────────────────────────
const CFG_KEYS = [
  "google_form_url", "spreadsheet_id", "gid", "dia_diem_hoc_mac_dinh", "apps_script_url", "apps_script_key",
  // bảng giá (VNĐ) theo loại hình học + phí khám sức khoẻ theo lịch trung tâm
  "gia_a1", "gia_a_con_tay", "gia_a_tay_ga", "phi_kham_suc_khoe",
];

async function getCauHinh() {
  await ensureTables();
  const pool = await connectSQL();
  const r = await pool.request().query(`SELECT khoa, gia_tri FROM ${CFG_TABLE}`);
  const cfg = Object.fromEntries(CFG_KEYS.map((k) => [k, ""]));
  for (const row of r.recordset) if (CFG_KEYS.includes(row.khoa)) cfg[row.khoa] = row.gia_tri || "";
  return cfg;
}

function extractSpreadsheet(value) {
  const s = String(value || "").trim();
  const id = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || s;
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] || null;
  return { id, gid };
}

async function saveCauHinh(body = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const data = { ...body };
  if (data.spreadsheet_id !== undefined) {
    const { id, gid } = extractSpreadsheet(data.spreadsheet_id);
    data.spreadsheet_id = id;
    if (gid && !data.gid) data.gid = gid;
  }
  for (const k of CFG_KEYS) {
    if (data[k] === undefined) continue;
    await pool
      .request()
      .input("k", mssql.VarChar(100), k)
      .input("v", mssql.NVarChar(mssql.MAX), String(data[k] ?? "").trim())
      .query(`MERGE ${CFG_TABLE} AS t USING (SELECT @k AS khoa) AS s ON t.khoa = s.khoa
              WHEN MATCHED THEN UPDATE SET gia_tri = @v, updated_at = GETDATE()
              WHEN NOT MATCHED THEN INSERT (khoa, gia_tri) VALUES (@k, @v);`);
  }
  return getCauHinh();
}

// ─── Đồng bộ dữ liệu HV tự khai (Google Sheet / Excel export) ─────────────
function findCol(header, tests) {
  return header.findIndex((c) => tests.some((t) => (typeof t === "string" ? c.includes(t) : t.test(c))));
}

function parseSheetRows(rawData) {
  if (!rawData?.length) return [];
  const headerIndex = Parser.findHeaderRow(rawData);
  const header = (rawData[headerIndex] || []).map((v) => String(v || "").trim().toLowerCase());
  const idx = {
    thoiGian: findCol(header, ["dấu thời gian", "timestamp", "thời gian"]),
    maPhieu: findCol(header, ["mã phiếu"]),
    hoTen: findCol(header, ["họ và tên", "họ tên", "tên học viên"]),
    ngaySinh: findCol(header, ["ngày sinh", "năm sinh"]),
    gioiTinh: findCol(header, ["giới tính"]),
    cccd: findCol(header, [/^(?!.*(ngày|nơi)).*(cccd|cmt|căn cước|cmnd)/]),
    ngayCap: findCol(header, ["ngày cấp"]),
    noiCap: findCol(header, ["nơi cấp"]),
    dienThoai: findCol(header, ["điện thoại", "sđt", "sdt"]),
    email: findCol(header, ["email"]),
    diaChi: findCol(header, [/^địa chỉ$/, "thường trú", /^địa chỉ(?!.*email)/]),
    noiO: findCol(header, ["nơi ở", "chỗ ở", "tạm trú"]),
    dauMoi: findCol(header, ["đầu mối", "người tuyển sinh", "người giới thiệu"]),
    hang: findCol(header, ["loại hình học", "hạng xe", "hạng"]),
    khamSucKhoe: findCol(header, ["khám sức kho"]),
    ghiChu: findCol(header, [/^ghi chú$/]),
    tongThu: findCol(header, ["tổng thu", "phải thu", "số tiền"]),
    diaDiem: findCol(header, ["địa điểm", "cơ sở"]),
  };
  if (idx.hoTen === -1) return [];

  const cell = (row, i) => (i === -1 || row[i] === undefined || row[i] === null ? "" : String(row[i]).trim());
  return rawData
    .slice(headerIndex + 1)
    .map((row) => {
      const hoTen = cell(row, idx.hoTen);
      if (!hoTen || /họ (và )?tên/i.test(hoTen) || hoTen.includes(";")) return null;
      const ngaySinhRaw = row[idx.ngaySinh];
      const loaiHinh = cell(row, idx.hang);
      const ksk = cell(row, idx.khamSucKhoe);
      const ghiChu = cell(row, idx.ghiChu);
      const tongThu = cell(row, idx.tongThu);
      return {
        thoi_gian_khai: toSqlDateTime(cell(row, idx.thoiGian)),
        nguon_ref: Parser.parseMaPhieu(cell(row, idx.maPhieu)) || null,
        ho_ten: hoTen,
        ngay_sinh: idx.ngaySinh === -1 ? undefined : toIsoDate(Parser.parseStringDate(ngaySinhRaw)),
        gioi_tinh: cell(row, idx.gioiTinh) || undefined,
        cccd: cell(row, idx.cccd) || undefined,
        ngay_cap_cccd: idx.ngayCap === -1 ? undefined : toIsoDate(Parser.parseStringDate(row[idx.ngayCap])),
        noi_cap: cell(row, idx.noiCap) || undefined,
        dien_thoai: cell(row, idx.dienThoai) || undefined,
        email: cell(row, idx.email) || undefined,
        dia_chi: cell(row, idx.diaChi) || undefined,
        noi_o_hien_tai: cell(row, idx.noiO) || undefined,
        dau_moi: cell(row, idx.dauMoi) || undefined,
        hang: loaiHinh || undefined,
        loai_hinh: loaiHinh || undefined,
        kham_suc_khoe: ksk || undefined,
        tong_thu: tongThu || undefined,
        ghi_chu: ghiChu || undefined,
        dia_diem_hoc: cell(row, idx.diaDiem) || undefined,
      };
    })
    .filter(Boolean);
}

async function importRows(rows, { tuNgay = null, nguoi = null } = {}) {
  await ensureTables();
  const pool = await connectSQL();
  const cfg = await getCauHinh();
  const from = tuNgay ? toIsoDate(tuNgay) : null;
  const result = { tong_dong: rows.length, them_moi: 0, bo_sung: 0, bo_qua_cu: 0, bo_qua_trung: 0, loi: [] };

  for (const row of rows) {
    // Chỉ lấy hồ sơ khai từ ngày được chọn trở đi (sheet chứa cả dữ liệu cũ)
    if (from && (!row.thoi_gian_khai || row.thoi_gian_khai.slice(0, 10) < from)) {
      result.bo_qua_cu++;
      continue;
    }
    try {
      const { thoi_gian_khai, nguon_ref, ...fields } = row;
      const data = cleanPayload(fields);
      if (!data.hang) data.hang = "A1";
      if (!data.khoa_hoc) data.khoa_hoc = "Đào tạo lái xe mô tô";
      if (!data.dia_diem_hoc && cfg.dia_diem_hoc_mac_dinh) data.dia_diem_hoc = cfg.dia_diem_hoc_mac_dinh;

      const existing = await findOpenByCccd(pool, data.cccd);
      if (existing) {
        // Đã có (đồng bộ trước đó hoặc NV đã nhập) -> chỉ điền các trường còn trống
        if (existing.trang_thai === TRANG_THAI.DA_IN) {
          result.bo_qua_trung++;
          continue;
        }
        const before = await getById(existing.id);
        await updateFields(pool, existing.id, data, { onlyEmpty: true });
        const after = await getById(existing.id);
        if (before.thieu_truong.length !== after.thieu_truong.length) result.bo_sung++;
        else result.bo_qua_trung++;
        continue;
      }
      if (!data.cccd && nguon_ref) {
        const dup = await pool
          .request()
          .input("ref", mssql.NVarChar(100), nguon_ref)
          .query(`SELECT TOP 1 id FROM ${TABLE} WHERE nguon = 'google_sheet' AND nguon_ref = @ref`);
        if (dup.recordset[0]) {
          result.bo_qua_trung++;
          continue;
        }
      }
      const id = await insertHoSo(pool, data, {
        nguon: "google_sheet",
        nguonRef: nguon_ref,
        thoiGianKhai: thoi_gian_khai,
        nguoi,
      });
      await addLog(pool, id, "tao_moi", "Đồng bộ từ Google Sheet (HV tự khai)", nguoi);
      result.them_moi++;
    } catch (err) {
      result.loi.push(`${row.ho_ten}: ${err.message}`);
    }
  }
  return result;
}

async function fetchPublicCsv(spreadsheetId, gid) {
  const axios = require("axios");
  const XLSX = require("xlsx");
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}`;
  const res = await axios.get(url, { responseType: "text", timeout: 30000, maxRedirects: 5, validateStatus: () => true });
  const ct = String(res.headers["content-type"] || "");
  if (res.status !== 200 || !ct.includes("text/csv")) throw new Error(`HTTP ${res.status} (sheet chưa chia sẻ công khai)`);
  const wb = XLSX.read(res.data, { type: "string", raw: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
}

/** Đọc sheet qua Apps Script web app gắn vào sheet (chạy bằng tài khoản Google của người tạo) */
async function fetchAppsScript(url, key, gid) {
  const axios = require("axios");
  const res = await axios.get(url, {
    params: { key: key || "", gid: gid || "" },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
  });
  const data = typeof res.data === "string" ? (() => { try { return JSON.parse(res.data); } catch { return null; } })() : res.data;
  if (res.status !== 200 || !data) throw new Error(`HTTP ${res.status} (web app chưa cho phép "Bất kỳ ai" truy cập?)`);
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.values)) throw new Error("Phản hồi không có dữ liệu");
  return data.values;
}

async function dongBoGoogleSheet({ tu_ngay } = {}, nguoi = null) {
  const cfg = await getCauHinh();
  if (!cfg.spreadsheet_id && !cfg.apps_script_url) {
    throw httpError(400, "Chưa cấu hình Google Sheet nhận dữ liệu HV khai báo (mục Cấu hình)");
  }
  let raw;
  let asErr = null;
  if (cfg.apps_script_url) {
    try {
      raw = await fetchAppsScript(cfg.apps_script_url, cfg.apps_script_key, cfg.gid);
    } catch (e) {
      asErr = e;
      if (!cfg.spreadsheet_id) throw httpError(400, `Không đọc được Google Sheet qua Apps Script: ${e.message}`);
    }
  }
  if (!raw) try {
    raw = await googleSheetService.fetchRawValues(cfg.spreadsheet_id, cfg.gid || null);
  } catch (apiErr) {
    // Tài khoản Google của máy chủ lỗi (vd token hết hạn) -> đọc bản CSV công khai của sheet
    try {
      raw = await fetchPublicCsv(cfg.spreadsheet_id, cfg.gid);
    } catch (csvErr) {
      throw httpError(
        400,
        `Không đọc được Google Sheet (${asErr ? `Apps Script: ${asErr.message}; ` : ""}API: ${apiErr.message}; link công khai: ${csvErr.message}). ` +
          "Hãy chia sẻ sheet \"Bất kỳ ai có đường liên kết - Người xem\" hoặc cấp lại quyền Google cho máy chủ.",
      );
    }
  }
  const rows = parseSheetRows(raw);
  if (!rows.length) throw httpError(400, "Google Sheet không có dữ liệu hoặc không tìm thấy cột Họ và tên");
  return importRows(rows, { tuNgay: tu_ngay || todayStr(), nguoi });
}

let _autoRunning = false;
async function dongBoTuDong() {
  if (_autoRunning) return null;
  _autoRunning = true;
  try {
    const cfg = await getCauHinh();
    if (!cfg.spreadsheet_id && !cfg.apps_script_url) return null;
    const result = await dongBoGoogleSheet({ tu_ngay: todayStr(-7) }, "Tự động");
    if (result.them_moi || result.bo_sung) {
      console.log(`[tiepSinh] Đồng bộ form: +${result.them_moi} mới, ${result.bo_sung} bổ sung`);
    }
    return result;
  } catch (err) {
    console.error("[tiepSinh] Đồng bộ tự động lỗi:", err.message);
    return null;
  } finally {
    _autoRunning = false;
  }
}

async function importExcel(buffer, { tu_ngay } = {}, nguoi = null) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  let rows = [];
  for (const name of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false, raw: false });
    rows = rows.concat(parseSheetRows(raw));
  }
  if (!rows.length) throw httpError(400, "File không có dữ liệu hợp lệ (thiếu cột Họ và tên)");
  return importRows(rows, { tuNgay: tu_ngay || null, nguoi });
}

module.exports = {
  TRANG_THAI,
  list,
  thongKe,
  getDetail,
  create,
  update,
  capNhatAnh,
  duyet,
  traBoSung,
  moLai,
  danhDauIn,
  remove,
  getCauHinh,
  saveCauHinh,
  dongBoGoogleSheet,
  dongBoTuDong,
  importExcel,
  _test: { parseSheetRows, toIsoDate, toSqlDateTime },
};
