const lotusApi = require("./lotusApi.service");
const SyncModel = require("../models/sync.model");
const cabinApiService = require("./cabinApi.service");

// Normalize registration codes to digits only for accurate matching
const normalizeMaDk = (val) => String(val || "").replace(/[^\d]/g, "");

const isMaDkMatch = (val1, val2) => {
  if (!val1 || !val2) return false;
  return normalizeMaDk(val1) === normalizeMaDk(val2);
};

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

async function kiemTraDongBo(students) {
  if (!Array.isArray(students) || students.length === 0) {
    return [];
  }

  // 1. Group unique clean course codes
  const uniqueKhoas = [...new Set(students.map(s => String(s.khoa || "").trim()).filter(Boolean))];
  
  // 2. Fetch session data for all unique courses in parallel
  const cabinMapsByKhoa = {};
  await Promise.all(
    uniqueKhoas.map(async (rawKhoa) => {
      let clean = rawKhoa;
      if (!clean.startsWith("30004")) {
        clean = "30004" + clean;
      }

      try {
        let response = await cabinApiService.getDanhSachKetQuaCabin({ khoa: clean });
        let list = response?.data || [];

        // Fallback: if 30004 prefix yields 0 sessions, try raw course code
        if (list.length === 0 && clean !== rawKhoa) {
          response = await cabinApiService.getDanhSachKetQuaCabin({ khoa: rawKhoa });
          list = response?.data || [];
        }

        const map = cabinApiService.buildCabinMap(list);
        cabinMapsByKhoa[rawKhoa] = map;
      } catch (err) {
        console.error(`[SyncService] Lỗi lấy kết quả Cabin cho khoa ${rawKhoa}:`, err.message);
        cabinMapsByKhoa[rawKhoa] = {};
      }
    })
  );

  // 3. Match each student in the list
  return students.map((std) => {
    const rawKhoa = String(std.khoa || "").trim();
    const map = cabinMapsByKhoa[rawKhoa] || {};
    
    // Find matching ma_dk in this course map
    const matchedKey = Object.keys(map).find(k => isMaDkMatch(k, std.ma_dk));
    const session = matchedKey ? map[matchedKey] : null;

    let tong_phut = 0;
    let so_bai_hoc = 0;
    let trang_thai = "truot";
    let ho_ten = std.ho_ten || null;
    let cccd = std.cccd || null;

    if (session) {
      tong_phut = Math.round(session.tong_thoi_gian / 60);
      so_bai_hoc = session.so_bai_hoc;
      const status = cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc);
      trang_thai = status === "dat" ? "dat" : "truot";
      if (session.ho_ten) ho_ten = session.ho_ten;
      if (session.cccd) cccd = session.cccd;
    }

    return {
      ma_dk: std.ma_dk,
      khoa: std.khoa,
      ho_ten,
      cccd,
      tong_phut,
      so_bai_hoc,
      trang_thai
    };
  });
}

module.exports = {
  syncCourses,
  syncStudents,
  upsertTienDoDaoTao,
  getTienDoDaoTaoList,
  getKhoaHocList,
  getHocVienSearch,
  kiemTraDongBo
};
