const axios = require("axios");

const LOTUS_BASE = "https://staging-api.lotuslms.com";

/**
 * Lấy tiến độ hoàn thành của học viên trong kế hoạch đào tạo (Sử dụng login của Hệ Thống)
 */
async function getStudentProgressInEnrolmentPlan(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    // Không dùng session_id từ query nếu đã có trong authInfo
    if (key !== '_sand_session_id') {
      queryParams.append(key, params[key]);
    }
  });

  // Luôn dùng authInfo từ hệ thống
  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/student/api/get-student-courses-in-enrolment-plan?${queryParams.toString()}`;

  const formData = new URLSearchParams();
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
 * Lấy điểm chi tiết theo rubric của học viên
 */
async function getUserScoreByRubric(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/rubrik/api/get-user-score-by-rubric?${queryParams.toString()}`;

  const formData = new URLSearchParams();
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
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/camera-snapshot/api/view?${queryParams.toString()}`;

  const formData = new URLSearchParams();
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
 * Lấy danh sách lịch sử học tập (Time Tracking)
 */
async function getTimeTrackingLog(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (key !== '_sand_session_id') {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/time-tracking/course-time-tracking/log-search?${queryParams.toString()}`;

  const formData = new URLSearchParams();
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
 * Lấy lịch sử thời gian học tập (Learning Time Tracking)
 */
async function getLearningTimeTracking(params, authInfo) {
  const queryParams = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    if (key !== "_sand_session_id") {
      queryParams.append(key, params[key]);
    }
  });

  queryParams.append("_sand_session_id", authInfo.sessionId);

  const url = `${LOTUS_BASE}/time-tracking/learning-time-tracking/search?${queryParams.toString()}`;

  const formData = new URLSearchParams();
  formData.append("_sand_token", authInfo.token);
  formData.append("_sand_uiid", authInfo.iid || authInfo.uiid);
  formData.append("_sand_uid", authInfo.id || authInfo.uid);
  formData.append("_sand_ajax", 1);
  formData.append("_sand_platform", 3);
  formData.append("_sand_domain", "lapphuongthanh");

  const response = await axios.post(url, formData);
  return response.data;
}

module.exports = {
  getStudentProgressInEnrolmentPlan,
  getUserScoreByRubric,
  getCameraSnapshot,
  getTimeTrackingLog,
  getLearningTimeTracking,
};
