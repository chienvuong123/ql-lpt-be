const { LOAI_MAP, STATE_TRANSITIONS, DIRECT_UPDATE_FIELDS } = require("../constants/hocbu.constants");

const toLoai = (val) => LOAI_MAP[String(val).trim().toLowerCase()] ?? String(val).trim().toLowerCase();

const normalizeLoai = (raw) => {
    if (!raw) return undefined;
    if (Array.isArray(raw)) return raw.map(toLoai);
    if (String(raw).includes(",")) return raw.split(",").map(toLoai);
    return toLoai(raw);
};

const parseTrangThai = (raw) => {
    if (!raw) return undefined;
    const toNum = (v) => { const n = Number(v); return isNaN(n) ? null : n; };
    if (Array.isArray(raw)) return raw.map(toNum).filter(Boolean);
    if (String(raw).includes(",")) return raw.split(",").map(toNum).filter(Boolean);
    return toNum(raw);
};

const pickArrayQuery = (query, key) => query[key] || query[`${key}[]`];

const calcDATSummary = (sessions) => {
    let tongKm = 0, tongGiay = 0;
    const mapped = sessions.map((s) => {
        const km = Number(s.TongQuangDuong || s.Distance || 0);
        let giay = Number(s.TongThoiGian || s.Duration || 0);
        if (giay > 0 && giay < 100) giay = Math.round(giay * 3600);
        tongKm += km;
        tongGiay += giay;
        return {
            ThoiDiemDangNhap: s.ThoiDiemDangNhap ?? s.gio_vao,
            ThoiDiemDangXuat: s.ThoiDiemDangXuat ?? s.gio_ra,
            BienSo: s.BienSo ?? s.BienSoXe ?? s.bien_so_xe,
            TongQuangDuong: km,
            TongThoiGian: giay,
            HoTenGV: s.HoTenGV ?? s.ho_ten_gv,
        };
    });
    const h = Math.floor(tongGiay / 3600);
    const m = Math.floor((tongGiay % 3600) / 60);
    return {
        sessions: mapped,
        summary: { tong_quang_duong: parseFloat(tongKm.toFixed(2)), tong_thoi_gian: `${h}h ${m}'` },
    };
};

const mapLocalDATSession = (s, hang) => ({
    ThoiDiemDangNhap: s.gio_vao,
    ThoiDiemDangXuat: s.gio_ra,
    BienSo: s.bien_so_xe,
    TongQuangDuong: s.tong_km,
    TongThoiGian: s.thoi_gian,
    HoTenGV: s.ho_ten_gv,
    HangDaoTao: hang,
});

const buildStateUpdateData = (record, action, extra) => {
    const effectiveAction = action || (extra.khoa_bu ? "xep_lop" : null);
    if (!effectiveAction) return null;

    const transitions = STATE_TRANSITIONS[effectiveAction];
    if (!transitions) return null;

    const factory = transitions[record.trang_thai];
    if (!factory) return null;

    return factory(extra.nguoi_update || "admin", { ...extra, loai: record.loai });
};

/** Merge direct fields từ req.body vào updateData (hỗ trợ FE cũ) */
const mergeDirectFields = (body, updateData = {}) => {
    const patch = Object.fromEntries(
        DIRECT_UPDATE_FIELDS
            .filter((f) => body[f] != null)
            .map((f) => [f, body[f]])
    );
    return { merged: { ...updateData, ...patch }, hasDirect: Object.keys(patch).length > 0 };
};

/** Lấy ngày cuối hôm nay theo timezone local */
const getLocalEndDateStr = () => {
    const offset = new Date().getTimezoneOffset();
    return new Date(Date.now() - offset * 60000).toISOString().split("T")[0] + "T23:59:00";
};

module.exports = {
    toLoai, normalizeLoai, parseTrangThai, pickArrayQuery,
    calcDATSummary, mapLocalDATSession,
    buildStateUpdateData, mergeDirectFields,
    getLocalEndDateStr,
};