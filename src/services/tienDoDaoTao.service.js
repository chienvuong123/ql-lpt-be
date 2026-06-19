const repository = require("../repositories/tienDoDaoTao.repository");
const TienDoDaoTao = require("../models/tienDoDaoTao.model");
const cabinApi = require("./cabinApi.service");
const progressService = require("./progress.service");

const getTienDoDaoTao = async (filters = {}) => {
    const raw = await repository.getAllSql(filters);
    return TienDoDaoTao.formatList(raw);
};

const getChiTietDaoTao = async (ma_khoa, { page = 1, limit = 10, search = "", forceSync = true } = {}) => {
    if (!ma_khoa) {
        throw new Error("Mã khóa học không được trống");
    }

    // 1. Fetch paginated students & theory progress
    const { data: students, pagination } = await repository.getStudentsAndTheoryProgressSql(ma_khoa, { page, limit, search });

    if (students.length === 0) {
        return { data: [], pagination };
    }

    // 2. Fetch Cabin progress from External Cabin API
    let cabinMap = {};
    try {
        let clean = String(ma_khoa).trim();
        if (!clean.startsWith("30004")) {
            clean = "30004" + clean;
        }

        let cabinRes = await cabinApi.getDanhSachKetQuaCabin({ khoa: clean });
        let cabinRaw = cabinRes?.data || [];

        // Fallback: if 30004 prefix yields 0 sessions, try raw course code
        if (cabinRaw.length === 0 && clean !== ma_khoa) {
            cabinRes = await cabinApi.getDanhSachKetQuaCabin({ khoa: ma_khoa });
            cabinRaw = cabinRes?.data || [];
        }

        const rawMap = cabinApi.buildCabinMap(cabinRaw);

        // Normalize keys of rawMap for robust matching (digits only)
        Object.entries(rawMap).forEach(([key, val]) => {
            const normKey = String(key).replace(/[^\d]/g, "");
            cabinMap[normKey] = val;
        });
    } catch (err) {
        console.error(`[TienDoDaoTaoService] Lỗi khi lấy dữ liệu Cabin cho khóa ${ma_khoa}:`, err.message);
    }

    // 3. Fetch DAT sessions for all students on the page in parallel (using HanhTrinh API / cache)
    const datSessionsPromises = students.map(st => 
        progressService.getDATSessions(st.ma_dk, ma_khoa, { forceSync, hang: st.hang })
            .catch(err => {
                console.error(`[TienDoDaoTaoService] Lỗi khi lấy DAT cho ${st.ma_dk}:`, err.message);
                return [];
            })
    );
    const datSessionsArray = await Promise.all(datSessionsPromises);

    // 4. Define DAT completion targets per Hang
    const HANG_CONFIG = {
        B1: { thoiGian: 12 * 3600, quangDuong: 710 },
        B11: { thoiGian: 12 * 3600, quangDuong: 710 },
        "B.01": { thoiGian: 12 * 3600, quangDuong: 710 },
        B2: { thoiGian: 20 * 3600, quangDuong: 810 },
        B: { thoiGian: 20 * 3600, quangDuong: 810 },
        C: { thoiGian: 24 * 3600, quangDuong: 825 },
        C1: { thoiGian: 24 * 3600, quangDuong: 825 }
    };

    // 5. Group by Teacher
    const teacherGroupMap = {};

    students.forEach((st, idx) => {
        const maDk = st.ma_dk;
        const teacherName = st.giao_vien || "Chưa phân công";

        // Theory progress
        const theoryProgress = st.theory_progress != null ? Number(st.theory_progress) : 0;
        const theoryHours = st.theory_hours != null ? Number(st.theory_hours) : 0;
        const theoryPassed = st.theory_passed === 1 || st.theory_passed === true;
        let learning = [];
        try {
            if (st.theory_score_by_rubrik) {
                learning = JSON.parse(st.theory_score_by_rubrik);
            }
        } catch (e) {
            console.error(`[TienDoDaoTaoService] Lỗi parse theory_score_by_rubrik cho ${st.ma_dk}:`, e.message);
        }

        // Cabin progress (lookup by normalized ma_dk)
        const normStudentMaDk = String(maDk).replace(/[^\d]/g, "");
        const cabinInfo = cabinMap[normStudentMaDk] || { tong_phut: 0, so_bai_hoc: 0 };
        const cabinPassed = cabinInfo.tong_phut >= 150 && cabinInfo.so_bai_hoc >= 8;

        // DAT progress calculation from HanhTrinh API sessions
        let tongKm = 0;
        let tongGiay = 0;
        const sessions = datSessionsArray[idx] || [];
        sessions.forEach(s => {
            if (s.trang_thai && s.trang_thai.toString().toUpperCase() === "HUY") return;
            const km = Number(s.TongQuangDuong || s.so_km || s.tong_km || s.Distance || 0);
            let giay = Number(s.TongThoiGian || s.thoi_gian || s.Duration || 0);
            if (giay > 0 && giay < 100) {
                giay = Math.round(giay * 3600);
            }
            tongKm += km;
            tongGiay += giay;
        });

        const hang = String(st.hang || "B2").trim().toUpperCase();
        const config = HANG_CONFIG[hang] || HANG_CONFIG["B2"];
        const datPassed = (tongKm >= config.quangDuong) && (tongGiay >= config.thoiGian);

        // Format DAT duration
        const datH = Math.floor(tongGiay / 3600);
        const datM = Math.floor((tongGiay % 3600) / 60);

        const studentData = {
            ma_dk: st.ma_dk,
            ho_ten: st.ho_ten,
            cccd: st.cccd,
            hang: st.hang,
            anh: st.anh || null,
            xe_b1: st.xe_b1 || null,
            xe_b2: st.xe_b2 || null,
            tien_do: {
                ly_thuyet: {
                    ti_le: theoryProgress,
                    so_gio: theoryHours,
                    dat: theoryPassed,
                    learning: learning
                },
                cabin: {
                    tong_phut: cabinInfo.tong_phut,
                    so_bai: cabinInfo.so_bai_hoc,
                    dat: cabinPassed
                },
                dat: {
                    tong_km: parseFloat(tongKm.toFixed(2)),
                    tong_thoi_gian: `${datH}h ${datM}'`,
                    tong_giay: tongGiay,
                    dat: datPassed
                }
            }
        };

        if (!teacherGroupMap[teacherName]) {
            teacherGroupMap[teacherName] = {
                giao_vien: teacherName,
                hoc_vien: []
            };
        }
        teacherGroupMap[teacherName].hoc_vien.push(studentData);
    });

    return {
        data: Object.values(teacherGroupMap),
        pagination
    };
};

module.exports = {
    getTienDoDaoTao,
    getChiTietDaoTao,
};
