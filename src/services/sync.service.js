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

async function getTienDoDaoTaoListPaginated(filters) {
  return await SyncModel.getTienDoDaoTaoListPaginated(filters);
}

async function getKhoaHocList(filters = {}) {
  return await SyncModel.getKhoaHocList(filters);
}

async function getHocVienSearch(filters) {
  return await SyncModel.getHocVienSearch(filters);
}

async function kiemTraDongBo(ma_khoa) {
  if (!ma_khoa) {
    return [];
  }

  // 1. Get all students of this course from the local database
  const students = await SyncModel.getHocVienByKhoa(ma_khoa);
  if (students.length === 0) {
    return [];
  }

  // 2. Fetch session data for the course code from external Cabin API
  let clean = String(ma_khoa).trim();
  if (!clean.startsWith("30004")) {
    clean = "30004" + clean;
  }

  let list = [];
  try {
    let response = await cabinApiService.getDanhSachKetQuaCabin({ khoa: clean });
    list = response?.data || [];

    // Fallback: if 30004 prefix yields 0 sessions, try raw course code
    if (list.length === 0 && clean !== ma_khoa) {
      response = await cabinApiService.getDanhSachKetQuaCabin({ khoa: ma_khoa });
      list = response?.data || [];
    }
  } catch (err) {
    console.error(`[SyncService] Lỗi lấy kết quả Cabin cho khoa ${ma_khoa}:`, err.message);
  }

  const map = cabinApiService.buildCabinMap(list);

  // 3. Match each student from the local database against the Cabin map
  return students.map((std) => {
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
      khoa: ma_khoa,
      ho_ten,
      cccd,
      tong_phut,
      so_bai_hoc,
      trang_thai,
      giao_vien: std.giao_vien || null,
      xe_b1: std.xe_b1 || null,
      xe_b2: std.xe_b2 || null
    };
  });
}

async function importXml(xmlBuffer, created_by = null, updated_by = null) {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const xmlStr = xmlBuffer.toString("utf-8");
  const parsed = await parser.parseStringPromise(xmlStr);

  const kh = parsed?.BAO_CAO1?.DATA?.KHOA_HOC;
  if (!kh) {
    throw new Error("Không tìm thấy thông tin khóa học <KHOA_HOC> trong file XML.");
  }

  const course = {
    ma_khoa: kh.MA_KHOA_HOC,
    ten_khoa: kh.TEN_KHOA_HOC,
    ngay_bat_dau: kh.NGAY_KHAI_GIANG ? new Date(kh.NGAY_KHAI_GIANG) : null,
    ngay_ket_thuc: kh.NGAY_BE_GIANG ? new Date(kh.NGAY_BE_GIANG) : null,
    total_member: kh.SO_HOC_SINH ? parseInt(kh.SO_HOC_SINH, 10) : 0,
    ma_csdt: kh.MA_CSDT || "30004"
  };

  let rawStudents = parsed?.BAO_CAO1?.DATA?.NGUOI_LXS?.NGUOI_LX || [];
  if (!Array.isArray(rawStudents)) {
    rawStudents = [rawStudents];
  }

  const parseXmlDateString = (dateStr) => {
    if (!dateStr) return null;
    const cleaned = String(dateStr).trim();
    if (cleaned.length === 8) {
      const y = cleaned.substring(0, 4);
      const m = cleaned.substring(4, 6);
      const d = cleaned.substring(6, 8);
      return new Date(`${y}-${m}-${d}`);
    }
    const parsedDate = new Date(cleaned);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const { uploadBase64ToCloudinary } = require("./cloudinary.service");
  const students = [];

  for (const s of rawStudents) {
    if (!s || !s.MA_DK) continue;

    const sexRaw = String(s.GIOI_TINH || "").trim().toLowerCase();
    const gioi_tinh = (sexRaw === "m" || sexRaw === "nam" || sexRaw === "1") ? "Nam" : "Nữ";

    let imageUrl = null;
    const base64Str = s.HO_SO?.ANH_CHAN_DUNG;
    if (base64Str && typeof base64Str === "string" && base64Str.trim().length > 10) {
      try {
        const publicId = `${course.ma_khoa}_${s.MA_DK}`;
        imageUrl = await uploadBase64ToCloudinary(base64Str, publicId);
      } catch (err) {
        console.error(`[importXml] Lỗi upload ảnh Cloudinary cho học viên ${s.MA_DK}:`, err.message);
      }
    }

    students.push({
      ma_dk: s.MA_DK,
      ho_ten: s.HO_VA_TEN || null,
      ho: s.HO_TEN_DEM || null,
      ten: s.TEN || null,
      cccd: s.SO_CMT || null,
      ngay_sinh: parseXmlDateString(s.NGAY_SINH),
      gioi_tinh: gioi_tinh,
      hang_gplx: s.HO_SO?.HANG_GPLX || null,
      hang: s.HO_SO?.HANG_DAOTAO || null,
      dia_chi: typeof s.NOI_TT === "object" ? "" : (s.NOI_TT || ""),
      ma_csdt: course.ma_csdt,
      anh: imageUrl
    });
  }

  return await SyncModel.importXmlData(course, students, created_by, updated_by);
}

module.exports = {
  syncCourses,
  syncStudents,
  upsertTienDoDaoTao,
  getTienDoDaoTaoList,
  getTienDoDaoTaoListPaginated,
  getKhoaHocList,
  getHocVienSearch,
  kiemTraDongBo,
  importXml
};
