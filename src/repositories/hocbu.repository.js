const mssql = require("mssql");
const connectSQL = require("../configs/sql");

/** Kiểu mssql tương ứng với giá trị JS */
const sqlType = (v) => {
    if (typeof v === "number") return Number.isInteger(v) ? mssql.Int : mssql.Decimal;
    if (v instanceof Date) return mssql.DateTime;
    if (typeof v === "boolean") return mssql.Bit;
    return mssql.NVarChar;
};

/** Schema cột rõ ràng, tránh đoán kiểu sai */
const COL_TYPES = {
    id: mssql.Int,
    trang_thai: mssql.Int,
    trang_thai_ly_thuyet: mssql.Int,
    trang_thai_thuc_hanh: mssql.Int,
    thoi_gian_xep_ly_thuyet: mssql.DateTime,
    thoi_gian_xep_thuc_hanh: mssql.DateTime,
    thoi_gian_duyet_ly_thuyet: mssql.DateTime,
    thoi_gian_duyet_thuc_hanh: mssql.DateTime,
};

const getType = (key, value) => COL_TYPES[key] ?? sqlType(value);

const BASE_SELECT = `
  SELECT h.*, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.anh, hv.hang,
         dk.khoa, dk.giao_vien, dk.xe_b1, dk.xe_b2
  FROM [dbo].[hoc_bu_new] h WITH (NOLOCK)
  LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON h.ma_dk = hv.ma_dk
  LEFT JOIN [dbo].[dang_ky_xe_gv] dk WITH (NOLOCK) ON h.ma_dk = dk.ma_dk
`;

// Khởi tạo bảng 1 lần duy nhất
let _tableReady = false;
const ensureTable = async (pool) => {
    if (_tableReady) return;
    await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[hoc_bu_new]') AND type = N'U')
    CREATE TABLE [dbo].[hoc_bu_new] (
      [id]                        INT IDENTITY(1,1) PRIMARY KEY,
      [ma_dk]                     NVARCHAR(100) NULL,
      [ma_khoa]                   NVARCHAR(100) NULL,
      [loai]                      NVARCHAR(20)  NULL,
      [khoa_bu_ly_thuyet]         NVARCHAR(100) NULL,
      [thoi_gian_xep_ly_thuyet]   DATETIME      NULL,
      [trang_thai_ly_thuyet]      INT           NULL,
      [nguoi_duyet_ly_thuyet]     NVARCHAR(100) NULL,
      [thoi_gian_duyet_ly_thuyet] DATETIME      NULL,
      [loai_thuc_hanh]            NVARCHAR(20)  NULL,
      [khoa_bu_thuc_hanh]         NVARCHAR(100) NULL,
      [thoi_gian_xep_thuc_hanh]   DATETIME      NULL,
      [trang_thai_thuc_hanh]      INT           NULL,
      [nguoi_duyet_thuc_hanh]     NVARCHAR(100) NULL,
      [thoi_gian_duyet_thuc_hanh] DATETIME      NULL,
      [trang_thai]                INT           NULL,
      [ghi_chu]                   NVARCHAR(MAX) NULL,
      [nguoi_tao]                 NVARCHAR(100) NULL,
      [created_at]                DATETIME      NULL,
      [nguoi_update]              NVARCHAR(100) NULL,
      [updated_at]                DATETIME      NULL
    )
  `);
    _tableReady = true;
};

const getPool = async () => {
    const pool = await connectSQL();
    await ensureTable(pool);
    return pool;
};

// ─── CRUD ───────────────────────────────────────────────────────────────────

const findById = async (id) => {
    const pool = await getPool();
    const { recordset } = await pool.request()
        .input("id", mssql.Int, id)
        .query(`${BASE_SELECT} WHERE h.id = @id`);
    return recordset[0] ?? null;
};

const upsert = async (data) => {
    const pool = await getPool();
    const req = new mssql.Request(pool);

    const fields = ["ma_dk", "ma_khoa", "loai", "trang_thai", "trang_thai_ly_thuyet",
        "trang_thai_thuc_hanh", "loai_thuc_hanh", "ghi_chu", "nguoi_tao"];

    fields.forEach((f) => req.input(f, getType(f, data[f]), data[f] ?? null));

    const { recordset } = await req.query(`
    IF EXISTS (SELECT 1 FROM [dbo].[hoc_bu_new] WHERE ma_dk = @ma_dk)
    BEGIN
      UPDATE [dbo].[hoc_bu_new]
      SET ma_khoa=@ma_khoa, loai=@loai, trang_thai=@trang_thai,
          trang_thai_ly_thuyet=@trang_thai_ly_thuyet, trang_thai_thuc_hanh=@trang_thai_thuc_hanh,
          loai_thuc_hanh=@loai_thuc_hanh, ghi_chu=@ghi_chu, nguoi_tao=@nguoi_tao, updated_at=GETDATE()
      WHERE ma_dk=@ma_dk;
      SELECT id FROM [dbo].[hoc_bu_new] WHERE ma_dk=@ma_dk;
    END
    ELSE
    BEGIN
      INSERT INTO [dbo].[hoc_bu_new]
        (ma_dk,ma_khoa,loai,trang_thai,trang_thai_ly_thuyet,trang_thai_thuc_hanh,loai_thuc_hanh,ghi_chu,nguoi_tao,created_at)
      OUTPUT INSERTED.id
      VALUES (@ma_dk,@ma_khoa,@loai,@trang_thai,@trang_thai_ly_thuyet,@trang_thai_thuc_hanh,@loai_thuc_hanh,@ghi_chu,@nguoi_tao,GETDATE())
    END
  `);
    return recordset[0]?.id;
};

const updateById = async (id, data) => {
    const pool = await getPool();
    const req = new mssql.Request(pool);
    req.input("id", mssql.Int, id);

    const setClauses = Object.entries(data).map(([k, v]) => {
        req.input(k, getType(k, v), v);
        return `[${k}]=@${k}`;
    });
    setClauses.push("[updated_at]=GETDATE()");

    const { rowsAffected } = await req.query(
        `UPDATE [dbo].[hoc_bu_new] SET ${setClauses.join(",")} WHERE id=@id`
    );
    return rowsAffected[0];
};

const remove = async (id) => {
    const pool = await getPool();
    const { rowsAffected } = await pool.request()
        .input("id", mssql.Int, id)
        .query("DELETE FROM [dbo].[hoc_bu_new] WHERE id=@id");
    return rowsAffected[0];
};

// ─── LIST với filter ─────────────────────────────────────────────────────────

const buildStatusFilter = (trangThai) => {
    const arr = [].concat(trangThai).map(Number).filter((n) => !isNaN(n));
    if (!arr.length) return "";

    const special = arr.filter((s) => [2, 5].includes(s));
    const basic = arr.filter((s) => ![2, 5].includes(s));

    if (!special.length) return ` AND h.trang_thai IN (${arr.join(",")})`;

    const parts = [];
    if (basic.length) parts.push(`h.trang_thai IN (${basic.join(",")})`);
    if (special.includes(2)) parts.push(`(h.trang_thai=2 AND h.loai='ly_thuyet')`);
    if (special.includes(5)) parts.push(`(h.trang_thai=5 OR (h.trang_thai=4 AND h.loai='ly_thuyet'))`);
    return ` AND (${parts.join(" OR ")})`;
};

const buildLoaiFilter = (req, loai) => {
    if (!loai) return "";
    const expand = (v) => ["thuc_hanh", "thuc-hanh"].includes(v) ? ["thuc_hanh", "cabin", "dat"] : [v];
    const types = [].concat(loai).flatMap(expand);
    const unique = [...new Set(types)];
    if (unique.length === 1) {
        req.input("loai", mssql.NVarChar, unique[0]);
        return " AND h.loai=@loai";
    }
    return ` AND h.loai IN (${unique.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")})`;
};

const isValidFilter = (v) => v != null && !["undefined", "null", ""].includes(String(v).trim());

const list = async (filters = {}) => {
    const pool = await getPool();
    const req = new mssql.Request(pool);

    const hasPaging = filters.page && filters.limit;
    const countCol = hasPaging ? ", COUNT(*) OVER() AS total_count" : "";

    let sql = `${BASE_SELECT.replace("h.*", `h.*${countCol}`)} WHERE 1=1`;

    if (isValidFilter(filters.ma_khoa)) {
        req.input("ma_khoa", mssql.NVarChar, String(filters.ma_khoa));
        sql += " AND h.ma_khoa=@ma_khoa";
    }
    sql += buildLoaiFilter(req, filters.loai);
    if (filters.trang_thai) sql += buildStatusFilter(filters.trang_thai);

    const simpleFilters = {
        loai_thuc_hanh: "h.loai_thuc_hanh",
        khoa_bu_ly_thuyet: "h.khoa_bu_ly_thuyet",
        khoa_bu_thuc_hanh: "h.khoa_bu_thuc_hanh",
    };
    Object.entries(simpleFilters).forEach(([key, col]) => {
        if (isValidFilter(filters[key])) {
            req.input(key, mssql.NVarChar, String(filters[key]));
            sql += ` AND ${col}=@${key}`;
        }
    });

    if (filters.search) {
        req.input("search", mssql.NVarChar, `%${filters.search}%`);
        sql += " AND (h.ma_dk LIKE @search OR hv.ho_ten LIKE @search OR hv.cccd LIKE @search)";
    }

    sql += " ORDER BY h.created_at DESC";

    if (hasPaging) {
        const page = Math.max(1, parseInt(filters.page));
        const limit = Math.max(1, parseInt(filters.limit));
        req.input("offset", mssql.Int, (page - 1) * limit);
        req.input("limit", mssql.Int, limit);
        sql += " OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    } else {
        sql = sql.replace(BASE_SELECT, `SELECT TOP 1000 h.*, hv.ho_ten, hv.cccd, hv.ngay_sinh, hv.anh, hv.hang,
      dk.khoa, dk.giao_vien, dk.xe_b1, dk.xe_b2
    FROM [dbo].[hoc_bu_new] h WITH (NOLOCK)
    LEFT JOIN [dbo].[hoc_vien] hv WITH (NOLOCK) ON h.ma_dk = hv.ma_dk
    LEFT JOIN [dbo].[dang_ky_xe_gv] dk WITH (NOLOCK) ON h.ma_dk = dk.ma_dk`);
    }

    const { recordset } = await req.query(sql);
    if (hasPaging) recordset.total = recordset[0]?.total_count ?? 0;
    return recordset;
};

const upsertMany = async (records) => {
    if (!records?.length) return { success: 0, total: 0 };
    const pool = await getPool();
    let success = 0;

    for (const record of records) {
        if (!record.ma_dk) continue;
        try {
            const req = new mssql.Request(pool);
            const entries = Object.entries(record).filter(([, v]) => v !== undefined);
            entries.forEach(([k, v]) => req.input(k, getType(k, v), v));

            const updateSet = entries.filter(([k]) => k !== "ma_dk").map(([k]) => `[${k}]=@${k}`).join(",");
            const cols = ["created_at", ...entries.map(([k]) => `[${k}]`)].join(",");
            const vals = ["GETDATE()", ...entries.map(([k]) => `@${k}`)].join(",");

            await req.query(`
        IF EXISTS (SELECT 1 FROM [dbo].[hoc_bu_new] WHERE ma_dk=@ma_dk)
          UPDATE [dbo].[hoc_bu_new] SET ${updateSet},[updated_at]=GETDATE() WHERE ma_dk=@ma_dk
        ELSE
          INSERT INTO [dbo].[hoc_bu_new] (${cols}) VALUES (${vals})
      `);
            success++;
        } catch (err) {
            console.error(`[hocBuRepo] upsertMany failed for ${record.ma_dk}:`, err.message);
        }
    }
    return { success, total: records.length };
};

/** Cập nhật hàng loạt học viên hoàn thành lý thuyết (chạy bởi cron) */
const autoCompleteTheory = async (pool) => {
    const { rowsAffected } = await (pool ?? await getPool()).request().query(`
    UPDATE h SET h.trang_thai=4, h.trang_thai_ly_thuyet=4, h.updated_at=GETDATE()
    FROM [dbo].[hoc_bu_new] h
    INNER JOIN [dbo].[tien_do_dao_tao] t ON h.khoa_bu_ly_thuyet=t.ma_khoa
    WHERE h.trang_thai=3 AND h.trang_thai_ly_thuyet=3 AND h.loai='ly_thuyet'
      AND t.ket_thuc_ly_thuyet IS NOT NULL
      AND CAST(t.ket_thuc_ly_thuyet AS DATE) <= CAST(GETDATE() AS DATE)
  `);
    return rowsAffected[0] ?? 0;
};

module.exports = { findById, upsert, updateById, remove, list, upsertMany, autoCompleteTheory };