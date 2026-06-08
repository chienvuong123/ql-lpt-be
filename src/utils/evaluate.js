// Cấu hình hệ thống kiểm tra được đồng bộ/thiết lập từ database
let currentSystemConfig = {
  checkTocDo: { enabled: true, startDate: "" },
  checkKhungGioTuDong: { enabled: true, startDate: "" },
  checkNghiGiuaPhien: { enabled: true, startDate: "" },
  checkSaiGiaoVien: { enabled: true, startDate: "" },
  checkSaiXe: { enabled: true, startDate: "" },
  checkDungNghi: { enabled: true, startDate: "" },
  checkPhienNgan: { enabled: true, startDate: "" },
  checkKhuVucCam: { enabled: true, startDate: "" },
};

function setSystemConfig(config) {
  if (config && typeof config === "object") {
    currentSystemConfig = { ...currentSystemConfig, ...config };
  }
}

const HANG_DAO_TAO_CONFIG = {
  B1: {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  B11: {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  "B.01": {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  B2: {
    thoiGian: { banNgay: 15, banDem: 3, tuDong: 2, tong: 20 },
    quangDuong: { banNgay: 610, banDem: 120, tuDong: 80, tong: 810 },
  },
  B: {
    thoiGian: { banNgay: 15, banDem: 3, tuDong: 2, tong: 20 },
    quangDuong: { banNgay: 610, banDem: 120, tuDong: 80, tong: 810 },
  },
  C: {
    thoiGian: { banNgay: 20, banDem: 3, tuDong: 1, tong: 24 },
    quangDuong: { banNgay: 705, banDem: 90, tuDong: 30, tong: 825 },
  },
  C1: {
    thoiGian: { banNgay: 20, banDem: 3, tuDong: 1, tong: 24 },
    quangDuong: { banNgay: 705, banDem: 90, tuDong: 30, tong: 825 },
  },
};

const CUNG_DUONG_CONFIG = [
  {
    id: "chi_linh",
    ten: "Chí Linh",
    bounds: { latMin: 21.05, latMax: 21.25, lngMin: 106.3, lngMax: 106.65 },
  },
  {
    id: "kinh_mon",
    ten: "Kinh Môn",
    bounds: { latMin: 20.92, latMax: 21.05, lngMin: 106.4, lngMax: 106.62 },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCourseYearFromCode(courseCode = "") {
  const match = String(courseCode)
    .trim()
    .match(/^K(\d{2})/i);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

// ─── Cấu hình hệ thống kiểm tra ──────────────────────────────────────────────

function getSystemConfig() {
  return currentSystemConfig;
}

function isRuleApplicable(ruleKey, sessionDateStr) {
  if (!sessionDateStr) return true;
  const config = getSystemConfig();
  const rule = config[ruleKey];
  if (!rule) return true;

  // 1. Chuẩn hóa trạng thái kích hoạt (Hỗ trợ boolean, integer 1/0, string 'true'/'1')
  const isEnabled =
    rule.enabled === true ||
    rule.enabled === 1 ||
    String(rule.enabled).toLowerCase() === "true" ||
    rule.enabled === "1";

  if (!isEnabled) return false;

  // 2. Chuẩn hóa và xử lý ngày bắt đầu áp dụng
  if (!rule.startDate || String(rule.startDate).trim() === "" || String(rule.startDate) === "null") {
    return true;
  }

  // Chỉ lấy chuỗi 'YYYY-MM-DD' để tránh lỗi so sánh khi chuỗi chứa giờ
  const ruleStartDateStr = String(rule.startDate).split("T")[0].split(" ")[0].trim();
  if (!ruleStartDateStr) return true;

  // 3. Lấy ngày cục bộ của phiên đào tạo
  const sessionDate = new Date(sessionDateStr);
  if (isNaN(sessionDate)) return true;

  const year = sessionDate.getFullYear();
  const month = String(sessionDate.getMonth() + 1).padStart(2, "0");
  const day = String(sessionDate.getDate()).padStart(2, "0");
  const localSessionDayStr = `${year}-${month}-${day}`;

  // So sánh chuỗi có độ dài đồng nhất
  return localSessionDayStr >= ruleStartDateStr;
}

function normalizePlate(plate) {
  if (!plate) return "";
  return plate
    .replace(/[-.\s]/g, "")
    .toUpperCase()
    .trim();
}

function isPlateSimilar(p1, p2) {
  const norm1 = normalizePlate(p1);
  const norm2 = normalizePlate(p2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  if (Math.abs(norm1.length - norm2.length) > 1) return false;

  if (norm1.length === norm2.length) {
    let diff = 0;
    for (let i = 0; i < norm1.length; i++) {
      if (norm1[i] !== norm2[i]) {
        diff++;
        if (diff > 1) return false;
      }
    }
    return diff <= 1;
  }

  const longer = norm1.length > norm2.length ? norm1 : norm2;
  const shorter = norm1.length > norm2.length ? norm2 : norm1;

  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] !== shorter[j]) {
      diff++;
      if (diff > 1) return false;
      i++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

const getSessionKeys = (item) => {
  const keys = new Set();
  const sessionId = item?.phien_hoc_id ?? item?.ID ?? item?.id ?? item?.phien_hoc_dat_id;
  const plate = normalizePlate(item?.bien_so ?? item?.BienSo);

  // Format dates manually to avoid dayjs dependency in utility
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

  const date = formatDate(item?.ngay ?? item?.Ngay ?? item?.ThoiDiemDangNhap);
  const startTime = formatTime(item?.gio_vao ?? item?.ThoiDiemDangNhap);
  const endTime = formatTime(item?.gio_ra ?? item?.ThoiDiemDangXuat);

  if (sessionId) keys.add(`id:${String(sessionId)}`);
  if (date && plate && startTime && endTime) {
    keys.add(`slot:${date}|${plate}|${startTime}|${endTime}`);
  }
  if (date && startTime && endTime) {
    keys.add(`time:${date}|${startTime}|${endTime}`);
  }

  return Array.from(keys);
};

const getMappedStatus = (item, statusMap = {}) => {
  const sessionKeys = getSessionKeys(item);
  for (const key of sessionKeys) {
    const entry = statusMap[key];
    if (entry) {
      const status = typeof entry === "string" ? entry : entry.status;
      if (status === "DUYET" || status === "HUY") {
        return status;
      }
    }
  }
  return null;
};

const getMappedEntry = (item, statusMap = {}) => {
  const sessionKeys = getSessionKeys(item);
  for (const key of sessionKeys) {
    const entry = statusMap[key];
    if (entry) return entry;
  }
  return null;
};

function shouldCheckCungDuongByCourse(courseCode = "") {
  const year = getCourseYearFromCode(courseCode);
  return year !== null && year >= 25;
}

/** Tính khoảng cách giữa 2 tọa độ (mét) dùng công thức Haversine */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Bán kính Trái đất trung bình (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Kiểm tra xem hành trình có đi qua vùng cấm không */
function checkForbiddenZones(listCoordinate, forbiddenZones) {
  if (!Array.isArray(listCoordinate) || !Array.isArray(forbiddenZones) || forbiddenZones.length === 0) {
    return null;
  }

  for (const coord of listCoordinate) {
    for (const zone of forbiddenZones) {
      if (!zone.enabled) continue;
      const distance = getDistance(coord.Latitude, coord.Longitude, zone.lat, zone.lng);
      if (distance <= (zone.radius_m || 0)) {
        return {
          zoneName: zone.name,
          lat: coord.Latitude,
          lng: coord.Longitude,
          time: coord.ThoiGian
        };
      }
    }
  }
  return null;
}

/** Format số thực giờ → "Xh MM'" */
function fmtGio(gio) {
  const totalMins = Math.round(gio * 60);
  const g = Math.floor(totalMins / 60);
  const p = totalMins % 60;
  return `${g}h ${p.toString().padStart(2, "0")}'`;
}

/** Format số phút → "Xh MM'" */
function fmtPhut(phut) {
  return fmtGio(phut / 60);
}

const fmtDateStr = (str) => {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d)
    ? str
    : d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
};

const removeBirthYear = (name = "") => name.replace(/\(\d{4}\)/g, "").trim();

const normalizeForCompare = (name = "") =>
  removeBirthYear(name || "").normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();

// ─── Helpers Check Dừng Nghỉ Xe ───────────────────────────────────────────────

function getStopDurationLimit() {
  try {
    const config = getSystemConfig();
    const rule = config.checkDungNghi;
    if (rule && rule.value !== undefined && rule.value !== null && rule.value !== "") {
      const parsed = parseInt(String(rule.value).match(/\d+/)?.[0] || "", 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (err) {
    // silent
  }
  return 10; // Default is 10 minutes
}

function getStopViolationDetails(listCoordinate) {
  if (!Array.isArray(listCoordinate) || listCoordinate.length < 2) return null;

  const coords = listCoordinate
    .map(c => {
      const t = new Date(c.ThoiGian);
      const vanTocStr = String(c.VanToc || "0");
      const match = vanTocStr.match(/[\d.]+/);
      const v = match ? parseFloat(match[0]) : 0;

      const totalKmStr = String(c.TotalKm || "0");
      const matchKm = totalKmStr.match(/[\d.]+/);
      const km = matchKm ? parseFloat(matchKm[0]) : 0;
      const kmTruncated = km.toFixed(3).slice(0, -1);

      return {
        ts: t.getTime(),
        v,
        km,
        kmTruncated
      };
    })
    .filter(c => !isNaN(c.ts))
    .sort((a, b) => a.ts - b.ts);

  if (coords.length < 2) return null;

  const stopPeriods = [];
  let currentStopStartTs = null;

  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const isBothZero = c.v === 0 && c.km === 0;
    const isUnchangedStop = c.v === 0 && (
      (i > 0 && c.kmTruncated === coords[i - 1].kmTruncated) ||
      (i < coords.length - 1 && c.kmTruncated === coords[i + 1].kmTruncated)
    );

    if (isBothZero || isUnchangedStop) {
      if (currentStopStartTs === null) {
        currentStopStartTs = c.ts;
      }
    } else {
      if (currentStopStartTs !== null) {
        const lastStopEndTs = coords[i - 1].ts;
        const durationMs = lastStopEndTs - currentStopStartTs;
        if (durationMs > 0) {
          stopPeriods.push({ start: currentStopStartTs, end: lastStopEndTs, durationMs });
        }
        currentStopStartTs = null;
      }
    }
  }

  // Xử lý nốt nếu tọa độ cuối cùng vẫn ở trạng thái đứng yên
  if (currentStopStartTs !== null) {
    const lastCoordTs = coords[coords.length - 1].ts;
    const durationMs = lastCoordTs - currentStopStartTs;
    if (durationMs > 0) {
      stopPeriods.push({ start: currentStopStartTs, end: lastCoordTs, durationMs });
    }
  }

  // Bỏ qua dừng đèn đỏ, tắc đường ngắn: Chỉ xem xét nếu xe đứng im liên tục từ 1 phút trở lên
  const MIN_REST_STOP_MS = 60 * 1000;
  const realRestStops = stopPeriods.filter(p => p.durationMs >= MIN_REST_STOP_MS);

  // Lấy thời gian dừng dài nhất & tổng thời gian dừng từ danh sách dừng thật sự
  let maxDurationMs = 0;
  let totalDurationMs = 0;
  realRestStops.forEach(p => {
    if (p.durationMs > maxDurationMs) maxDurationMs = p.durationMs;
    totalDurationMs += p.durationMs;
  });

  const maxDurationMin = maxDurationMs / 1000 / 60;
  const totalDurationMin = totalDurationMs / 1000 / 60;

  const singleLimit = getStopDurationLimit();
  const totalLimit = singleLimit * 2;

  const hasLongStopViolation = maxDurationMin >= singleLimit;
  const hasTotalStopViolation = totalDurationMin >= totalLimit;

  if (!hasLongStopViolation && !hasTotalStopViolation) {
    return null;
  }

  const reason = `có lần dừng nghỉ dài nhất là ${formatStopMinutes(Math.round(maxDurationMin))}, tổng thời gian dừng nghỉ là ${formatStopMinutes(Math.round(totalDurationMin))}`;

  // reason += ` - Tổng số lần nghỉ: ${realRestStops.length} lần.`;

  return {
    isViolated: true,
    reason
  };
}

const formatStopMinutes = (mins) => {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m} phút` : `${h} giờ`;
  }
  return `${mins} phút`;
};

function isRestSession(phien, matchingLt) {
  const checkValues = (obj) => {
    if (!obj) return false;
    const vStr = String(obj.VanToc || "");
    const kmStr = String(obj.TotalKm || "");
    const matchV = vStr.match(/[\d.]+/);
    const matchKm = kmStr.match(/[\d.]+/);
    return matchV && parseFloat(matchV[0]) === 0 && matchKm && parseFloat(matchKm[0]) === 0;
  };

  if (checkValues(phien)) return true;
  if (checkValues(matchingLt)) return true;

  if (matchingLt && Array.isArray(matchingLt.ListCoordinate) && matchingLt.ListCoordinate.length > 0) {
    return matchingLt.ListCoordinate.every(c => {
      const vStr = String(c.VanToc || "");
      const kmStr = String(c.TotalKm || "");
      const matchV = vStr.match(/[\d.]+/);
      const matchKm = kmStr.match(/[\d.]+/);
      return matchV && parseFloat(matchV[0]) === 0 && matchKm && parseFloat(matchKm[0]) === 0;
    });
  }

  return false;
}

function evaluateDungNghiPhien(dataSource, loTrinh) {
  if (!dataSource || !loTrinh || dataSource.length === 0 || loTrinh.length === 0) return [];
  const warnings = [];

  dataSource.forEach((phien, idx) => {
    if (!isRuleApplicable("checkDungNghi", phien.ThoiDiemDangNhap)) return;
    const matchingLt = loTrinh.find(lt => {
      const sessStart = new Date(phien.ThoiDiemDangNhap).getTime();
      const sessEnd = new Date(phien.ThoiDiemDangXuat).getTime();
      const ltStart = new Date(lt.StartTime || lt.ThoiDiemDangNhap || lt.thoiDiemDangNhap).getTime();
      const ltEnd = new Date(lt.EndTime || lt.ThoiDiemDangXuat || lt.thoiDiemDangXuat).getTime();
      if (isNaN(sessStart) || isNaN(sessEnd) || isNaN(ltStart) || isNaN(ltEnd)) return false;
      return Math.abs(sessStart - ltStart) < 5 * 60 * 1000 && Math.abs(sessEnd - ltEnd) < 5 * 60 * 1000;
    });

    if (isRestSession(phien, matchingLt)) {
      return;
    }

    if (matchingLt && Array.isArray(matchingLt.ListCoordinate)) {
      const stopCheck = getStopViolationDetails(matchingLt.ListCoordinate);
      if (stopCheck !== null) {
        const km = phien.TongQuangDuong || phien.TongQD || phien.TongQD_raw || 0;
        warnings.push({
          type: "warning",
          label: "Dừng nghỉ sai quy định",
          message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): có dấu hiệu vi phạm dừng nghỉ, ${stopCheck.reason}.`,
        });
      }
    }
  });

  return warnings;
}


// ─── Xác định biển số xe tự động ─────────────────────────────────────────────

/**
 * Biển số xuất hiện ít nhất = xe tự động.
 * Chỉ có 1 loại biển → trả null.
 */
// Chuẩn hóa hạng đào tạo
function normalizeHang(hang) {
  const h = String(hang || '').trim().toUpperCase();
  if (h === 'B' || h === 'B2') return 'B2';
  if (h === 'B.01' || h === 'B1') return 'B1';
  if (h === 'C1' || h === 'C') return 'C1';
  return h;
}

function getBienSoTuDong(dataSource, studentInfo = null) {
  if (!dataSource || dataSource.length === 0) return null;

  // Lấy hạng đào tạo
  let hangRaw = '';
  if (dataSource[0]) {
    hangRaw = dataSource[0].HangDaoTao || dataSource[0].hangDaoTao || '';
  }
  if (!hangRaw && studentInfo) {
    hangRaw = studentInfo.hangDaoTao || studentInfo.HangDaoTao || studentInfo.hang || '';
  }

  const hang = normalizeHang(hangRaw);

  // Hạng B1 → tất cả phiên đều là số tự động, không cần check
  if (hang === 'B1') return null;

  // Chỉ áp dụng check xe tự động cho B2 và C1
  if (hang !== 'B2' && hang !== 'C1') return null;

  // Có thông tin đăng ký xe → xeB1 là xe tự động
  if (studentInfo) {
    const bs1 = normalizePlate(studentInfo.xeB1);
    const bs2 = normalizePlate(studentInfo.xeB2);

    // Có cả 2 xe → xeB1 là xe tự động
    if (bs1 && bs2) return bs1;
  }

  // Không có thông tin xe → đếm biển số
  // Xe xuất hiện nhiều = B2 (số sàn), ít = B1 (số tự động)
  const count = {};
  dataSource.forEach((item) => {
    const bs = normalizePlate(item.BienSo);
    if (bs) count[bs] = (count[bs] || 0) + 1;
  });

  const entries = Object.entries(count);
  if (entries.length <= 1) return null;

  // Xe tự động = xuất hiện ít nhất
  return entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min))[0];
}

// ─── Đánh dấu phiên lỗi ──────────────────────────────────────────────────────

/**
 * Trả về:
 *   invalidIndexes   : Set<number>  — tất cả phiên không hợp lệ
 *   tuDongLoiIndexes : Set<number>  — phiên TỰ ĐỘNG trước 17h
 *   invalidReasons   : Map<number, string[]>
 *
 * Tiêu chí loại:
 *   1. Tốc độ TB < 18 km/h
 *   2. Xe tự động bắt đầu trước 17h  → thêm vào tuDongLoiIndexes
 *   3. Nghỉ giữa phiên < 15 phút → phiên SAU bị loại
 */
// ─── Đánh dấu phiên lỗi ──────────────────────────────────────────────────────

function getInvalidSessionIndexes(
  dataSource,
  studentInfo = null,
  loTrinh = [],
  forbiddenZones = [],
  statusMap = {},
) {
  const invalidIndexes = new Set();
  const tuDongLoiIndexes = new Set();
  const invalidReasons = new Map();

  if (!dataSource || dataSource.length === 0)
    return { invalidIndexes, tuDongLoiIndexes, invalidReasons };

  const addReason = (idx, reason) => {
    const phien = dataSource[idx];
    const status = getMappedStatus(phien, statusMap);
    if (status === "DUYET") {
      return;
    }
    if (!invalidReasons.has(idx)) invalidReasons.set(idx, []);
    invalidReasons.get(idx).push(reason);
    invalidIndexes.add(idx);
  };

  const systemConfig = getSystemConfig();
  const ruleTocDo = systemConfig.checkTocDo;
  const configuredSpeedValue = ruleTocDo && ruleTocDo.value !== undefined && ruleTocDo.value !== null && ruleTocDo.value !== "" ? parseFloat(ruleTocDo.value) : 18;
  const MIN_SPEED = isNaN(configuredSpeedValue) ? 18 : configuredSpeedValue;

  const bienSoTuDong = getBienSoTuDong(dataSource, studentInfo);

  // 0. Xác định tên GV hợp lệ
  //    Ưu tiên: dùng studentInfo nếu có, fallback: tên xuất hiện nhiều nhất
  let tenGVHopLe = null;
  if (studentInfo?.giaoVien) {
    tenGVHopLe = normalizeForCompare(studentInfo.giaoVien);
  } else {
    const gvCount = {};
    dataSource.forEach((item) => {
      const tenNorm = normalizeForCompare(item.HoTenGV || "");
      if (tenNorm) gvCount[tenNorm] = (gvCount[tenNorm] || 0) + 1;
    });
    const gvEntries = Object.entries(gvCount);
    if (gvEntries.length > 0) {
      const tenGVHopLeNorm = gvEntries.reduce((max, cur) =>
        cur[1] > max[1] ? cur : max,
      )[0];
      // Tìm tên hiển thị gốc cho GV xuất hiện nhiều nhất
      tenGVHopLe =
        dataSource.find(
          (item) => normalizeForCompare(item.HoTenGV || "") === tenGVHopLeNorm,
        )?.HoTenGV || tenGVHopLeNorm;
    } else {
      tenGVHopLe = null;
    }
  }

  // 1. Tốc độ TB < 18 km/h (hoặc cấu hình)
  dataSource.forEach((phien, idx) => {
    if (!isRuleApplicable("checkTocDo", phien.ThoiDiemDangNhap)) return;
    const km = phien.TongQuangDuong || phien.TongQD_raw || 0;
    const giay = phien.TongThoiGian || 0;
    if (giay === 0 || km === 0) return;
    const tocDo = km / (giay / 3600);
    if (tocDo < MIN_SPEED) {
      addReason(idx, `Tốc độ TB ${tocDo.toFixed(1)} km/h < ${MIN_SPEED} km/h`);
    }
  });

  // 2. Xe tự động bắt đầu ngoài khung giờ hợp lệ
  if (bienSoTuDong) {
    dataSource.forEach((phien, idx) => {
      if (!isRuleApplicable("checkKhungGioTuDong", phien.ThoiDiemDangNhap)) return;
      if (!isPlateSimilar(phien.BienSo, bienSoTuDong)) return;
      const thoiDiem = new Date(phien.ThoiDiemDangNhap);
      if (isNaN(thoiDiem)) return;

      const hour = thoiDiem.getHours();
      const minute = thoiDiem.getMinutes();
      const totalMinutes = hour * 60 + minute;

      const SANG_START = 4 * 60 + 45;
      const SANG_END = 6 * 60 + 59;
      const CHIEU_START = 17 * 60;

      const inSangWindow =
        totalMinutes >= SANG_START && totalMinutes <= SANG_END;
      const inChieuWindow = totalMinutes >= CHIEU_START;

      if (!inSangWindow && !inChieuWindow) {
        const phien = dataSource[idx];
        const status = getMappedStatus(phien, statusMap);
        if (status !== "DUYET") {
          addReason(
            idx,
            `Xe tự động bắt đầu lúc ${hour}h${String(minute).padStart(2, "0")} — không thuộc khung hợp lệ (04:45–06:59 hoặc từ sau 17:00)`,
          );
          tuDongLoiIndexes.add(idx);
        }
      }
    });
  }

  // 3. Nghỉ giữa phiên < X phút (cấu hình) → phiên SAU bị loại
  const ruleNghiGiuaPhien = systemConfig.checkNghiGiuaPhien;
  const configuredNghiValue = ruleNghiGiuaPhien && ruleNghiGiuaPhien.value !== undefined && ruleNghiGiuaPhien.value !== null && ruleNghiGiuaPhien.value !== "" ? parseFloat(ruleNghiGiuaPhien.value) : 15;
  const MIN_REST_BETWEEN_SESSIONS = isNaN(configuredNghiValue) ? 15 : configuredNghiValue;

  const sorted = [...dataSource]
    .map((item, originalIdx) => ({ item, originalIdx }))
    .sort(
      (a, b) =>
        new Date(a.item.ThoiDiemDangNhap) - new Date(b.item.ThoiDiemDangNhap),
    );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!isRuleApplicable("checkNghiGiuaPhien", curr.item.ThoiDiemDangNhap)) continue;
    const tXuat = new Date(prev.item.ThoiDiemDangXuat);
    const tNhap = new Date(curr.item.ThoiDiemDangNhap);
    if (isNaN(tXuat) || isNaN(tNhap)) continue;
    const nghiPhut = (tNhap - tXuat) / 1000 / 60;
    if (nghiPhut < MIN_REST_BETWEEN_SESSIONS) {
      addReason(
        curr.originalIdx,
        `Nghỉ giữa phiên ${nghiPhut.toFixed(0)} phút (< ${MIN_REST_BETWEEN_SESSIONS} phút)`,
      );
    }
  }

  // 4. Sai tên giáo viên
  if (tenGVHopLe) {
    dataSource.forEach((phien, idx) => {
      if (!isRuleApplicable("checkSaiGiaoVien", phien.ThoiDiemDangNhap)) return;
      const ten = normalizeForCompare(phien.HoTenGV || "");
      const hopLe = normalizeForCompare(tenGVHopLe);
      if (!ten) {
        addReason(
          idx,
          `Không có tên giáo viên (GV hợp lệ: "${removeBirthYear(tenGVHopLe)}")`,
        );
      } else if (ten !== hopLe) {
        addReason(
          idx,
          `Tên giáo viên "${removeBirthYear(phien.HoTenGV)}" khác với GV hợp lệ "${removeBirthYear(tenGVHopLe)}"`,
        );
      }
    });
  }

  // 5. Sai biển số xe (không phải xeB1 cũng không phải xeB2)
  if (studentInfo?.xeB1 || studentInfo?.xeB2) {
    dataSource.forEach((phien, idx) => {
      if (!isRuleApplicable("checkSaiXe", phien.ThoiDiemDangNhap)) return;
      const bs = normalizePlate(phien.BienSo);
      if (bs) {
        const isMatched = [studentInfo.xeB1, studentInfo.xeB2]
          .filter(Boolean)
          .some((reg) => isPlateSimilar(bs, reg));
        if (!isMatched) {
          addReason(
            idx,
            `Biển số xe "${phien.BienSo}" không thuộc xe đăng ký (${[studentInfo.xeB1, studentInfo.xeB2].filter(Boolean).join(", ")})`,
          );
        }
      }
    });
  }



  // 7. Vi phạm vùng cấm
  if (Array.isArray(loTrinh) && loTrinh.length > 0 && forbiddenZones.length > 0) {
    dataSource.forEach((phien, idx) => {
      if (!isRuleApplicable("checkKhuVucCam", phien.ThoiDiemDangNhap)) return;
      const matchingLt = loTrinh.find(lt => {
        const sessStart = new Date(phien.ThoiDiemDangNhap).getTime();
        const sessEnd = new Date(phien.ThoiDiemDangXuat).getTime();
        const ltStart = new Date(lt.StartTime || lt.ThoiDiemDangNhap || lt.thoiDiemDangNhap).getTime();
        const ltEnd = new Date(lt.EndTime || lt.ThoiDiemDangXuat || lt.thoiDiemDangXuat).getTime();
        if (isNaN(sessStart) || isNaN(sessEnd) || isNaN(ltStart) || isNaN(ltEnd)) return false;
        return Math.abs(sessStart - ltStart) < 5 * 60 * 1000 && Math.abs(sessEnd - ltEnd) < 5 * 60 * 1000;
      });

      if (matchingLt && Array.isArray(matchingLt.ListCoordinate)) {
        const violation = checkForbiddenZones(matchingLt.ListCoordinate, forbiddenZones);
        if (violation) {
          addReason(idx, `Đi qua vùng cấm: ${violation.zoneName}`);
        }
      }
    });
  }

  // 8. Dừng nghỉ sai quy định (nghỉ quá 10 phút) — chỉ lưu vào invalidReasons để TruyVetModal hiển thị cảnh báo, không thêm vào invalidIndexes để không bị trừ km/giờ
  if (Array.isArray(loTrinh) && loTrinh.length > 0) {
    dataSource.forEach((phien, idx) => {
      if (!isRuleApplicable("checkDungNghi", phien.ThoiDiemDangNhap)) return;
      const matchingLt = loTrinh.find(lt => {
        const sessStart = new Date(phien.ThoiDiemDangNhap).getTime();
        const sessEnd = new Date(phien.ThoiDiemDangXuat).getTime();
        const ltStart = new Date(lt.StartTime || lt.ThoiDiemDangNhap || lt.thoiDiemDangNhap).getTime();
        const ltEnd = new Date(lt.EndTime || lt.ThoiDiemDangXuat || lt.thoiDiemDangXuat).getTime();
        if (isNaN(sessStart) || isNaN(sessEnd) || isNaN(ltStart) || isNaN(ltEnd)) return false;
        return Math.abs(sessStart - ltStart) < 5 * 60 * 1000 && Math.abs(sessEnd - ltEnd) < 5 * 60 * 1000;
      });

      if (isRestSession(phien, matchingLt)) return;

      if (matchingLt && Array.isArray(matchingLt.ListCoordinate)) {
        const stopCheck = getStopViolationDetails(matchingLt.ListCoordinate);
        if (stopCheck !== null) {
          if (!invalidReasons.has(idx)) invalidReasons.set(idx, []);
          const reasons = invalidReasons.get(idx);
          const km = phien.TongQuangDuong || phien.TongQD || phien.TongQD_raw || 0;
          const msg = `Dừng nghỉ sai quy định: ${stopCheck.reason}, tổng quãng đường ${km.toFixed(1)} km`;
          if (!reasons.includes(msg)) {
            reasons.push(msg);
          }
        }
      }
    });
  }

  // ─── Manual status HUY override ───────────────────────────────────────────
  dataSource.forEach((phien, idx) => {
    const status = getMappedStatus(phien, statusMap);
    if (status === "HUY") {
      invalidIndexes.add(idx);
      if (!invalidReasons.has(idx)) invalidReasons.set(idx, []);
      const reasons = invalidReasons.get(idx);
      if (!reasons.includes("Phiên học bị hủy duyệt thủ công")) {
        reasons.push("Phiên học bị hủy duyệt thủ công");
      }
    }
  });

  return { invalidIndexes, tuDongLoiIndexes, invalidReasons };
}

// ─── Các hàm evaluate riêng lẻ ───────────────────────────────────────────────

function checkCungDuong(listCoordinate, bounds) {
  if (!Array.isArray(listCoordinate) || listCoordinate.length === 0)
    return false;
  return listCoordinate.some(
    (p) =>
      p.Latitude >= bounds.latMin &&
      p.Latitude <= bounds.latMax &&
      p.Longitude >= bounds.lngMin &&
      p.Longitude <= bounds.lngMax,
  );
}

function evaluateCungDuong(dataSource) {
  const allCoords = dataSource?.flatMap((item) => item.ListCoordinate || []);
  const ok = CUNG_DUONG_CONFIG.some(({ bounds }) =>
    checkCungDuong(allCoords, bounds),
  );
  if (!ok)
    return [
      {
        type: "warning",
        label: "Cung đường Chí Linh / Kinh Môn",
        message: "Chưa đi qua cung đường Chí Linh hoặc Kinh Môn.",
      },
    ];
  return [];
}

function evaluateNghiGiuaPhien(dataSource) {
  if (!dataSource || dataSource.length < 2) return [];
  const errors = [];
  const sorted = [...dataSource].sort(
    (a, b) => new Date(a.ThoiDiemDangNhap) - new Date(b.ThoiDiemDangNhap),
  );
  const fmt = (d) =>
    d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const systemConfig = getSystemConfig();
  const ruleNghiGiuaPhien = systemConfig.checkNghiGiuaPhien;
  const configuredNghiValue = ruleNghiGiuaPhien && ruleNghiGiuaPhien.value !== undefined && ruleNghiGiuaPhien.value !== null && ruleNghiGiuaPhien.value !== "" ? parseFloat(ruleNghiGiuaPhien.value) : 15;
  const MIN_REST_BETWEEN_SESSIONS = isNaN(configuredNghiValue) ? 15 : configuredNghiValue;

  for (let i = 1; i < sorted.length; i++) {
    const tXuat = new Date(sorted[i - 1].ThoiDiemDangXuat);
    const tNhap = new Date(sorted[i].ThoiDiemDangNhap);
    if (isNaN(tXuat) || isNaN(tNhap)) continue;
    if (!isRuleApplicable("checkNghiGiuaPhien", sorted[i].ThoiDiemDangNhap)) continue;
    const phut = (tNhap - tXuat) / 1000 / 60;
    if (phut < MIN_REST_BETWEEN_SESSIONS) {
      errors.push({
        type: "warning",
        label: "Thời gian nghỉ giữa phiên",
        message: `Phiên ${i + 1} nghỉ chỉ ${phut.toFixed(0)} phút (${fmt(tXuat)} → ${fmt(tNhap)}), yêu cầu ≥ ${MIN_REST_BETWEEN_SESSIONS} phút.`,
      });
    }
  }
  return errors;
}

function evaluateTocDoPhien(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];
  const systemConfig = getSystemConfig();
  const ruleTocDo = systemConfig.checkTocDo;
  const configuredSpeedValue = ruleTocDo && ruleTocDo.value !== undefined && ruleTocDo.value !== null && ruleTocDo.value !== "" ? parseFloat(ruleTocDo.value) : 18;
  const MIN_SPEED = isNaN(configuredSpeedValue) ? 18 : configuredSpeedValue;

  return dataSource.reduce((acc, phien, idx) => {
    if (!isRuleApplicable("checkTocDo", phien.ThoiDiemDangNhap)) return acc;
    const km = phien.TongQuangDuong || phien.TongQD_raw || 0;
    const giay = phien.TongThoiGian || 0;
    if (giay === 0 || km === 0) return acc;
    const v = km / (giay / 3600);
    if (v < MIN_SPEED) {
      acc.push({
        type: "warning",
        label: "Tốc độ trung bình phiên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tốc độ TB ${v.toFixed(1)} km/h, yêu cầu ≥ ${MIN_SPEED} km/h.`,
      });
    }
    return acc;
  }, []);
}

function evaluateTuDongSau17h(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];

  const bienSoTuDong = getBienSoTuDong(dataSource);
  if (!bienSoTuDong) return [];

  return dataSource.reduce((acc, phien, idx) => {
    if (!isRuleApplicable("checkKhungGioTuDong", phien.ThoiDiemDangNhap)) return acc;
    if (!isPlateSimilar(phien.BienSo, bienSoTuDong)) {
      return acc;
    }

    const thoiDiem = new Date(phien.ThoiDiemDangNhap);
    if (isNaN(thoiDiem)) return acc;

    const hour = thoiDiem.getHours();
    const minute = thoiDiem.getMinutes();
    const totalMinutes = hour * 60 + minute;
    const timeStr = `${hour}h${String(minute).padStart(2, "0")}`;
    const dateStr = fmtDateStr(phien.ThoiDiemDangNhap);
    const bienSo = phien.BienSo;

    const SANG_START = 4 * 60 + 45; // 04:45
    const SANG_END = 7 * 60; // 07:00
    const CHIEU_START = 17 * 60; // 17:00

    const loaiPhien = phien.LoaiPhien; // "SANG" | "CHIEU"

    const inSangWindow = totalMinutes >= SANG_START && totalMinutes <= SANG_END;
    const inChieuWindow = totalMinutes >= CHIEU_START;

    if (loaiPhien === "SANG") {
      if (!inSangWindow) {
        acc.push({
          type: "warning",
          label: "Xe tự động chạy sai giờ phiên sáng",
          message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${bienSo}) bắt đầu lúc ${timeStr} — phiên sáng chỉ hợp lệ từ 04:45 đến 07:00.`,
        });
      }
    } else if (loaiPhien === "CHIEU") {
      if (!inChieuWindow) {
        acc.push({
          type: "warning",
          label: "Xe tự động chạy sai giờ phiên chiều",
          message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${bienSo}) bắt đầu lúc ${timeStr} — phiên chiều chỉ hợp lệ từ 17:00 trở đi.`,
        });
      }
    } else {
      // LoaiPhien không xác định — check xem có rơi vào khung hợp lệ nào không
      if (!inSangWindow && !inChieuWindow) {
        acc.push({
          type: "warning",
          label: "Xe tự động chạy ngoài giờ cho phép",
          message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${bienSo}) bắt đầu lúc ${timeStr} — không thuộc khung sáng (04:45–07:00) hoặc chiều (từ 17:00).`,
        });
      }
    }

    return acc;
  }, []);
}

function evaluateSaiGiaoVien(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];

  // Tên GV xuất hiện nhiều nhất = hợp lệ
  const gvCount = {};
  dataSource.forEach((item) => {
    const tenNorm = normalizeForCompare(item.HoTenGV || "");
    if (tenNorm) gvCount[tenNorm] = (gvCount[tenNorm] || 0) + 1;
  });
  const gvEntries = Object.entries(gvCount);
  if (gvEntries.length === 0) return [];
  const tenGVHopLeNorm = gvEntries.reduce((max, cur) =>
    cur[1] > max[1] ? cur : max,
  )[0];

  // Tìm tên hiển thị gốc cho GV hợp lệ
  const tenGVHopLeDisplay =
    dataSource.find(
      (item) => normalizeForCompare(item.HoTenGV || "") === tenGVHopLeNorm,
    )?.HoTenGV || tenGVHopLeNorm;

  return dataSource.reduce((acc, phien, idx) => {
    if (!isRuleApplicable("checkSaiGiaoVien", phien.ThoiDiemDangNhap)) return acc;
    const tenNorm = normalizeForCompare(phien.HoTenGV || "");
    if (!tenNorm) {
      acc.push({
        type: "warning",
        label: "Sai tên giáo viên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): không có tên giáo viên (GV hợp lệ: "${tenGVHopLeDisplay}").`,
      });
    } else if (tenNorm !== tenGVHopLeNorm) {
      acc.push({
        type: "warning",
        label: "Sai tên giáo viên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tên GV "${phien.HoTenGV}" khác với GV hợp lệ "${tenGVHopLeDisplay}".`,
      });
    }
    return acc;
  }, []);
}

function evaluatePhienDuoi5Phut(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];
  const MIN_MINUTES = 5;
  return dataSource.reduce((acc, phien, idx) => {
    if (!isRuleApplicable("checkPhienNgan", phien.ThoiDiemDangNhap)) return acc;
    const giay = phien.TongThoiGian || 0;
    if (giay === 0) return acc;
    const phut = giay / 60;
    if (phut < MIN_MINUTES) {
      acc.push({
        type: "warning",
        label: "Phiên học quá ngắn",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tổng thời gian chỉ ${phut.toFixed(1)} phút, yêu cầu ≥ ${MIN_MINUTES} phút.`,
      });
    }
    return acc;
  }, []);
}

function evaluateSaiGiaoVienTheoStudentInfo(dataSource, studentInfo) {
  if (!studentInfo) return [];

  const registeredTeacherNorm = normalizeForCompare(studentInfo.giaoVien || "");
  if (!registeredTeacherNorm) {
    return [
      {
        type: "warning",
        label: "Không có thông tin giáo viên đăng ký",
        message:
          "Học viên không có thông tin giáo viên đăng ký. Không thể kiểm tra tên GV.",
      },
    ];
  }

  const wrongSessions = dataSource.filter(
    (s) =>
      isRuleApplicable("checkSaiGiaoVien", s.ThoiDiemDangNhap) &&
      normalizeForCompare(s.HoTenGV || "") !== registeredTeacherNorm,
  );

  if (wrongSessions.length === 0) return [];

  const wrongNames = [
    ...new Set(
      wrongSessions.map((s) => removeBirthYear(s.HoTenGV || "(trống)")),
    ),
  ].join(", ");

  return [
    {
      type: "warning",
      label: "Sai giáo viên (theo đăng ký)",
      message: `Đăng ký với GV: "${removeBirthYear(studentInfo.giaoVien)}", nhưng hành trình có phiên dạy bởi: "${wrongNames}" (${wrongSessions.length} phiên không khớp).`,
    },
  ];
}

// ─── Check xe sang theo studentInfo ──────────────────────────────────────────

function evaluateSaiXe(dataSource, studentInfo) {
  if (!studentInfo) return [];

  const registeredPlateB1 = normalizePlate(studentInfo.xeB1);
  const registeredPlateB2 = normalizePlate(studentInfo.xeB2);
  const hasTwoPlates = !!registeredPlateB2;
  const warnings = [];

  if (!registeredPlateB1 && !registeredPlateB2) {
    warnings.push({
      type: "warning",
      label: "Không có thông tin xe",
      message:
        "Học viên không có thông tin biển số xe đăng ký. Không thể kiểm tra biển số.",
    });
    return warnings;
  }

  const wrongPlateSessions = dataSource.filter(
    (s) =>
      isRuleApplicable("checkSaiXe", s.ThoiDiemDangNhap) &&
      ![registeredPlateB1, registeredPlateB2].filter(Boolean).some((reg) => isPlateSimilar(s.BienSo, reg)),
  );

  if (wrongPlateSessions.length > 0) {
    const wrongPlates = [
      ...new Set(wrongPlateSessions.map((s) => s.BienSo || "(trống)")),
    ].join(", ");
    const allowedList = [studentInfo.xeB1, studentInfo.xeB2]
      .filter(Boolean)
      .join(", ");

    warnings.push({
      type: "warning",
      label: "Sai biển số xe",
      message: `Xe đăng ký: "${allowedList}", nhưng hành trình có phiên dùng xe: "${wrongPlates}" (${wrongPlateSessions.length} phiên không đúng).`,
    });
  }

  if (hasTwoPlates && dataSource.some(s => isRuleApplicable("checkSaiXe", s.ThoiDiemDangNhap))) {
    const platesUsed = new Set(
      dataSource.map((s) => normalizePlate(s.BienSo)).filter(Boolean),
    );
    const hasUsedB1 = Array.from(platesUsed).some((plate) => isPlateSimilar(plate, registeredPlateB1));
    if (!hasUsedB1) {
      warnings.push({
        type: "warning",
        label: "Thiếu phiên xe B1",
        message: `Học viên đăng ký 2 xe nhưng chưa có phiên học nào trên xe B1: "${studentInfo.xeB1}".`,
      });
    }
    const hasUsedB2 = Array.from(platesUsed).some((plate) => isPlateSimilar(plate, registeredPlateB2));
    if (!hasUsedB2) {
      warnings.push({
        type: "warning",
        label: "Thiếu phiên xe B2",
        message: `Học viên đăng ký 2 xe nhưng chưa có phiên học nào trên xe B2: "${studentInfo.xeB2}".`,
      });
    }
  }

  return warnings;
}

// ─── computeSummary ───────────────────────────────────────────────────────────

/**
 * Tính tổng hợp sau khi loại bỏ các phiên lỗi.
 *
 * Trả về 4 trường mới:
 *   tongThoiGianLoiGio  — tổng giờ của TẤT CẢ phiên lỗi
 *   tongQuangDuongLoi   — tổng km  của TẤT CẢ phiên lỗi
 *   tuDongLoiGio        — tổng giờ của các phiên TỰ ĐỘNG lỗi (trước 17h)
 *   tuDongLoiKm         — tổng km  của các phiên TỰ ĐỘNG lỗi
 */
// ─── computeSummary ───────────────────────────────────────────────────────────

/**
 * Tính tổng hợp sau khi loại bỏ các phiên lỗi.
 *
 * Trả về 4 trường mới:
 *   tongThoiGianLoiGio  — tổng giờ của TẤT CẢ phiên lỗi
 *   tongQuangDuongLoi   — tổng km  của TẤT CẢ phiên lỗi
 *   tuDongLoiGio        — tổng giờ của các phiên TỰ ĐỘNG lỗi (trước 17h)
 *   tuDongLoiKm         — tổng km  của các phiên TỰ ĐỘNG lỗi
 */
function computeSummary(
  dataSource,
  hangDaoTao = "",
  studentInfo = null,
  loTrinh = [],
  forbiddenZones = [],
  statusMap = {},
) {
  const empty = {
    tongThoiGianGio: 0,
    tongQuangDuong: 0,
    thoiGianBanDemGio: 0,
    quangDuongBanDem: 0,
    thoiGianBanNgayGio: 0,
    quangDuongBanNgay: 0,
    thoiGianTuDongGio: 0,
    quangDuongTuDong: 0,
    tongThoiGianLoiGio: 0,
    tongQuangDuongLoi: 0,
    tuDongLoiGio: 0,
    tuDongLoiKm: 0,
    tongThoiGianChuaLoaiGio: 0,
    tongQuangDuongChuaLoai: 0,
    hangDaoTao,
  };
  if (!dataSource || dataSource.length === 0) return empty;

  const bienSoTuDong = getBienSoTuDong(dataSource, studentInfo);
  const { invalidIndexes, tuDongLoiIndexes } = getInvalidSessionIndexes(
    dataSource,
    studentInfo,
    loTrinh,
    forbiddenZones,
    statusMap,
  );

  const t = dataSource.reduce(
    (acc, item, idx) => {
      const isTuDong =
        !!bienSoTuDong &&
        isPlateSimilar(item.BienSo, bienSoTuDong);

      // TongThoiGian trong API là GIÂY
      const thoiGianGiay = item.TongThoiGian || 0;
      const quangDuong = item.TongQuangDuong || item.TongQD || 0;

      // ── Phiên lỗi ───────────────────────────────────────────────────────────
      if (invalidIndexes.has(idx)) {
        acc.loiGiay += thoiGianGiay;
        acc.loiKm += quangDuong;
        if (tuDongLoiIndexes.has(idx)) {
          acc.tuDongLoiGiay += thoiGianGiay;
          acc.tuDongLoiKm += quangDuong;
        }
        return acc;
      }

      // ── Phiên hợp lệ ────────────────────────────────────────────────────────
      acc.tongGiay += thoiGianGiay;
      acc.tongKm += quangDuong;

      // Ban đêm
      const demGiayAPI = item.ThoiGianBanDem || 0;
      const demKmAPI = item.QuangDuongBanDem || 0;
      if (demGiayAPI > 0) {
        acc.demGiay += demGiayAPI;
        acc.demKm += demKmAPI;
      } else if (item.ThoiDiemDangNhap) {
        // Fallback: xét giờ bắt đầu phiên
        const hour = new Date(item.ThoiDiemDangNhap).getHours();
        if (hour >= 18) {
          acc.demGiay += thoiGianGiay;
          acc.demKm += quangDuong;
        }
      }

      // Số tự động — tính TẤT CẢ phiên của biển số tự động hợp lệ
      if (isTuDong) {
        acc.tuDongGiay += thoiGianGiay;
        acc.tuDongKm += quangDuong;

        // Trừ phần ban đêm của phiên tự động khỏi ban đêm chung (tránh tính 2 lần)
        const demTuDongGiay = item.ThoiGianBanDem || 0;
        const demTuDongKm = item.QuangDuongBanDem || 0;
        if (demTuDongGiay > 0) {
          acc.demTuDongGiay += demTuDongGiay;
          acc.demTuDongKm += demTuDongKm;
        } else if (item.ThoiDiemDangNhap) {
          const hour = new Date(item.ThoiDiemDangNhap).getHours();
          if (hour >= 18) {
            acc.demTuDongGiay += thoiGianGiay;
            acc.demTuDongKm += quangDuong;
          }
        }
      }

      return acc;
    },
    {
      tongGiay: 0,
      tongKm: 0,
      demGiay: 0,
      demKm: 0,
      tuDongGiay: 0,
      tuDongKm: 0,
      demTuDongGiay: 0, // phần ban đêm nằm trong phiên tự động (để trừ)
      demTuDongKm: 0,
      loiGiay: 0,
      loiKm: 0,
      tuDongLoiGiay: 0,
      tuDongLoiKm: 0,
    },
  );

  // Trừ phần ban đêm của phiên tự động ra khỏi ban đêm chung
  const demGiayFinal = Math.max(t.demGiay - t.demTuDongGiay, 0);
  const demKmFinal = Math.max(t.demKm - t.demTuDongKm, 0);

  const tongGio = t.tongGiay / 3600;
  const demGio = demGiayFinal / 3600;
  const tuDongGio = t.tuDongGiay / 3600;

  const banNgayGio = Math.max(tongGio - demGio - tuDongGio, 0);
  const banNgayKm = Math.max(t.tongKm - t.demKm - t.tuDongKm, 0);

  const finalHang = dataSource[0]?.HangDaoTao || hangDaoTao;

  return {
    tongThoiGianGio: tongGio,
    tongQuangDuong: t.tongKm,
    thoiGianBanDemGio: demGio,
    quangDuongBanDem: demKmFinal,
    thoiGianBanNgayGio: banNgayGio,
    quangDuongBanNgay: banNgayKm,
    thoiGianTuDongGio: tuDongGio,
    quangDuongTuDong: t.tuDongKm,
    // Trường mới
    tongThoiGianLoiGio: t.loiGiay / 3600,
    tongQuangDuongLoi: t.loiKm,
    tuDongLoiGio: t.tuDongLoiGiay / 3600,
    tuDongLoiKm: t.tuDongLoiKm,
    tongThoiGianChuaLoaiGio: (t.tongGiay + t.loiGiay) / 3600,
    tongQuangDuongChuaLoai: t.tongKm + t.loiKm,
    hangDaoTao: finalHang,
  };
}

// ─── evaluate ─────────────────────────────────────────────────────────────────

function evaluate(
  summaryData,
  dataSource = [],
  loTrinh = [],
  studentInfo,
  forbiddenZones = [],
  statusMap = {},
) {
  const errors = [];
  const warnings = [];

  const yeuCauHang =
    HANG_DAO_TAO_CONFIG[summaryData.hangDaoTao] || HANG_DAO_TAO_CONFIG.B1;

  const rules = [
    // ─── ERRORS ────────────────────────────────────────────────────────────────
    {
      type: "error",
      label: "Thời gian ban đêm",
      condition: Math.round(summaryData.thoiGianBanDemGio * 60) < Math.round(yeuCauHang.thoiGian.banDem * 60),
      getMessage: () => {
        const thieu =
          yeuCauHang.thoiGian.banDem - summaryData.thoiGianBanDemGio;
        return `Thời gian ban đêm thiếu ${fmtGio(thieu)} (yêu cầu ${fmtGio(yeuCauHang.thoiGian.banDem)}, thực tế ${fmtGio(summaryData.thoiGianBanDemGio)}).`;
      },
    },
    {
      type: "error",
      label: "Quãng đường ban đêm",
      condition: summaryData.quangDuongBanDem < yeuCauHang.quangDuong.banDem,
      getMessage: () => {
        const thieu =
          yeuCauHang.quangDuong.banDem - summaryData.quangDuongBanDem;
        return `Quãng đường ban đêm thiếu ${thieu.toFixed(2)} km (yêu cầu ${yeuCauHang.quangDuong.banDem} km, thực tế ${summaryData.quangDuongBanDem.toFixed(2)} km).`;
      },
    },
    {
      type: "error",
      label: "Thời gian số tự động",
      condition: Math.round(summaryData.thoiGianTuDongGio * 60) < Math.round(yeuCauHang.thoiGian.tuDong * 60),
      getMessage: () => {
        const thieu =
          yeuCauHang.thoiGian.tuDong - summaryData.thoiGianTuDongGio;

        return `Thời gian số tự động thiếu ${fmtGio(thieu)} (thực tế ${fmtGio(summaryData.thoiGianTuDongGio)}, yêu cầu ${fmtGio(yeuCauHang.thoiGian.tuDong)}).`;
      },
    },
    {
      type: "error",
      label: "Quãng đường số tự động",
      condition: summaryData.quangDuongTuDong < yeuCauHang.quangDuong.tuDong,
      getMessage: () => {
        const thieu =
          yeuCauHang.quangDuong.tuDong - summaryData.quangDuongTuDong;

        return `Quãng đường số tự động thiếu ${thieu.toFixed(2)} km (thực tế ${summaryData.quangDuongTuDong.toFixed(2)} km, yêu cầu ${yeuCauHang.quangDuong.tuDong} km).`;
      },
    },
    {
      type: "error",
      label: "Thừa số tự động (Thời gian số sàn)",
      condition: (() => {
        const normalizedH = normalizeHang(summaryData.hangDaoTao);
        if (normalizedH !== "B2" && normalizedH !== "C1") return false;
        const limitManualTime = normalizedH === "C1" ? 23.0 : 18.0;
        const remainingManualTime = summaryData.tongThoiGianGio - summaryData.thoiGianTuDongGio;
        return Math.round(remainingManualTime * 60) < Math.round(limitManualTime * 60);
      })(),
      getMessage: () => {
        const normalizedH = normalizeHang(summaryData.hangDaoTao);
        const limitManualTime = normalizedH === "C1" ? 23.0 : 18.0;
        const remainingManualTime = summaryData.tongThoiGianGio - summaryData.thoiGianTuDongGio;
        const thieu = limitManualTime - remainingManualTime;
        return `Thời gian số sàn chỉ đạt ${fmtGio(remainingManualTime)}, thiếu ${fmtGio(thieu)} so với yêu cầu tối thiểu là ${fmtGio(limitManualTime)}.`;
      },
    },
    {
      type: "error",
      label: "Thừa số tự động (Quãng đường số sàn)",
      condition: (() => {
        const normalizedH = normalizeHang(summaryData.hangDaoTao);
        if (normalizedH !== "B2" && normalizedH !== "C1") return false;
        const limitManualKm = normalizedH === "C1" ? 795.0 : 730.0;
        const remainingManualKm = summaryData.tongQuangDuong - summaryData.quangDuongTuDong;
        return remainingManualKm < limitManualKm;
      })(),
      getMessage: () => {
        const normalizedH = normalizeHang(summaryData.hangDaoTao);
        const limitManualKm = normalizedH === "C1" ? 795.0 : 730.0;
        const remainingManualKm = summaryData.tongQuangDuong - summaryData.quangDuongTuDong;
        const thieu = limitManualKm - remainingManualKm;
        return `Quãng đường số sàn chỉ đạt ${remainingManualKm.toFixed(2)} km, thiếu ${thieu.toFixed(2)} km so với yêu cầu tối thiểu là ${limitManualKm} km.`;
      },
    },
    {
      type: "error",
      label: "Tổng thời lượng",
      condition: Math.round(summaryData.tongThoiGianGio * 60) < Math.round(yeuCauHang.thoiGian.tong * 60),
      getMessage: () => {
        const thieu = yeuCauHang.thoiGian.tong - summaryData.tongThoiGianGio;

        return `Tổng thời lượng thiếu ${fmtGio(thieu)} (thực tế ${fmtGio(summaryData.tongThoiGianGio)}, yêu cầu ${fmtGio(yeuCauHang.thoiGian.tong)}).`;
      },
    },
    {
      type: "error",
      label: "Tổng quãng đường",
      condition: summaryData.tongQuangDuong < yeuCauHang.quangDuong.tong,
      getMessage: () => {
        const thieu = yeuCauHang.quangDuong.tong - summaryData.tongQuangDuong;

        return `Tổng quãng đường thiếu ${thieu.toFixed(2)} km (thực tế ${summaryData.tongQuangDuong.toFixed(2)} km, yêu cầu ${yeuCauHang.quangDuong.tong} km).`;
      },
    },

    // ─── WARNINGS ──────────────────────────────────────────────────────────────
    {
      type: "warning",
      label: "Thiếu tên giáo viên",
      condition: !dataSource.some((item) => item.HoTenGV),
      getMessage: () => "Không có tên giáo viên để kiểm tra tính nhất quán.",
    },
    {
      type: "warning",
      label: "Thời gian ban ngày",
      condition: (() => {
        const yc = yeuCauHang.thoiGian.banNgay;
        if (yc === 0) return false;
        return Math.round(summaryData.thoiGianBanNgayGio * 60) < Math.round(yc * 0.8 * 60);
      })(),
      getMessage: () => {
        const yc = yeuCauHang.thoiGian.banNgay;
        const tt = summaryData.thoiGianBanNgayGio;
        const pct = ((1 - tt / yc) * 100).toFixed(1);
        return `Thời gian ban ngày thiếu ${pct}% (thiếu ${fmtGio(yc - tt)}, yêu cầu ${fmtGio(yc)}).`;
      },
    },
    {
      type: "warning",
      label: "Quãng đường ban ngày",
      condition: (() => {
        const yc = yeuCauHang.quangDuong.banNgay;
        if (yc === 0) return false;
        return summaryData.quangDuongBanNgay / yc < 0.8;
      })(),
      getMessage: () => {
        const yc = yeuCauHang.quangDuong.banNgay;
        const tt = summaryData.quangDuongBanNgay;
        const pct = ((1 - tt / yc) * 100).toFixed(1);
        return `Quãng đường ban ngày thiếu ${pct}% (thiếu ${(yc - tt).toFixed(2)} km, yêu cầu ${yc} km).`;
      },
    },
  ];

  rules.forEach((rule) => {
    if (rule.condition) {
      const issue = {
        type: rule.type,
        label: rule.label,
        message: rule.getMessage(),
      };
      if (rule.type === "error") errors.push(issue);
      else warnings.push(issue);
    }
  });

  if (studentInfo) {
    warnings.push(
      ...evaluateSaiGiaoVienTheoStudentInfo(dataSource, studentInfo),
    );
    warnings.push(...evaluateSaiXe(dataSource, studentInfo));
  }

  // Các phiên vi phạm đã bị loại khỏi tổng → chỉ cảnh báo, không ảnh hưởng status
  warnings.push(...evaluateNghiGiuaPhien(dataSource));
  warnings.push(...evaluateTocDoPhien(dataSource));
  warnings.push(...evaluateTuDongSau17h(dataSource));
  warnings.push(...evaluatePhienDuoi5Phut(dataSource));
  warnings.push(...evaluateSaiGiaoVien(dataSource));
  warnings.push(...evaluateDungNghiPhien(dataSource, loTrinh));

  // Check vùng cấm cho toàn bộ hành trình
  if (Array.isArray(loTrinh) && loTrinh.length > 0 && forbiddenZones.length > 0) {
    loTrinh.forEach((lt, ltIdx) => {
      // Tìm phiên tương ứng để check ngày áp dụng
      const phien = dataSource.find(p => {
        const sessStart = new Date(p.ThoiDiemDangNhap).getTime();
        const sessEnd = new Date(p.ThoiDiemDangXuat).getTime();
        const ltStart = new Date(lt.StartTime || lt.ThoiDiemDangNhap || lt.thoiDiemDangNhap).getTime();
        const ltEnd = new Date(lt.EndTime || lt.ThoiDiemDangXuat || lt.thoiDiemDangXuat).getTime();
        return Math.abs(sessStart - ltStart) < 5 * 60 * 1000 && Math.abs(sessEnd - ltEnd) < 5 * 60 * 1000;
      });

      if (phien && isRuleApplicable("checkKhuVucCam", phien.ThoiDiemDangNhap)) {
        const violation = checkForbiddenZones(lt.ListCoordinate, forbiddenZones);
        if (violation) {
          warnings.push({
            type: "warning",
            label: "Đi vào vùng cấm",
            message: `Phiên ${dataSource.indexOf(phien) + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}) đi qua vùng cấm "${violation.zoneName}".`,
          });
        }
      }
    });
  }

  const courseCode =
    dataSource?.[0]?.MaKhoaHoc ||
    dataSource?.[0]?.MaKhoa ||
    dataSource?.[0]?.KhoaHoc ||
    "";
  if (shouldCheckCungDuongByCourse(courseCode)) {
    warnings.push(...evaluateCungDuong(loTrinh));
  }

  // ─── Filter errors/warnings based on statusMap (manually approved sessions "DUYET" are hidden) ───
  const filterByStatusMap = (issues) => {
    return issues.filter(issue => {
      // Find all matches for "phiên X" (case-insensitive) in the message
      const matches = [...issue.message.matchAll(/phiên\s+(\d+)/gi)];
      if (matches.length > 0) {
        // If any of the referenced sessions is DUYET, we hide this warning/error
        const isApproved = matches.some(m => {
          const idx = parseInt(m[1], 10) - 1;
          if (idx >= 0 && idx < dataSource.length) {
            const phien = dataSource[idx];
            return getMappedStatus(phien, statusMap) === "DUYET";
          }
          return false;
        });
        if (isApproved) return false;
      }
      return true;
    });
  };

  const finalErrors = filterByStatusMap(errors);
  const finalWarnings = filterByStatusMap(warnings);

  return { status: finalErrors.length === 0 ? "pass" : "fail", errors: finalErrors, warnings: finalWarnings };
}

module.exports = {
  HANG_DAO_TAO_CONFIG,
  getSystemConfig,
  setSystemConfig,
  isRuleApplicable,
  normalizePlate,
  isPlateSimilar,
  getSessionKeys,
  getMappedStatus,
  getMappedEntry,
  getDistance,
  checkForbiddenZones,
  fmtGio,
  fmtPhut,
  evaluateDungNghiPhien,
  getBienSoTuDong,
  getInvalidSessionIndexes,
  checkCungDuong,
  evaluateCungDuong,
  evaluateNghiGiuaPhien,
  evaluateTocDoPhien,
  evaluateTuDongSau17h,
  evaluateSaiGiaoVien,
  evaluatePhienDuoi5Phut,
  computeSummary,
  evaluate,
};
