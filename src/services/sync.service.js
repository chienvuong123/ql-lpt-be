const lotusApi = require("./lotusApi.service");
const SyncModel = require("../models/sync.model");

/**
 * Sync all enrolment plans (courses) from Lotus LMS to local DB
 */
async function syncCourses() {
  const response = await lotusApi.callWithRetry((auth) =>
    lotusApi.getLopHocLyThuyet({ items_per_page: 500 }, auth)
  );

  // Lotus search APIs usually return data in .result or .data array
  const courses = response.result || [];
  if (courses.length > 0) {
    await SyncModel.upsertKhoaHoc(courses);
  }
  return courses.length;
}

/**
 * Sync all members for a specific enrolment plan
 * @param {Number} enrolmentPlanIid 
 */
async function syncStudents(enrolmentPlanIid) {
  // 1. Fetch enrolment plan details to get the 'code' (ma_khoa)
  // We search for the specific plan by its IID
  const planResponse = await lotusApi.callWithRetry((auth) =>
    lotusApi.getLopHocLyThuyet({ items_per_page: 500 }, auth)
  );

  const plans = planResponse.result || [];
  const plan = plans.find(p => p.iid == enrolmentPlanIid);

  if (!plan) {
    throw new Error(`Không tìm thấy khóa học với IID ${enrolmentPlanIid} trên Lotus LMS`);
  }

  const ma_khoa = plan.code;

  // 2. Fetch all members for this plan
  // Note: pagination might be needed if > 150 members, 
  // but getHocVienTheoKhoa uses items_per_page: 150 by default in lotusApi.service.js
  const membersResponse = await lotusApi.callWithRetry((auth) =>
    lotusApi.getHocVienTheoKhoa(enrolmentPlanIid, { page: 1 }, auth)
  );

  const students = membersResponse.result || membersResponse.data || [];

  if (students.length > 0) {
    await SyncModel.upsertHocVien(students, plan);
  }

  return {
    ma_khoa,
    ten_khoa: plan.name,
    count: students.length
  };
}

module.exports = {
  syncCourses,
  syncStudents
};
