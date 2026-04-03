const express = require("express");
const axios = require("axios");
const router = express.Router();

const API1_URL = "http://192.168.1.69:8000/api/hoc-vien-lop-ly-thuyet";
const API2_BASE = "https://lapphuongthanh.io.vn/api/thongtintap/danh-sach";
const API3_URL = "http://192.168.1.69:8000/api/check-data-student/";

router.get("/api/xep-lich-cabin", async (req, res) => {
  try {
    // ── Bước 1: Lấy danh sách học viên đủ điều kiện cabin ──
    const { data: api1Res } = await axios.get(API1_URL);
    const duDieuKien = (api1Res.data || []).filter(
      (hv) => hv.dat_cabin === true,
    );

    if (duDieuKien.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // ── Bước 2: Extract các ma_dk và khóa unique ──
    const maDkList = duDieuKien.map((hv) => hv.ma_dk);

    // Lấy ma_khoa unique → chỉ gọi API 2 M lần (M << N)
    const khoaUniqueSet = new Set(
      duDieuKien.map((hv) => hv.ma_khoa).filter(Boolean),
    );
    const khoaList = [...khoaUniqueSet];

    // ── Bước 3: Gọi song song API 3 và API 2 ──
    const [api3Results, api2Results] = await Promise.all([
      // API 3: lấy thông tin học viên theo ma_dk
      fetchApi3ByMaDk(maDkList),
      // API 2: gọi từng khóa unique (song song)
      fetchApi2ByKhoas(khoaList),
    ]);

    // ── Bước 4: Build lookup maps ──
    // Map: ma_dk → thông tin học viên từ API 3
    const studentInfoMap = buildStudentMap(api3Results);

    // Map: ma_dk → [{ten_bai, tong_phut}, ...] từ API 2
    const studyResultMap = buildStudyResultMap(api2Results, maDkList);

    // ── Bước 5: Join data và trả về ──
    const data = duDieuKien.map((hv) => {
      const info = studentInfoMap[hv.ma_dk] || {};
      const baiHocList = studyResultMap[hv.ma_dk] || [];

      // Tổng hợp từng bài: gom theo tên bài, cộng dồn phút
      const baiHocSummary = aggregateBaiHoc(baiHocList);
      const tongThoiGianPhut = baiHocSummary.reduce(
        (s, b) => s + b.tong_phut,
        0,
      );

      return {
        ma_dk: hv.ma_dk,
        ma_khoa: hv.ma_khoa,

        // Ưu tiên data từ API 1, bổ sung từ API 3
        ho_ten: hv.ho_ten || info.hoVaTen || null,
        cccd: hv.cccd || info.soCMND || null,
        nam_sinh:
          hv.nam_sinh ||
          (info.ngaySinh ? new Date(info.ngaySinh).getFullYear() : null),
        gioi_tinh: info.gioiTinh || null,

        // Thông tin giáo viên & xe từ API 3
        giao_vien: info.giaoVien || null,
        xe_b1: info.xeB1 || null,
        xe_b2: info.xeB2 || null,

        // Kết quả học từ API 2
        bai_hoc: baiHocSummary,
        tong_thoi_gian_phut: tongThoiGianPhut,

        dat_cabin: hv.dat_cabin,
        loai_ly_thuyet: hv.loai_ly_thuyet,
        loai_het_mon: hv.loai_het_mon,
        ghi_chu: hv.ghi_chu || "",
        cap_nhat_luc: hv.status_updated_at_local || null,
      };
    });

    res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error("Lỗi xep-lich-cabin:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Helpers ──

async function fetchApi3ByMaDk(maDkList) {
  // Gọi API 3 với danh sách ma_dk
  // Nếu API 3 hỗ trợ batch query thì gọi 1 lần:
  const { data } = await axios.get(API3_URL, {
    params: { maDkList: maDkList.join(",") }, // tuỳ format API 3 của bạn
  });
  return data.data || [];
}

async function fetchApi2ByKhoas(khoaList) {
  // Gọi song song M request cho M khóa unique
  const requests = khoaList.map(
    (khoa) =>
      axios
        .get(API2_BASE, { params: { khoa } })
        .then((r) => r.data.data || [])
        .catch(() => []), // nếu 1 khóa lỗi, bỏ qua
  );
  const results = await Promise.all(requests);
  return results.flat(); // mảng phẳng tất cả kết quả tập
}

function buildStudentMap(api3Data) {
  // Key: maDangKy → object học viên
  return api3Data.reduce((map, hv) => {
    if (hv.maDangKy) map[hv.maDangKy] = hv;
    return map;
  }, {});
}

function buildStudyResultMap(api2Data, maDkFilter) {
  // Key: MaDK → mảng các kết quả tập
  // Lọc chỉ giữ học viên nằm trong danh sách đủ điều kiện (tránh lấy nhầm)
  const filterSet = new Set(maDkFilter);
  const map = {};
  for (const row of api2Data) {
    const madk = row.MaDK || row.ID_HocVien;
    if (!madk || !filterSet.has(madk)) continue; // bỏ học viên không trong filter
    if (!map[madk]) map[madk] = [];
    map[madk].push(row);
  }
  return map;
}

function aggregateBaiHoc(rows) {
  // Gom theo tên bài, cộng dồn TongThoiGian (giây → phút)
  const baiMap = {};
  for (const r of rows) {
    const ten = r.Name || "Không rõ";
    if (!baiMap[ten]) {
      baiMap[ten] = { ten_bai: ten, tong_giay: 0, so_lan: 0 };
    }
    baiMap[ten].tong_giay += r.TongThoiGian || 0;
    baiMap[ten].so_lan += 1;
  }
  return Object.values(baiMap).map((b) => ({
    ten_bai: b.ten_bai,
    so_lan: b.so_lan,
    tong_phut: Math.round(b.tong_giay / 60),
  }));
}

module.exports = router;
