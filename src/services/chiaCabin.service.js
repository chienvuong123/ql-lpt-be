const axios = require("axios");

const API_LOC_DU_DIEU_KIEN_URL =
  "http://192.168.1.69:8000/api/hoc-vien-lop-ly-thuyet";
const API_KET_QUA_HOC_TAP_BASE =
  "https://lapphuongthanh.io.vn/api/thongtintap/danh-sach";
const API_GIAO_VIEN_XE_URL = "http://192.168.1.69:8000/api/check-data-student/";

const PREFIX_KHOA = "30004";

// ── Điều kiện 8 bài bắt buộc ────────────────────────────
const DIEU_KIEN_BAI = [
  { keywords: ["đô thị"], min_phut: 3, so_lan_min: 1 },
  { keywords: ["cao tốc"], min_phut: 35, so_lan_min: 1 },
  { keywords: ["đồi núi"], min_phut: 10, so_lan_min: 1 },
  { keywords: ["phà"], min_phut: 3, so_lan_min: 1 },
  { keywords: ["lầy"], min_phut: 3, so_lan_min: 1 },
  { keywords: ["sương mù"], min_phut: 3, so_lan_min: 1 },
  { keywords: ["ngập nước", "ngầm", "nước"], min_phut: 3, so_lan_min: 1 },
  { keywords: ["tổng hợp"], min_phut: 5, so_lan_min: 1 },
];

const TONG_PHUT_MIN = 150;

// ── Entry point ──────────────────────────────────────────
async function buildCabinSchedule(filters = {}) {
  const { khoa, hoTen, trangThai } = filters;

  // Bước 1: Song song API lọc điều kiện + API giáo viên/xe
  const [duDieuKien, dsGiaoVienXe] = await Promise.all([
    fetchHocVienDuDieuKien(),
    fetchToanBoGiaoVienVaXe(),
  ]);

  if (duDieuKien.length === 0) return [];

  // Bước 2: Lọc theo khóa và tên trước khi gọi API kết quả
  //         → giảm số học viên cần xử lý, giảm số khóa cần gọi API 2
  let ds = duDieuKien;

  if (khoa) {
    ds = ds.filter((hv) => hv.ma_khoa === khoa);
  }

  if (hoTen) {
    const keyword = hoTen.toLowerCase().trim();
    ds = ds.filter((hv) => (hv.ho_ten || "").toLowerCase().includes(keyword));
  }

  if (ds.length === 0) return [];

  const maDkList = ds.map((hv) => hv.ma_dk);
  const giaoVienXeMap = buildGiaoVienXeMap(dsGiaoVienXe);

  // Bước 3: Extract khóa unique → gọi API kết quả học tập
  const khoaList = [
    ...new Set(
      maDkList
        .map((madk) => giaoVienXeMap[madk]?.khoaHoc)
        .filter(Boolean)
        .map((k) => `${PREFIX_KHOA}${k}`),
    ),
  ];

  const dsKetQuaHocTap = await fetchKetQuaHocTap(khoaList);
  const ketQuaHocTapMap = buildKetQuaHocTapMap(dsKetQuaHocTap, maDkList);

  // Bước 4: Merge + kiểm tra đủ điều kiện 8 bài
  let result = ds
    .map((hv) => mergeHocVien(hv, giaoVienXeMap, ketQuaHocTapMap))
    .filter((hv) => !hv._da_hoan_thanh); // loại khỏi danh sách nếu đã đủ điều kiện

  // Bước 5: Lọc theo trạng thái thời gian học
  if (trangThai === true) {
    result = result.filter((hv) => hv.tong_thoi_gian_phut === 0);
  } else if (trangThai === false) {
    result = result.filter((hv) => hv.tong_thoi_gian_phut > 0);
  }

  // Bỏ field nội bộ trước khi trả về
  return result.map(({ _da_hoan_thanh, ...hv }) => hv);
}

// ── Fetchers ─────────────────────────────────────────────

async function fetchHocVienDuDieuKien() {
  const { data } = await axios.get(API_LOC_DU_DIEU_KIEN_URL, {
    timeout: 10000,
  });
  return (data.data || []).filter((hv) => hv.dat_cabin === true);
}

async function fetchToanBoGiaoVienVaXe() {
  const { data } = await axios.get(API_GIAO_VIEN_XE_URL, { timeout: 10000 });
  return data.data || [];
}

async function fetchKetQuaHocTap(khoaList) {
  const requests = khoaList.map((khoa) =>
    axios
      .get(API_KET_QUA_HOC_TAP_BASE, { params: { khoa }, timeout: 10000 })
      .then((r) => r.data.data || [])
      .catch(() => []),
  );
  const results = await Promise.all(requests);
  return results.flat();
}

// ── Builders ─────────────────────────────────────────────

function buildGiaoVienXeMap(dsGiaoVienXe) {
  return dsGiaoVienXe.reduce((map, hv) => {
    if (hv.maDangKy) map[hv.maDangKy] = hv;
    return map;
  }, {});
}

function buildKetQuaHocTapMap(dsKetQua, maDkFilter) {
  const filterSet = new Set(maDkFilter);
  return dsKetQua.reduce((map, row) => {
    const madk = row.MaDK || row.ID_HocVien;
    if (!madk || !filterSet.has(madk)) return map;
    if (!map[madk]) map[madk] = [];
    map[madk].push(row);
    return map;
  }, {});
}

// ── Kiểm tra đủ điều kiện 8 bài ─────────────────────────
function kiemTraDuDieuKienBai(baiHocSummary, tongPhut) {
  // Chưa đủ tổng thời gian
  if (tongPhut < TONG_PHUT_MIN) return false;

  // Kiểm tra từng bài trong DIEU_KIEN_BAI
  for (const dieuKien of DIEU_KIEN_BAI) {
    // Tìm bài học khớp với keywords (không phân biệt hoa thường)
    const baiKhop = baiHocSummary.find((b) =>
      dieuKien.keywords.some((kw) =>
        b.ten_bai.toLowerCase().includes(kw.toLowerCase()),
      ),
    );

    if (!baiKhop) return false; // chưa học bài này

    // Kiểm tra thời gian tối thiểu
    if (baiKhop.tong_phut < dieuKien.min_phut) return false;

    // Kiểm tra số lần tối thiểu (quan trọng với bài cao tốc)
    if (baiKhop.so_lan < dieuKien.so_lan_min) return false;
  }

  return true;
}

// ── Merge 1 học viên ─────────────────────────────────────
function mergeHocVien(hv, giaoVienXeMap, ketQuaHocTapMap) {
  const giaoVienXe = giaoVienXeMap[hv.ma_dk] || {};
  const baiHocRaw = ketQuaHocTapMap[hv.ma_dk] || [];
  const baiHocSummary = aggregateBaiHoc(baiHocRaw);
  const tongPhut = baiHocSummary.reduce((s, b) => s + b.tong_phut, 0);
  const daHoanThanh = kiemTraDuDieuKienBai(baiHocSummary, tongPhut);

  return {
    ma_dk: hv.ma_dk,
    ma_khoa: hv.ma_khoa,

    ho_ten: hv.ho_ten || giaoVienXe.hoVaTen || null,
    cccd: hv.cccd || giaoVienXe.soCMND || null,
    nam_sinh:
      hv.nam_sinh ||
      (giaoVienXe.ngaySinh
        ? new Date(giaoVienXe.ngaySinh).getFullYear()
        : null),
    gioi_tinh: giaoVienXe.gioiTinh || null,

    khoa_hoc: giaoVienXe.khoaHoc || null,
    ma_khoa_api: giaoVienXe.khoaHoc
      ? `${PREFIX_KHOA}${giaoVienXe.khoaHoc}`
      : null,

    giao_vien: giaoVienXe.giaoVien || null,
    xe_b1: giaoVienXe.xeB1 || null,
    xe_b2: giaoVienXe.xeB2 || null,

    bai_cabin: baiHocSummary.length,
    tong_so_luot_tap: baiHocRaw.length,
    phut_cabin: tongPhut > 0 ? tongPhut : null,
    bai_hoc: baiHocSummary,

    dat_cabin: hv.dat_cabin,
    loai_ly_thuyet: hv.loai_ly_thuyet,
    loai_het_mon: hv.loai_het_mon,
    ghi_chu: hv.ghi_chu || "",
    cap_nhat_luc: hv.status_updated_at_local || null,

    _da_hoan_thanh: daHoanThanh, // dùng nội bộ để filter, bỏ trước khi trả về
  };
}

// ── Aggregate bài học ────────────────────────────────────
function aggregateBaiHoc(rows) {
  const baiMap = rows.reduce((map, r) => {
    const ten = r.Name || "Không rõ";
    if (!map[ten]) map[ten] = { ten_bai: ten, tong_giay: 0, so_lan: 0 };
    map[ten].tong_giay += r.TongThoiGian || 0;
    map[ten].so_lan += 1;
    return map;
  }, {});

  return Object.values(baiMap).map((b) => ({
    ten_bai: b.ten_bai,
    so_lan: b.so_lan,
    tong_phut: Math.round(b.tong_giay / 60),
  }));
}

module.exports = { buildCabinSchedule };
