const lotusApi = require("./lotusApi.service");
const SyncModel = require("../models/sync.model");

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

async function syncStudents(enrolmentPlanIids) {
  const ids = Array.isArray(enrolmentPlanIids) ? enrolmentPlanIids : [enrolmentPlanIids];

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
        total_member: plan.__expand?.learning_stats?.total_member,
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

async function upsertTienDoDaoTao(data) {
  return await SyncModel.upsertTienDoDaoTao(data);
}

async function getTienDoDaoTaoList(filters) {
  return await SyncModel.getTienDoDaoTaoList(filters);
}

async function getKhoaHocList() {
  return await SyncModel.getKhoaHocList();
}

async function getHocVienSearch(filters) {
  return await SyncModel.getHocVienSearch(filters);
}

module.exports = {
  syncCourses,
  syncStudents,
  upsertTienDoDaoTao,
  getTienDoDaoTaoList,
  getKhoaHocList,
  getHocVienSearch
};
