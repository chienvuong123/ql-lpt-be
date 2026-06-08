const cron = require("node-cron");
const axios = require("axios");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");
const hocBuModel = require("../models/hocBu.model");
const syncModel = require("../models/sync.model");
const cabinService = require("../services/cabinApi.service");
const lopLyThuyetModel = require("../models/lopLyThuyet.model");
const vehicleRegistrationModel = require("../models/vehicleRegistration.model");
const evaluateUtils = require("../utils/evaluate");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");

// ─── STANDALONE HELPERS ─────────────────────────────────────────────────────────────

/** Parallel iteration tool */
async function mapConcurrent(items, limit, fn) {
  const result = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        result[i] = await fn(items[i], i);
      } catch (err) {
        result[i] = { error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

/** Fetch live API telemetry for road driving evaluation */
async function fetchRawHanhTrinhRecords(maDk, maKhoaHoc) {
  const trimmedMaDk = String(maDk || "").trim();
  const trimmedMaKhoa = String(maKhoaHoc || "").trim();
  const ngaybatdau = "2020-01-01";
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset * 60 * 1000));
  const endDateStr = localToday.toISOString().split('T')[0] + "T23:59:00";

  const buildParams = (useKhoa = true) => {
    const p = { ngaybatdau, ngayketthuc: endDateStr, ten: trimmedMaDk, limit: 500, page: 1 };
    if (useKhoa && trimmedMaKhoa) p.makhoahoc = trimmedMaKhoa;
    return new URLSearchParams(p);
  };

  const hanhTrinhAxios = axios.create({ baseURL: "http://113.160.131.3:7782", timeout: 20000 });

  const fetchAttempt = async (useKhoa) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resToken = await getHanhTrinhToken();
        const token = resToken?.token;
        const params = buildParams(useKhoa);
        const response = await hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        return response.data?.Data || [];
      } catch (err) {
        if (err?.response?.status === 401) { invalidateHanhTrinhToken(); if (attempt < 2) continue; }
        if (attempt < 2) { await new Promise(r => setTimeout(r, 800)); continue; }
        return [];
      }
    }
    return [];
  };

  let data = await fetchAttempt(true);
  if (data.length === 0 && trimmedMaKhoa) data = await fetchAttempt(false);
  return data;
}

/** Normalize duration from hours/seconds into absolute seconds */
function normalizeDurationToSeconds(s) {
  const raw = Number(s.TongThoiGian || s.Duration || s.thoi_gian || 0);
  if (raw === 0) return 0;
  if (raw < 100 || !Number.isInteger(raw)) return Math.round(raw * 3600);
  return raw;
}

// ─── MAIN SERVICE CLASS ─────────────────────────────────────────────────────────────

class CronService {
  init() {
    console.log("[CronService] Đang khởi tạo các tác vụ tự động...");

    // Quét các khóa hết hạn vào lúc 01:00 AM
    cron.schedule("0 1 * * *", async () => {
      console.log(`[CronService] [${new Date().toLocaleString()}] Bắt đầu quét quy trình tự động...`);
      try {
        const theoryExpired = await tienDoDaoTaoModel.getTheoryExpiredYesterday();
        if (theoryExpired.length > 0) {
          console.log(`[CronService] Tìm thấy ${theoryExpired.length} khóa hết hạn Lý thuyết.`);
          for (const mk of theoryExpired) await this.checkAndMoveTheory(mk).catch(e => console.error(`Failed theory move ${mk}:`, e.message));
        }

        const cabinExpired = await tienDoDaoTaoModel.getCabinExpiredYesterday();
        if (cabinExpired.length > 0) {
          console.log(`[CronService] Tìm thấy ${cabinExpired.length} khóa hết hạn Cabin.`);
          for (const mk of cabinExpired) await this.checkAndMoveCabin(mk).catch(e => console.error(`Failed cabin move ${mk}:`, e.message));
        }

        const datExpired = await tienDoDaoTaoModel.getDatExpiredYesterday();
        if (datExpired.length > 0) {
          console.log(`[CronService] Tìm thấy ${datExpired.length} khóa hết hạn DAT.`);
          for (const mk of datExpired) await this.checkAndMoveDat(mk).catch(e => console.error(`Failed DAT move ${mk}:`, e.message));
        }
      } catch (error) {
        console.error("[CronService] Lỗi nghiêm trọng trong tác vụ quét tự động:", error.message);
      }
    });

    // Đồng bộ Google Sheets vào 12:00 và 17:00 (chủ yếu lấy GID 1754545655, tự động thử lại tối đa 5 lần nếu lỗi)
    cron.schedule("0 12,17 * * *", async () => {
      console.log(`[CronService] [${new Date().toLocaleString()}] Bắt đầu tiến trình đồng bộ Google Sheet GID 1754545655...`);
      try {
        const googleSheetService = require("./googleSheet.service");
        
        let success = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            console.log(`[CronService] Đang đồng bộ (Lần thử ${attempt}/5)...`);
            await googleSheetService.syncAllSheetsToDatabase("1754545655");
            success = true;
            console.log(`[CronService] Đồng bộ thành công ở lần thử ${attempt}.`);
            break;
          } catch (err) {
            console.warn(`[CronService] Lần thử ${attempt}/5 thất bại: ${err.message}`);
            if (attempt < 5) {
              console.log("[CronService] Chờ 2 giây trước khi thử lại...");
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              throw err; // Ném lỗi ra ngoài nếu cả 5 lần đều xịt
            }
          }
        }
      } catch (error) {
        console.error("[CronService] Lỗi đồng bộ Google Sheets sau 5 lần thử:", error.message);
      }
    });

    console.log("[CronService] Tác vụ tự động và sync Google Sheet đã hoạt động.");
  }

  // ─── CORE JOB METHODS (Migrated from hocBu.service) ───────────────────────────────────

  /** Find unique mapping metadata for course */
  async getCourseInfo(ma_khoa_full) {
    const pool = await connectSQL();
    const result = await pool.request().input("ma_khoa", mssql.VarChar, ma_khoa_full).query(`
      SELECT TOP 1 LTRIM(RTRIM(ma_khoa)) as ma_khoa, ten_khoa, LTRIM(RTRIM(code)) as code 
      FROM khoa_hoc WHERE ma_khoa = @ma_khoa OR LTRIM(RTRIM(ma_khoa)) = LTRIM(RTRIM(@ma_khoa))
    `);
    return result.recordset[0];
  }

  /** Core logic to move theoretical failing students into makeup list */
  async checkAndMoveTheory(ma_khoa) {
    console.log(`[Cron] Check theory for ${ma_khoa}`);
    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const students = await syncModel.getHocVienSearch({ ma_khoa });
    if (!students.length) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const theoryData = await lopLyThuyetModel.getAll({ ma_khoa: ma_khoa });
    const theoryMap = Object.fromEntries(theoryData.map(i => [String(i.ma_dk).trim(), i]));

    const failedStudents = [];
    for (const student of students) {
      const maDk = String(student.ma_dk || "").trim();
      const tt = theoryMap[maDk];
      const isOkOnline = tt ? Number(tt.loai_ly_thuyet) === 1 : false;
      const isOkExam = tt ? Number(tt.loai_het_mon) === 1 : false;

      if (!isOkOnline || !isOkExam) {
        failedStudents.push({
          ma_dk: maDk, ma_khoa, loai: 1,
          ghi_chu: `Lý thuyết: ${!isOkOnline ? "Chưa đạt online" : ""} ${!isOkExam ? "Chưa làm bài hết môn" : ""}`.trim()
        });
      }
    }

    const movedCount = failedStudents.length > 0 ? await hocBuModel.moveToHocBu(failedStudents) : 0;
    return { totalChecked: students.length, movedCount, failedCount: failedStudents.length };
  }

  /** Core logic to move failing cabin students into makeup list */
  async checkAndMoveCabin(ma_khoa) {
    console.log(`[Cron] Check cabin for ${ma_khoa}`);
    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const raw = await syncModel.getHocVienSearch({ ma_khoa });
    if (!raw.length) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const maDkInTheory = await hocBuModel.getMaDkByKhoaAndLoai(ma_khoa, [1]);
    const students = raw.filter(s => !maDkInTheory.has(s.ma_dk));
    if (!students.length) return { totalChecked: raw.length, movedCount: 0, failedCount: 0 };

    const cabinRaw = await cabinService.getDanhSachKetQuaCabin({ khoa: ma_khoa }).then(r => r?.data || []);
    const cabinMap = cabinService.buildCabinMap(cabinRaw);

    const failed = [];
    for (const student of students) {
      const maDk = String(student.ma_dk || "").trim();
      const tt = cabinMap[maDk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
      if ((tt.tong_thoi_gian || 0) < 9000 || (tt.so_bai_hoc || 0) < 8) {
        failed.push({
          ma_dk: maDk, ma_khoa, loai: 2,
          ghi_chu: `Cabin: ${(tt.tong_thoi_gian || 0) < 9000 ? "Chưa đủ 150p" : ""} ${(tt.so_bai_hoc || 0) < 8 ? "Chưa đủ 8 bài" : ""}`.trim()
        });
      }
    }

    const moved = failed.length > 0 ? await hocBuModel.moveToHocBu(failed) : 0;
    return { totalChecked: students.length, movedCount: moved, failedCount: failed.length };
  }

  /** Core logic to move students missing required on-road telemetry (DAT) */
  async checkAndMoveDat(ma_khoa) {
    console.log(`[Cron] Check DAT for ${ma_khoa}`);
    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const raw = await syncModel.getHocVienSearch({ ma_khoa });
    if (!raw.length) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const prevSet = await hocBuModel.getMaDkByKhoaAndLoai(ma_khoa, [1, 2]);
    const students = raw.filter(s => !prevSet.has(s.ma_dk));
    if (!students.length) return { totalChecked: raw.length, movedCount: 0, failedCount: 0 };

    const regList = await vehicleRegistrationModel.findByMaDkList(students.map(s => s.ma_dk));
    const regMap = Object.fromEntries(regList.map(r => [r.ma_dk, { giaoVien: r.giao_vien, xeB1: r.xe_b1, xeB2: r.xe_b2 }]));

    const CheckConfigModel = require("../models/checkConfig.model");
    const ForbiddenZoneModel = require("../models/forbiddenZone.model");
    const PhienHocModel = require("../models/phienHocDAT.model");

    const [checkConfigs, forbiddenZoneRows, phienHocList, results] = await Promise.all([
      CheckConfigModel.getAll().catch(() => []),
      ForbiddenZoneModel.getAll().catch(() => []),
      PhienHocModel.getPhienHocDATByMaDKList(students.map(s => s.ma_dk)).catch(() => []),
      mapConcurrent(students, 8, (s) => fetchRawHanhTrinhRecords(s.ma_dk, ma_khoa))
    ]);

    const configMap = {};
    checkConfigs.forEach((cfg) => {
      configMap[cfg.check_key] = {
        enabled: cfg.enabled,
        startDate: cfg.start_date,
        value: cfg.value,
      };
    });
    evaluateUtils.setSystemConfig(configMap);

    const forbiddenZones = forbiddenZoneRows.filter((z) => z.enabled === true || z.enabled === 1);

    const buildStatusMapLocal = (list = []) => {
      const statusMap = {};
      const formatDate = (val) => {
        if (!val) return "";
        const d = new Date(val);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const formatTime = (val) => {
        if (!val) return "";
        const d = new Date(val);
        if (isNaN(d.getTime())) return "";
        const h = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        const sec = String(d.getSeconds()).padStart(2, "0");
        return `${h}:${min}:${sec}`;
      };
      const normalizePlateStr = (plate) => {
        if (!plate) return "";
        return plate.replace(/[-.\s]/g, "").toUpperCase().trim();
      };

      list.forEach((row) => {
        const status = row.trang_thai;
        if (status !== "DUYET" && status !== "HUY") return;

        const sessionId = row.phien_hoc_id || row.id;
        if (sessionId) {
          statusMap[`id:${sessionId}`] = { status };
        }

        const date = formatDate(row.ngay || row.gio_tu);
        const startTime = formatTime(row.gio_tu);
        const endTime = formatTime(row.gio_den);
        const plate = normalizePlateStr(row.bien_so_xe);

        if (date && plate && startTime && endTime) {
          statusMap[`slot:${date}|${plate}|${startTime}|${endTime}`] = { status };
        }
        if (date && startTime && endTime) {
          statusMap[`time:${date}|${startTime}|${endTime}`] = { status };
        }
      });
      return statusMap;
    };

    const phienHocMapByMaDK = new Map();
    phienHocList.forEach((row) => {
      const maDK = row.ma_dk;
      if (!phienHocMapByMaDK.has(maDK)) {
        phienHocMapByMaDK.set(maDK, []);
      }
      phienHocMapByMaDK.get(maDK).push(row);
    });

    const studentStatusMap = new Map();
    students.forEach((s) => {
      const list = phienHocMapByMaDK.get(s.ma_dk) || [];
      const statusMap = buildStatusMapLocal(list);
      studentStatusMap.set(s.ma_dk, statusMap);
    });

    const failed = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const reg = regMap[s.ma_dk] || null;
      const sessions = (results[i] || []).map(sess => ({
        ...sess,
        TongThoiGian: normalizeDurationToSeconds(sess),
        TongQuangDuong: Number(sess.TongQuangDuong || sess.Distance || 0),
        ThoiGianBanDem: Number(sess.ThoiGianBanDem || 0),
        QuangDuongBanDem: Number(sess.QuangDuongBanDem || 0)
      }));

      const statusMap = studentStatusMap.get(s.ma_dk) || {};
      const sum = evaluateUtils.computeSummary(sessions, s.hang_gplx || s.hang, reg, [], [], statusMap);
      const evalRes = evaluateUtils.evaluate(sum, sessions, [], reg, [], statusMap);

      if (evalRes.status === 'fail') {
        failed.push({
          ma_dk: s.ma_dk, ma_khoa, loai: 3,
          ghi_chu: `DAT: ${(evalRes.errors || []).map(e => e.label).join(", ") || "Không đạt"}`
        });
      }
    }

    const moved = failed.length > 0 ? await hocBuModel.moveToHocBu(failed) : 0;
    return { totalChecked: students.length, movedCount: moved, failedCount: failed.length };
  }
}

module.exports = new CronService();
