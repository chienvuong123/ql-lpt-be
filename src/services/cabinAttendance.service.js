const cabinModel = require("../repositories/cabin.repository");
const cabinApiService = require("./cabinApi.service");
const telegramService = require("./telegram.service");
const { CA_HOC_CONFIG } = require("../constants/caHoc");

/**
 * Hàm phân tích chuỗi thời gian thành Timestamp tuyệt đối theo giờ Việt Nam (UTC+7)
 * Điều này đảm bảo tính chính xác bất kể timezone của máy chủ (local hay UTC)
 */
const parseToTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  // Nếu chuỗi không chứa chỉ định múi giờ (Z, +07:00...), ta mặc định là giờ Việt Nam (UTC+7)
  if (typeof dateInput === "string" && !dateInput.match(/Z|[+-]\d{2}:?\d{2}$/i)) {
    const parts = dateInput.split(/[\sT]/);
    if (parts.length >= 2) {
      const [year, month, day] = parts[0].split("-").map(Number);
      const [hour, minute, second] = parts[1].split(":").map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      // Trừ đi 7 giờ để chuyển đổi từ UTC+7 về UTC chuẩn
      utcDate.setUTCHours(utcDate.getUTCHours() - 7);
      return utcDate.getTime();
    }
  }
  return d.getTime();
};

/**
 * Tính toán khung giờ học kèm 15 phút buffer (trước và sau ca học)
 */
const getShiftWindow = (dateStr, caHoc) => {
  const config = CA_HOC_CONFIG[caHoc];
  if (!config) return null;

  const parseVNTime = (timeStr) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    date.setUTCHours(date.getUTCHours() - 7);
    return date;
  };

  const startDt = parseVNTime(config.start);
  const endDt = parseVNTime(config.end);
  const buffer = 15 * 60 * 1000; // 15 phút

  return {
    min: startDt.getTime() - buffer,
    max: endDt.getTime() + buffer,
    startStr: config.start,
    endStr: config.end,
  };
};

/**
 * Kiểm tra xem một học viên có tham gia học trong khung giờ (window) hay không
 */
const checkStudentAttended = async (maDk, window) => {
  try {
    const rawData = await cabinApiService.getKetQuaTapByMaDk(maDk);
    const records = Array.isArray(rawData?.data) ? rawData.data : Array.isArray(rawData) ? rawData : [];

    // Tìm kiếm bất cứ bản ghi nào có thời gian bắt đầu/kết thúc nằm trong khung giờ ca học (kèm buffer)
    const matchRecord = records.find((r) => {
      const timeIn = parseToTimestamp(r.Time_In);
      const timeOut = parseToTimestamp(r.Time_Out);
      const dateCreate = parseToTimestamp(r.DateCreate);

      const times = [timeIn, timeOut, dateCreate].filter((t) => t !== null);
      return times.some((t) => t >= window.min && t <= window.max);
    });

    return !!matchRecord;
  } catch (err) {
    console.error(`[CabinAttendance] Lỗi kiểm tra đi học của học viên ${maDk}:`, err.message);
    return false;
  }
};

/**
 * Hàm chính thực hiện quét lịch học cabin, kiểm tra chuyên cần và báo Telegram
 */
const checkAttendanceAndNotify = async ({ dateStr, caHoc }) => {
  if (!dateStr || !caHoc) {
    throw new Error("Thiếu tham số dateStr hoặc caHoc");
  }

  const window = getShiftWindow(dateStr, caHoc);
  if (!window) {
    throw new Error(`Ca học ${caHoc} không hợp lệ`);
  }

  // 1. Lấy danh sách lịch phân bổ của ca này
  const assignments = await cabinModel.getAssignmentsByShift(dateStr, caHoc);
  if (!assignments || assignments.length === 0) {
    return {
      message: `Không có lịch xếp cabin cho ca ${caHoc} ngày ${dateStr}`,
      checkedCount: 0,
      alertsSent: false,
    };
  }

  // 2. Lấy kết quả tích lũy cabin của các khóa để xác định trạng thái "chưa đạt"
  const uniqueKhoas = [...new Set(assignments.map((a) => a.ma_khoa).filter(Boolean))];
  const allSessionResults = await Promise.all(
    uniqueKhoas.map(async (k) => {
      try {
        const r = await cabinApiService.getDanhSachKetQuaCabin({ khoa: k });
        return r?.data || [];
      } catch (err) {
        console.warn(`[CabinAttendance] Lỗi lấy danh sách kết quả khóa ${k}:`, err.message);
        return [];
      }
    })
  );
  const cabinMap = cabinApiService.buildCabinMap(allSessionResults.flat());

  // 3. Kiểm tra chuyên cần thực tế trong ca học của từng học viên
  const results = await Promise.all(
    assignments.map(async (asm) => {
      const attended = await checkStudentAttended(asm.ma_dk, window);
      return { ...asm, attended };
    })
  );

  // 4. Nhóm học viên theo giáo viên để kiểm tra điều kiện (A): Giáo viên không có học sinh nào đi học
  const teacherGroups = {};
  results.forEach((r) => {
    const teacherName = String(r.giao_vien || "Chưa phân công").trim();
    if (!teacherGroups[teacherName]) {
      teacherGroups[teacherName] = [];
    }
    teacherGroups[teacherName].push(r);
  });

  const teacherAlerts = [];
  Object.entries(teacherGroups).forEach(([teacherName, students]) => {
    const attendedCount = students.filter((s) => s.attended).length;
    if (students.length > 0 && attendedCount === 0) {
      teacherAlerts.push(
        `- Giáo viên: <b>${teacherName}</b> (Có ${students.length} cabin được xếp nhưng không học viên nào đến học)`
      );
    }
  });

  // 5. Kiểm tra điều kiện (B): Học viên chưa đạt / chưa học mà không đi học theo lịch xếp
  const studentAlerts = [];
  results.forEach((r) => {
    const cabinInfo = cabinMap[r.ma_dk];
    const isDat = cabinInfo && cabinApiService.getCabinStatus(cabinInfo.tong_thoi_gian, cabinInfo.so_bai_hoc) === "dat";

    // Nếu học viên CHƯA ĐẠT (hoặc chưa học gì) mà KHÔNG ĐI HỌC ca này
    if (!isDat && !r.attended) {
      const courseName = r.ten_khoa || r.ma_khoa || "Chưa xác định";
      const teacherName = r.giao_vien || "Chưa phân công";
      const currentCabinStr = cabinInfo
        ? `${Math.round(cabinInfo.tong_thoi_gian / 60)} phút / ${cabinInfo.so_bai_hoc} bài`
        : "Chưa học buổi nào";

      studentAlerts.push(
        `- <b>${r.ho_ten}</b> (CCCD: <code>${r.cccd || "N/A"}</code>)\n` +
        `  • Khóa học: ${courseName}\n` +
        `  • Giáo viên: ${teacherName}\n` +
        `  • Trạng thái hiện tại: ${currentCabinStr}`
      );
    }
  });

  // 6. Gửi cảnh báo lên Telegram nếu phát hiện vi phạm điều kiện
  let alertsSent = false;
  if (teacherAlerts.length > 0 || studentAlerts.length > 0) {
    let message = `⚠️ <b>CẢNH BÁO CHUYÊN CẦN CABIN - CA ${caHoc}</b>\n`;
    message += `📅 Ngày: <b>${dateStr}</b> (Thời gian ca: ${window.startStr} - ${window.endStr})\n\n`;

    if (teacherAlerts.length > 0) {
      message += `🚫 <b>GIÁO VIÊN KHÔNG CÓ HỌC VIÊN ĐẾN HỌC:</b>\n`;
      message += `${teacherAlerts.join("\n")}\n\n`;
    }

    if (studentAlerts.length > 0) {
      message += `👤 <b>HỌC VIÊN CHƯA ĐẠT CABIN VẮNG MẶT:</b>\n`;
      message += `${studentAlerts.join("\n")}`;
    }

    alertsSent = await telegramService.sendTelegramMessage(message);
  }

  return {
    message: "Kiểm tra chuyên cần cabin hoàn tất",
    dateStr,
    caHoc,
    checkedCount: results.length,
    teacherAlertsCount: teacherAlerts.length,
    studentAlertsCount: studentAlerts.length,
    alertsSent,
  };
};

module.exports = {
  checkAttendanceAndNotify,
};
