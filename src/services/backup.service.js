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
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resToken = await getHanhTrinhToken();
        const token = resToken?.token;
        const params = buildParams(useKhoa);
        const response = await hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return { success: true, data: response.data?.Data || [] };
      } catch (err) {
        lastError = err;
        if (err?.response?.status === 401) {
          invalidateHanhTrinhToken();
          if (attempt < 2) continue;
        }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    return { success: false, error: lastError?.message || "Failed after 3 attempts" };
  };

  let res = await fetchAttempt(true);
  if ((!res.success || (res.success && res.data.length === 0)) && trimmedMaKhoa) {
    const fallbackRes = await fetchAttempt(false);
    if (fallbackRes.success) {
      res = fallbackRes;
    } else if (!res.success) {
      res.error = `${res.error} (Fallback: ${fallbackRes.error})`;
    }
  }
  return res;
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
    FROM [BACK_UP].[dbo].[backup_hanh_trinh] WITH (NOLOCK)
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
      summary: { totalStudents: 0, totalFetchedSessions: 0, totalSavedSessions: 0, skippedCount: 0, successFetchedStudentsCount: 0, savedStudentsCount: 0, failedStudentsCount: 0 },
      skipped: [],
      failedStudents: []
    };
  }

  // 2. Fetch the set of cabin make-up students
  const cabinMakeupSet = await getCabinMakeupMaDkSet();

  // 3. Fetch HanhTrinh sessions for all students concurrently
  const fetchResults = await mapConcurrent(uniqueStudents, 10, async (student) => {
    const res = await fetchRawHanhTrinhRecords(student.ma_dk, student.ma_khoa_trigger);
    if (!res.success) {
      return { student, success: false, error: res.error };
    }
    return {
      student,
      success: true,
      sessions: res.data.map(s => ({
        ...s,
        HoTen: student.ho_ten || s.HoTen || null,
        MaKhoaHocKetThuc: student.ma_khoa_trigger,
        SessionId: s.SessionId || s.ID?.toString() || null,
        MaDK: s.MaDK || student.ma_dk || null,
        MaKhoaHoc: s.MaKhoaHoc || s.MaKhoa || null,
        KhoaHoc: s.KhoaHoc || null
      }))
    };
  });

  const successResults = fetchResults.filter(r => r.success);
  const failedResults = fetchResults.filter(r => !r.success);

  const finalSuccessResults = [...successResults];
  const finalFailedStudents = [];

  // Retry logic for failed students
  for (const failedItem of failedResults) {
    console.log(`[backupHanhTrinh] Retrying failed student API call: ${failedItem.student.ma_dk} (${failedItem.student.ho_ten}) due to error: ${failedItem.error}`);
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetchRawHanhTrinhRecords(failedItem.student.ma_dk, failedItem.student.ma_khoa_trigger);
    if (res.success) {
      finalSuccessResults.push({
        student: failedItem.student,
        success: true,
        sessions: res.data.map(s => ({
          ...s,
          HoTen: failedItem.student.ho_ten || s.HoTen || null,
          MaKhoaHocKetThuc: failedItem.student.ma_khoa_trigger,
          SessionId: s.SessionId || s.ID?.toString() || null,
          MaDK: s.MaDK || failedItem.student.ma_dk || null,
          MaKhoaHoc: s.MaKhoaHoc || s.MaKhoa || null,
          KhoaHoc: s.KhoaHoc || null
        }))
      });
    } else {
      finalFailedStudents.push({
        ma_dk: failedItem.student.ma_dk,
        ho_ten: failedItem.student.ho_ten,
        ma_khoa: failedItem.student.ma_khoa_trigger,
        error: res.error
      });
    }
  }

  const rawAllSessions = finalSuccessResults.map(r => r.sessions).flat().filter(s => s && s.SessionId);

  if (!rawAllSessions.length) {
    return {
      success: true,
      message: `Đã xử lý backup cho ${uniqueStudents.length} học viên. Không lấy được phiên học nào thành công hoặc không có phiên học nào từ API HanhTrinh.`,
      summary: { 
        totalStudents: uniqueStudents.length, 
        totalFetchedSessions: 0, 
        totalSavedSessions: 0, 
        skippedCount: 0,
        successFetchedStudentsCount: finalSuccessResults.length,
        savedStudentsCount: 0,
        failedStudentsCount: finalFailedStudents.length
      },
      skipped: [],
      failedStudents: finalFailedStudents
    };
  }

  const acceptedSessions = [];
  const skippedSessionsReport = [];

  for (const session of rawAllSessions) {
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

    acceptedSessions.push(session);
  }

  // 4. Save accepted sessions to the backup database
  let savedCount = 0;
  if (acceptedSessions.length > 0) {
    savedCount = await backupRepository.upsertBackUpHanhTrinh(acceptedSessions);
  }

  const savedStudentMaDks = new Set(acceptedSessions.map(s => s.MaDK));

  return {
    success: true,
    message: `Đã xử lý backup cho ${uniqueStudents.length} học viên. Đã lưu thành công ${savedCount} phiên học.`,
    summary: {
      totalStudents: uniqueStudents.length,
      successFetchedStudentsCount: finalSuccessResults.length,
      savedStudentsCount: savedStudentMaDks.size,
      failedStudentsCount: finalFailedStudents.length,
      totalFetchedSessions: rawAllSessions.length,
      totalSavedSessions: savedCount,
      skippedCount: skippedSessionsReport.length
    },
    skipped: skippedSessionsReport,
    failedStudents: finalFailedStudents,
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

// Helper for date formatting
const toJsDate = (ts) => {
  if (!ts) return null;
  const date = new Date(ts * 1000);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to sanitize strings
const toSafeString = (str, maxLen) => {
  if (str === null || str === undefined) return "";
  const s = String(str).trim();
  return maxLen ? s.substring(0, maxLen) : s;
};

async function backupHocVienTheoKhoa(enrolmentPlanIid, students) {
  if (!enrolmentPlanIid || !Array.isArray(students)) return 0;
  
  const records = students.map(s => {
    const user = s.user || {};
    const maDk = user.admission_code || user.code || s.id || "";
    const lp = s.learning_progress || {};
    return {
      enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
      ma_dk: toSafeString(maDk, 100),
      total_hour_learned: lp.total_hour_learned ? parseFloat(lp.total_hour_learned) : 0,
      progress: lp.progress ? parseFloat(lp.progress) : 0,
      passed: lp.passed ? 1 : 0,
      learned: lp.learned ? 1 : 0,
      score_by_rubrik: lp.score_by_rubrik ? JSON.stringify(lp.score_by_rubrik) : null
    };
  }).filter(r => r.ma_dk);

  if (records.length === 0) return 0;
  return await backupRepository.upsertHocVienKhoa(records);
}

async function backupCameraSnapshots(maDk, enrolmentPlanIid, snapshots) {
  if (!maDk || !Array.isArray(snapshots)) return 0;
  
  const records = snapshots.map(s => {
    const snapshotId = s.id || s.iid || "";
    const url = s.image_url || s.url || "";
    return {
      lotus_snapshot_id: toSafeString(snapshotId, 100),
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
      item_iid: s.item_iid ? toSafeString(s.item_iid, 100) : null,
      image_url: toSafeString(url, 500),
      captured_at: s.captured_at || 0,
      captured_at_iso: toJsDate(s.captured_at),
      verify_status: s.verify_status ? toSafeString(s.verify_status, 50) : null
    };
  }).filter(r => r.image_url);

  if (records.length === 0) return 0;
  return await backupRepository.upsertCameraSnapshots(records);
}

async function backupTimeTrackingLogs(maDk, enrolmentPlanIid, logs) {
  if (!maDk || !Array.isArray(logs)) return 0;
  
  const records = logs.map(l => {
    const logId = l.id || l.log_id || "";
    return {
      lotus_log_id: toSafeString(logId, 100),
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
      item_iid: l.item_iid ? toSafeString(l.item_iid, 100) : "",
      item_name: l.item_name ? toSafeString(l.item_name, 255) : null,
      start_time: l.start_time || 0,
      start_time_iso: toJsDate(l.start_time),
      end_time: l.end_time || null,
      end_time_iso: toJsDate(l.end_time),
      duration: l.duration || 0,
      device: l.device ? toSafeString(l.device, 255) : null,
      ip_address: l.ip_address ? toSafeString(l.ip_address, 50) : null
    };
  }).filter(r => r.item_iid && r.start_time);

  if (records.length === 0) return 0;
  return await backupRepository.upsertTimeTrackingLogs(records);
}

async function backupLearningTimeTracking(maDk, enrolmentPlanIid, logs) {
  if (!maDk || !Array.isArray(logs)) return 0;
  
  const records = logs.map(l => {
    const progressVal = l.progress || l.percent || 0;
    const lastLearned = l.last_learned_at || l.date || 0;
    return {
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid || l.enrolment_plan_iid, 100) || "",
      item_iid: l.item_iid ? toSafeString(l.item_iid, 100) : "",
      item_name: l.item_name ? toSafeString(l.item_name, 255) : null,
      total_time: l.total_time || 0,
      progress: Number(progressVal),
      last_learned_at: lastLearned,
      last_learned_at_iso: toJsDate(lastLearned)
    };
  }).filter(r => r.item_iid);

  if (records.length === 0) return 0;

  // Deduplicate by (ma_dk, enrolment_plan_iid, item_iid) to avoid unique constraint violations
  const uniqueRecordsMap = new Map();
  records.forEach(r => {
    if (r.ma_dk && r.enrolment_plan_iid && r.item_iid) {
      const key = `${r.ma_dk}_${r.enrolment_plan_iid}_${r.item_iid}`;
      uniqueRecordsMap.set(key, r);
    }
  });
  const deduplicatedRecords = Array.from(uniqueRecordsMap.values());

  return await backupRepository.upsertLearningTimeTracking(deduplicatedRecords);
}

async function backupStudentProgress(maDk, enrolmentPlanIid, responseData) {
  if (!maDk) return 0;
  
  const result = responseData?.result || responseData || {};
  let progress = 0;
  let totalHourLearned = 0;
  let passed = 0;
  let learned = 0;
  
  if (Array.isArray(result)) {
    let totalProgress = 0;
    result.forEach(item => {
      const prog = item?.progress || item?.learning_progress?.progress || 0;
      totalProgress += Number(prog);
      totalHourLearned += Number(item?.total_hour_learned || item?.learning_progress?.total_hour_learned || 0);
      if (item?.passed || item?.learning_progress?.passed) passed = 1;
      if (item?.learned || item?.learning_progress?.learned) learned = 1;
    });
    progress = result.length > 0 ? (totalProgress / result.length) : 0;
  } else {
    progress = result.progress || result.learning_progress?.progress || 0;
    totalHourLearned = result.total_hour_learned || result.learning_progress?.total_hour_learned || 0;
    passed = (result.passed || result.learning_progress?.passed) ? 1 : 0;
    learned = (result.learned || result.learning_progress?.learned) ? 1 : 0;
  }
  
  return await backupRepository.upsertHocVienHocTap({
    ma_dk: toSafeString(maDk, 100),
    enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
    progress: Number(progress),
    total_hour_learned: Number(totalHourLearned),
    passed: passed,
    learned: learned
  });
}

async function backupScoreByRubric(maDk, enrolmentPlanIid, responseData) {
  if (!maDk) return 0;
  
  const scoreJson = responseData ? JSON.stringify(responseData) : null;
  const result = responseData?.result || {};
  const rubric = result.rubric || {};
  const rubricIid = rubric.iid || result.iid || "";
  const rubricName = rubric.name || "";
  const score = result.score || 0;
  const cp = result.cp || 0;
  const passed = result.passed || 0;
  const scoreByRubrik = result.score_by_rubrik ? JSON.stringify(result.score_by_rubrik) : null;

  // 1. Save to the new table
  if (rubricIid) {
    const record = {
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
      rubric_iid: toSafeString(rubricIid, 100),
      rubric_name: toSafeString(rubricName, 255),
      score: Number(score),
      cp: Number(cp),
      passed: Number(passed),
      score_by_rubrik: scoreByRubrik,
    };
    await backupRepository.upsertScoreByRubricTable(record).catch(err => {
      console.error("[backupScoreByRubric] Save to new table failed:", err.message);
    });
  }

  // 2. Save to the legacy hoc_vien_hoc_tap table
  return await backupRepository.upsertScoreByRubric(maDk, enrolmentPlanIid, scoreJson);
}

async function backupTienDoHoanThanh(maDk, enrolmentPlanIid, responseData) {
  if (!maDk) return 0;
  const list = responseData?.result || (Array.isArray(responseData) ? responseData : []);
  if (!Array.isArray(list) || list.length === 0) return 0;

  const records = list.map(item => {
    const epIid = enrolmentPlanIid || item.enrolment_plan?.iid || (item.enrolment_plans && item.enrolment_plans[0]) || "";
    return {
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(epIid, 100),
      course_iid: toSafeString(item.iid || item.id, 100),
      course_name: toSafeString(item.name, 255),
      cp: Number(item.cp || 0),
      p: Number(item.p || 0),
      pf: Number(item.pf || 0),
      rubric_iid: toSafeString(item.rubric_iid, 100),
    };
  }).filter(r => r.course_iid);

  if (records.length === 0) return 0;

  // Deduplicate records to avoid unique constraint violations
  const uniqueRecordsMap = new Map();
  records.forEach(r => {
    const key = `${r.ma_dk}_${r.enrolment_plan_iid}_${r.course_iid}`;
    uniqueRecordsMap.set(key, r);
  });
  const deduplicatedRecords = Array.from(uniqueRecordsMap.values());

  await backupRepository.upsertTienDoHoanThanh(deduplicatedRecords);

  // Fallback sync to legacy hoc_vien_hoc_tap
  await backupStudentProgress(maDk, enrolmentPlanIid, responseData).catch(err => {
    console.error("[backupTienDoHoanThanh] legacy update to hoc_vien_hoc_tap failed:", err.message);
  });

  return deduplicatedRecords.length;
}

module.exports = {
  backupHanhTrinh,
  checkOverlap,
  backupHocVienTheoKhoa,
  backupCameraSnapshots,
  backupTimeTrackingLogs,
  backupLearningTimeTracking,
  backupStudentProgress,
  backupScoreByRubric,
  backupTienDoHoanThanh
};
