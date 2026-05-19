const cabinModel = require("../repositories/cabin.repository");
const cabinApiService = require("./cabinApi.service");

const cabinApiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const normalizeMaDk = (val) => String(val || "").replace(/[^\d]/g, "");

const isMaDkMatch = (val1, val2) => {
  if (!val1 || !val2) return false;
  return normalizeMaDk(val1) === normalizeMaDk(val2);
};

const fetchSessionResults = async (khoas) => {
  const now = Date.now();
  return Promise.all(
    khoas.map(async (k) => {
      const cached = cabinApiCache.get(k);
      if (cached && now - cached.timestamp < CACHE_TTL) return cached.data;

      try {
        const r = await cabinApiService.getDanhSachKetQuaCabin({ khoa: k });
        const data = r?.data || [];
        cabinApiCache.set(k, { data, timestamp: Date.now() });
        return data;
      } catch (err) {
        console.warn(`[getDanhSachCabinSQL] Lỗi gọi API khóa ${k}:`, err.message);
        return cached ? cached.data : [];
      }
    })
  );
};

const mapStudent = (s, cabinMap) => {
  const session = cabinMap[s.ma_dk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
  const tongPhut = Math.round(session.tong_thoi_gian / 60);

  return {
    ma_dk: s.ma_dk,
    ma_khoa: s.ma_khoa,
    khoa_hoc: s.ten_khoa,
    ho_ten: s.ho_ten,
    cccd: s.cccd,
    nam_sinh: s.ngay_sinh ? new Date(s.ngay_sinh).getFullYear() : null,
    gioi_tinh: s.gioi_tinh,
    hang_xe: s.ten_khoa?.match(/K\d+B01/i) ? "B1" : "B2",
    giao_vien: s.giao_vien,
    phut_cabin: tongPhut > 0 ? tongPhut : 0,
    tong_thoi_gian: session.tong_thoi_gian,
    so_bai_hoc: session.so_bai_hoc || 0,
    bai_hoc: session.bai_hoc || [],
    trang_thai_cabin: cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc),
    ket_thuc_cabin: s.ket_thuc_cabin,
    ma_khoa_api: s.code,
    so_lan_chia: s.so_lan_chia,
    is_makeup: s.is_makeup || false,
  };
};

const getDanhSachCabinSQL = async ({ khoa, hoTen }) => {
  const [regularStudents, makeupStudents] = await Promise.all([
    cabinModel.getCabinStudentListSQL({ maKhoa: khoa, hoTen }),
    cabinModel.getCabinMakeupStudentListSQL({ maKhoa: khoa, hoTen }),
  ]);

  const students = [...(regularStudents || []), ...(makeupStudents || [])];
  if (students.length === 0) return [];

  const uniqueKhoas = [...new Set(students.map((s) => s.ma_khoa))];
  const allSessionResults = await fetchSessionResults(uniqueKhoas);
  const cabinMap = cabinApiService.buildCabinMap(allSessionResults.flat());

  return students
    .map((s) => mapStudent(s, cabinMap))
    .filter((s) => {
      if (s.trang_thai_cabin === "dat") return false;
      return (s.phut_cabin <= 140) || (s.so_lan_chia >= 1 && !s.is_makeup);
    });
};

const getDanhSachVerification = async () => {
  const now = new Date();

  // Convert now to Vietnam timezone (UTC+7)
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = vnTime.getUTCFullYear();
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vnTime.getUTCDate()).padStart(2, "0");
  const hh = String(vnTime.getUTCHours()).padStart(2, "0");
  const min = String(vnTime.getUTCMinutes()).padStart(2, "0");

  const today = `${yyyy}-${mm}-${dd}`;
  const nowTime = `${hh}:${min}`;

  const assignments = await cabinModel.getAssignmentsForVerification({ today, nowTime });
  if (assignments.length === 0) {
    return { chua_co_thong_tin_hoc: [], da_hoc_chua_dat: [] };
  }

  // 1. Gặp tất cả các khóa của học viên được chia lịch để lấy kết quả từ API
  const uniqueKhoas = [...new Set(assignments.map((a) => a.ma_khoa).filter(Boolean))];

  // 2. Gọi API lấy kết quả tập cabin cho các khóa này
  const allSessionResults = await fetchSessionResults(uniqueKhoas);
  const cabinMap = cabinApiService.buildCabinMap(allSessionResults.flat());

  const chua_co_thong_tin_hoc = [];
  const da_hoc_chua_dat = [];
  const failedIds = [];

  assignments.forEach((asm) => {
    const studentMaDkFromApi = Object.keys(cabinMap).find((k) => isMaDkMatch(k, asm.ma_dk));
    const session = studentMaDkFromApi ? cabinMap[studentMaDkFromApi] : null;

    const mapped = {
      assignment_id: asm.assignment_id,
      ma_dk: asm.ma_dk,
      ngay: asm.ngay ? new Date(asm.ngay).toISOString().split('T')[0] : null,
      ca_hoc: asm.ca_hoc,
      cabin_so: asm.cabin_so,
      so_lan_chia: asm.so_lan_chia,
      so_lan_chia_moi: (asm.so_lan_chia || 0) + 1,
      is_makeup: asm.is_makeup,
      ma_khoa: asm.ma_khoa,
      giao_vien: asm.giao_vien || asm.gv_dang_ky,
      ho_ten: asm.ho_ten,
      cccd: asm.cccd,
      gioi_tinh: asm.gioi_tinh,
      phut_cabin: session ? Math.round(session.tong_thoi_gian / 60) : 0,
      so_bai_hoc: session ? session.so_bai_hoc : 0,
      trang_thai_cabin: session 
        ? cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc)
        : "chua_hoc"
    };

    if (!session || session.tong_thoi_gian === 0) {
      chua_co_thong_tin_hoc.push(mapped);
      failedIds.push(asm.assignment_id);
    } else if (mapped.trang_thai_cabin !== "dat") {
      da_hoc_chua_dat.push(mapped);
      failedIds.push(asm.assignment_id);
    }
  });

  if (failedIds.length > 0) {
    await cabinModel.incrementSoLanChiaBatch(failedIds);
  }

  return {
    chua_co_thong_tin_hoc,
    da_hoc_chua_dat
  };
};

module.exports = {
  getDanhSachCabinSQL,
  getDanhSachVerification,
};
