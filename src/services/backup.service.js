const backupRepository = require("../repositories/backup.repository");

// Helper to safely format and truncate string parameters to avoid SQL Server validation errors
function toSafeString(val, maxLength = 255) {
  if (val === undefined || val === null) return null;
  let str = "";
  if (typeof val === "object") {
    str = val instanceof Date ? val.toISOString() : JSON.stringify(val);
  } else {
    str = String(val).trim();
  }
  
  if (str === "" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
    return null;
  }
  
  return str.substring(0, maxLength);
}

// Helper to convert UNIX timestamp to JS Date safely
function toJsDate(unixTs) {
  if (!unixTs) return null;
  const ts = Number(unixTs);
  if (isNaN(ts) || ts <= 0) return null;
  // If timestamp is already in milliseconds, don't multiply by 1000
  const isMs = ts > 99999999999;
  return new Date(isMs ? ts : ts * 1000);
}

// Helper to get Unix timestamp (seconds) from Date or string safely
function toUnixTs(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === "number") {
    return dateVal > 99999999999 ? Math.floor(dateVal / 1000) : dateVal;
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

// Helper to format UNIX timestamp to DD/MM/YYYY
function formatDDMMYYYY(unixTs) {
  if (!unixTs) return "";
  const date = new Date(Number(unixTs) * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function backupHocVienTheoKhoa(enrolmentPlanIid, students) {
  if (!enrolmentPlanIid || !Array.isArray(students)) return 0;

  const records = students.map((student) => {
    const user = student?.user || {};
    const learning = student?.learning_progress || {};
    const maDk = toSafeString(user.admission_code || user.code || student.id || "", 100);

    return {
      enrolment_plan_iid: toSafeString(enrolmentPlanIid, 100),
      ma_dk: maDk,
      total_hour_learned: learning.total_hour_learned || 0,
      progress: learning.progress || 0,
      passed: learning.passed ? 1 : 0,
      learned: learning.learned ? 1 : 0,
      score_by_rubrik: learning.score_by_rubrik ? JSON.stringify(learning.score_by_rubrik) : null,
    };
  });

  // Deduplicate by (enrolment_plan_iid, ma_dk) to avoid unique constraint violations
  const uniqueRecordsMap = new Map();
  records.forEach(r => {
    if (r.enrolment_plan_iid && r.ma_dk) {
      const key = `${r.enrolment_plan_iid}_${r.ma_dk}`;
      uniqueRecordsMap.set(key, r);
    }
  });
  const deduplicatedRecords = Array.from(uniqueRecordsMap.values());

  return await backupRepository.upsertHocVienKhoa(deduplicatedRecords);
}

async function backupCameraSnapshots(maDk, enrolmentPlanIid, snapshots) {
  if (!maDk || !Array.isArray(snapshots)) return 0;

  const records = snapshots.map((item) => {
    const captured = toUnixTs(item.captured_at || item.created_at || item.timestamp || item.ts);
    const capturedSecs = captured || Math.floor(Date.now() / 1000);
    return {
      lotus_snapshot_id: toSafeString(item.id || item.iid || item.file?.id, 100),
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid || item.enrolment_plan_iid, 100),
      item_iid: toSafeString(item.item_iid || item.course_item_iid || (item.snapshot_affected_items && item.snapshot_affected_items[0]?.iid), 100) || "",
      image_url: toSafeString(item.url || item.image_url || item.file_path || item.file?.link, 500) || "",
      captured_at: capturedSecs,
      captured_at_iso: toJsDate(capturedSecs),
      verify_status: toSafeString(item.verify_status || item.status || (item.verified === 1 ? "verified" : "unverified"), 50),
    };
  });

  // Deduplicate by (ma_dk, captured_at, image_url) to avoid unique constraint violations
  const uniqueRecordsMap = new Map();
  records.forEach(r => {
    if (r.ma_dk && r.captured_at && r.image_url) {
      const key = `${r.ma_dk}_${r.captured_at}_${r.image_url}`;
      uniqueRecordsMap.set(key, r);
    }
  });
  const deduplicatedRecords = Array.from(uniqueRecordsMap.values());

  return await backupRepository.upsertCameraSnapshots(deduplicatedRecords);
}

async function backupTimeTrackingLogs(maDk, enrolmentPlanIid, logs) {
  if (!maDk || !Array.isArray(logs)) return 0;

  const records = logs.map((item) => {
    const start = toUnixTs(item.start_time || item.started_at || item.ts);
    const startSecs = start || Math.floor(Date.now() / 1000);
    const endSecs = toUnixTs(item.end_time || item.ended_at || item.updated_ts);
    
    return {
      lotus_log_id: toSafeString(item.id || item.log_id || item.session_iid, 100),
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid || item.enrolment_plan_iid, 100),
      item_iid: toSafeString(item.item_iid || item.course_item_iid || item.item_id || item.course_iid, 100),
      item_name: toSafeString(item.item_name || item.name || item.__expand?.course?.name, 255),
      start_time: startSecs,
      start_time_iso: toJsDate(startSecs),
      end_time: endSecs,
      end_time_iso: toJsDate(endSecs),
      duration: item.duration || item.active_time || item.time_spent || 0,
      device: toSafeString(item.device || item.browser || item.platform, 255),
      ip_address: toSafeString(item.ip_address || item.ip, 50),
    };
  });

  // Deduplicate by (ma_dk, start_time, item_iid) to avoid unique constraint violations
  const uniqueRecordsMap = new Map();
  records.forEach(r => {
    if (r.ma_dk && r.start_time && r.item_iid) {
      const key = `${r.ma_dk}_${r.start_time}_${r.item_iid}`;
      uniqueRecordsMap.set(key, r);
    }
  });
  const deduplicatedRecords = Array.from(uniqueRecordsMap.values());

  return await backupRepository.upsertTimeTrackingLogs(deduplicatedRecords);
}

async function backupLearningTimeTracking(maDk, enrolmentPlanIid, trackingList) {
  if (!maDk || !Array.isArray(trackingList)) return 0;

  const records = trackingList.map((item) => {
    const lastLearned = toUnixTs(item.last_learned_at || item.last_accessed || item.updated_at || item.date);
    // Use item.id (e.g. date1775581200) or generate date-based id to ensure uniqueness per day
    const itemIid = toSafeString(item.id || (item.date ? "date" + item.date : null) || item.item_iid || item.course_item_iid || (item.course_iids && item.course_iids[0]), 100) || "";
    
    // Format name as "Ngày học DD/MM/YYYY" as requested by the user
    const dateVal = item.date || lastLearned;
    const dateStr = dateVal ? formatDDMMYYYY(dateVal) : "";
    const itemName = `Ngày học ${dateStr}`;

    const totalTime = item.total_time || item.duration || item.time || item.real_time_spent || item.gained_kpi_time || 0;
    const progressVal = item.progress || item.percent || 100.0;

    return {
      ma_dk: toSafeString(maDk, 100),
      enrolment_plan_iid: toSafeString(enrolmentPlanIid || item.enrolment_plan_iid, 100) || "",
      item_iid: itemIid,
      item_name: itemName,
      total_time: totalTime,
      progress: progressVal,
      last_learned_at: lastLearned,
      last_learned_at_iso: toJsDate(lastLearned),
    };
  });

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
    ma_dk: maDk,
    enrolment_plan_iid: enrolmentPlanIid,
    progress: Number(progress),
    total_hour_learned: Number(totalHourLearned),
    passed: passed,
    learned: learned
  });
}

async function backupScoreByRubric(maDk, enrolmentPlanIid, responseData) {
  if (!maDk) return 0;
  const scoreJson = responseData ? JSON.stringify(responseData) : null;
  return await backupRepository.upsertScoreByRubric(maDk, enrolmentPlanIid, scoreJson);
}

module.exports = {
  backupHocVienTheoKhoa,
  backupCameraSnapshots,
  backupTimeTrackingLogs,
  backupLearningTimeTracking,
  backupStudentProgress,
  backupScoreByRubric,
};
