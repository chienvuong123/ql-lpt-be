const axios = require("axios");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");
const hocBuModel = require("../models/hocBu.model");
const syncModel = require("../models/sync.model");
const cabinService = require("../services/cabinApi.service");
const lopLyThuyetModel = require("../models/lopLyThuyet.model");
const vehicleRegistrationModel = require("../models/vehicleRegistration.model");
const evaluateUtils = require("../utils/evaluate");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");

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

/**
 * Fetch raw road training records from API HanhTrinh
 */
async function fetchRawHanhTrinhRecords(maDk, maKhoaHoc) {
  const ngaybatdau = "2020-01-01";
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset * 60 * 1000));
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
      return response.data?.Data || [];
    } catch (err) {
      if (err?.response?.status === 401) {
        invalidateHanhTrinhToken();
        if (attempt < 2) continue;
      }
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.error(`[HT Fetch Raw Error] ${maDk}:`, err.message);
      return [];
    }
  }
}

class HocBuService {
  /**
   * Lấy thông tin mapping của khóa học
   * @param {string} ma_khoa_full Ví dụ: 30004K26B0108
   */
  async getCourseInfo(ma_khoa_full) {
    const pool = await connectSQL();
    const result = await pool.request().input("ma_khoa", mssql.VarChar, ma_khoa_full).query(`
      SELECT TOP 1 ma_khoa, ten_khoa, code 
      FROM khoa_hoc 
      WHERE ma_khoa = @ma_khoa
    `);
    return result.recordset[0];
  }

  /**
   * Chỉ kiểm tra và chuyển học viên chưa đạt LÝ THUYẾT vào bảng học bù
   * @param {string} ma_khoa 
   */
  async checkAndMoveTheory(ma_khoa) {
    console.log(`[HocBuService] [Theory] Bắt đầu kiểm tra cho khóa: ${ma_khoa}`);

    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) {
      console.error(`[HocBuService] Không tìm thấy thông tin khóa học: ${ma_khoa}`);
      return { totalChecked: 0, movedCount: 0, failedCount: 0 };
    }

    const students = await syncModel.getHocVienSearch({ ma_khoa });
    if (students.length === 0) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const theoryData = await lopLyThuyetModel.getAll({ maKhoa: courseInfo.code });
    const theoryMap = {};
    theoryData.forEach(item => {
      theoryMap[item.ma_dk] = item;
    });

    const failedStudents = [];
    for (const student of students) {
      const maDk = student.ma_dk;
      const ttTheory = theoryMap[maDk];

      const th_online = ttTheory ? Boolean(ttTheory.loai_ly_thuyet) : false;
      const th_het_mon = ttTheory ? Boolean(ttTheory.loai_het_mon) : false;

      if (!th_online || !th_het_mon) {
        failedStudents.push({
          ma_dk: maDk,
          ma_khoa,
          loai: 1, // 1: Lý thuyết
          ghi_chu: `Lý thuyết: ${!th_online ? "Chưa đạt online" : ""} ${!th_het_mon ? "Chưa làm bài hết môn" : ""}`.trim()
        });
      }
    }

    let movedCount = 0;
    if (failedStudents.length > 0) {
      movedCount = await hocBuModel.moveToHocBu(failedStudents);
    }

    console.log(`[HocBuService] [Theory] Hoàn tất khóa ${ma_khoa}: Kiểm tra ${students.length}, Chuyển ${movedCount}/${failedStudents.length} vào học bù.`);
    return { totalChecked: students.length, movedCount, failedCount: failedStudents.length };
  }

  /**
   * Chỉ kiểm tra và chuyển học viên chưa đạt CABIN vào bảng học bù
   * @param {string} ma_khoa 
   */
  async checkAndMoveCabin(ma_khoa) {
    console.log(`[HocBuService] [Cabin] Bắt đầu kiểm tra cho khóa: ${ma_khoa}`);

    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) {
      console.error(`[HocBuService] Không tìm thấy thông tin khóa học: ${ma_khoa}`);
      return { totalChecked: 0, movedCount: 0, failedCount: 0 };
    }

    const students = await syncModel.getHocVienSearch({ ma_khoa });
    if (students.length === 0) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const cabinRaw = await cabinService.getDanhSachKetQuaCabin({ khoa: ma_khoa }).then(r => r?.data || []);
    const cabinMap = cabinService.buildCabinMap(cabinRaw);

    const failedStudents = [];
    for (const student of students) {
      const maDk = student.ma_dk;
      const ttCabin = cabinMap[maDk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };

      const cabin_duration = ttCabin.tong_thoi_gian || 0;
      const cabin_lessons = ttCabin.so_bai_hoc || 0;

      if (cabin_duration < 9000 || cabin_lessons < 8) {
        failedStudents.push({
          ma_dk: maDk,
          ma_khoa,
          loai: 2, // 2: Cabin
          ghi_chu: `Cabin: ${cabin_duration < 9000 ? "Chưa đủ 150 phút" : ""} ${cabin_lessons < 8 ? "Chưa đủ 8 bài" : ""}`.trim()
        });
      }
    }

    let movedCount = 0;
    if (failedStudents.length > 0) {
      movedCount = await hocBuModel.moveToHocBu(failedStudents);
    }

    console.log(`[HocBuService] [Cabin] Hoàn tất khóa ${ma_khoa}: Kiểm tra ${students.length}, Chuyển ${movedCount}/${failedStudents.length} vào học bù.`);
    return { totalChecked: students.length, movedCount, failedCount: failedStudents.length };
  }

  /**
   * Kiểm tra và chuyển học viên chưa đạt DAT vào bảng học bù
   * @param {string} ma_khoa 
   */
  async checkAndMoveDat(ma_khoa) {
    console.log(`[HocBuService] [DAT] Bắt đầu kiểm tra cho khóa: ${ma_khoa}`);

    const courseInfo = await this.getCourseInfo(ma_khoa);
    if (!courseInfo) {
      console.error(`[HocBuService] Không tìm thấy thông tin khóa học: ${ma_khoa}`);
      return { totalChecked: 0, movedCount: 0, failedCount: 0 };
    }

    const students = await syncModel.getHocVienSearch({ ma_khoa });
    if (students.length === 0) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    const maDkList = students.map(s => s.ma_dk);

    const registrationList = await vehicleRegistrationModel.findByMaDkList(maDkList);
    const regMap = {};
    registrationList.forEach(r => {
      regMap[r.ma_dk] = {
        giaoVien: r.giao_vien,
        xeB1: r.xe_b1,
        xeB2: r.xe_b2
      };
    });

    // Sử dụng hàm helper nội bộ thay vì gọi sang ktiService
    const datResults = await mapConcurrent(students, 8, async (s) => {
      return await fetchRawHanhTrinhRecords(s.ma_dk, ma_khoa);
    });

    const failedStudents = [];
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const sessions = datResults[i] || [];
      
      const regRecord = regMap[student.ma_dk];
      const regInfo = regRecord ? { 
        giaoVien: regRecord.giaoVien, 
        xeB1: regRecord.xeB1, 
        xeB2: regRecord.xeB2 
      } : null;

      const summary = evaluateUtils.computeSummary(sessions, student.hang_gplx || student.hang, regInfo);
      const evaluation = evaluateUtils.evaluate(summary, sessions, regInfo);

      if (evaluation.status === 'fail') {
        const errorReasons = (evaluation.errors || []).map(e => e.label).join(", ");
        failedStudents.push({
          ma_dk: student.ma_dk,
          ma_khoa,
          loai: 3, // 3: DAT
          ghi_chu: `DAT: ${errorReasons || "Không đạt tiêu chuẩn kiểm tra"}`
        });
      }
    }

    let movedCount = 0;
    if (failedStudents.length > 0) {
      movedCount = await hocBuModel.moveToHocBu(failedStudents);
    }

    console.log(`[HocBuService] [DAT] Hoàn tất khóa ${ma_khoa}: Kiểm tra ${students.length}, Chuyển ${movedCount}/${failedStudents.length} vào học bù.`);
    return { totalChecked: students.length, movedCount, failedCount: failedStudents.length };
  }
}

module.exports = new HocBuService();
