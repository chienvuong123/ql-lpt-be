const axios = require("axios");
const XLSX = require("xlsx");
const model = require("../models/kiemTraTotNghiep.model");
const { getDanhSachKetQuaCabin, buildCabinMap } = require("./cabinApi.service");
const { getHocVienTheoKhoa, callWithRetry } = require("./lotusApi.service");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");

// Helper for concurrency
async function mapConcurrent(items, limit, fn) {
  const result = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        result[i] = await fn(items[i], i);
      } catch (err) {
        result[i] = { error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

async function fetchHanhTrinhData(maDk, maKhoaHoc, signal) {
  // ngaybatdau là 01/01/2020 và ngayketthuc là ngày hôm nay và giờ cuối cùng T23:59:00
  const ngaybatdau = "2020-01-01";
  const today = new Date();
  // subtract timezone offset if needed to get correct local date string, or just use slice
  const offset = today.getTimezoneOffset()
  const localToday = new Date(today.getTime() - (offset * 60 * 1000))
  const endDateStr = localToday.toISOString().split('T')[0] + "T23:59:00";

  const params = new URLSearchParams({
    ngaybatdau,
    ngayketthuc: endDateStr,
    ten: maDk,
    makhoahoc: maKhoaHoc,
    limit: 200,
    page: 1,
  });

  const hanhTrinhAxios = axios.create({ baseURL: "http://113.160.131.3:7782", timeout: 15000 });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resToken = await getHanhTrinhToken();
      const token = resToken?.token;
      const response = await hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const items = response.data?.Data || [];
      let tongQuangDuong = 0;
      let tongThoiGian = 0;
      items.forEach(item => {
        tongQuangDuong += Number(item.TongQuangDuong || 0);
        tongThoiGian += Number(item.TongThoiGian || 0);
      });

      return {
        tong_quang_duong_ht: tongQuangDuong,
        tong_thoi_gian_ht: tongThoiGian,
        so_phien_ht: items.length
      };
    } catch (err) {
      if (err?.response?.status === 401) {
        invalidateHanhTrinhToken();
        // Lỗi 401 thì lặp lại liên tục gọi lại token ngay không chờ đợi
        if (attempt < 2) continue;
      }

      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.error(`[HT Fetch Error] ${maDk}:`, err.message);
      return { tong_quang_duong_ht: 0, tong_thoi_gian_ht: 0, so_phien_ht: 0, ht_error: err.message };
    }
  }
}

async function getAllStudents() {
  return await model.findAll();
}

async function importFromExcel(fileBuffer, classes = []) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Row 0 là header, bỏ qua
  const dataRows = rows.slice(1).filter((row) => {
    return row && row[0] && String(row[0]).trim() !== "";
  });

  await model.deleteAll(); // Xoá sạch dữ liệu cũ trước khi chèn mới

  let inserted = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const student = {
      ma_dk: String(row[0] || "").trim(),
      ho_ten: String(row[1] || "").trim(),
      ngay_sinh: String(row[2] || "").trim(),
      can_cuoc: String(row[3] || "").trim(),
      ma_khoa: String(row[4] || "").trim(),
    };

    const matchedClass = classes.find(c => c.code === student.ma_khoa);
    if (matchedClass && matchedClass.iid) {
      student.iid = matchedClass.iid;
    }

    if (!student.ma_dk) {
      skipped++;
      continue;
    }

    const existing = await model.findByMaSo(student.ma_dk);
    if (existing) {
      skipped++;
      continue;
    }

    await model.insertOne(student);
    inserted++;
  }

  return {
    total_processed: dataRows.length,
    inserted,
    skipped,
  };
}

function formatSecondsToGioPhut(seconds) {
  if (!seconds || isNaN(seconds)) return "0 giờ 0 phút";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h > 0 ? h + " giờ " : ""}${m} phút`.trim();
}

async function getReportData() {
  const students = await getAllStudents();
  if (!students.length) return [];

  // Group by ma_khoa for Cabin
  const khoas = [...new Set(students.map(s => s.ma_khoa).filter(Boolean))];
  const cabinGlobalMap = {};

  await Promise.all(khoas.map(async (khoa) => {
    try {
      const data = await getDanhSachKetQuaCabin({ khoa });
      const map = buildCabinMap(data?.data || data || []);
      Object.assign(cabinGlobalMap, map);
    } catch (err) {
      console.error(`[Cabin error] khoa ${khoa}:`, err.message);
    }
  }));

  // Group by iid for LyThuyet
  const iids = [...new Set(students.map(s => s.iid).filter(iid => iid !== null && iid !== undefined))];
  
  // Mapping từ CC/CMND ra mã đăng ký
  const validCCCDToMaDk = new Map(students.map(s => [String(s.can_cuoc || "").trim(), s.ma_dk]));
  const lyThuyetGlobalMap = {};

  await Promise.all(iids.map(async (iid) => {
    try {
      const list = await callWithRetry(auth => getHocVienTheoKhoa(iid, { page: 1, items_per_page: 500 }, auth));
      const members = Array.isArray(list?.result) ? list.result : [];
      members.forEach(m => {
        const idCard = String(m?.user?.identification_card || "").trim();
        const matchedMaDk = validCCCDToMaDk.get(idCard);
        
        if (idCard && matchedMaDk) {
          const scoreByRubrik = m?.learning_progress?.score_by_rubrik || [];
          const chiTiet = scoreByRubrik.map(item => ({
            name: item.name,
            score: item.score,
            passed: item.passed
          }));
          const soBaiPassed = scoreByRubrik.filter(item => Number(item.passed) === 1).length;

          // Tính số bài học lý thuyết
          lyThuyetGlobalMap[matchedMaDk] = {
            so_bai_ly_thuyet: soBaiPassed,
            chi_tiet_ly_thuyet: chiTiet
          };
        }
      });
    } catch (err) {
      console.error(`[LyThuyet error] iid ${iid}:`, err.message);
    }
  }));

  // Map concurrency for HanhTrinh
  const hanhTrinhResults = await mapConcurrent(students, 8, async (s) => {
    return await fetchHanhTrinhData(s.ma_dk, s.ma_khoa);
  });

  // Merge data
  return students.map((s, idx) => {
    const cb = cabinGlobalMap[s.ma_dk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
    const lt = lyThuyetGlobalMap[s.ma_dk] || { so_bai_ly_thuyet: 0, chi_tiet_ly_thuyet: [] };
    const ht = hanhTrinhResults[idx] || { tong_quang_duong_ht: 0, tong_thoi_gian_ht: 0 };

    return {
      ...s,
      cabin_tong_thoi_gian: formatSecondsToGioPhut(cb.tong_thoi_gian),
      cabin_so_bai_hoc: cb.so_bai_hoc,
      so_bai_ly_thuyet: lt.so_bai_ly_thuyet,
      chi_tiet_ly_thuyet: lt.chi_tiet_ly_thuyet,
      ht_tong_quang_duong: ht.tong_quang_duong_ht,
      ht_tong_thoi_gian: formatSecondsToGioPhut(ht.tong_thoi_gian_ht),
      ht_so_phien: ht.so_phien_ht,
    };
  });
}

module.exports = { getAllStudents, importFromExcel, getReportData };
