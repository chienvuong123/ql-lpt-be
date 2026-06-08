const axios = require("axios");
const { generateSandTokens } = require("./lotusAuth.service");

const LOTUS_BASE = "https://staging-api.lotuslms.com";

/**
 * Lấy tiến độ hoàn thành của học viên trong kế hoạch đào tạo (Sử dụng login của Hệ Thống)
 */
async function getStudentProgressInEnrolmentPlan(params, authInfo) {
  const maDk = params.ma_dk || params.student_id || params.user_iid || params.code || "";
  const planIid = params.enrolment_plan_iid || params.course_id || params.plan_iid || "";
  const isForceBackup = params.from_backup === true || params.from_backup === "true";

  // 1. Check if backup only query is requested
  if (isForceBackup && maDk) {
    const backupRepository = require("../repositories/backup.repository");
    const cachedLogs = await backupRepository.getTienDoHoanThanh({ ma_dk: maDk, enrolment_plan_iid: planIid });
    if (cachedLogs && cachedLogs.length > 0) {
      return {
        success: true,
        count: cachedLogs.length,
        total: cachedLogs.length,
        result: cachedLogs.map(r => ({
          iid: Number(r.course_iid),
          id: r.course_iid,
          name: r.course_name,
          cp: r.cp,
          p: r.p,
          pf: r.pf,
          rubric_iid: r.rubric_iid ? Number(r.rubric_iid) : null,
        })),
        _is_backup: true
      };
    }
    const cached = await backupRepository.getHocVienHocTap(maDk);
    if (cached) {
      return {
        success: true,
        result: {
          ma_dk: cached.ma_dk,
          progress: cached.progress,
          total_hour_learned: cached.total_hour_learned,
          passed: cached.passed === 1 || cached.passed === true,
          learned: cached.learned === 1 || cached.learned === true,
          updated_at: cached.updated_at
        },
        _is_backup: true
      };
    }
  }

  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id' && key !== 'from_backup') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/student/api/get-student-courses-in-enrolment-plan?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  try {
    const response = await axios.post(url, formData);
    const result = response.data;

    // Asynchronously trigger local database cache backup
    if (maDk) {
      const backupService = require("./backup.service");
      backupService.backupTienDoHoanThanh(maDk, planIid, result).catch(err => {
        console.error("[getStudentProgressInEnrolmentPlan] Local Cache Backup Failed:", err.message);
      });
    }

    return result;
  } catch (error) {
    console.warn(`[getStudentProgressInEnrolmentPlan] API failed: ${error.message}. Checking local backup fallback...`);
    if (maDk) {
      const backupRepository = require("../repositories/backup.repository");
      const cachedLogs = await backupRepository.getTienDoHoanThanh({ ma_dk: maDk, enrolment_plan_iid: planIid });
      if (cachedLogs && cachedLogs.length > 0) {
        return {
          success: true,
          count: cachedLogs.length,
          total: cachedLogs.length,
          result: cachedLogs.map(r => ({
            iid: Number(r.course_iid),
            id: r.course_iid,
            name: r.course_name,
            cp: r.cp,
            p: r.p,
            pf: r.pf,
            rubric_iid: r.rubric_iid ? Number(r.rubric_iid) : null,
          })),
          _is_backup: true
        };
      }
      const cached = await backupRepository.getHocVienHocTap(maDk);
      if (cached) {
        return {
          success: true,
          result: {
            ma_dk: cached.ma_dk,
            progress: cached.progress,
            total_hour_learned: cached.total_hour_learned,
            passed: cached.passed === 1 || cached.passed === true,
            learned: cached.learned === 1 || cached.learned === true,
            updated_at: cached.updated_at
          },
          _is_backup: true
        };
      }
    }
    throw error;
  }
}

/**
 * Lấy điểm chi tiết theo rubric của học viên
 */
async function getUserScoreByRubric(params, authInfo) {
  const maDk = params.ma_dk || params.student_id || params.user_iid || params.code || "";
  const planIid = params.enrolment_plan_iid || params.course_id || params.plan_iid || "";
  const isForceBackup = params.from_backup === true || params.from_backup === "true";

  // 1. Check if backup only query is requested
  if (isForceBackup && maDk) {
    const backupRepository = require("../repositories/backup.repository");
    const cached = await backupRepository.getScoreByRubric({ ma_dk: maDk, enrolment_plan_iid: planIid });
    if (cached && cached.length > 0) {
      const r = cached[0];
      try {
        const scoreByRubrikArray = r.score_by_rubrik ? JSON.parse(r.score_by_rubrik) : [];
        return {
          success: true,
          result: {
            iid: Number(r.rubric_iid),
            rubric: {
              iid: Number(r.rubric_iid),
              name: r.rubric_name,
            },
            score: r.score,
            cp: r.cp,
            passed: r.passed,
            score_by_rubrik: scoreByRubrikArray,
          },
          _is_backup: true
        };
      } catch (err) {
        console.error("[getUserScoreByRubric] Failed to parse cached score_by_rubrik from new table:", err.message);
      }
    }
    const cachedLegacy = await backupRepository.getHocVienHocTap(maDk);
    if (cachedLegacy && cachedLegacy.score_by_rubrik) {
      try {
        const scoreData = JSON.parse(cachedLegacy.score_by_rubrik);
        if (Array.isArray(scoreData)) {
          return {
            success: true,
            score_by_rubrik: scoreData,
            _is_backup: true
          };
        } else {
          return {
            ...scoreData,
            _is_backup: true
          };
        }
      } catch (err) {
        console.error("[getUserScoreByRubric] Failed to parse cached score_by_rubrik:", err.message);
      }
    }
  }

  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id' && key !== 'from_backup') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/rubrik/api/get-user-score-by-rubric?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  try {
    const response = await axios.post(url, formData);
    const result = response.data;

    // Asynchronously trigger local database cache backup
    if (maDk) {
      const backupService = require("./backup.service");
      backupService.backupScoreByRubric(maDk, planIid, result).catch(err => {
        console.error("[getUserScoreByRubric] Local Cache Backup Failed:", err.message);
      });
    }

    return result;
  } catch (error) {
    console.warn(`[getUserScoreByRubric] API failed: ${error.message}. Checking local backup fallback...`);
    if (maDk) {
      const backupRepository = require("../repositories/backup.repository");
      const cached = await backupRepository.getScoreByRubric({ ma_dk: maDk, enrolment_plan_iid: planIid });
      if (cached && cached.length > 0) {
        const r = cached[0];
        try {
          const scoreByRubrikArray = r.score_by_rubrik ? JSON.parse(r.score_by_rubrik) : [];
          return {
            success: true,
            result: {
              iid: Number(r.rubric_iid),
              rubric: {
                iid: Number(r.rubric_iid),
                name: r.rubric_name,
              },
              score: r.score,
              cp: r.cp,
              passed: r.passed,
              score_by_rubrik: scoreByRubrikArray,
            },
            _is_backup: true
          };
        } catch (err) {
          console.error("[getUserScoreByRubric] Failed to parse cached score_by_rubrik inside fallback:", err.message);
        }
      }
      const cachedLegacy = await backupRepository.getHocVienHocTap(maDk);
      if (cachedLegacy && cachedLegacy.score_by_rubrik) {
        try {
          const scoreData = JSON.parse(cachedLegacy.score_by_rubrik);
          if (Array.isArray(scoreData)) {
            return {
              success: true,
              score_by_rubrik: scoreData,
              _is_backup: true
            };
          } else {
            return {
              ...scoreData,
              _is_backup: true
            };
          }
        } catch (err) {
          console.error("[getUserScoreByRubric] Failed to parse cached score_by_rubrik inside fallback:", err.message);
        }
      }
    }
    throw error;
  }
}

/**
 * Helper to fetch a single camera snapshot from Lotus API
 */
async function fetchCameraSnapshotSingle(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id' && key !== 'from_backup') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/camera-snapshot/api/view?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  const response = await axios.post(url, formData);
  return response.data;
}

/**
 * Lấy danh sách ảnh chụp camera của học viên
 */
async function getCameraSnapshot(params, authInfo) {
  const maDk = params.ma_dk || params.student_id || params.user_iid || params.code || "";
  const planIid = params.enrolment_plan_iid || params.course_id || params.plan_iid || null;
  const isForceBackup = params.from_backup === true || params.from_backup === "true";

  // 1. Check if backup only query is requested
  if (isForceBackup && maDk) {
    const backupRepository = require("../repositories/backup.repository");
    const localData = await backupRepository.getCameraSnapshots({ ma_dk: maDk, enrolment_plan_iid: planIid });
    return {
      success: true,
      result: localData.map(r => ({
        id: r.lotus_snapshot_id,
        image_url: r.image_url,
        url: r.image_url,
        captured_at: r.captured_at,
        verify_status: r.verify_status,
      })),
      _is_backup: true
    };
  }

  try {
    const itemIid = params.item_iid || params.course_item_iid || null;
    let result;
    let allSnapshots = [];
    let studentInfo = null;

    if (itemIid) {
      // Fetch for a single specific item
      result = await fetchCameraSnapshotSingle(params, authInfo);
      if (result?.success) {
        allSnapshots = result?.result?.snapshots || (Array.isArray(result?.result) ? result.result : []);
        studentInfo = result?.result?.u || null;
      }
    } else {
      // No item_iid specified: Fetch all items first, then fetch snapshots for each
      let items = [];
      let progressCourses = [];
      try {
        // Query progress outline courses to ensure we capture all course item IDs
        const progressRes = await getStudentProgressInEnrolmentPlan({
          ma_dk: maDk,
          student_id: params.student_id || params.user_iid,
          user_iid: params.user_iid || params.student_id,
          enrolment_plan_iid: planIid
        }, authInfo);
        progressCourses = Array.isArray(progressRes) ? progressRes : (progressRes?.result || []);
      } catch (err) {
        console.warn(`[getCameraSnapshot] Failed to fetch progress outline: ${err.message}`);
      }

      try {
        const trackingRes = await getLearningTimeTracking({
          ma_dk: maDk,
          student_id: params.student_id || params.user_iid,
          user_iid: params.user_iid || params.student_id,
          enrolment_plan_iid: planIid,
          items_per_page: 1000
        }, authInfo);
        items = trackingRes?.result || [];
      } catch (err) {
        console.warn(`[getCameraSnapshot] Failed to fetch learning items for snapshots: ${err.message}. Trying backup...`);
        const backupRepository = require("../repositories/backup.repository");
        items = await backupRepository.getLearningTimeTracking({ ma_dk: maDk, enrolment_plan_iid: planIid });
      }

      const itemIidsSet = new Set();
      
      // Extract from progress outline
      if (Array.isArray(progressCourses)) {
        progressCourses.forEach(c => {
          if (c.iid) itemIidsSet.add(String(c.iid));
          if (c.id && !String(c.id).startsWith("date")) itemIidsSet.add(String(c.id));
        });
      }

      // Extract from tracking items
      items.forEach(item => {
        if (item.item_iid) itemIidsSet.add(String(item.item_iid));
        if (item.course_item_iid) itemIidsSet.add(String(item.course_item_iid));
        if (item.iid) itemIidsSet.add(String(item.iid));
        if (item.id && !String(item.id).startsWith("date")) itemIidsSet.add(String(item.id));
        if (Array.isArray(item.course_iids)) {
          item.course_iids.forEach(cid => {
            if (cid) itemIidsSet.add(String(cid));
          });
        }
      });
      const itemIids = Array.from(itemIidsSet).filter(Boolean);

      if (itemIids.length === 0) {
        // Fallback to fetching default snapshot without item_iid
        result = await fetchCameraSnapshotSingle(params, authInfo);
        if (result?.success) {
          allSnapshots = result?.result?.snapshots || (Array.isArray(result?.result) ? result.result : []);
          studentInfo = result?.result?.u || null;
        }
      } else {
        // Fetch snapshots for each item concurrently
        console.log(`[studentDetailService] getCameraSnapshot fetching snapshots for ${itemIids.length} items...`);
        const fetchPromises = itemIids.map(async (id) => {
          try {
            const singleParams = { ...params, item_iid: id };
            const singleRes = await fetchCameraSnapshotSingle(singleParams, authInfo);
            return singleRes;
          } catch (err) {
            console.error(`[getCameraSnapshot] Failed to fetch snapshots for item ${id}:`, err.message);
            return null;
          }
        });

        const responses = await Promise.all(fetchPromises);
        
        // Merge snapshots
        const seenIds = new Set();
        responses.forEach((res) => {
          if (res?.success) {
            if (res.result?.u && !studentInfo) {
              studentInfo = res.result.u;
            }
            const snapshots = res.result?.snapshots || (Array.isArray(res.result) ? res.result : []);
            snapshots.forEach((snap) => {
              const snapId = snap.id || snap.iid || snap.file?.id;
              if (snapId && !seenIds.has(snapId)) {
                seenIds.add(snapId);
                allSnapshots.push(snap);
              }
            });
          }
        });

        // Construct standard response
        result = {
          success: true,
          result: {
            dmn: "lapphuongthanh",
            school: "lapphuongthanh",
            u: studentInfo,
            snapshots: allSnapshots
          }
        };
      }
    }

    // Trigger local backup if snapshots are found
    if (maDk && allSnapshots.length > 0) {
      const backupService = require("./backup.service");
      backupService.backupCameraSnapshots(maDk, planIid, allSnapshots).catch(err => {
        console.error("[getCameraSnapshot] Local Cache Backup Failed:", err.message);
      });
    }

    return result;
  } catch (error) {
    console.warn(`[getCameraSnapshot] API failed: ${error.message}. Checking local backup fallback...`);
    if (maDk) {
      const backupRepository = require("../repositories/backup.repository");
      const localData = await backupRepository.getCameraSnapshots({ ma_dk: maDk, enrolment_plan_iid: planIid });
      if (localData && localData.length > 0) {
        return {
          success: true,
          result: localData.map(r => ({
            id: r.lotus_snapshot_id,
            image_url: r.image_url,
            url: r.image_url,
            captured_at: r.captured_at,
            verify_status: r.verify_status,
          })),
          _is_backup: true
        };
      }
    }
    throw error;
  }
}

/**
 * Lấy danh sách lịch sử học tập (Time Tracking)
 */
async function getTimeTrackingLog(params, authInfo) {
  const maDk = params.ma_dk || params.student_id || params.user_iid || params.code || "";
  const planIid = params.enrolment_plan_iid || params.course_id || params.plan_iid || null;
  const isForceBackup = params.from_backup === true || params.from_backup === "true";

  // 1. Check if backup only query is requested
  if (isForceBackup && maDk) {
    const backupRepository = require("../repositories/backup.repository");
    const localData = await backupRepository.getTimeTrackingLogs({ ma_dk: maDk, enrolment_plan_iid: planIid });
    return {
      success: true,
      result: localData.map(r => ({
        id: r.lotus_log_id,
        log_id: r.lotus_log_id,
        item_iid: r.item_iid,
        item_name: r.item_name,
        start_time: r.start_time,
        end_time: r.end_time,
        duration: r.duration,
        device: r.device,
        ip_address: r.ip_address,
      })),
      _is_backup: true
    };
  }

  // Set default items_per_page to 1000 to prevent pagination truncation of time tracking logs
  const apiParams = { items_per_page: 1000, ...params };

  const queryParams = new URLSearchParams();
  Object.keys(apiParams).forEach(key => {
    if (key !== '_sand_session_id' && key !== 'from_backup') {
      queryParams.append(key, apiParams[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/time-tracking/course-time-tracking/log-search?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  try {
    const response = await axios.post(url, formData);
    const result = response.data;

    // Asynchronously trigger local database cache backup
    const list = Array.isArray(result) ? result : (result?.result || []);
    if (maDk && list.length > 0) {
      const backupService = require("./backup.service");
      backupService.backupTimeTrackingLogs(maDk, planIid, list).catch(err => {
        console.error("[getTimeTrackingLog] Local Cache Backup Failed:", err.message);
      });
    }

    return result;
  } catch (error) {
    console.warn(`[getTimeTrackingLog] API failed: ${error.message}. Checking local backup fallback...`);
    if (maDk) {
      const backupRepository = require("../repositories/backup.repository");
      const localData = await backupRepository.getTimeTrackingLogs({ ma_dk: maDk, enrolment_plan_iid: planIid });
      if (localData && localData.length > 0) {
        return {
          success: true,
          result: localData.map(r => ({
            id: r.lotus_log_id,
            log_id: r.lotus_log_id,
            item_iid: r.item_iid,
            item_name: r.item_name,
            start_time: r.start_time,
            end_time: r.end_time,
            duration: r.duration,
            device: r.device,
            ip_address: r.ip_address,
          })),
          _is_backup: true
        };
      }
    }
    throw error;
  }
}

/**
 * Lấy lịch sử thời gian học tập (Learning Time Tracking)
 */
async function getLearningTimeTracking(params, authInfo) {
  const maDk = params.ma_dk || params.student_id || params.user_iid || params.code || "";
  const planIid = params.enrolment_plan_iid || params.course_id || params.plan_iid || null;
  const isForceBackup = params.from_backup === true || params.from_backup === "true";

  // 1. Check if backup only query is requested
  if (isForceBackup && maDk) {
    const backupRepository = require("../repositories/backup.repository");
    const localData = await backupRepository.getLearningTimeTracking({ ma_dk: maDk, enrolment_plan_iid: planIid });
    return {
      success: true,
      result: localData.map(r => ({
        item_iid: r.item_iid,
        item_name: r.item_name,
        total_time: r.total_time,
        progress: r.progress ? parseFloat(r.progress) : 0,
        last_learned_at: r.last_learned_at,
      })),
      _is_backup: true
    };
  }

  // Set default items_per_page to 1000 to prevent pagination truncation of learning time logs
  const apiParams = { items_per_page: 1000, ...params };

  const queryParams = new URLSearchParams();
  Object.keys(apiParams).forEach((key) => {
    if (key !== "_sand_session_id" && key !== "from_backup") {
      queryParams.append(key, apiParams[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/time-tracking/learning-time-tracking/search?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  try {
    const response = await axios.post(url, formData);
    const result = response.data;

    // Asynchronously trigger local database cache backup
    const list = Array.isArray(result) ? result : (result?.result || []);
    list.sort((a, b) => {
      const ta = a.date || a.last_learned_at || 0;
      const tb = b.date || b.last_learned_at || 0;
      return ta - tb;
    });

    if (maDk && list.length > 0) {
      const backupService = require("./backup.service");
      backupService.backupLearningTimeTracking(maDk, planIid, list).catch(err => {
        console.error("[getLearningTimeTracking] Local Cache Backup Failed:", err.message);
      });
    }

    return result;
  } catch (error) {
    console.warn(`[getLearningTimeTracking] API failed: ${error.message}. Checking local backup fallback...`);
    if (maDk) {
      const backupRepository = require("../repositories/backup.repository");
      const localData = await backupRepository.getLearningTimeTracking({ ma_dk: maDk, enrolment_plan_iid: planIid });
      if (localData && localData.length > 0) {
        return {
          success: true,
          result: localData.map(r => ({
            item_iid: r.item_iid,
            item_name: r.item_name,
            total_time: r.total_time,
            progress: r.progress ? parseFloat(r.progress) : 0,
            last_learned_at: r.last_learned_at,
          })),
          _is_backup: true
        };
      }
    }
    throw error;
  }
}

/**
 * Lấy chi tiết thời gian học tập của một môn (Video/Document/...)
 */
async function getDetailLearningTime(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    if (key !== "_sand_session_id") {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/time-tracking/course-time-tracking/get-detail-learning-time?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid || authInfo.uiid);
  formData.append("_sand_ri", sand_ri);
  formData.append("_sand_rit", sand_rit);
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  const response = await axios.post(url, formData);
  return response.data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getRandomDelay = () => Math.floor(Math.random() * 60000) + 60000; // sleep 60s to 120s (1 to 2 minutes)

/**
 * Chạy tiến độ đồng bộ ngầm hàng loạt (Batch background sync)
 */
async function startBatchSync(plans) {
  console.log(`[BatchSync] Starting background batch sync for ${plans.length} plans...`);
  
  const { callWithRetry } = require("./lotusApi.service");
  const lotusApiService = require("./lotusApi.service");

  try {
    await callWithRetry(async (authInfo) => {
      for (let pIndex = 0; pIndex < plans.length; pIndex++) {
        const plan = plans[pIndex];
        const planIid = plan.enrolment_plan_iid;
        if (!planIid) continue;

        console.log(`[BatchSync] [Plan ${pIndex + 1}/${plans.length}] Fetching course students for plan: ${planIid}...`);
        
        // 1. Fetch student list with progress & rubric scores from Lotus (1 API call)
        let studentsResponse;
        try {
          studentsResponse = await lotusApiService.getHocVienTheoKhoa(planIid, { items_per_page: 500 }, authInfo);
        } catch (err) {
          console.error(`[BatchSync] Failed to fetch students for plan ${planIid}:`, err.message);
          continue;
        }

        const students = studentsResponse?.result || [];
        console.log(`[BatchSync] Found ${students.length} students in plan ${planIid}. Starting safe sequential crawl...`);

        // 2. Loop sequentially through each student
        for (let sIndex = 0; sIndex < students.length; sIndex++) {
          const student = students[sIndex];
          const user = student?.user || {};
          const maDk = user.admission_code || user.code || student.id || "";
          const studentId = user.iid || student.id || "";
          
          if (!maDk) continue;

          console.log(`[BatchSync] [Plan ${pIndex + 1}/${plans.length}] [Student ${sIndex + 1}/${students.length}] Syncing detail logs for student: ${maDk}...`);

          const params = {
            ma_dk: maDk,
            student_id: studentId,
            user_iid: studentId,
            enrolment_plan_iid: planIid
          };

          // --- API Call 1: Camera Snapshot ---
          try {
            console.log(`[BatchSync] Calling camera-snapshot for student: ${maDk}...`);
            await getCameraSnapshot(params, authInfo);
          } catch (err) {
            console.error(`[BatchSync] Camera snapshot failed for student ${maDk}:`, err.message);
          }

          // Safe Sleep: 5s - 10s
          let delay = getRandomDelay();
          console.log(`[BatchSync] Sleeping for ${(delay / 1000).toFixed(1)}s...`);
          await sleep(delay);

          // --- API Call 2: Time Tracking Log ---
          try {
            console.log(`[BatchSync] Calling time-tracking for student: ${maDk}...`);
            await getTimeTrackingLog(params, authInfo);
          } catch (err) {
            console.error(`[BatchSync] Time tracking failed for student ${maDk}:`, err.message);
          }

          // Safe Sleep: 5s - 10s
          delay = getRandomDelay();
          console.log(`[BatchSync] Sleeping for ${(delay / 1000).toFixed(1)}s...`);
          await sleep(delay);

          // --- API Call 3: Learning Time Tracking ---
          try {
            console.log(`[BatchSync] Calling learning-time for student: ${maDk}...`);
            await getLearningTimeTracking(params, authInfo);
          } catch (err) {
            console.error(`[BatchSync] Learning time failed for student ${maDk}:`, err.message);
          }

          // Safe Sleep: 5s - 10s
          delay = getRandomDelay();
          console.log(`[BatchSync] Sleeping for ${(delay / 1000).toFixed(1)}s...`);
          await sleep(delay);

          // --- API Call 4: Detailed Completion Progress (/tien-do-hoan-thanh) ---
          try {
            console.log(`[BatchSync] Calling progress for student: ${maDk}...`);
            await getStudentProgressInEnrolmentPlan(params, authInfo);
          } catch (err) {
            console.error(`[BatchSync] Progress API failed for student ${maDk}:`, err.message);
          }

          // Safe Sleep: 5s - 10s
          delay = getRandomDelay();
          console.log(`[BatchSync] Sleeping for ${(delay / 1000).toFixed(1)}s...`);
          await sleep(delay);

          // --- API Call 5: Detailed Rubric Score (/score-by-rubric) ---
          try {
            console.log(`[BatchSync] Calling score-by-rubric for student: ${maDk}...`);
            await getUserScoreByRubric(params, authInfo);
          } catch (err) {
            console.error(`[BatchSync] Rubric API failed for student ${maDk}:`, err.message);
          }

          // Safe Sleep before moving to the next student: 5s - 10s
          delay = getRandomDelay();
          console.log(`[BatchSync] Student done. Sleeping ${(delay / 1000).toFixed(1)}s before next student...`);
          await sleep(delay);
        }

        // Safe Sleep before moving to the next plan: 2s - 3 minutes
        const planDelay = Math.floor(Math.random() * 60000) + 120000;
        console.log(`[BatchSync] Plan done. Sleeping ${(planDelay / 1000).toFixed(1)}s before next plan...`);
        await sleep(planDelay);
      }
    });

    console.log("[BatchSync] Batch synchronization completed successfully.");
  } catch (error) {
    console.error("[BatchSync] Failed to process batch sync:", error.message);
  }
}

module.exports = {
  getStudentProgressInEnrolmentPlan,
  getUserScoreByRubric,
  getCameraSnapshot,
  getTimeTrackingLog,
  getLearningTimeTracking,
  getDetailLearningTime,
  startBatchSync,
};
