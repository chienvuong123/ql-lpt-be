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
 * Sync all members for one or more enrolment plans
 * @param {Number|Array} enrolmentPlanIids 
 */
async function syncStudents(enrolmentPlanIids) {
  const ids = Array.isArray(enrolmentPlanIids) ? enrolmentPlanIids : [enrolmentPlanIids];

  // 1. Fetch enrolment plan details to get the metadata for mapping
  const planResponse = await lotusApi.callWithRetry((auth) =>
    lotusApi.getLopHocLyThuyet({ items_per_page: 500 }, auth)
  );

  const allPlans = planResponse.result || [];

  const summary = {
    totalCourses: ids.length,
    success: 0,
    failed: 0,
    details: []
  };

  for (const iid of ids) {
    try {
      const plan = allPlans.find(p => p.iid == iid);

      if (!plan) {
        throw new Error(`Không tìm thấy khóa học với IID ${iid} trên Lotus LMS`);
      }

      // 2. Fetch all members for this plan
      const membersResponse = await lotusApi.callWithRetry((auth) =>
        lotusApi.getHocVienTheoKhoa(iid, { page: 1 }, auth)
      );

      const students = membersResponse.result || membersResponse.data || [];

      if (students.length > 0) {
        await SyncModel.upsertHocVien(students, plan);
      }

      summary.success++;
      summary.details.push({
        iid,
        ma_khoa: plan.code,
        ten_khoa: plan.name,
        count: students.length,
        status: 'success'
      });
    } catch (err) {
      console.error(`[Sync] Lỗi đồng bộ học viên cho IID ${iid}:`, err.message);
      summary.failed++;
      summary.details.push({
        iid,
        status: 'failed',
        error: err.message
      });
    }
  }

  return summary;
}

module.exports = {
  syncCourses,
  syncStudents
};
