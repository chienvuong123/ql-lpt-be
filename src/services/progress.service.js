const axios = require("axios");
const { getHanhTrinhToken } = require("../services/localAuth.service");
const { calcDATSummary, mapLocalDATSession, getLocalEndDateStr } = require("../helpers/hocbu.helpers");

const DAT_API = "http://113.160.131.3:7782/api/HanhTrinh";
const CABIN_API = "https://lapphuongthanh.io.vn/api/thongtintap";

const fetchDATFromAPI = async (maDk, maKhoa, token) => {
    const baseParams = { ngaybatdau: "2020-01-01", ngayketthuc: getLocalEndDateStr(), ten: maDk, limit: 500, page: 1 };
    const headers = { Authorization: `Bearer ${token}` };

    const doFetch = (useKhoa) => {
        const params = new URLSearchParams(baseParams);
        if (useKhoa && maKhoa) params.append("makhoahoc", maKhoa);
        return axios.get(`${DAT_API}?${params}`, { headers, timeout: 6000 })
            .then((r) => r.data?.Data ?? [])
            .catch(() => []);
    };

    const sessions = await doFetch(true);
    return sessions.length ? sessions : doFetch(false);
};

const getDATSessions = async (maDk, maKhoa, { forceSync = false, hang } = {}) => {
    const phienHocDATModel = require("../models/phienHocDAT.model");

    if (!forceSync) {
        const cached = await phienHocDATModel.getPhienHocDATByMaDK(maDk).catch(() => []);
        if (cached?.length) return cached.map((s) => mapLocalDATSession(s, hang));
    }

    const tokenRes = await getHanhTrinhToken().catch(() => null);
    const token = tokenRes?.token;
    if (!token) return [];

    const sessions = await fetchDATFromAPI(maDk, maKhoa, token);
    if (sessions.length) phienHocDATModel.upsertPhienHocDATMany(maDk, sessions, maKhoa).catch(() => { });
    return sessions;
};

const buildDATData = (rawSessions, hang) => {
    const sessionsWithHang = rawSessions.map((s) => ({ ...s, HangDaoTao: hang }));
    const { sessions, summary } = calcDATSummary(sessionsWithHang);
    return { datDetails: { sessions }, datSummary: summary };
};

// ─── CABIN ───────────────────────────────────────────────────────────────────

const fetchCabinRaw = (maDk) =>
    axios.get(`${CABIN_API}?maDK=${maDk}`, { timeout: 10000 })
        .then((r) => r.data?.data ?? [])
        .catch(() => []);

const buildCabinData = (rawArray, maDk) => {
    const cabinApi = require("../services/cabinApi.service");
    const cabinMap = cabinApi.buildCabinMap(rawArray);
    const myCabin = cabinMap[maDk] ?? { tong_phut: 0, so_bai_hoc: 0, bai_hoc: [] };
    return {
        cabinDetails: myCabin.bai_hoc,
        cabinSummary: { tong_thoi_gian: myCabin.tong_phut, tong_bai: myCabin.so_bai_hoc },
    };
};

// ─── LOTUS ───────────────────────────────────────────────────────────────────

const getLotusDetail = async (maDk) => {
    try {
        const connectSQL = require("../configs/sql");
        const mssql = require("mssql");
        const pool = await connectSQL();
        const { recordset } = await pool.request().input("maDk", mssql.VarChar, maDk).query(`
            SELECT TOP 1 hv.ma_khoa, hv.cccd, LTRIM(RTRIM(kh.code)) as code 
            FROM [dbo].[hoc_vien] hv
            LEFT JOIN [dbo].[khoa_hoc] kh ON hv.ma_khoa = kh.ma_khoa
            WHERE hv.ma_dk = @maDk
        `);
        const student = recordset[0];
        if (!student || !student.code) return { scoreByRubrik: [] };

        const lotusApiService = require("../services/lotusApi.service");
        const lotusData = await lotusApiService.callWithRetry((auth) =>
            lotusApiService.getHocVienTheoKhoa(student.code, { text: maDk }, auth)
        );

        const member = (lotusData?.result ?? []).find((m) =>
            String(m?.user?.code ?? "").trim() === String(maDk).trim() ||
            (student.cccd && String(m?.user?.identification_card ?? "").trim() === String(student.cccd).trim())
        );

        return { scoreByRubrik: member?.learning_progress?.score_by_rubrik ?? [] };
    } catch (err) {
        console.error(`[LotusDetail] Error ${maDk}:`, err.message);
        return { scoreByRubrik: [] };
    }
};

const getStudentProgress = async (maDk, maKhoa, { forceSync = false, hang, includeCabin = true, includeDAT = true, includeLotus = true } = {}) => {
    const tasks = [
        includeCabin ? fetchCabinRaw(maDk) : Promise.resolve([]),
        includeDAT ? getDATSessions(maDk, maKhoa, { forceSync, hang }) : Promise.resolve([]),
        includeLotus ? getLotusDetail(maDk) : Promise.resolve({ scoreByRubrik: [] }),
    ];

    const [rawCabin, datSessions, lotusData] = await Promise.all(tasks);

    return {
        ...(includeCabin ? buildCabinData(rawCabin, maDk) : {}),
        ...(includeDAT ? buildDATData(datSessions, hang) : {}),
        scoreByRubrik: includeLotus ? (lotusData?.scoreByRubrik ?? []) : [],
    };
};

const getBatchProgress = async (students, batchSize = 6, opts = {}) => {
    const results = [];
    for (let i = 0; i < students.length; i += batchSize) {
        const chunk = students.slice(i, i + batchSize);
        const chunkResults = await Promise.all(
            chunk.map((s) => getStudentProgress(s.ma_dk, s.ma_khoa, { hang: s.hang, ...opts }))
        );
        results.push(...chunkResults);
    }
    return results;
};

module.exports = { getDATSessions, buildDATData, buildCabinData, getStudentProgress, getBatchProgress };