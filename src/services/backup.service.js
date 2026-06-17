const axios = require("axios");
const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const syncModel = require("../models/sync.model");
const backupRepository = require("../repositories/backup.repository");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");

// Helper for concurrent execution (similar to cron.service)
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

const getLocalEndDateStr = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset * 60 * 1000));
  return localToday.toISOString().split('T')[0] + "T23:59:00";
};

// Fetch HanhTrinh sessions for a single student (with retry and fallback logic)
async function fetchRawHanhTrinhRecords(maDk, maKhoaHoc) {
  const trimmedMaDk = String(maDk || "").trim();
  const trimmedMaKhoa = String(maKhoaHoc || "").trim();
  const ngaybatdau = "2020-01-01";
  const endDateStr = getLocalEndDateStr();

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
        const response = await hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return response.data?.Data || [];
      } catch (err) {
        if (err?.response?.status === 401) {
          invalidateHanhTrinhToken();
          if (attempt < 2) continue;
        }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        return [];
      }
    }
    return [];
  };

  let data = await fetchAttempt(true);
  if (data.length === 0 && trimmedMaKhoa) {
    data = await fetchAttempt(false);
  }
  return data;
}

// Check if two time intervals overlap
function isOverlapping(start1, end1, start2, end2) {
  return Math.max(start1, start2) < Math.min(end1, end2);
}

// Get the cabin makeup student Set (ma_dk)
async function getCabinMakeupMaDkSet() {
  const pool = await connectSQL();
  const result = await pool.request().query(`
    SELECT DISTINCT ma_dk 
    FROM [dbo].[hoc_bu_new] WITH (NOLOCK)
    WHERE loai = 'cabin' OR loai_thuc_hanh = 'cabin'
  `);
  return new Set(result.recordset.map(r => r.ma_dk));
}

// Get existing database backup sessions within the time range
async function getExistingBackupSessions(minStart, maxEnd) {
  const pool = await connectSQL();
  const request = pool.request();
  request.input("minStart", mssql.DateTime, minStart);
  request.input("maxEnd", mssql.DateTime, maxEnd);
  
  const result = await request.query(`
    SELECT SessionId, MaDK, BienSo, ThoiDiemDangNhap, ThoiDiemDangXuat 
    FROM [BACK_UP].[dbo].[BACK_UP_HANH_TRINH] WITH (NOLOCK)
    WHERE ThoiDiemDangXuat >= @minStart AND ThoiDiemDangNhap <= @maxEnd
  `);
  return result.recordset;
}

async function backupHanhTrinh(maKhoaListInput) {
  let maKhoaList = [];
  if (Array.isArray(maKhoaListInput)) {
    maKhoaList = maKhoaListInput.map(k => String(k || "").trim()).filter(Boolean);
  } else if (typeof maKhoaListInput === "string") {
    maKhoaList = maKhoaListInput.split(",").map(k => k.trim()).filter(Boolean);
  }

  if (!maKhoaList.length) {
    throw new Error("Mã khóa học (ma_khoa) không hợp lệ");
  }

  // 1. Retrieve all students for these courses
  let allStudents = [];
  for (const maKhoa of maKhoaList) {
    const students = await syncModel.getHocVienByKhoa(maKhoa);
    students.forEach(std => {
      std.ma_khoa_trigger = maKhoa;
    });
    allStudents = allStudents.concat(students);
  }

  // Deduplicate students by ma_dk
  const uniqueStudentsMap = new Map();
  allStudents.forEach(std => {
    if (std.ma_dk) {
      uniqueStudentsMap.set(std.ma_dk, std);
    }
  });
  const uniqueStudents = Array.from(uniqueStudentsMap.values());

  if (!uniqueStudents.length) {
    return {
      success: true,
      message: "Không tìm thấy học viên nào trong các khóa học được yêu cầu.",
      summary: { totalStudents: 0, totalFetchedSessions: 0, totalSavedSessions: 0, skippedCount: 0 },
      skipped: []
    };
  }

  // 2. Fetch the set of cabin make-up students
  const cabinMakeupSet = await getCabinMakeupMaDkSet();

  // 3. Fetch HanhTrinh sessions for all students concurrently
  const fetchResults = await mapConcurrent(uniqueStudents, 10, async (student) => {
    const sessions = await fetchRawHanhTrinhRecords(student.ma_dk, student.ma_khoa_trigger);
    
    return sessions.map(s => ({
      ...s,
      HoTen: student.ho_ten || s.HoTen || null,
      MaKhoaHocKetThuc: student.ma_khoa_trigger,
      SessionId: s.SessionId || s.ID?.toString() || null,
      MaDK: s.MaDK || student.ma_dk || null,
      MaKhoaHoc: s.MaKhoaHoc || s.MaKhoa || null,
      KhoaHoc: s.KhoaHoc || null
    }));
  });

  const rawAllSessions = fetchResults.flat().filter(s => s && s.SessionId);

  if (!rawAllSessions.length) {
    return {
      success: true,
      message: "Không lấy được phiên học nào từ API HanhTrinh cho các học viên.",
      summary: { totalStudents: uniqueStudents.length, totalFetchedSessions: 0, totalSavedSessions: 0, skippedCount: 0 },
      skipped: []
    };
  }

  // 4. Determine time range of all fetched sessions to pull existing db backup sessions
  let minStart = null;
  let maxEnd = null;
  rawAllSessions.forEach(s => {
    const start = new Date(s.ThoiDiemDangNhap);
    const end = new Date(s.ThoiDiemDangXuat);
    if (!isNaN(start.getTime()) && (!minStart || start < minStart)) {
      minStart = start;
    }
    if (!isNaN(end.getTime()) && (!maxEnd || end > maxEnd)) {
      maxEnd = end;
    }
  });

  let existingSessions = [];
  if (minStart && maxEnd) {
    existingSessions = await getExistingBackupSessions(minStart, maxEnd);
  }

  // 5. Resolve conflicts and filter sessions
  // Sort: IsSend (1 first), then TongQuangDuong (desc), then TongThoiGian (desc), then ID (asc)
  const sortedSessions = rawAllSessions.sort((a, b) => {
    const isSendA = a.IsSend === true || a.IsSend === 1 ? 1 : 0;
    const isSendB = b.IsSend === true || b.IsSend === 1 ? 1 : 0;
    if (isSendA !== isSendB) return isSendB - isSendA;

    const qdA = parseFloat(a.TongQuangDuong || 0);
    const qdB = parseFloat(b.TongQuangDuong || 0);
    if (qdA !== qdB) return qdB - qdA;

    const tgA = parseInt(a.TongThoiGian || 0);
    const tgB = parseInt(b.TongThoiGian || 0);
    if (tgA !== tgB) return tgB - tgA;

    return (a.ID || 0) - (b.ID || 0);
  });

  const acceptedSessions = [];
  const skippedSessionsReport = [];

  for (const session of sortedSessions) {
    const start = new Date(session.ThoiDiemDangNhap).getTime();
    const end = new Date(session.ThoiDiemDangXuat).getTime();

    if (isNaN(start) || isNaN(end) || end <= start) {
      skippedSessionsReport.push({
        sessionId: session.SessionId,
        student: session.HoTen,
        maDk: session.MaDK,
        reason: "Thời gian đăng nhập/đăng xuất không hợp lệ"
      });
      continue;
    }

    // Check "Học bù cabin không được chạy DAT"
    if (cabinMakeupSet.has(session.MaDK)) {
      skippedSessionsReport.push({
        sessionId: session.SessionId,
        student: session.HoTen,
        maDk: session.MaDK,
        reason: "Học bù cabin không được chạy DAT"
      });
      continue;
    }

    // Check "trùng phiên học" (same student, overlapping times)
    const isDuplicateSession = [...acceptedSessions, ...existingSessions].some(acc => {
      if (acc.SessionId === session.SessionId) return false;
      if (acc.MaDK !== session.MaDK) return false;
      const accStart = new Date(acc.ThoiDiemDangNhap).getTime();
      const accEnd = new Date(acc.ThoiDiemDangXuat).getTime();
      return isOverlapping(start, end, accStart, accEnd);
    });

    if (isDuplicateSession) {
      skippedSessionsReport.push({
        sessionId: session.SessionId,
        student: session.HoTen,
        maDk: session.MaDK,
        reason: "Trùng phiên học (học viên trùng lịch học khác)"
      });
      continue;
    }

    // Check "trùng xe" (same vehicle, overlapping times)
    const plate = session.BienSo ? session.BienSo.replace(/[-.\s]/g, "").toUpperCase() : "";
    const isDuplicateVehicle = [...acceptedSessions, ...existingSessions].some(acc => {
      if (acc.SessionId === session.SessionId) return false;
      const accPlate = acc.BienSo ? acc.BienSo.replace(/[-.\s]/g, "").toUpperCase() : "";
      if (!plate || !accPlate || plate !== accPlate) return false;

      const accStart = new Date(acc.ThoiDiemDangNhap).getTime();
      const accEnd = new Date(acc.ThoiDiemDangXuat).getTime();
      return isOverlapping(start, end, accStart, accEnd);
    });

    if (isDuplicateVehicle) {
      skippedSessionsReport.push({
        sessionId: session.SessionId,
        student: session.HoTen,
        maDk: session.MaDK,
        reason: `Trùng xe (xe ${session.BienSo} đang chạy ở phiên học khác trùng giờ)`
      });
      continue;
    }

    acceptedSessions.push(session);
  }

  // 6. Save accepted sessions to the backup database
  let savedCount = 0;
  if (acceptedSessions.length > 0) {
    savedCount = await backupRepository.upsertBackUpHanhTrinh(acceptedSessions);
  }

  return {
    success: true,
    message: `Đã xử lý backup cho ${uniqueStudents.length} học viên. Đã lưu ${savedCount} phiên hợp lệ.`,
    summary: {
      totalStudents: uniqueStudents.length,
      totalFetchedSessions: rawAllSessions.length,
      totalSavedSessions: savedCount,
      skippedCount: skippedSessionsReport.length
    },
    skipped: skippedSessionsReport,
    data: acceptedSessions
  };
}

async function checkOverlap(filters) {
  const result = await backupRepository.checkOverlap(filters);
  
  const formattedData = result.data.map(r => {
    const isTrungXe = r.bienSo1 && r.bienSo2 && r.bienSo1.replace(/[-.\s]/g, "").toUpperCase() === r.bienSo2.replace(/[-.\s]/g, "").toUpperCase();
    const isTrungGv = r.idGv1 && r.idGv2 && r.idGv1.trim() === r.idGv2.trim();

    return {
      loaiTrung: isTrungXe && isTrungGv ? "trung_ca_hai" : (isTrungXe ? "trung_xe" : "trung_gv"),
      phien1: {
        id: r.id1,
        sessionId: r.sessionId1,
        maDk: r.maDk1,
        hoTen: r.hoTen1,
        maKhoaHoc: r.maKhoaHoc1,
        maKhoaHocKetThuc: r.maKhoaHocKetThuc1,
        bienSo: r.bienSo1,
        idGv: r.idGv1,
        hoTenGv: r.hoTenGv1,
        thoiDiemDangNhap: r.thoiDiemDangNhap1,
        thoiDiemDangXuat: r.thoiDiemDangXuat1
      },
      phien2: {
        id: r.id2,
        sessionId: r.sessionId2,
        maDk: r.maDk2,
        hoTen: r.hoTen2,
        maKhoaHoc: r.maKhoaHoc2,
        maKhoaHocKetThuc: r.maKhoaHocKetThuc2,
        bienSo: r.bienSo2,
        idGv: r.idGv2,
        hoTenGv: r.hoTenGv2,
        thoiDiemDangNhap: r.thoiDiemDangNhap2,
        thoiDiemDangXuat: r.thoiDiemDangXuat2
      }
    };
  });

  return {
    success: true,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    data: formattedData
  };
}

module.exports = {
  backupHanhTrinh,
  checkOverlap
};
