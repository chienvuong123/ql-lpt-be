const hocBuModel = require("../models/hocBu.model");
const syncModel = require("../models/sync.model");
const cabinService = require("../services/cabinApi.service");
const lopLyThuyetModel = require("../models/lopLyThuyet.model");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");

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

    // Sử dụng courseInfo.code (ID số) để query bảng trang_thai_ly_thuyet
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

    // Sử dụng ten_khoa (mã ngắn) cho API Cabin theo xác nhận của User
    const cabinRaw = await cabinService.getDanhSachKetQuaCabin({ khoa: courseInfo.ten_khoa }).then(r => r?.data || []);
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
}

module.exports = new HocBuService();
