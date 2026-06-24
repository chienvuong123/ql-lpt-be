const svc = require("../services/hocbu.service");
const { normalizeLoai, parseTrangThai, pickArrayQuery } = require("../helpers/hocbu.helpers");
const { TRANG_THAI_GROUPS } = require("../constants/hocbu.constants");

// ─── Helpers response ────────────────────────────────────────────────────────

const ok = (res, data, extra = {}) => res.json({ success: true, ...extra, data });
const err = (res, error, status = 500) => {
    console.error(error);
    res.status(status).json({ success: false, message: error.message || error });
};

/** Gắn thêm pagination vào response nếu có page + limit */
const withPaging = (res, data, page, limit) => {
    if (!page || !limit) return ok(res, data);
    const total = data.total || 0;
    return ok(res, data, { total, pagination: { page: +page, limit: +limit, total } });
};

/** Parse filter chung từ query */
const parseListFilters = (query) => ({
    ma_khoa: query.ma_khoa,
    loai: normalizeLoai(pickArrayQuery(query, "loai")),
    trang_thai: parseTrangThai(pickArrayQuery(query, "trang_thai")),
    loai_thuc_hanh: query.loai_thuc_hanh,
    search: query.search || query.text,
    page: query.page,
    limit: query.limit,
});

// ─── LIST routes ─────────────────────────────────────────────────────────────

const getHocBuList = async (req, res) => {
    try {
        const filters = parseListFilters(req.query);
        const data = await svc.list(filters);
        withPaging(res, data, filters.page, filters.limit);
    } catch (e) { err(res, e); }
};

const getChoDuyetHocBuList = async (req, res) => {
    try {
        const loai = normalizeLoai(req.query.loai);
        const trangThaiMap = {
            ly_thuyet: TRANG_THAI_GROUPS.CHO_DUYET_LT,
            cabin: TRANG_THAI_GROUPS.CHO_DUYET_TH,
            dat: TRANG_THAI_GROUPS.CHO_DUYET_TH,
        };
        const trang_thai = trangThaiMap[loai] ?? TRANG_THAI_GROUPS.CHO_DUYET_ALL;
        const { page, limit } = req.query;

        const rawMaDk = pickArrayQuery(req.query, "ma_dk");
        let ma_dk_list = undefined;
        if (rawMaDk) {
            const rawArr = Array.isArray(rawMaDk) ? rawMaDk : String(rawMaDk).split(",");
            ma_dk_list = [...new Set(rawArr.map(String).map(s => s.trim()).filter(Boolean))];
        }

        const data = await svc.list({ 
            ma_khoa: req.query.ma_khoa, 
            loai, 
            trang_thai, 
            search: req.query.search || req.query.text, 
            ma_dk_list,
            page, 
            limit 
        });
        withPaging(res, data, page, limit);
    } catch (e) { err(res, e); }
};

const getChoDuyetLyThuyetList = async (req, res) => {
    try {
        const data = await svc.list({ ma_khoa: req.query.ma_khoa, trang_thai: TRANG_THAI_GROUPS.CHO_DUYET_LT, search: req.query.search || req.query.text });
        ok(res, data);
    } catch (e) { err(res, e); }
};

const getChoDuyetThucHanhList = async (req, res) => {
    try {
        const { ma_khoa, loai, loai_thuc_hanh, search, text, page, limit } = req.query;
        const rawMaDk = pickArrayQuery(req.query, "ma_dk");
        let ma_dk_list = undefined;
        if (rawMaDk) {
            const rawArr = Array.isArray(rawMaDk) ? rawMaDk : String(rawMaDk).split(",");
            ma_dk_list = [...new Set(rawArr.map(String).map(s => s.trim()).filter(Boolean))];
        }
        const data = await svc.list({ 
            ma_khoa, 
            loai: normalizeLoai(loai), 
            loai_thuc_hanh, 
            trang_thai: TRANG_THAI_GROUPS.CHO_DUYET_TH, 
            search: search || text, 
            ma_dk_list, 
            page, 
            limit 
        });
        withPaging(res, data, page, limit);
    } catch (e) { err(res, e); }
};

const getDangHocBuList = async (req, res) => {
    try {
        const { ma_khoa, loai, loai_thuc_hanh, search, text, page, limit } = req.query;
        const trang_thai = parseTrangThai(pickArrayQuery(req.query, "trang_thai"));
        const data = await svc.getDangHocBuList({ ma_khoa, loai: normalizeLoai(loai), loai_thuc_hanh, trang_thai, search: search || text, page, limit });
        withPaging(res, data, page, limit);
    } catch (e) { err(res, e); }
};

// ─── DETAIL ──────────────────────────────────────────────────────────────────

const getHocBuDetail = async (req, res) => {
    try {
        const { id, ma_dk, sync } = req.query;
        const key = id ? +id : ma_dk;
        if (!key) return res.status(400).json({ success: false, message: "Thiếu id hoặc ma_dk" });

        const data = await svc.getDetail(key, { forceSync: sync === "true" });
        if (!data) return res.status(404).json({ success: false, message: "Không tìm thấy đơn học bù" });
        ok(res, data);
    } catch (e) { err(res, e); }
};

const getChiTietLopBuLyThuyet = async (req, res) => {
    try {
        const { ma_khoa_bu } = req.params;
        ok(res, await svc.getChiTietLopLyThuyet(ma_khoa_bu));
    } catch (e) { err(res, e); }
};

const getChiTietLopBuThucHanh = async (req, res) => {
    try {
        const { ma_khoa_bu } = req.params;
        ok(res, await svc.getChiTietLopThucHanh(ma_khoa_bu));
    } catch (e) { err(res, e); }
};

// ─── WRITE ───────────────────────────────────────────────────────────────────

const addStudentToHocBu = async (req, res) => {
    try {
        const { ma_dk, ma_khoa, loai } = req.body;
        if (!ma_dk || !ma_khoa || !loai) return res.status(400).json({ success: false, message: "Thiếu ma_dk, ma_khoa hoặc loai" });
        const id = await svc.addStudent(req.body);
        ok(res, null, { message: "Đã lưu học viên vào danh sách học bù", id });
    } catch (e) { err(res, e); }
};

const updateHocBuStatus = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: "Thiếu ID" });

        const result = await svc.updateStatus(+id, req.body);
        if (result.notFound) return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
        if (result.noAction) return res.status(400).json({ success: false, message: "Không xác định được hành động cập nhật" });
        ok(res, result.updated, { message: "Cập nhật trạng thái thành công" });
    } catch (e) { err(res, e); }
};

const updateHocBuStatusBulk = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: "Danh sách ID không hợp lệ" });
        const { totalUpdated, total } = await svc.updateStatusBulk(ids, req.body);
        ok(res, null, { message: `Cập nhật thành công ${totalUpdated}/${total} bản ghi` });
    } catch (e) { err(res, e); }
};

const importHocBuExcel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Vui lòng đính kèm file Excel" });
        const stats = await svc.importFromExcel(req.file.buffer, req.body);
        ok(res, null, { message: "Xử lý file Excel thành công", stats });
    } catch (e) { err(res, e); }
};

const checkHoanThanhLyThuyet = async (req, res) => {
    try {
        const updatedCount = await svc.autoCompleteTheory();
        ok(res, null, { message: `Đã cập nhật ${updatedCount} học viên sang trạng thái lý thuyết đạt`, updatedCount });
    } catch (e) { err(res, e); }
};

// ─── TIẾN ĐỘ ĐÀO TẠO ────────────────────────────────────────────────────────

const getTienDoDaoTao = async (req, res) => {
    try {
        ok(res, await svc.getTienDoDaoTao({ ma_khoa: req.query.ma_khoa }));
    } catch (e) { err(res, e); }
};

module.exports = {
    getHocBuList, getChoDuyetHocBuList, getChoDuyetLyThuyetList,
    getChoDuyetThucHanhList, getDangHocBuList,
    getHocBuDetail, getChiTietLopBuLyThuyet, getChiTietLopBuThucHanh,
    addStudentToHocBu, updateHocBuStatus, updateHocBuStatusBulk,
    importHocBuExcel, checkHoanThanhLyThuyet, getTienDoDaoTao,
};