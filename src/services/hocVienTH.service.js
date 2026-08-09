const axios = require("axios");
const { getDatNewToken, invalidateDatNewToken } = require("./datNewAuth.service");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";
const PAGE_LIMIT = 200;
const MAX_PAGES = 50;

// Danh sách khóa cố định cần lấy học viên (idkhoahoc + mã khóa hệ DAT tenant 31011)
const FIXED_COURSES = [
  { ID: 11352, Ten: "K26B016", MaKhoaHoc: "31011K26B016" },
  { ID: 11351, Ten: "K26B0117", MaKhoaHoc: "31011K26B0117" },
  { ID: 11350, Ten: "K26C1007", MaKhoaHoc: "31011K26C1007" },
  { ID: 11349, Ten: "K26B0116", MaKhoaHoc: "31011K26B0116" },
  { ID: 11348, Ten: "K26B0115", MaKhoaHoc: "31011K26B0115" },
  { ID: 11341, Ten: "K26C1006", MaKhoaHoc: "31011K26C1006" },
  { ID: 11340, Ten: "K26B0114", MaKhoaHoc: "31011K26B0114" },
  { ID: 11339, Ten: "K26B015", MaKhoaHoc: "31011K26B015" },
  { ID: 11338, Ten: "K26B0113", MaKhoaHoc: "31011K26B0113" },
  { ID: 11337, Ten: "K26C1005", MaKhoaHoc: "31011K26C1005" },
  { ID: 11336, Ten: "K26C1004", MaKhoaHoc: "31011K26C1004" },
  { ID: 11334, Ten: "K26B014", MaKhoaHoc: "31011K26B014" },
];

const hanhTrinhAxios = axios.create({ baseURL: HANH_TRINH_BASE, timeout: 20000 });

function formatNgaySinh(val) {
  if (!val) return null;
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
}

async function fetchHocVienTHPage(idKhoaHoc, page, token) {
  const res = await hanhTrinhAxios.get("/api/HocVienTH", {
    params: { idkhoahoc: idKhoaHoc, page, limit: PAGE_LIMIT },
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data?.Data || [];
}

// Lấy toàn bộ học viên (phân trang) của 1 khóa, tự đăng nhập lại nếu token hết hạn (401)
async function fetchHocVienTHByCourse(course) {
  let token = (await getDatNewToken())?.token;
  let all = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    let list;
    try {
      list = await fetchHocVienTHPage(course.ID, page, token);
    } catch (err) {
      if (err?.response?.status === 401) {
        invalidateDatNewToken();
        token = (await getDatNewToken())?.token;
        list = await fetchHocVienTHPage(course.ID, page, token);
      } else {
        throw err;
      }
    }

    all = all.concat(list);
    if (list.length < PAGE_LIMIT) break;
    page += 1;
  }

  return all.map((s) => ({
    ma_dk: s.MaDK || null,
    ten: s.HoTen || null,
    cccd: s.SoCMT || null,
    ngay_sinh: formatNgaySinh(s.NgaySinh),
    ma_khoa: course.MaKhoaHoc,
    ten_khoa: course.Ten,
  }));
}

// Lấy học viên (ma_dk, ten, cccd, ngay_sinh) của toàn bộ danh sách khóa cố định
async function getHocVienTHByFixedCourses() {
  const results = [];

  for (const course of FIXED_COURSES) {
    try {
      const students = await fetchHocVienTHByCourse(course);
      results.push(...students);
    } catch (err) {
      console.error(
        `[HocVienTH] Lỗi lấy học viên khóa ${course.MaKhoaHoc} (ID ${course.ID}):`,
        err.message
      );
    }
  }

  return results;
}

module.exports = { getHocVienTHByFixedCourses, FIXED_COURSES };
