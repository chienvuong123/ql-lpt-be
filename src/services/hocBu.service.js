const axios = require("axios");
const { getHanhTrinhToken, invalidateHanhTrinhToken } = require("./localAuth.service");
const hocBuModel = require("../models/hocBu.model");
const syncModel = require("../models/sync.model");
const cabinService = require("../services/cabinApi.service");
const lopLyThuyetModel = require("../models/lopLyThuyet.model");
const vehicleRegistrationModel = require("../models/vehicleRegistration.model");
const lotusApiService = require("./lotusApi.service");
const evaluateUtils = require("../utils/evaluate");
const connectSQL = require("../configs/sql");
const mssql = require("mssql");
const phienHocDATModel = require("../models/phienHocDAT.model");

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
  const trimmedMaDk = String(maDk || "").trim();
  const trimmedMaKhoa = String(maKhoaHoc || "").trim();

  const ngaybatdau = "2020-01-01";
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset * 60 * 1000));
  const endDateStr = localToday.toISOString().split('T')[0] + "T23:59:00";

  const buildParams = (useKhoa = true) => {
    const p = {
      ngaybatdau,
      ngayketthuc: endDateStr,
      ten: trimmedMaDk,
      limit: 500, // Tăng giới hạn lên để lấy đủ phiên
      page: 1,
    };
    if (useKhoa && trimmedMaKhoa) {
      p.makhoahoc = trimmedMaKhoa;
    }
    return new URLSearchParams(p);
  };

  const hanhTrinhAxios = axios.create({ baseURL: "http://113.160.131.3:7782", timeout: 20000 });

  const fetchAttempt = async (useKhoa) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resToken = await getHanhTrinhToken();
        const token = resToken?.token;
        const params = buildParams(useKhoa);
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
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        console.error(`[HT Fetch Raw Error] ${trimmedMaDk} (useKhoa=${useKhoa}):`, err.message);
        return [];
      }
    }
    return [];
  };

  // 1. Thử lấy chính xác theo khóa
  let data = await fetchAttempt(true);

  // 2. Nếu không có dữ liệu, thử lấy toàn bộ theo maDk (Fallback)
  if (data.length === 0 && trimmedMaKhoa) {
    console.log(`[HocBuService] No DAT found for ${trimmedMaDk} under course ${trimmedMaKhoa}. Retrying without course filter...`);
    data = await fetchAttempt(false);
  }

  return data;
}

/**
 * Normalize session duration to seconds
 * Handles both decimal hours (2.63) and seconds (476)
 */
function normalizeDurationToSeconds(s) {
  const raw = Number(s.TongThoiGian || s.Duration || s.thoi_gian || 0);
  if (raw === 0) return 0;

  // Nếu là số nhỏ (ví dụ < 100) hoặc có phần thập phân, khả năng cao là GIỜ (decimal hours)
  // Thực tế một phiên học hiếm khi kéo dài quá 24h liên tục.
  if (raw < 100 || !Number.isInteger(raw)) {
    return Math.round(raw * 3600);
  }

  // Ngược lại giả định là GIÂY
  return raw;
}

/**
 * Format seconds to "Xh Y phút"
 */
function formatSecondsToHms(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m} phút`;
}

/**
 * Fetch DAT records from LOCAL database cache
 */
async function fetchCachedHanhTrinhRecords(maDk, maKhoa = null) {
  try {
    const localSessions = await phienHocDATModel.getPhienHocDATByMaDK(maDk, maKhoa);
    if (!localSessions || localSessions.length === 0) return [];

    // Map back to HanhTrinh API format expected by evaluation utils
    return localSessions.map(s => ({
      ID: s.phien_hoc_id,
      SessionId: s.guid_session_id || s.guid_session_id, // Map to SessionId (GUID)
      MaDK: s.ma_dk,
      MaHocVien: s.ma_hoc_vien,
      ThoiDiemDangNhap: s.gio_vao,
      ThoiDiemDangXuat: s.gio_ra,
      BienSo: s.bien_so_xe,
      TongQuangDuong: s.tong_km,
      TongThoiGian: s.thoi_gian,
      TrangThai: s.trang_thai,

      // Metadata fields from cache
      IDGV: s.id_gv,
      HoTenGV: s.ho_ten_gv,
      HoTen: s.ho_ten_hv,
      ThoiGianBanDem: s.thoi_gian_dem,
      QuangDuongBanDem: s.quang_duong_dem,
      Tile: s.tile,

      // Fallback/Legacy keys
      Distance: s.tong_km,
      Duration: s.thoi_gian,
      GuidSessionId: s.guid_session_id
    }));
  } catch (err) {
    console.error(`[HT Fetch Cached Error] ${maDk}:`, err.message);
    return [];
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
      SELECT TOP 1 
        LTRIM(RTRIM(ma_khoa)) as ma_khoa, 
        ten_khoa, 
        LTRIM(RTRIM(code)) as code 
      FROM khoa_hoc 
      WHERE ma_khoa = @ma_khoa OR LTRIM(RTRIM(ma_khoa)) = LTRIM(RTRIM(@ma_khoa))
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

    // Sử dụng ma_khoa (mã đầy đủ) để query bảng trang_thai_ly_thuyet cho chính xác
    const theoryData = await lopLyThuyetModel.getAll({ ma_khoa: ma_khoa });
    const theoryMap = {};
    theoryData.forEach(item => {
      theoryMap[item.ma_dk] = item;
    });

    const failedStudents = [];
    for (const student of students) {
      const maDk = String(student.ma_dk || "").trim();
      const ttTheory = theoryMap[maDk];

      const th_online = ttTheory ? Boolean(Number(ttTheory.loai_ly_thuyet)) : false;
      const th_het_mon = ttTheory ? Boolean(Number(ttTheory.loai_het_mon)) : false;

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

    const studentsRaw = await syncModel.getHocVienSearch({ ma_khoa });
    if (studentsRaw.length === 0) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    // Lọc bỏ các học viên đã có trong danh sách Học bù Lý thuyết (loai: 1)
    const maDkInTheory = await hocBuModel.getMaDkByKhoaAndLoai(ma_khoa, [1]);
    const students = studentsRaw.filter(s => !maDkInTheory.has(s.ma_dk));

    if (students.length === 0) {
      console.log(`[HocBuService] [Cabin] Toàn bộ học viên đã ở trong danh sách bù Lý thuyết. Bỏ qua.`);
      return { totalChecked: studentsRaw.length, movedCount: 0, failedCount: 0 };
    }

    // Sử dụng ma_khoa (mã đầy đủ) cho API Cabin để đảm bảo khớp dữ liệu
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

    const studentsRaw = await syncModel.getHocVienSearch({ ma_khoa });
    if (studentsRaw.length === 0) return { totalChecked: 0, movedCount: 0, failedCount: 0 };

    // Lọc bỏ các học viên đã có trong danh sách Học bù Lý thuyết (loai: 1) hoặc Cabin (loai: 2)
    const maDkInPrevious = await hocBuModel.getMaDkByKhoaAndLoai(ma_khoa, [1, 2]);
    const students = studentsRaw.filter(s => !maDkInPrevious.has(s.ma_dk));

    if (students.length === 0) {
      console.log(`[HocBuService] [DAT] Toàn bộ học viên đã ở trong danh sách bù Lý thuyết hoặc Cabin. Bỏ qua.`);
      return { totalChecked: studentsRaw.length, movedCount: 0, failedCount: 0 };
    }

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

      const normalizedForEval = sessions.map(sess => ({
        ...sess,
        TongThoiGian: normalizeDurationToSeconds(sess),
        TongQuangDuong: Number(sess.TongQuangDuong || sess.Distance || 0),
        ThoiGianBanDem: Number(sess.ThoiGianBanDem || 0),
        QuangDuongBanDem: Number(sess.QuangDuongBanDem || 0)
      }));

      const summary = evaluateUtils.computeSummary(normalizedForEval, student.hang_gplx || student.hang, regInfo);
      const evaluation = evaluateUtils.evaluate(summary, normalizedForEval, regInfo);

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

  /**
   * Helper: Lấy thông tin cơ bản của học viên cho các API progress
   * @param {string} ma_dk 
   */
  async getStudentBaseInfo(ma_dk) {
    const studentInfo = await syncModel.getHocVienSearch({ ma_dk: ma_dk });
    const student = studentInfo[0];
    if (!student) throw new Error("Không tìm thấy học viên trong hệ thống.");

    const registration = await vehicleRegistrationModel.findByMaDkList([ma_dk]);
    const regRecord = registration[0];

    return {
      ma_dk: student.ma_dk,
      ho_ten: student.ho_ten,
      thay_giao: regRecord ? regRecord.giao_vien : null,
      cccd: student.cccd,
      ngay_sinh: student.ngay_sinh,
      ten_khoa: student.ten_khoa,
      hang: student.hang_gplx || student.hang,
      anh: student.anh,
      ma_khoa: student.ma_khoa // Giữ lại nội bộ để dùng cho các hàm khác
    };
  }

  /**
   * API 1: Lấy tiến độ Lý thuyết (Nội bộ)
   */
  async getTheoryProgress(ma_dk = null, ma_khoa = null) {
    let studentList = [];
    if (ma_dk) {
      const base = await this.getStudentBaseInfo(ma_dk);
      studentList.push(base);
    } else {
      // Lấy danh sách học viên học bù loại 1 (Lý thuyết)
      studentList = await hocBuModel.getHocBuList({ loai: 1, ma_khoa });
    }

    if (studentList.length === 0) return ma_dk ? null : [];

    const maDks = studentList.map(s => s.ma_dk);
    const theoryData = await lopLyThuyetModel.getAll({ ma_dk_list: maDks });
    const theoryMap = {};
    theoryData.forEach(item => { theoryMap[item.ma_dk] = item; });

    const results = studentList.map(s => {
      const tt = theoryMap[s.ma_dk] || {};
      return {
        student: s,
        theoryInfo: {
          loai_ly_thuyet: tt.loai_ly_thuyet || 0,
          loai_het_mon: tt.loai_het_mon || 0,
          ghi_chu: tt.ghi_chu || ""
        }
      };
    });

    return ma_dk ? results[0] : results;
  }

  /**
   * API 2: Lấy chi tiết bài học Lý thuyết từ Lotus (Giữ nguyên cho chi tiết 1 người)
   */
  async getTheoryLotusDetail(ma_dk) {
    let studentBase = null;
    try {
      studentBase = await this.getStudentBaseInfo(ma_dk);
    } catch (e) {
      console.error("[Theory Detail] Error getting base info:", e.message);
    }

    const studentInfo = await syncModel.getHocVienSearch({ ma_dk: ma_dk });
    const student = studentInfo[0];
    if (!student) throw new Error("Không tìm thấy học viên.");

    const courseInfo = await this.getCourseInfo(student.ma_khoa);
    const lotusPlanIid = courseInfo ? courseInfo.code : null;

    if (!lotusPlanIid) return { student: studentBase, scoreByRubrik: [] };

    try {
      const lotusData = await lotusApiService.callWithRetry(async (auth) => {
        return await lotusApiService.getHocVienTheoKhoa(lotusPlanIid, { text: student.ma_dk }, auth);
      });
      const members = lotusData?.result || [];
      const member = members.find(m =>
        String(m?.user?.code || "").trim() === String(student.ma_dk || "").trim() ||
        String(m?.user?.identification_card || "").trim() === String(student.cccd || "").trim()
      );

      return {
        student: studentBase,
        scoreByRubrik: member?.learning_progress?.score_by_rubrik || []
      };
    } catch (err) {
      console.error("[Detail Lotus] Error:", err.message);
      return { student: studentBase, scoreByRubrik: [] };
    }
  }

  /**
   * API 3: Lấy tiến độ Cabin
   */
  async getCabinProgress(ma_dk = null, ma_khoa = null) {
    let studentList = [];
    try {
      if (ma_dk) {
        const base = await this.getStudentBaseInfo(ma_dk);
        studentList.push(base);
      } else {
        studentList = await hocBuModel.getHocBuList({ loai: 2, ma_khoa });
      }

      if (studentList.length === 0) return ma_dk ? null : [];

      // Lấy dữ liệu Cabin
      let cabinMap = {};
      try {
        if (ma_dk) {
          // Trường hợp xem chi tiết 1 người
          const cabinRaw = await cabinService.getKetQuaTapByMaDk(ma_dk);
          const cabinResult = Array.isArray(cabinRaw) ? cabinRaw : (cabinRaw?.data || []);
          cabinMap = cabinService.buildCabinMap(cabinResult);
        } else if (studentList.length > 0) {
          // Trường hợp danh sách: Gọi song song cho từng người trong danh sách bù (Lấy tối đa 8 người cùng lúc)
          const cabinRawResults = await mapConcurrent(studentList, 8, async (s) => {
            try {
              const res = await cabinService.getKetQuaTapByMaDk(s.ma_dk);
              return Array.isArray(res) ? res : (res?.data || []);
            } catch (e) { return []; }
          });

          // Gộp tất cả kết quả vào map
          const allCabinData = cabinRawResults.flat();
          cabinMap = cabinService.buildCabinMap(allCabinData);
        }
      } catch (err) {
        console.error("[Cabin API Error]", err.message);
      }

      const results = studentList.map(s => {
        const tt = cabinMap[s.ma_dk] || { bai_hoc: [], tong_thoi_gian: 0, so_bai_hoc: 0, tong_phut: 0 };
        return {
          student: s,
          tong_thoi_gian: tt.tong_phut || 0,
          tong_bai: tt.so_bai_hoc || 0,
          cabinDetails: tt.bai_hoc || []
        };
      });

      return ma_dk ? results[0] : results;
    } catch (error) {
      console.error("[getCabinProgress] Error:", error.message);
      throw error;
    }
  }

  /**
   * API 4: Lấy tiến độ DAT
   */
  async getDatProgress(ma_dk = null, ma_khoa = null, isSync = false) {
    let studentList = [];
    try {
      if (ma_dk) {
        const base = await this.getStudentBaseInfo(ma_dk);
        studentList.push(base);
      } else {
        studentList = await hocBuModel.getHocBuList({ loai: 3, ma_khoa });
      }

      if (studentList.length === 0) return ma_dk ? null : [];

      const results = await mapConcurrent(studentList, 5, async (s) => {
        try {
          const currentMaDk = String(s.ma_dk || "").trim();
          const currentMaKhoa = String(s.ma_khoa || "").trim();
          const hocVienHang = String(s.hang || "").trim() || "B2";

          // Lấy dữ liệu từ bảng ky_dat (Không làm sập nếu lỗi)
          let kyDatInfo = {};
          try {
            const pool = await connectSQL();
            const kyDatResult = await pool.request().input("ma_dk", mssql.VarChar, currentMaDk).query(`
              SELECT TOP 1 trang_thai, ghi_chu_1, ghi_chu_2 FROM ky_dat WHERE ma_dk = @ma_dk
            `);
            kyDatInfo = kyDatResult.recordset[0] || {};
          } catch (e) { console.error("ky_dat query error:", e.message); }

          const registration = await vehicleRegistrationModel.findByMaDkList([currentMaDk]);
          const r = registration[0];
          const regInfo = r ? { giaoVien: r.giao_vien, xeB1: r.xe_b1, xeB2: r.xe_b2 } : null;

          let datDetails = { sessions: [], summary: { tongKm: 0, tongPhut: 0, soPhien: 0 } };
          try {
            let datSessions = [];
            if (isSync) {
              datSessions = await fetchRawHanhTrinhRecords(currentMaDk, currentMaKhoa);
              if (datSessions.length > 0) {
                await phienHocDATModel.upsertPhienHocDATMany(currentMaDk, datSessions, currentMaKhoa);
              }
            } else {
              datSessions = await fetchCachedHanhTrinhRecords(currentMaDk, currentMaKhoa);
              if (datSessions.length === 0) {
                datSessions = await fetchRawHanhTrinhRecords(currentMaDk, currentMaKhoa);
                if (datSessions.length > 0) {
                  await phienHocDATModel.upsertPhienHocDATMany(currentMaDk, datSessions, currentMaKhoa);
                }
              }
            }

            const normalizedForEval = datSessions.map(sess => ({
              ...sess,
              TongThoiGian: normalizeDurationToSeconds(sess),
              TongQuangDuong: Number(sess.TongQuangDuong || sess.Distance || 0),
              ThoiGianBanDem: Number(sess.ThoiGianBanDem || 0),
              QuangDuongBanDem: Number(sess.QuangDuongBanDem || 0)
            }));

            const summary = evaluateUtils.computeSummary(normalizedForEval, hocVienHang, regInfo);
            const evaluation = evaluateUtils.evaluate(summary, normalizedForEval, regInfo);

            datDetails.sessions = datSessions.map(sess => {
              const { SrcdxAvatar, srcAvatar, SrcdnAvatar, ...sessionData } = sess;
              return {
                ...sessionData,
                isError: !!evaluation.errors?.some(err => err.sessionId === sess.SessionId)
              };
            });

            datDetails.summary = {
              tongKm: Number((summary.tongQuangDuong || 0).toFixed(2)),
              tongPhut: Math.round((summary.tongThoiGianGio || 0) * 60),
              soPhien: datSessions.length,
              evaluationStatus: evaluation.status,
              errors: evaluation.errors
            };
          } catch (err) {
            console.error(`[DAT Fetch Error] ${currentMaDk}:`, err.message);
          }

          // Tính tổng tuyệt đối tất cả các phiên
          const absTotalKm = datSessions.reduce((sum, sess) => sum + (Number(sess.TongQuangDuong || sess.Distance) || 0), 0);
          const absTotalSeconds = datSessions.reduce((sum, sess) => sum + normalizeDurationToSeconds(sess), 0);

          return {
            student: {
              ...s,
              xe_b1: r?.xe_b1 || null,
              xe_b2: r?.xe_b2 || null,
              ky_dat: kyDatInfo.trang_thai || null,
              ghi_chu_1: kyDatInfo.ghi_chu_1 || null,
              ghi_chu_2: kyDatInfo.ghi_chu_2 || null
            },
            tong_quang_duong: Number(absTotalKm.toFixed(2)),
            tong_thoi_gian: formatSecondsToHms(absTotalSeconds),
            datDetails
          };
        } catch (innerError) {
          console.error(`[inner DAT error] ${s.ma_dk}:`, innerError.message);
          return { student: s, datDetails: { sessions: [], summary: {} } };
        }
      });

      return ma_dk ? results[0] : results;
    } catch (error) {
      console.error("[getDatProgress] Error:", error.message);
      throw error;
    }
  }

  /**
   * Lấy danh sách học bù kèm đầy đủ thông tin tiến độ (LT, Cabin, DAT)
   * @param {Object} filters { ma_khoa, loai, search, sync }
   */
  async getHocBuListDetailed(filters = {}) {
    const isSync = filters.sync === true || filters.sync === "true";
    console.log("[HocBuService] [ListDetailed] Fetching with filters:", filters, "Sync:", isSync);
    const studentList = await hocBuModel.getHocBuList(filters);
    if (studentList.length === 0) return [];

    const ma_khoa = filters.ma_khoa;

    // Lấy thông tin khóa học để lấy trường code (Lotus Plan IID)
    let courseInfo = null;
    if (ma_khoa) {
      try {
        courseInfo = await this.getCourseInfo(ma_khoa);
      } catch (e) {
        console.error("[HocBuService] [CourseInfo] error:", e.message);
      }
    }

    const maDks = studentList.map(s => String(s.ma_dk).trim());

    // 1. Lấy dữ liệu Lý thuyết (Local SQL) cho toàn bộ list để tối ưu
    let theoryMap = {};
    try {
      const theoryData = await lopLyThuyetModel.getAll({ ma_dk_list: maDks });
      theoryData.forEach(item => { theoryMap[String(item.ma_dk).trim()] = item; });
    } catch (e) {
      console.error("[HocBuService] [Theory] Query error:", e.message);
    }

    // 2. Lấy dữ liệu KyDat cho toàn bộ list
    let kyDatMap = {};
    try {
      if (maDks.length > 0) {
        const pool = await connectSQL();
        const escapedMaDks = maDks.map(m => `'${String(m).replace(/'/g, "''")}'`).join(",");
        const kyDatResult = await pool.request().query(`
          SELECT ma_dk, trang_thai, ghi_chu_1, ghi_chu_2 FROM ky_dat WHERE ma_dk IN (${escapedMaDks})
        `);
        kyDatResult.recordset.forEach(row => { kyDatMap[String(row.ma_dk).trim()] = row; });
      }
    } catch (e) {
      console.error("[HocBuService] [KyDat] Query error:", e.message);
    }

    // 3. Lấy dữ liệu Registration (Giáo viên, Xe) cho toàn bộ list
    let regMap = {};
    try {
      const registrations = await vehicleRegistrationModel.findByMaDkList(maDks);
      registrations.forEach(r => { regMap[String(r.ma_dk).trim()] = r; });
    } catch (e) {
      console.error("[HocBuService] [Registration] Query error:", e.message);
    }

    // 4. Lấy dữ liệu Cabin trong một lần call nếu có ma_khoa
    let cabinMap = {};
    try {
      if (ma_khoa) {
        const cabinRaw = await cabinService.getDanhSachKetQuaCabin({ khoa: ma_khoa });
        cabinMap = cabinService.buildCabinMap(cabinRaw?.data || cabinRaw || []);
      } else {
        // Fallback: Nếu không có khóa, lấy từng người (nhưng giới hạn concurrency)
        const cabinRawResults = await mapConcurrent(maDks, 10, async (id) => {
          try {
            const res = await cabinService.getKetQuaTapByMaDk(id);
            return Array.isArray(res) ? res : (res?.data || []);
          } catch (e) { return []; }
        });
        cabinMap = cabinService.buildCabinMap(cabinRawResults.flat());
      }
    } catch (e) {
      console.error("[HocBuService] [Cabin] Bulk fetch error:", e.message);
    }

    // 5. Lấy dữ liệu DAT từ cache (Local SQL) cho toàn bộ list
    let datSessionMap = {};
    try {
      const allCachedSessions = await phienHocDATModel.getPhienHocDATByMaDKList(maDks, ma_khoa);
      allCachedSessions.forEach(s => {
        const dk = String(s.ma_dk).trim();
        if (!datSessionMap[dk]) datSessionMap[dk] = [];
        datSessionMap[dk].push(s);
      });
    } catch (e) {
      console.error("[HocBuService] [DAT Cache] Bulk fetch error:", e.message);
    }

    // 6. Xử lý từng học viên
    // Chỉ sync API ngoài nếu isSync=true, còn lại dùng cache để đảm bảo tốc độ
    const students = await mapConcurrent(studentList, 5, async (s) => {
      try {
        const maDk = String(s.ma_dk || "").trim();
        const currentMaKhoa = String(s.ma_khoa || ma_khoa || "").trim();
        const hocVienHang = String(s.hang || s.hang_gplx || "").trim() || "B2";

        // a. Theory Detail
        const ttTheory = theoryMap[maDk] || {};
        const theoryInfo = {
          loai_ly_thuyet: ttTheory.loai_ly_thuyet || 0,
          loai_het_mon: ttTheory.loai_het_mon || 0,
          ghi_chu: ttTheory.ghi_chu || ""
        };

        // b. Cabin Detail
        const ttCabin = cabinMap[maDk] || { tong_phut: 0, so_bai_hoc: 0, bai_hoc: [] };
        const cabinInfo = {
          tong_thoi_gian: ttCabin.tong_phut || 0,
          tong_bai: ttCabin.so_bai_hoc || 0,
          cabinDetails: ttCabin.bai_hoc || []
        };

        // c. DAT Detail
        const r = regMap[maDk];
        const regInfo = r ? { giaoVien: r.giao_vien, xeB1: r.xe_b1, xeB2: r.xe_b2 } : null;

        let datSessions = datSessionMap[maDk] || [];

        // Nếu isSync=true HOẶC (cache trống và chúng ta muốn lấy dữ liệu mới - nhưng để nhanh thì nên hạn chế)
        if (isSync) {
          const freshSessions = await fetchRawHanhTrinhRecords(maDk, currentMaKhoa);
          if (freshSessions.length > 0) {
            await phienHocDATModel.upsertPhienHocDATMany(maDk, freshSessions, currentMaKhoa);
            datSessions = await fetchCachedHanhTrinhRecords(maDk, currentMaKhoa);
          }
        }

        const absTotalKm = datSessions.reduce((sum, sess) => sum + (Number(sess.TongQuangDuong || sess.Distance || sess.tong_km) || 0), 0);
        const absTotalSeconds = datSessions.reduce((sum, sess) => sum + normalizeDurationToSeconds(sess), 0);

        const datInfo = {
          tong_quang_duong: Number(absTotalKm.toFixed(2)),
          tong_thoi_gian: formatSecondsToHms(absTotalSeconds),
          datDetails: {
            sessions: datSessions.slice(0, 50).map(sess => { // Giới hạn số phiên gửi về để tránh payload quá lớn
              const { SrcdxAvatar, srcAvatar, SrcdnAvatar, ...sessionData } = sess;
              return sessionData;
            })
          }
        };

        const kd = kyDatMap[maDk] || {};

        return {
          ...s,
          xe_b1: r?.xe_b1 || null,
          xe_b2: r?.xe_b2 || null,
          ky_dat: kd.trang_thai || null,
          ghi_chu_1: kd.ghi_chu_1 || null,
          ghi_chu_2: kd.ghi_chu_2 || null,
          detail: {
            theoryInfo,
            cabinInfo,
            datInfo
          }
        };
      } catch (innerErr) {
        console.error(`[HocBuService] [ListDetailed] Process error for ${s.ma_dk}:`, innerErr.message);
        return { ...s, detail: { error: innerErr.message } };
      }
    });

    return { students, course: courseInfo };
  }

  /**
   * Lấy dữ liệu chi tiết tiến độ của một học viên từ tất cả các nguồn
   * @param {string} ma_dk 
   */
  async getStudentProgressDetail(ma_dk, isSync = false) {
    console.log(`[HocBuService] [Detail] Lấy chi tiết cho: ${ma_dk}`);

    const ma_dk_trimmed = String(ma_dk || "").trim();
    const studentInfo = await syncModel.getHocVienSearch({ ma_dk: ma_dk_trimmed });
    const student = studentInfo[0];

    if (!student) throw new Error("Không tìm thấy học viên trong hệ thống.");

    const ma_khoa = String(student.ma_khoa || "").trim();
    const courseInfo = await this.getCourseInfo(ma_khoa);
    const lotusPlanIid = courseInfo ? courseInfo.code : null;

    // 2. Lấy thông tin giáo viên từ bảng đăng ký
    const registration = await vehicleRegistrationModel.findByMaDkList([ma_dk_trimmed]);
    const regRecord = registration[0];
    const thay_giao = regRecord ? regRecord.giao_vien : null;

    // 3. Lấy thêm thông tin từ bảng ky_dat (Trạng thái kỳ thi DAT)
    const pool = await connectSQL();
    const kyDatResult = await pool.request().input("ma_dk", mssql.VarChar, ma_dk_trimmed).query(`
      SELECT TOP 1 trang_thai, ghi_chu_1, ghi_chu_2 
      FROM ky_dat 
      WHERE ma_dk = @ma_dk
    `);
    const kyDatInfo = kyDatResult.recordset[0] || {};

    // 3. Lấy chi tiết Lý thuyết (Rubriks) từ Lotus
    let theoryDetails = { scoreByRubrik: [] };
    if (lotusPlanIid) {
      try {
        const lotusData = await lotusApiService.callWithRetry(async (auth) => {
          return await lotusApiService.getHocVienTheoKhoa(lotusPlanIid, { text: ma_dk_trimmed }, auth);
        });
        const members = lotusData?.result || [];
        const member = members.find(m =>
          String(m?.user?.code || "").trim() === ma_dk_trimmed ||
          String(m?.user?.identification_card || "").trim() === String(student.cccd || "").trim()
        );
        if (member) {
          theoryDetails.scoreByRubrik = member.learning_progress?.score_by_rubrik || [];
        }
      } catch (err) {
        console.error("[Detail] Lỗi lấy lý thuyết Lotus:", err.message);
      }
    }

    // 4. Lấy chi tiết Cabin
    let cabinDetails = { cabinSessions: [], summary: { tongPhut: 0, soBai: 0 } };
    try {
      const cabinRaw = await cabinService.getKetQuaTapByMaDk(ma_dk_trimmed);
      const cabinResult = Array.isArray(cabinRaw) ? cabinRaw : (cabinRaw?.data || []);
      const map = cabinService.buildCabinMap(cabinResult);
      const tt = map[ma_dk_trimmed];
      if (tt) {
        cabinDetails.cabinSessions = tt.bai_hoc || [];
        cabinDetails.summary = {
          tongPhut: tt.tong_phut,
          soBai: tt.so_bai_hoc
        };
      }
    } catch (err) {
      console.error("[Detail] Lỗi lấy Cabin:", err.message);
    }

    // 5. Lấy chi tiết DAT
    let datDetails = { sessions: [], summary: { tongKm: 0, tongPhut: 0, soPhien: 0 } };
    try {
      let datSessions = [];
      if (isSync) {
        datSessions = await fetchRawHanhTrinhRecords(ma_dk_trimmed, ma_khoa);
        if (datSessions.length > 0) {
          await phienHocDATModel.upsertPhienHocDATMany(ma_dk_trimmed, datSessions, ma_khoa);
        }
      } else {
        datSessions = await fetchCachedHanhTrinhRecords(ma_dk_trimmed, ma_khoa);
        if (datSessions.length === 0) {
          datSessions = await fetchRawHanhTrinhRecords(ma_dk_trimmed, ma_khoa);
          if (datSessions.length > 0) {
            await phienHocDATModel.upsertPhienHocDATMany(ma_dk_trimmed, datSessions, ma_khoa);
          }
        }
      }
      const regInfo = regRecord ? {
        giaoVien: regRecord.giao_vien,
        xeB1: regRecord.xe_b1,
        xeB2: regRecord.xe_b2
      } : null;

      const resultsSummary = evaluateUtils.computeSummary(datSessions, student.hang_gplx || student.hang || "B2", regInfo);
      const evaluation = evaluateUtils.evaluate(resultsSummary, datSessions, regInfo);

      datDetails.sessions = datSessions.map(sess => {
        const { SrcdxAvatar, srcAvatar, SrcdnAvatar, ...sessionData } = sess;
        return {
          ...sessionData,
          isError: !!evaluation.errors?.some(err => err.sessionId === sess.SessionId || err.details?.some(d => d.SessionId === sess.SessionId))
        };
      });

      // Tính tổng tuyệt đối cho detail summary
      const absTotalKm = datSessions.reduce((sum, s) => sum + (Number(s.TongQuangDuong || s.Distance) || 0), 0);
      const absTotalSeconds = datSessions.reduce((sum, s) => sum + normalizeDurationToSeconds(s), 0);

      datDetails.summary = {
        tongKm: Number((resultsSummary.tongQuangDuong || 0).toFixed(2)),
        tongPhut: Math.round((resultsSummary.tongThoiGianGio || 0) * 60),
        tongKmRaw: Number(absTotalKm.toFixed(2)),
        tongThoiGianRaw: formatSecondsToHms(absTotalSeconds),
        soPhien: datSessions.length,
        evaluationStatus: evaluation.status,
        errors: evaluation.errors
      };
    } catch (err) {
      console.error("[Detail] Lỗi lấy DAT:", err.message);
    }

    return {
      student: {
        ma_dk: student.ma_dk,
        ma_khoa: student.ma_khoa,
        ten_khoa: student.ten_khoa,
        ngay_sinh: student.ngay_sinh,
        thay_giao: thay_giao,
        xe_b1: regRecord?.xe_b1 || null,
        xe_b2: regRecord?.xe_b2 || null,
        hang: student.hang_gplx || student.hang,
        anh: student.anh,
        ky_dat: kyDatInfo.trang_thai || null,
        ghi_chu_1: kyDatInfo.ghi_chu_1 || null,
        ghi_chu_2: kyDatInfo.ghi_chu_2 || null
      },
      // Tính tổng tuyệt đối cho main view
      tong_quang_duong: datDetails.summary.tongKmRaw || 0,
      tong_thoi_gian: datDetails.summary.tongThoiGianRaw || "0h 0 phút",
      theoryDetails,
      cabinDetails,
      datDetails
    };
  }
}

const service = new HocBuService();
module.exports = {
  getHocBuListDetailed: service.getHocBuListDetailed.bind(service),
  getStudentProgressDetail: service.getStudentProgressDetail.bind(service),
  getTheoryProgress: service.getTheoryProgress.bind(service),
  getCabinProgress: service.getCabinProgress.bind(service),
  getDatProgress: service.getDatProgress.bind(service),
  getCourseInfo: service.getCourseInfo.bind(service),
  fetchRawHanhTrinhRecords // Export helper
};
