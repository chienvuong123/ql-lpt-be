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
      map[maDk] = { tongThoiGian: 0, baiTapSet: new Set() };
    }

    map[maDk].tongThoiGian += Number(item?.TongThoiGian || 0);

    if (item?.ID_BaiTap || item?.Name) {
      map[maDk].baiTapSet.add(item?.ID_BaiTap || item?.Name);
    }
  });

  const result = {};
  Object.entries(map).forEach(([maDk, value]) => {
    result[maDk] = {
      tong_thoi_gian: value.tongThoiGian,
      so_bai_hoc: value.baiTapSet.size,
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

module.exports = { getDanhSachKetQuaCabin, buildCabinMap, getCabinStatus };
