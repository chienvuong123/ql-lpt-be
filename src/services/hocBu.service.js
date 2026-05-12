const mssql = require("mssql");
const XLSX = require("xlsx");
const connectSQL = require("../configs/sql");
const repo = require("../repositories/hocbu.repository");
const { toLoai, buildStateUpdateData, mergeDirectFields } = require("../helpers/hocbu.helpers");
const { TRANG_THAI_GROUPS } = require("../constants/hocbu.constants");

// ─── QUERY ───────────────────────────────────────────────────────────────────

const list = (filters) => repo.list(filters);
const getById = (id) => repo.findById(id);

const getByMaDk = async (maDk) => {
    const rows = await repo.list({ search: maDk });
    return rows.find((r) => r.ma_dk === maDk) ?? null;
};

// ─── CREATE ──────────────────────────────────────────────────────────────────
const addStudent = async ({ ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao }) => {
    const nLoai = toLoai(loai);
    const actor = nguoi_tao || "admin";

    const data = { ma_dk, ma_khoa, loai: nLoai, ghi_chu: ghi_chu || "Đăng ký học bù thủ công", nguoi_tao: actor };

    const ts = trang_thai != null && String(trang_thai).trim() !== "" ? Number(trang_thai) : undefined;

    if (ts !== undefined && !isNaN(ts)) {
        data.trang_thai = ts;
        if (ts === 1) data.trang_thai_ly_thuyet = 1;
        if (ts === 4) { data.trang_thai_thuc_hanh = 1; data.loai_thuc_hanh = nLoai; }
    } else if (nLoai === "ly_thuyet") {
        data.trang_thai = null;
        data.trang_thai_ly_thuyet = null;
    } else {
        data.trang_thai = 4;
        data.trang_thai_thuc_hanh = null;
        data.loai_thuc_hanh = nLoai;
    }

    return repo.upsert(data);
};

// ─── STATUS UPDATE ────────────────────────────────────────────────────────────
const updateStatus = async (id, body) => {
    const record = await repo.findById(id);
    if (!record) return { notFound: true };

    const extra = { ...body, nguoi_update: body.nguoi_update || "admin" };
    const fromMachine = buildStateUpdateData(record, body.action, extra);
    const { merged, hasDirect } = mergeDirectFields(body, fromMachine ?? {});

    if (!hasDirect && !fromMachine) return { noAction: true };

    merged.nguoi_update = extra.nguoi_update;
    await repo.updateById(id, merged);
    return { updated: merged };
};

const updateStatusBulk = async (ids, body) => {
    const BATCH = 100;
    let totalUpdated = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const results = await Promise.all(batch.map((id) => updateStatus(id, body)));
        totalUpdated += results.filter((r) => r.updated).length;
    }
    return { totalUpdated, total: ids.length };
};

// ─── DETAIL ───────────────────────────────────────────────────────────────────
const getDetail = async (idOrMaDk, { forceSync = false } = {}) => {
    const record = typeof idOrMaDk === "number"
        ? await repo.findById(idOrMaDk)
        : await getByMaDk(idOrMaDk);

    if (!record) return null;

    const maDk = String(record.ma_dk || "").trim();
    const maKhoa = record.khoa_bu_thuc_hanh || record.ma_khoa || "";

    // Gắn theoryInfo nhanh từ trang_thai
    const ttLT = record.trang_thai_ly_thuyet || 0;
    record.theoryInfo = { loai_ly_thuyet: ttLT >= 2 ? 1 : 0, loai_het_mon: ttLT >= 4 ? 1 : 0, ghi_chu: "" };

    // Lấy song song tiến độ ngoài + DB nội bộ
    const progressService = require("./progress.service");
    const pool = await connectSQL();

    const [progress, kyDat, regList] = await Promise.all([
        progressService.getStudentProgress(maDk, maKhoa, { forceSync, hang: record.hang }),
        pool.request().input("ma_dk", mssql.VarChar, maDk)
            .query("SELECT TOP 1 trang_thai AS ky_dat, ghi_chu_1, ghi_chu_2 FROM ky_dat WHERE ma_dk=@ma_dk")
            .then((r) => r.recordset[0] ?? {}),
        require("../models/vehicleRegistration.model")
            .findByMaDkList([maDk]).then((r) => r[0] ?? {}),
    ]);

    return {
        ...record, ...progress,
        ky_dat: kyDat.ky_dat ?? null,
        ghi_chu_dat_1: kyDat.ghi_chu_1 ?? null,
        ghi_chu_dat_2: kyDat.ghi_chu_2 ?? null,
        xe_b1: regList.xe_b1 ?? null,
        xe_b2: regList.xe_b2 ?? null,
    };
};

// ─── DANH SÁCH LỚP ────────────────────────────────────────────────────────────
const getChiTietLopLyThuyet = async (maKhoaBu) => {
    const lopLyThuyetRepo = require("../models/lopLyThuyet.model");
    const progressService = require("./progress.service");

    const students = await repo.list({ khoa_bu_ly_thuyet: maKhoaBu, limit: 1000, page: 1 });

    const theoryRaw = await lopLyThuyetRepo.getAll({ ma_dk_list: students.map((s) => s.ma_dk) }).catch(() => []);
    const theoryMap = Object.fromEntries(theoryRaw.map((t) => [String(t.ma_dk).trim(), t]));

    // Chunked batch gọi Lotus (tránh spam)
    const progressList = await progressService.getBatchProgress(
        students.map((s) => ({ ma_dk: s.ma_dk, ma_khoa: s.ma_khoa, hang: s.hang })),
        6
    );

    return students.map((student, i) => {
        const tt = theoryMap[String(student.ma_dk).trim()] ?? {};
        const ttLT = student.trang_thai_ly_thuyet;
        const theoryInfo = {
            loai_ly_thuyet: tt.loai_ly_thuyet != null ? Number(tt.loai_ly_thuyet) : (ttLT >= 2 ? 1 : 0),
            loai_het_mon: tt.loai_het_mon != null ? Number(tt.loai_het_mon) : (ttLT >= 4 ? 1 : 0),
            ghi_chu: tt.ghi_chu ?? "",
        };
        return { ...student, theoryInfo, scoreByRubrik: progressList[i]?.scoreByRubrik ?? [] };
    });
};

/** Chi tiết lớp học bù TH — kèm tiến độ DAT + Cabin từng học viên */
const getChiTietLopThucHanh = async (maKhoaBu) => {
    const progressService = require("./progress.service");
    const students = await repo.list({ khoa_bu_thuc_hanh: maKhoaBu, limit: 1000, page: 1 });
    if (!students.length) return [];

    const progressList = await progressService.getBatchProgress(
        students.map((s) => ({ ma_dk: s.ma_dk, ma_khoa: s.ma_khoa, hang: s.hang })),
        10 // TH không gọi Lotus → batch lớn hơn được
    );

    return students.map((student, i) => ({ ...student, ...progressList[i] }));
};

const getDangHocBuList = async (filters) => {
    const data = await repo.list({ ...filters, trang_thai: filters.trang_thai || TRANG_THAI_GROUPS.DANG_HOC_BU });
    if (!data.length) return data;

    const courseCodes = [...new Set(
        data.flatMap((item) => [item.ma_khoa, item.khoa_bu_ly_thuyet, item.khoa_bu_thuc_hanh].filter(Boolean).map(String))
    )];

    const pool = await connectSQL();
    const buildInParams = (req, codes) => {
        codes.forEach((c, i) => req.input(`c_${i}`, mssql.NVarChar, c));
        return codes.map((_, i) => `@c_${i}`).join(",");
    };

    const [courseList, progressList] = await Promise.all([
        (() => {
            const req = new mssql.Request(pool);
            const inP = buildInParams(req, courseCodes);
            return req.query(`SELECT ma_khoa, ten_khoa FROM [dbo].[khoa_hoc] WHERE ma_khoa IN (${inP})`)
                .then((r) => r.recordset);
        })(),
        (() => {
            const req = new mssql.Request(pool);
            const inP = buildInParams(req, courseCodes);
            return req.query(`SELECT * FROM [dbo].[tien_do_dao_tao] WHERE ma_khoa IN (${inP})`)
                .then((r) => r.recordset);
        })(),
    ]);

    const courseNameMap = Object.fromEntries(courseList.map((c) => [String(c.ma_khoa).trim(), String(c.ten_khoa).trim()]));
    const progressMap = Object.fromEntries(progressList.map((p) => [`${String(p.ma_khoa).trim()}_${Number(p.loai ?? 0)}`, p]));
    const progressFallback = Object.fromEntries(progressList.map((p) => [String(p.ma_khoa).trim(), p]));

    const getProgress = (code, loaiNum) => {
        if (!code) return null;
        const k = String(code).trim();
        return progressMap[`${k}_${loaiNum}`] ?? progressFallback[k] ?? null;
    };

    data.forEach((item) => {
        const { ma_khoa: mK, khoa_bu_ly_thuyet: kbLT, khoa_bu_thuc_hanh: kbTH } = item;
        const main = getProgress(mK, 0);
        const lt = getProgress(kbLT, 1);
        const th = getProgress(kbTH, 2);
        const name = (code) => courseNameMap[String(code || "").trim()] || code;

        item.khoa = {
            ten_khoa: name(mK),
            bat_dau_ly_thuyet: main?.bat_dau_ly_thuyet ?? null, ket_thuc_ly_thuyet: main?.ket_thuc_ly_thuyet ?? null,
            kiem_tra_het_mon: main?.kiem_tra_het_mon ?? null,
            bat_dau_cabin: main?.bat_dau_cabin ?? null, ket_thuc_cabin: main?.ket_thuc_cabin ?? null,
            bat_dau_dat: main?.bat_dau_dat ?? null, ket_thuc_dat: main?.ket_thuc_dat ?? null,
        };
        item.khoa_bu_ly_thuyet = kbLT ? { ten_khoa: name(kbLT), bat_dau_ly_thuyet: lt?.bat_dau_ly_thuyet ?? null, ket_thuc_ly_thuyet: lt?.ket_thuc_ly_thuyet ?? null, kiem_tra_het_mon: lt?.kiem_tra_het_mon ?? null } : null;
        item.khoa_bu_thuc_hanh = kbTH ? { ten_khoa: name(kbTH), bat_dau_cabin: th?.bat_dau_cabin ?? null, ket_thuc_cabin: th?.ket_thuc_cabin ?? null, bat_dau_dat: th?.bat_dau_dat ?? null, ket_thuc_dat: th?.ket_thuc_dat ?? null } : null;
    });

    return data;
};

// ─── IMPORT EXCEL ─────────────────────────────────────────────────────────────
const importFromExcel = async (buffer, { loai, khoa_bu, ghi_chu, nguoi_tao }) => {
    const nLoai = toLoai(loai || "ly_thuyet");
    const actor = nguoi_tao || "admin";
    const note = ghi_chu || "Import từ dữ liệu Excel";

    const wb = XLSX.read(buffer, { type: "buffer" });
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    if (!rawRows.length) throw new Error("File excel rỗng.");

    // Tìm header row
    let headIdx = -1;
    const cols = { ma_dk: -1, ho_ten: -1, ma_khoa: -1 };

    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        if (!rawRows[r].some((c) => /mã?\s*đk/i.test(String(c)))) continue;
        headIdx = r;
        rawRows[r].forEach((c, i) => {
            const t = String(c).toLowerCase();
            if (/mã?\s*đk/.test(t)) cols.ma_dk = i;
            else if (/họ\s*tên|ho\s*ten/.test(t)) cols.ho_ten = i;
            else if (/khóa|khoa/.test(t)) cols.ma_khoa = i;
        });
        break;
    }
    if (headIdx < 0 || cols.ma_dk < 0) throw new Error("Không tìm thấy cột 'Mã ĐK' trong Excel.");

    const entries = rawRows.slice(headIdx + 1)
        .map((row) => ({ ma_dk: String(row[cols.ma_dk] || "").trim(), xlKhoa: String(row[cols.ma_khoa] || "").trim() }))
        .filter((e) => e.ma_dk);

    if (!entries.length) throw new Error("Không có dữ liệu hợp lệ bên dưới dòng tiêu đề.");

    // Batch query để lấy ma_khoa từ DB
    const codes = [...new Set(entries.map((e) => e.ma_dk))];
    const pool = await connectSQL();
    const bReq = new mssql.Request(pool);
    codes.forEach((c, i) => bReq.input(`c${i}`, mssql.VarChar, c));
    const { recordset } = await bReq.query(
        `SELECT ma_dk, ma_khoa FROM [dbo].[hoc_vien] WHERE ma_dk IN (${codes.map((_, i) => `@c${i}`).join(",")})`
    );
    const dbMap = Object.fromEntries(recordset.map((x) => [String(x.ma_dk).trim(), String(x.ma_khoa).trim()]));

    const notFound = [];
    const toUpsert = entries.map((e) => {
        const fullKhoa = dbMap[e.ma_dk];
        if (!fullKhoa) notFound.push(e.ma_dk);

        let maKhoa = fullKhoa || e.xlKhoa || "IMPORTED";
        if (maKhoa !== "IMPORTED" && !maKhoa.startsWith("30004")) maKhoa = "30004" + maKhoa;

        const payload = { ma_dk: e.ma_dk, ma_khoa: maKhoa, loai: nLoai, ghi_chu: note, nguoi_tao: actor, nguoi_update: actor };

        if (nLoai === "ly_thuyet") {
            Object.assign(payload, { trang_thai: null, trang_thai_ly_thuyet: null, ...(khoa_bu && { khoa_bu_ly_thuyet: khoa_bu }) });
        } else {
            Object.assign(payload, { trang_thai: null, trang_thai_thuc_hanh: null, loai_thuc_hanh: nLoai, ...(khoa_bu && { khoa_bu_thuc_hanh: khoa_bu }) });
        }
        return payload;
    });

    const result = await repo.upsertMany(toUpsert);
    return { totalUploaded: entries.length, savedSuccess: result.success, notFoundInSystem: notFound.length };
};

// ─── MISC ─────────────────────────────────────────────────────────────────────

const autoCompleteTheory = () => repo.autoCompleteTheory();

module.exports = {
    list, getById, getByMaDk, addStudent,
    updateStatus, updateStatusBulk,
    getDetail, getChiTietLopLyThuyet, getChiTietLopThucHanh,
    getDangHocBuList, importFromExcel, autoCompleteTheory,
};