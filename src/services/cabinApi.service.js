const axios = require("axios");

const CABIN_BASE = "https://lapphuongthanh.io.vn/api/thongtintap";

async function getDanhSachKetQuaCabin({ khoa, hoTen = "" }) {
  const response = await axios.get(`${CABIN_BASE}/danh-sach`, {
    params: { khoa, hoTen },
  });
  return response.data;
}

/**
 * Hàm tổng hợp dữ liệu Cabin dùng chung cho cả API Thống kê và Xử lý Học bù
 * @param {Array} rawList Mảng dữ liệu thô từ API ngoài
 */
function buildCabinMap(rawList) {
  const map = {};

  (Array.isArray(rawList) ? rawList : []).forEach((item) => {
    const maDk = item?.MaDK || item?.ID_HocVien;
    if (!maDk) return;

    if (!map[maDk]) {
      map[maDk] = {
        ma_dk: maDk,
        ho_ten: item.HoTen,
        cccd: item.SoCMT,
        ngay_sinh: item.NgaySinh,
        ma_khoa: item.Khoa,
        tong_thoi_gian: 0,
        baiTapMap: {}, // Để đếm số bài và tổng thời gian từng bài
      };
    }

    const duration = Number(item?.TongThoiGian || 0);
    map[maDk].tong_thoi_gian += duration;

    const tenBai = item?.Name || "Chưa xác định";
    if (!map[maDk].baiTapMap[tenBai]) {
      map[maDk].baiTapMap[tenBai] = 0;
    }
    map[maDk].baiTapMap[tenBai] += duration;
  });

  const result = {};
  Object.entries(map).forEach(([maDk, value]) => {
    const baiHoc = Object.entries(value.baiTapMap).map(([ten, giay]) => ({
      ten_bai: ten,
      tong_thoi_gian: giay,
      tong_phut: Math.round(giay / 60),
    }));

    result[maDk] = {
      ma_dk: value.ma_dk,
      ho_ten: value.ho_ten,
      cccd: value.cccd,
      ngay_sinh: value.ngay_sinh,
      ma_khoa: value.ma_khoa,
      tong_thoi_gian: value.tong_thoi_gian,
      tong_phut: Math.round(value.tong_thoi_gian / 60),
      so_bai_hoc: baiHoc.length,
      bai_hoc: baiHoc, // Dùng cho API thống kê
    };
  });

  return result;
}

/**
 * Tính trạng thái cabin dựa trên điều kiện mới: >= 150 phút và >= 8 bài
 */
function getCabinStatus(tongThoiGian, soBaiHoc) {
  if (!tongThoiGian && !soBaiHoc) return "chua_hoc";
  // 150 phút = 9000 giây
  if (tongThoiGian >= 9000 && soBaiHoc >= 8) return "dat";
  return "chua_dat";
}

async function getKetQuaTapByMaDk(maDk) {
  const response = await axios.get(CABIN_BASE, {
    params: { maDK: maDk },
  });
  return response.data;
}

module.exports = {
  getDanhSachKetQuaCabin,
  buildCabinMap,
  getCabinStatus,
  getKetQuaTapByMaDk,
};
