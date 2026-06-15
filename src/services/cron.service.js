const cron = require("node-cron");
const axios = require("axios");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");
// const syncModel = require("../models/sync.model");
// const cabinService = require("../services/cabinApi.service");
// const lopLyThuyetModel = require("../models/lopLyThuyet.model");
// const vehicleRegistrationModel = require("../models/vehicleRegistration.model");
// const evaluateUtils = require("../utils/evaluate");
// const connectSQL = require("../configs/sql");
// const mssql = require("mssql");
// const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");

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

    // Cấu hình kiểm tra chuyên cần Cabin tự động sau khi kết thúc ca học 10 phút
    const getTodayVNStr = () => {
      const now = new Date();
      const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const yyyy = vnTime.getUTCFullYear();
      const mm = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(vnTime.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const getHourVN = () => {
      const now = new Date();
      const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      return vnTime.getUTCHours();
    };

    // Kiểm tra Ca 1 (múi giờ 9h), Ca 3 (14h), Ca 5 (19h)
    cron.schedule("40 9,14,19 * * *", async () => {
      const hour = getHourVN();
      let caHoc = null;
      if (hour === 9) caHoc = 1;
      else if (hour === 14) caHoc = 3;
      else if (hour === 19) caHoc = 5;

      if (caHoc) {
        const dateStr = getTodayVNStr();
        console.log(`[CronService] [${new Date().toLocaleString()}] Bắt đầu kiểm tra chuyên cần Cabin Ca ${caHoc} ngày ${dateStr}...`);
        try {
          const cabinAttendanceService = require("./cabinAttendance.service");
          const result = await cabinAttendanceService.checkAttendanceAndNotify({ dateStr, caHoc });
          console.log(`[CronService] Kết quả kiểm tra chuyên cần Ca ${caHoc}:`, result);
        } catch (err) {
          console.error(`[CronService] Lỗi kiểm tra chuyên cần Ca ${caHoc}:`, err.message);
        }
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Kiểm tra Ca 2 (múi giờ 12h), Ca 4 (17h), Ca 6 (22h)
    cron.schedule("10 12,17,22 * * *", async () => {
      const hour = getHourVN();
      let caHoc = null;
      if (hour === 12) caHoc = 2;
      else if (hour === 17) caHoc = 4;
      else if (hour === 22) caHoc = 6;

      if (caHoc) {
        const dateStr = getTodayVNStr();
        console.log(`[CronService] [${new Date().toLocaleString()}] Bắt đầu kiểm tra chuyên cần Cabin Ca ${caHoc} ngày ${dateStr}...`);
        try {
          const cabinAttendanceService = require("./cabinAttendance.service");
          const result = await cabinAttendanceService.checkAttendanceAndNotify({ dateStr, caHoc });
          console.log(`[CronService] Kết quả kiểm tra chuyên cần Ca ${caHoc}:`, result);
        } catch (err) {
          console.error(`[CronService] Lỗi kiểm tra chuyên cần Ca ${caHoc}:`, err.message);
        }
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    console.log("[CronService] Tác vụ tự động, sync Google Sheet và kiểm tra chuyên cần Cabin đã hoạt động.");
  }
}

module.exports = new CronService();
