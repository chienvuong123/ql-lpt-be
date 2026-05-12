const XLSX = require("xlsx");
const repo = require("../repositories/hocbu.repository");
const { toLoai, buildStateUpdateData, mergeDirectFields } = require("../helpers/hocbu.helpers");
const { TRANG_THAI_GROUPS } = require("../constants/hocbu.constants");

// ─── BASICS ───────────────────────────────────────────────────────────────
const list = (filters) => repo.list(filters);
const getById = (id) => repo.findById(id);
const getByMaDk = async (maDk) => (await repo.list({ search: maDk })).find((r) => r.ma_dk === maDk) ?? null;

// ─── WRITE OPERATIONS ─────────────────────────────────────────────────────
/** Tính toán payload add dựa trên trạng thái ban đầu */
const calcAddData = (base, loai, ts) => {
    const d = { ...base };
    if (ts != null && !isNaN(ts)) {
        d.trang_thai = ts;
        if (ts === 1) d.trang_thai_ly_thuyet = 1;
        if (ts === 4) { d.trang_thai_thuc_hanh = 1; d.loai_thuc_hanh = loai; }
    } else if (loai === "ly_thuyet") {
        d.trang_thai = d.trang_thai_ly_thuyet = null;
    } else {
        d.trang_thai = 4; d.trang_thai_thuc_hanh = null; d.loai_thuc_hanh = loai;
    }
    return d;
};

const addStudent = async ({ ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao }) => {
    const l = toLoai(loai), u = nguoi_tao || "admin";
    const b = { ma_dk, ma_khoa, loai: l, ghi_chu: ghi_chu || "Đăng ký học bù thủ công", nguoi_tao: u };
    const ts = (trang_thai != null && String(trang_thai).trim()) ? Number(trang_thai) : undefined;
    return repo.upsert(calcAddData(b, l, ts));
};

const updateStatus = async (id, body) => {
    const old = await repo.findById(id);
    if (!old) return { notFound: true };
    const updateContext = { ...body, nguoi_update: body.nguoi_update || "admin" };
    const fromMach = buildStateUpdateData(old, body.action, updateContext);
    const { merged, hasDirect } = mergeDirectFields(body, fromMach ?? {});
    if (!hasDirect && !fromMach) return { noAction: true };
    merged.nguoi_update = updateContext.nguoi_update;
    await repo.updateById(id, merged);
    return { updated: merged };
};

const updateStatusBulk = async (ids, body) => {
    let count = 0;
    for (let i = 0; i < ids.length; i += 100) {
        const res = await Promise.all(ids.slice(i, i + 100).map((id) => updateStatus(id, body)));
        count += res.filter((r) => r.updated).length;
    }
    return { totalUpdated: count, total: ids.length };
};

// ─── DETAILED PROGRESS ────────────────────────────────────────────────────
const getDetail = async (k, { forceSync = false } = {}) => {
    const r = typeof k === "number" ? await repo.findById(k) : await getByMaDk(k);
    if (!r) return null;
    const maDk = String(r.ma_dk || "").trim();
    r.theoryInfo = { loai_ly_thuyet: (r.trang_thai_ly_thuyet || 0) >= 2 ? 1 : 0, loai_het_mon: (r.trang_thai_ly_thuyet || 0) >= 4 ? 1 : 0, ghi_chu: "" };

    const pgSvc = require("./progress.service"), regMod = require("../models/vehicleRegistration.model");
    const [pg, kd, reg] = await Promise.all([
        pgSvc.getStudentProgress(maDk, r.khoa_bu_thuc_hanh || r.ma_khoa || "", { forceSync, hang: r.hang }),
        repo.getKyDatByMaDk(maDk),
        regMod.findByMaDkList([maDk]).then((res) => res[0] ?? {})
    ]);

    return {
        ...r, ...pg, ky_dat: kd.ky_dat ?? null, ghi_chu_dat_1: kd.ghi_chu_1 ?? null,
        ghi_chu_dat_2: kd.ghi_chu_2 ?? null, xe_b1: reg.xe_b1 ?? null, xe_b2: reg.xe_b2 ?? null
    };
};

const getChiTietLopLyThuyet = async (mkb) => {
    const ltMod = require("../models/lopLyThuyet.model"), lotusApi = require("./lotusApi.service");
    const ss = await repo.list({ khoa_bu_ly_thuyet: mkb, limit: 1000, page: 1 });
    if (!ss.length) return [];

    const distinctCodes = await repo.getLotusCodesByKhoaList([...new Set(ss.map(s => s.ma_khoa).filter(Boolean))]);
    const apiCall = (c) => lotusApi.callWithRetry((a) => lotusApi.getHocVienTheoKhoa(c, { items_per_page: 300 }, a)).catch(() => ({}));

    const [rawTheory, lotusResList] = await Promise.all([
        ltMod.getAll({ ma_dk_list: ss.map((s) => s.ma_dk) }).catch(() => []),
        Promise.all(distinctCodes.map(o => apiCall(o.code)))
    ]);

    const thMap = Object.fromEntries(rawTheory.map((t) => [String(t.ma_dk).trim(), t]));
    const lk = {}; lotusResList.flatMap(r => r?.result ?? []).forEach(m => {
        const k = String(m?.user?.code ?? "").trim(), c = String(m?.user?.identification_card ?? "").trim();
        const sc = m?.learning_progress?.score_by_rubrik ?? [];
        if (k) lk[k] = sc; if (c) lk[c] = sc;
    });

    return ss.map((s) => {
        const t = thMap[String(s.ma_dk).trim()] ?? {};
        const sc = lk[String(s.ma_dk).trim()] ?? lk[String(s.cccd).trim()] ?? [];
        return {
            ...s, scoreByRubrik: sc,
            theoryInfo: {
                loai_ly_thuyet: t.loai_ly_thuyet != null ? +t.loai_ly_thuyet : (s.trang_thai_ly_thuyet >= 2 ? 1 : 0),
                loai_het_mon: t.loai_het_mon != null ? +t.loai_het_mon : (s.trang_thai_ly_thuyet >= 4 ? 1 : 0),
                ghi_chu: t.ghi_chu ?? ""
            }
        };
    });
};

const getChiTietLopThucHanh = async (mkb) => {
    const ss = await repo.list({ khoa_bu_thuc_hanh: mkb, limit: 1000, page: 1 });
    if (!ss.length) return [];
    const pgSvc = require("./progress.service");
    const list = await pgSvc.getBatchProgress(ss.map(s => ({ ma_dk: s.ma_dk, ma_khoa: s.ma_khoa, hang: s.hang })), 10, { includeLotus: false });
    return ss.map((s, i) => ({ ...s, ...list[i] }));
};

// ─── DANG HOC BU LIST ─────────────────────────────────────────────────────
/** Lấy batch Maps thông tin khóa hỗ trợ việc render list */
const getCombinedMaps = async (codes) => {
    const [names, progress] = await Promise.all([repo.getCourseNamesByCodes(codes), repo.getCourseProgressByCodes(codes)]);
    return {
        nM: Object.fromEntries(names.map(c => [String(c.ma_khoa).trim(), String(c.ten_khoa).trim()])),
        pM: Object.fromEntries(progress.map(p => [`${String(p.ma_khoa).trim()}_${Number(p.loai ?? 0)}`, p])),
        pF: Object.fromEntries(progress.map(p => [String(p.ma_khoa).trim(), p]))
    };
};

const getDangHocBuList = async (filters) => {
    const d = await repo.list({ ...filters, trang_thai: filters.trang_thai || TRANG_THAI_GROUPS.DANG_HOC_BU });
    if (!d.length) return d;

    const codes = [...new Set(d.flatMap((i) => [i.ma_khoa, i.khoa_bu_ly_thuyet, i.khoa_bu_thuc_hanh].filter(Boolean).map(String)))];
    const { nM, pM, pF } = await getCombinedMaps(codes);

    d.forEach((i) => {
        const gn = (c) => nM[String(c || "").trim()] || c;
        const gp = (c, l) => pM[`${String(c || "").trim()}_${l}`] ?? pF[String(c || "").trim()] ?? {};
        const m = gp(i.ma_khoa, 0), lt = gp(i.khoa_bu_ly_thuyet, 1), th = gp(i.khoa_bu_thuc_hanh, 2);
        i.khoa = { ten_khoa: gn(i.ma_khoa), bat_dau_ly_thuyet: m.bat_dau_ly_thuyet, ket_thuc_ly_thuyet: m.ket_thuc_ly_thuyet, bat_dau_cabin: m.bat_dau_cabin, ket_thuc_cabin: m.ket_thuc_cabin, bat_dau_dat: m.bat_dau_dat, ket_thuc_dat: m.ket_thuc_dat };
        i.khoa_bu_ly_thuyet = i.khoa_bu_ly_thuyet ? { ten_khoa: gn(i.khoa_bu_ly_thuyet), bat_dau_ly_thuyet: lt.bat_dau_ly_thuyet, ket_thuc_ly_thuyet: lt.ket_thuc_ly_thuyet } : null;
        i.khoa_bu_thuc_hanh = i.khoa_bu_thuc_hanh ? { ten_khoa: gn(i.khoa_bu_thuc_hanh), bat_dau_cabin: th.bat_dau_cabin, ket_thuc_cabin: th.ket_thuc_cabin, bat_dau_dat: th.bat_dau_dat, ket_thuc_dat: th.ket_thuc_dat } : null;
    });
    return d;
};

// ─── IMPORT EXCEL ─────────────────────────────────────────────────────────
/** Quét header từ sheet JSON tìm cột Mã ĐK và Khóa */
const parseHeaderCols = (raw) => {
    let idx = -1; const cols = { md: -1, k: -1 };
    for (let r = 0; r < Math.min(raw.length, 15); r++) {
        if (!raw[r].some((c) => /mã?\s*đk/i.test(String(c)))) continue;
        idx = r;
        raw[r].forEach((c, i) => {
            const t = String(c).toLowerCase();
            if (/mã?\s*đk/.test(t)) cols.md = i;
            else if (/khóa|khoa/.test(t)) cols.k = i;
        });
        break;
    }
    if (idx < 0 || cols.md < 0) throw new Error("Không tìm thấy cột 'Mã ĐK' trong Excel.");
    return { idx, cols };
};

/** Xây dựng object database payload cho từng dòng Excel */
const buildImportData = (entries, dbMap, nLoai, meta) => {
    const notFound = [];
    const toUpsert = entries.map((e) => {
        const fullK = dbMap[e.md]; if (!fullK) notFound.push(e.md);
        let mk = fullK || e.xk || "IMPORTED";
        if (mk !== "IMPORTED" && !mk.startsWith("30004")) mk = "30004" + mk;
        const p = { ma_dk: e.md, ma_khoa: mk, loai: nLoai, ghi_chu: meta.note, nguoi_tao: meta.actor, nguoi_update: meta.actor, trang_thai: null };
        if (nLoai === "ly_thuyet") {
            Object.assign(p, { trang_thai_ly_thuyet: null, ...(meta.kb && { khoa_bu_ly_thuyet: meta.kb }) });
        } else {
            Object.assign(p, { trang_thai_thuc_hanh: null, loai_thuc_hanh: nLoai, ...(meta.kb && { khoa_bu_thuc_hanh: meta.kb }) });
        }
        return p;
    });
    return { toUpsert, notFound };
};

const importFromExcel = async (buffer, { loai, khoa_bu, ghi_chu, nguoi_tao }) => {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    if (!raw.length) throw new Error("File excel rỗng.");
    const { idx, cols } = parseHeaderCols(raw);
    const es = raw.slice(idx + 1).map((r) => ({ md: String(r[cols.md] || "").trim(), xk: String(r[cols.k] || "").trim() })).filter((x) => x.md);
    if (!es.length) throw new Error("Không có dữ liệu hợp lệ bên dưới tiêu đề.");

    const dbR = await repo.getMaKhoaByMaDkList([...new Set(es.map(e => e.md))]);
    const map = Object.fromEntries(dbR.map((x) => [String(x.ma_dk).trim(), String(x.ma_khoa).trim()]));

    const { toUpsert, notFound } = buildImportData(es, map, toLoai(loai || "ly_thuyet"), { note: ghi_chu || "Import từ Excel", actor: nguoi_tao || "admin", kb: khoa_bu });
    const result = await repo.upsertMany(toUpsert);
    return { totalUploaded: es.length, savedSuccess: result.success, notFoundInSystem: notFound.length };
};

// ─── MISC / WRAPPERS ──────────────────────────────────────────────────────
const getTienDoDaoTao = (f) => require("../models/tienDoDaoTao.model").getAll(f);
const autoCompleteTheory = () => repo.autoCompleteTheory();

module.exports = {
    list, getById, getByMaDk, addStudent, updateStatus, updateStatusBulk,
    getDetail, getChiTietLopLyThuyet, getChiTietLopThucHanh,
    getDangHocBuList, importFromExcel, getTienDoDaoTao, autoCompleteTheory
};