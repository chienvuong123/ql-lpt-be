const model = require("../repositories/cabin.repository");
const modelLyThuyet = require("../models/lopLyThuyet.model");
const cabinApiService = require("./cabinApi.service");
const lotusApi = require("./lotusApi.service");
const { normalizeStatusTime } = require("../helpers/time.helper");
const { paginate } = require("../utils/paginate");

const getDanhSachDatCabin = async (filters) => {
  const result = await model.getDatCabin(filters);
  const totalPages = Math.ceil(result.total / result.limit);
  const data = result.data.map(normalizeStatusTime);
  
  return {
    data,
    pagination: {
      total: result.total,
      totalPages,
      page: result.page,
      limit: result.limit,
      hasNext: result.page < totalPages,
      hasPrev: result.page > 1,
    },
    filter: {
      maKhoa: filters.maKhoa || null,
      tenKhoa: filters.tenKhoa || null,
      hoTen: filters.hoTen || null,
    }
  };
};

const fetchCabinStudentComponents = async (enrolmentPlanIid, filters) => {
  const { text, khoa } = filters;
  return Promise.all([
    lotusApi.callWithRetry((auth) =>
      lotusApi.getHocVienTheoKhoa(enrolmentPlanIid, { page: 1, items_per_page: 500, text }, auth)
    ),
    enrolmentPlanIid ? modelLyThuyet.getAll({ maKhoa: enrolmentPlanIid }) : Promise.resolve([]),
    khoa ? cabinApiService.getDanhSachKetQuaCabin({ khoa, hoTen: text || "" })
      .then((r) => r?.data || [])
      .catch((err) => {
        console.error("[fetchCabinStudentComponents] Cabin API error:", err.message);
        return [];
      }) : Promise.resolve([]),
    enrolmentPlanIid ? model.getAll({ ma_khoa: enrolmentPlanIid, limit: 9999 }).then((r) => r?.data || []) : Promise.resolve([]),
  ]);
};

const buildStudentStatus = (dbRecord, student) => {
  if (dbRecord) {
    return {
      loai_ly_thuyet: dbRecord.loai_ly_thuyet,
      loai_het_mon: dbRecord.loai_het_mon,
      dat_cabin: dbRecord.dat_cabin,
      dat: dbRecord.dat,
      ghi_chu: dbRecord.ghi_chu || null,
      status_updated_at: dbRecord.thoi_gian_thay_doi_trang_thai || dbRecord.updated_at || null,
    };
  }
  const scoreByRubrik = student?.learning_progress?.score_by_rubrik || [];
  const autoLyThuyetPassed = Array.isArray(scoreByRubrik) && scoreByRubrik.length > 0 && scoreByRubrik.every((item) => Number(item?.passed) !== 0);
  return {
    loai_ly_thuyet: autoLyThuyetPassed,
    loai_het_mon: false,
    dat_cabin: null,
    dat: null,
    ghi_chu: null,
    status_updated_at: null,
  };
};

const mapUser = (u, code) => ({
  iid: u?.iid,
  name: u?.name,
  first_name: u?.first_name,
  last_name: u?.last_name,
  avatar: u?.avatar,
  birthday: u?.birthday,
  birth_year: u?.birth_year,
  sex: u?.sex,
  identification_card: u?.identification_card,
  identification_card_date: u?.identification_card_date,
  identification_card_place: u?.identification_card_place,
  nationality: u?.nationality,
  organization_name: u?.organization_name,
  school: u?.schools?.[0] || u?.school,
  status: u?.status,
  code,
});

const mapRawStudent = (student, dbMap, cabinMap, cabinNoteMap) => {
  const maDk = String(student?.user?.admission_code || student?.user?.code || student?.id || "");
  const dbRecord = dbMap[maDk] || null;
  const cabinInfo = cabinMap[maDk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
  const trangThaiCabin = cabinApiService.getCabinStatus(cabinInfo.tong_thoi_gian, cabinInfo.so_bai_hoc);

  return {
    user: mapUser(student?.user, maDk),
    learning: student?.learning_progress ? {
      item_iid: student.learning_progress.item_iid,
      total_hour_learned: student.learning_progress.total_hour_learned,
      progress: student.learning_progress.progress,
      passed: student.learning_progress.passed,
      learned: student.learning_progress.learned,
      score_by_rubrik: student.learning_progress.score_by_rubrik || [],
    } : null,
    ma_dk: maDk,
    trang_thai: buildStudentStatus(dbRecord, student),
    cabin: {
      tong_thoi_gian: cabinInfo.tong_thoi_gian,
      so_bai_hoc: cabinInfo.so_bai_hoc,
      trang_thai: trangThaiCabin,
      note: cabinNoteMap[maDk] || null,
    },
  };
};

const filterStudents = (students, trangThaiCabin) => {
  let filtered = students.filter((s) => {
    const tt = s.trang_thai;
    return tt ? Boolean(tt.loai_ly_thuyet) && Boolean(tt.loai_het_mon) : true;
  });

  if (trangThaiCabin) {
    filtered = filtered.filter((s) => s.cabin.trang_thai === trangThaiCabin);
  }
  return filtered;
};

const getDanhSachHocVienCabin = async (enrolmentPlanIid, query) => {
  const { text, page, limit, trang_thai_cabin, khoa } = query;
  const [lotusData, dbData, cabinRaw, cabinNotes] = await fetchCabinStudentComponents(enrolmentPlanIid, { text, khoa });

  const dbMap = Object.fromEntries((dbData || []).filter((i) => i?.ma_dk).map((i) => [String(i.ma_dk), i]));
  const cabinMap = cabinApiService.buildCabinMap(cabinRaw);
  const cabinNoteMap = Object.fromEntries(cabinNotes.filter((i) => i?.ma_dk).map((i) => [String(i.ma_dk), i.ghi_chu || null]));

  const allStudents = Array.isArray(lotusData?.result) ? lotusData.result : [];
  const allMapped = allStudents.map((s) => mapRawStudent(s, dbMap, cabinMap, cabinNoteMap));

  const filtered = filterStudents(allMapped, trang_thai_cabin);
  return paginate(filtered, page, limit);
};

const upsertCabinNote = async (payload) => {
  if (!payload.ma_dk) throw new Error("Thieu ma_dk");
  return model.createOrUpdate(payload);
};

const saveLichPhanBo = async (week_key, assignments) => {
  if (!week_key) throw new Error("Thieu week_key");
  return model.saveLichPhanBo(week_key, assignments);
};

const getLichPhanBo = async (week_key) => {
  if (!week_key) throw new Error("Thieu week_key");
  return model.getLichPhanBo(week_key);
};

const updateLichNote = async (id, ghi_chu) => {
  return model.updateLichNote(id, ghi_chu);
};

const parseOnlineWindows = (startTime, endTime) => {
  const startDt = new Date(startTime), endDt = new Date(endTime);
  if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
    throw new Error("Định dạng thời gian không hợp lệ");
  }
  const buffer = 15 * 60 * 1000;
  return { min: startDt.getTime() - buffer, max: endDt.getTime() + buffer };
};

const isRecordInRange = (record, window) => {
  const timeIn = record.Time_In ? new Date(record.Time_In).getTime() : null;
  const timeOut = record.Time_Out ? new Date(record.Time_Out).getTime() : null;
  const dateCreate = record.DateCreate ? new Date(record.DateCreate).getTime() : null;
  const times = [timeIn, timeOut, dateCreate].filter((t) => t !== null);
  return times.some((t) => t >= window.min && t <= window.max);
};

const checkSingleStudentOnline = async (maDk, window) => {
  try {
    const rawData = await cabinApiService.getKetQuaTapByMaDk(maDk);
    const records = Array.isArray(rawData?.data) ? rawData.data : Array.isArray(rawData) ? rawData : [];
    const matchRecord = records.find((r) => isRecordInRange(r, window));
    
    return {
      maDk,
      status: matchRecord ? "online" : "warning",
      cabin_so: matchRecord ? matchRecord.ID_ThietBi : null,
    };
  } catch (err) {
    return { maDk, status: "warning", cabin_so: null, error: err.message };
  }
};

const checkOnlineStatus = async ({ maDkList, startTime, endTime }) => {
  if (!Array.isArray(maDkList) || !startTime || !endTime) {
    throw new Error("Thiếu dữ liệu đầu vào (maDkList, startTime, endTime)");
  }
  const window = parseOnlineWindows(startTime, endTime);
  const [teacherList, results] = await Promise.all([
    model.getTeacherByMaDkList(maDkList),
    Promise.all(maDkList.map((maDk) => checkSingleStudentOnline(maDk, window))),
  ]);

  const teacherMap = Object.fromEntries(teacherList.map((t) => [t.ma_dk, t.giao_vien]));
  return results.map((r) => ({ ...r, giao_vien: teacherMap[r.maDk] || null }));
};

const getThongKeCabinKhoa = async (ma_khoa) => {
  if (!ma_khoa) throw new Error("Thiếu ma_khoa");
  const response = await cabinApiService.getDanhSachKetQuaCabin({ khoa: ma_khoa });
  const rawData = response?.data || [];
  if (!rawData.length) return [];

  const cabinMap = cabinApiService.buildCabinMap(rawData);
  return Object.values(cabinMap).map((s) => ({
    ma_dk: s.ma_dk,
    ho_ten: s.ho_ten,
    cccd: s.cccd,
    ngay_sinh: s.ngay_sinh,
    ma_khoa: s.ma_khoa,
    tong_thoi_gian: s.tong_thoi_gian,
    tong_phut: s.tong_phut,
    tong_so_bai: s.so_bai_hoc,
    chi_tiet_bai_tap: s.bai_hoc,
  }));
};

module.exports = {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
  saveLichPhanBo,
  getLichPhanBo,
  updateLichNote,
  checkOnlineStatus,
  getThongKeCabinKhoa,
};
