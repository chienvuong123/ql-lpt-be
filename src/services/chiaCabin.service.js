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

const updatePastAssignments = async (students, cabinMap) => {
  const maDkList = students.map((s) => s.ma_dk);
  const pastAssignments = await cabinModel.getPastAssignments(maDkList);
  const missedIds = [];
  const missedMap = {};

  pastAssignments.forEach((asm) => {
    const studentMaDkFromApi = Object.keys(cabinMap).find((k) => isMaDkMatch(k, asm.ma_dk));
    const session = studentMaDkFromApi ? cabinMap[studentMaDkFromApi] : { tong_thoi_gian: 0, so_bai_hoc: 0 };
    const status = cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc);

    if (status !== "dat") {
      missedIds.push(asm.id);
      missedMap[asm.ma_dk] = 2;
    }
  });

  if (missedIds.length > 0) {
    await cabinModel.updateSoLanChiaBatch(missedIds, 2);
  }
  return missedMap;
};

const mapStudent = (s, cabinMap, missedMap) => {
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
    so_lan_chia: missedMap[s.ma_dk] || s.so_lan_chia || 0,
    is_makeup: s.is_makeup || false,
  };
};

const getDanhSachCabinSQL = async ({ khoa, hoTen }) => {
  const students = await cabinModel.getCabinStudentListSQL({ maKhoa: khoa, hoTen });
  if (!students || students.length === 0) return [];

  const uniqueKhoas = [...new Set(students.map((s) => s.ma_khoa))];
  const allSessionResults = await fetchSessionResults(uniqueKhoas);
  const cabinMap = cabinApiService.buildCabinMap(allSessionResults.flat());
  const missedMap = await updatePastAssignments(students, cabinMap);

  return students
    .map((s) => mapStudent(s, cabinMap, missedMap))
    .filter((s) => {
      if (s.trang_thai_cabin === "dat") return false;
      return (s.phut_cabin <= 140) || (s.so_lan_chia > 1 && !s.is_makeup);
    });
};

module.exports = {
  getDanhSachCabinSQL,
};
