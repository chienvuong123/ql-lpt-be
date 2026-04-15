const axios = require("axios");

const CABIN_BASE = "https://lapphuongthanh.io.vn/api/thongtintap";

async function getDanhSachKetQuaCabin({ khoa, hoTen = "" }) {
  const response = await axios.get(`${CABIN_BASE}/danh-sach`, {
    params: { khoa, hoTen },
  });
  return response.data;
}

// Build map: { maDk -> { tongThoiGian, soBaiHoc } }
function buildCabinMap(rawList) {
  const map = {};

  (Array.isArray(rawList) ? rawList : []).forEach((item) => {
    const maDk = item?.MaDK || item?.ID_HocVien;
    if (!maDk) return;

    if (!map[maDk]) {
      map[maDk] = {
        tongThoiGian: 0,
        baiTapMap: {}, // Để đếm số bài và tổng thời gian từng bài
      };
    }

    const duration = Number(item?.TongThoiGian || 0);
    map[maDk].tongThoiGian += duration;

    const tenBai = item?.Name || "Không rõ";
    if (!map[maDk].baiTapMap[tenBai]) {
      map[maDk].baiTapMap[tenBai] = 0;
    }
    map[maDk].baiTapMap[tenBai] += duration;
  });

  const result = {};
  Object.entries(map).forEach(([maDk, value]) => {
    const baiHoc = Object.entries(value.baiTapMap).map(([ten, giay]) => ({
      ten_bai: ten,
      tong_phut: Math.round(giay / 60),
    }));

    result[maDk] = {
      tong_thoi_gian: value.tongThoiGian,
      so_bai_hoc: baiHoc.length,
      bai_hoc: baiHoc,
    };
  });

  return result;
}

// Tính trạng thái cabin
function getCabinStatus(tongThoiGian, soBaiHoc) {
  if (!tongThoiGian && !soBaiHoc) return "chua_hoc";
  if (tongThoiGian >= 8400 && soBaiHoc >= 8) return "dat";
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
