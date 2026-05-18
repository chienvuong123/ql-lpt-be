const ExcelJS = require("exceljs");
const {
  getLopHocLyThuyet,
  getHocVienTheoKhoa,
  callWithRetry,
} = require("../services/lotusApi.service");
const model = require("../models/lopLyThuyet.model");
const { paginate } = require("../utils/paginate");
const {
  getDanhSachKetQuaCabin,
  buildCabinMap,
  getCabinStatus,
} = require("../services/cabinApi.service");
const { LOCAL_BASE } = require("../constants/base");
const googleSheetModel = require("../models/googleSheet.model");
const connectSQL = require("../configs/sql");

// GET /api/ly-thuyet/lop-hoc
async function getDanhSachLop(req, res) {
  try {
    const searchParams = req.query;

    const data = await callWithRetry((auth) =>
      getLopHocLyThuyet(searchParams, auth),
    );

    const list = Array.isArray(data?.result) ? data.result : [];

    const result = list.map((item) => ({
      name: item.name,
      suffix_name: item.suffix_name,
      code: item.code,
      iid: item.iid,
      start_date: item?.start_date,
      end_date: item?.end_date,
    }));

    return res.json({ success: true, total: result.length, data: result });
  } catch (err) {
    console.error("[getDanhSachLop]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function searchDanhSachLop(req, res) {
  try {
    const { page, limit, text, start_date, end_date, ...searchParams } =
      req.query;

    const data = await callWithRetry((auth) =>
      getLopHocLyThuyet(searchParams, auth),
    );

    let list = Array.isArray(data?.result) ? data.result : [];

    if (text?.trim()) {
      const keyword = text.trim().toLowerCase();
      list = list.filter((item) =>
        [item?.name, item?.suffix_name, item?.code]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(keyword)),
      );
    }

    if (start_date) {
      const from = Math.floor(new Date(start_date).getTime() / 1000);
      list = list.filter((item) => item?.start_date >= from);
    }

    if (end_date) {
      const to = Math.floor(new Date(end_date).getTime() / 1000);
      list = list.filter((item) => item?.end_date <= to);
    }

    const { data: pagedData, pagination } = paginate(list, page, limit);

    // Normalize ngày trong response
    const normalizedData = pagedData.map((item) => ({
      ...item,
      start_date_iso: item.start_date
        ? new Date(item.start_date * 1000).toISOString()
        : null,
      end_date_iso: item.end_date
        ? new Date(item.end_date * 1000).toISOString()
        : null,
    }));

    return res.json({ success: true, pagination, data: normalizedData });
  } catch (err) {
    console.error("[searchDanhSachLop]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/ly-thuyet/hoc-vien/:enrolmentPlanIid
async function getDanhSachHocVien(req, res) {
  try {
    const { enrolmentPlanIid } = req.params;
    const extraParams = req.query;

    const data = await callWithRetry((auth) =>
      getHocVienTheoKhoa(enrolmentPlanIid, extraParams, auth),
    );

    return res.json({
      success: true,
      total: data?.total || 0,
      data: data?.result || [],
    });
  } catch (err) {
    console.error("[getDanhSachHocVien]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/ly-thuyet/hoc-vien/:enrolmentPlanIid/chi-tiet/:studentId
async function getChiTietHocVienLyThuyet(req, res) {
  try {
    const { enrolmentPlanIid, studentId } = req.params;

    // Truy vấn bảng khoa_hoc để lấy mã code (enrolmentPlanIid thật trên LotusLMS) từ ma_khoa
    const pool = await connectSQL();
    const khoaRes = await pool.request()
      .input('ma_khoa', enrolmentPlanIid)
      .query('SELECT TOP 1 code FROM khoa_hoc WHERE ma_khoa = @ma_khoa');
    
    const actualEnrolmentPlanIid = khoaRes.recordset[0]?.code || enrolmentPlanIid;

    // Tìm kiếm với text = studentId để thu hẹp kết quả trả về từ LotusLMS
    const data = await callWithRetry((auth) =>
      getHocVienTheoKhoa(actualEnrolmentPlanIid, { text: studentId }, auth),
    );

    const list = data?.result || [];
    // Khớp chính xác studentId với iid, admission_code, hoặc mã đăng ký
    const student = list.find(
      (s) =>
        String(s?.user?.iid) === String(studentId) ||
        String(s?.user?.admission_code) === String(studentId) ||
        String(s?.user?.code) === String(studentId) ||
        String(s?.id) === String(studentId)
    );

    if (!student) {
      return res.status(404).json({ success: false, message: "Không tìm thấy học viên" });
    }

    return res.json({
      success: true,
      data: student,
    });
  } catch (err) {
    console.error("[getChiTietHocVienLyThuyet]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getDanhSachHocVienTheoKhoa(req, res) {
  try {
    const { enrolmentPlanIid } = req.params;
    const {
      maKhoa,
      text,
      page,
      limit,
      loai_het_mon,
      loai_ly_thuyet,
      loc_ly_thuyet_online,
      loc_dang_nhap,
      loc_bat_thuong,
    } = req.query;

    const [lotusData, dbData, cabinRaw, cabinNotes] = await Promise.all([
      callWithRetry((auth) =>
        getHocVienTheoKhoa(
          enrolmentPlanIid,
          { page: 1, items_per_page: 500, text },
          auth,
        ),
      ),
      model.getAll({ maKhoa: enrolmentPlanIid }),
      maKhoa
        ? getDanhSachKetQuaCabin({ khoa: maKhoa, hoTen: text || "" })
          .then((r) => r?.data || [])
          .catch((err) => {
            console.error("[getDanhSachHocVienTheoKhoa] Cabin API error:", err.message);
            return [];
          })
        : Promise.resolve([]),
      enrolmentPlanIid
        ? model
          .getAll({ ma_khoa: enrolmentPlanIid, limit: 9999 })
          .then((r) => r?.data || [])
        : Promise.resolve([]),
    ]);

    const allStudents = Array.isArray(lotusData?.result)
      ? lotusData.result
      : [];

    // Lấy thông tin từ Google Sheet trong SQL dựa trên danh sách CCCD từ Lotus
    const cccdList = allStudents
      .map(s => s?.user?.identification_card ? String(s?.user?.identification_card).trim() : null)
      .filter(Boolean);

    const googleSheetData = cccdList.length > 0
      ? await googleSheetModel.getAllDataByCccdList(cccdList)
      : [];

    const googleSheetMap = {};
    googleSheetData.forEach(item => {
      if (item.cccd) googleSheetMap[String(item.cccd).trim()] = item;
    });

    // Trích xuất danh sách ma_dk để lấy thông tin giáo viên chính xác nhất
    const maDkList = allStudents.map(s => String(s?.user?.admission_code || s?.user?.code || s?.id || ""));
    const dangKyXeGvData = await model.getDangKyXeGvByMaDkList(maDkList);

    // Build maps
    const dbMap = {};
    (Array.isArray(dbData) ? dbData : []).forEach((item) => {
      if (item?.ma_dk) dbMap[String(item.ma_dk)] = item;
    });

    const cabinMap = buildCabinMap(cabinRaw);

    // Build map cho dang_ky_xe_gv (theo ma_dk)
    const dangKyXeGvMap = {};
    (dangKyXeGvData || []).forEach((item) => {
      if (item?.ma_dk) dangKyXeGvMap[String(item.ma_dk)] = item;
    });


    // Build cabin note map theo ma_dk
    const cabinNoteMap = {};
    cabinNotes.forEach((item) => {
      if (item?.ma_dk) cabinNoteMap[String(item.ma_dk)] = item.ghi_chu || null;
    });

    const allMapped = allStudents.map((student) => {
      const maDk = String(
        student?.user?.admission_code ||
        student?.user?.code ||
        student?.id ||
        "",
      );
      const identificationCard = student?.user?.identification_card ? String(student?.user?.identification_card).trim() : "";

      const dbRecord = dbMap[maDk] || null;
      const cabinInfo = cabinMap[maDk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
      const trangThaiCabin = getCabinStatus(
        cabinInfo.tong_thoi_gian,
        cabinInfo.so_bai_hoc,
      );

      // Thông tin từ Google Sheet (lấy từ SQL google_sheet_data theo CCCD)
      const sheetRecord = googleSheetMap[identificationCard] || null;
      const sheetInfo = sheetRecord ? {
        sdt_hoc_vien: sheetRecord.dien_thoai || null,
        nguoi_tuyen_sinh: sheetRecord.nguoi_tuyen_sinh || null,
        ghi_chu_sheet: sheetRecord.ghi_chu || null,
        dat_coc: sheetRecord.dat_coc || null,
        ctv: sheetRecord.ctv || null,
        cccd_pho_to: sheetRecord.cccd_pho_to || false,
      } : null;

      // Thông tin giáo viên từ Database
      const dangKyXeRecord = dangKyXeGvMap[maDk] || null;

      return {
        user: {
          iid: student?.user?.iid,
          name: student?.user?.name,
          first_name: student?.user?.first_name,
          last_name: student?.user?.last_name,
          avatar: student?.user?.avatar,
          birthday: student?.user?.birthday,
          birth_year: student?.user?.birth_year,
          sex: student?.user?.sex,
          identification_card: student?.user?.identification_card,
          identification_card_date: student?.user?.identification_card_date,
          identification_card_place: student?.user?.identification_card_place,
          nationality: student?.user?.nationality,
          organization_name: student?.user?.organization_name,
          school: student?.user?.schools?.[0] || student?.user?.school,
          status: student?.user?.status,
          code: maDk,
          last_login: student?.last_login_info || student?.__expand?.last_login_info || null,
        },
        learning: student?.learning_progress
          ? {
            item_iid: student.learning_progress.item_iid,
            total_hour_learned: student.learning_progress.total_hour_learned,
            progress: student.learning_progress.progress,
            passed: student.learning_progress.passed,
            learned: student.learning_progress.learned,
            score_by_rubrik: student.learning_progress.score_by_rubrik || [],
          }
          : null,
        ma_dk: maDk,
        trang_thai: dbRecord
          ? {
            loai_ly_thuyet: dbRecord.loai_ly_thuyet,
            loai_het_mon: dbRecord.loai_het_mon,
            dat_cabin: dbRecord.dat_cabin,
            dat: dbRecord.dat,
            ghi_chu: dbRecord.ghi_chu || null,
            status_updated_at:
              dbRecord.thoi_gian_thay_doi_trang_thai ||
              dbRecord.updated_at ||
              null,
          }
          : null,
        cabin: {
          tong_thoi_gian: cabinInfo.tong_thoi_gian,
          so_bai_hoc: cabinInfo.so_bai_hoc,
          trang_thai: trangThaiCabin,
          note: cabinNoteMap[maDk] || null,
        },
        // Thông tin khớp từ Database Local
        giao_vien_theo_xe: dangKyXeRecord ? {
          giao_vien: dangKyXeRecord.giao_vien,
          xe_b1: dangKyXeRecord.xe_b1,
          xe_b2: dangKyXeRecord.xe_b2,
        } : null,
        // Thông tin từ Google Sheet
        sheet_info: sheetInfo,
      };
    });

    // Helper to check truthy from query/db
    const isTrue = (val) => val === true || val === 1 || val === "1" || val === "true";

    let filtered = allMapped;

    // 1. Lọc theo loai_het_mon (đã làm bài hết môn)
    if (loai_het_mon !== undefined && loai_het_mon !== "") {
      filtered = filtered.filter((s) => isTrue(s.trang_thai?.loai_het_mon) === isTrue(loai_het_mon));
    }

    // 2. Lọc theo loai_ly_thuyet (Local status Đạt/Chưa đạt lý thuyết)
    if (loai_ly_thuyet !== undefined && loai_ly_thuyet !== "") {
      filtered = filtered.filter((s) => isTrue(s.trang_thai?.loai_ly_thuyet) === isTrue(loai_ly_thuyet));
    }

    // 3. Lọc theo lý thuyết online (LotusLMS passed status)
    if (loc_ly_thuyet_online === "dat") {
      filtered = filtered.filter((s) => isTrue(s.learning?.passed));
    } else if (loc_ly_thuyet_online === "chua_dat") {
      filtered = filtered.filter((s) => !isTrue(s.learning?.passed));
    }

    // 4. Lọc theo chưa đăng nhập
    if (loc_dang_nhap === "chua_login") {
      filtered = filtered.filter((s) => !s.user?.last_login || !s.user.last_login.ts);
    }

    // 5. Lọc bất thường (đã có cabin nhưng chưa pass lý thuyết hoặc hết môn)
    const finalFiltered =
      loc_bat_thuong === "true"
        ? filtered.filter((s) => {
          const coCabin =
            s.cabin?.tong_thoi_gian > 0 || s.cabin?.so_bai_hoc > 0;

          const daPassLyThuyet = isTrue(s.trang_thai?.loai_ly_thuyet);
          const daPassHetMon = isTrue(s.trang_thai?.loai_het_mon);

          return coCabin && (!daPassLyThuyet || !daPassHetMon);
        })
        : filtered;

    const { data: pagedData, pagination } = paginate(
      finalFiltered,
      page,
      limit,
    );

    return res.json({ success: true, pagination, data: pagedData });
  } catch (err) {
    console.error("[getDanhSachHocVienTheoKhoa]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getDashboardLyThuyet(req, res) {
  try {
    const { khoas, text, page, limit, loai_het_mon } = req.body;

    const planList = Array.isArray(khoas)
      ? khoas.filter((k) => k?.enrolmentPlanIid && k?.maKhoa)
      : [];

    if (!planList.length) {
      return res.status(400).json({
        success: false,
        message: "Thiếu tham số khoas",
      });
    }

    const enrolmentPlanIids = planList.map((k) => k.enrolmentPlanIid);

    const [checkDataRes, allDbData, allCabinNotes] = await Promise.all([
      fetch(`${LOCAL_BASE}/api/check-data-student`)
        .then((r) => r.json())
        .catch(() => ({ data: [] })),

      model.getAll({ maKhoa: { $in: enrolmentPlanIids } }).catch(() => []),

      model
        .getAll({ ma_khoa: { $in: enrolmentPlanIids }, limit: 99999 })
        .then((r) => r?.data || [])
        .catch(() => []),
    ]);

    const checkDataMap = {};
    (checkDataRes?.data || []).forEach((item) => {
      if (item?.maDangKy) checkDataMap[String(item.maDangKy)] = item;
    });

    const dbMapByPlan = {};
    (Array.isArray(allDbData) ? allDbData : []).forEach((item) => {
      if (!item?.ma_dk) return;
      const planIid = String(item.maKhoa || "");
      if (!dbMapByPlan[planIid]) dbMapByPlan[planIid] = {};
      dbMapByPlan[planIid][String(item.ma_dk)] = item;
    });

    const cabinNoteMapByPlan = {};
    allCabinNotes.forEach((item) => {
      if (!item?.ma_dk) return;
      const planIid = String(item.ma_khoa || "");
      if (!cabinNoteMapByPlan[planIid]) cabinNoteMapByPlan[planIid] = {};
      cabinNoteMapByPlan[planIid][String(item.ma_dk)] = item.ghi_chu || null;
    });

    const perPlanResults = await Promise.all(
      planList.map(async ({ enrolmentPlanIid, maKhoa }) => {
        const [lotusData, cabinRaw] = await Promise.all([
          callWithRetry((auth) =>
            getHocVienTheoKhoa(
              enrolmentPlanIid,
              { page: 1, items_per_page: 500, text },
              auth,
            ),
          ),
          getDanhSachKetQuaCabin({ khoa: maKhoa, hoTen: text || "" })
            .then((r) => r?.data || [])
            .catch(() => []),
        ]);

        const allStudents = Array.isArray(lotusData?.result)
          ? lotusData.result
          : [];

        const dbMap = dbMapByPlan[String(enrolmentPlanIid)] || {};
        const cabinMap = buildCabinMap(cabinRaw);
        const cabinNoteMap = cabinNoteMapByPlan[String(enrolmentPlanIid)] || {};

        return allStudents.map((student) => {
          const maDk = String(
            student?.user?.admission_code ||
            student?.user?.code ||
            student?.id ||
            "",
          );
          const dbRecord = dbMap[maDk] || null;
          const cabinInfo = cabinMap[maDk] || {
            tong_thoi_gian: 0,
            so_bai_hoc: 0,
          };
          const trangThaiCabin = getCabinStatus(
            cabinInfo.tong_thoi_gian,
            cabinInfo.so_bai_hoc,
          );
          const checkInfo = checkDataMap[maDk] || null;

          return {
            enrolmentPlanIid,
            ma_khoa: maKhoa,
            user: {
              iid: student?.user?.iid,
              name: student?.user?.name,
              first_name: student?.user?.first_name,
              last_name: student?.user?.last_name,
              avatar: student?.user?.avatar,
              birthday: student?.user?.birthday,
              birth_year: student?.user?.birth_year,
              sex: student?.user?.sex,
              identification_card: student?.user?.identification_card,
              identification_card_date: student?.user?.identification_card_date,
              identification_card_place:
                student?.user?.identification_card_place,
              nationality: student?.user?.nationality,
              organization_name: student?.user?.organization_name,
              school: student?.user?.schools?.[0] || student?.user?.school,
              status: student?.user?.status,
              code: maDk,
            },
            learning: student?.learning_progress
              ? {
                item_iid: student.learning_progress.item_iid,
                total_hour_learned:
                  student.learning_progress.total_hour_learned,
                progress: student.learning_progress.progress,
                passed: student.learning_progress.passed,
                learned: student.learning_progress.learned,
                score_by_rubrik:
                  student.learning_progress.score_by_rubrik || [],
              }
              : null,
            ma_dk: maDk,
            trang_thai: dbRecord
              ? {
                loai_ly_thuyet: dbRecord.loai_ly_thuyet,
                loai_het_mon: dbRecord.loai_het_mon,
                dat_cabin: dbRecord.dat_cabin,
                dat: dbRecord.dat,
                ghi_chu: dbRecord.ghi_chu || null,
                status_updated_at:
                  dbRecord.thoi_gian_thay_doi_trang_thai ||
                  dbRecord.updated_at ||
                  null,
              }
              : null,
            cabin: {
              tong_thoi_gian: cabinInfo.tong_thoi_gian,
              so_bai_hoc: cabinInfo.so_bai_hoc,
              trang_thai: trangThaiCabin,
              note: cabinNoteMap[maDk] || null,
            },
            giang_vien: checkInfo
              ? {
                giao_vien: checkInfo.giaoVien || null,
                xe_b1: checkInfo.xeB1 || null,
                xe_b2: checkInfo.xeB2 || null,
                khoa_hoc: checkInfo.khoaHoc || null,
              }
              : null,
          };
        });
      }),
    );

    const allMapped = perPlanResults.flat();
    const isTrue = (val) => val === true || val === 1 || val === "1";

    const filtered = allMapped.filter((s) => {
      const coCabin = s.cabin?.tong_thoi_gian > 0 || s.cabin?.so_bai_hoc > 0;
      const daPassLyThuyet = isTrue(s.trang_thai?.loai_ly_thuyet);
      const daPassHetMon = isTrue(s.trang_thai?.loai_het_mon);

      if (!(coCabin && (!daPassLyThuyet || !daPassHetMon))) return false;

      if (
        loai_het_mon !== undefined &&
        loai_het_mon !== null &&
        loai_het_mon !== ""
      ) {
        const filterTruthy = loai_het_mon === true || loai_het_mon === "true";
        return daPassHetMon === filterTruthy;
      }

      return true;
    });

    const { data: pagedData, pagination } = paginate(filtered, page, limit);
    return res.json({ success: true, pagination, data: pagedData });
  } catch (err) {
    console.error("[getDashboardLyThuyet]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function exportDanhSachHocVienTheoKhoaExcel(req, res) {
  try {
    const { enrolmentPlanIid } = req.params;
    const { text } = req.query;

    const pool = await connectSQL();

    // 1. Get Course Info
    const khoaRes = await pool.request()
      .input('enrolmentPlanIid', enrolmentPlanIid)
      .query('SELECT TOP 1 ten_khoa, ma_khoa, code FROM khoa_hoc WHERE ma_khoa = @enrolmentPlanIid OR code = @enrolmentPlanIid');
    const courseInfo = khoaRes.recordset[0];
    const tenKhoa = courseInfo?.ten_khoa || enrolmentPlanIid;

    // 2. Fetch Lotus data and SQL data (Only theory, no Cabin info required)
    const [lotusData, dbData] = await Promise.all([
      callWithRetry((auth) =>
        getHocVienTheoKhoa(
          enrolmentPlanIid,
          { page: 1, items_per_page: 500, text },
          auth,
        ),
      ),
      model.getAll({ maKhoa: enrolmentPlanIid }),
    ]);

    const allStudents = Array.isArray(lotusData?.result)
      ? lotusData.result
      : [];

    // Build Maps
    const dbMap = {};
    (Array.isArray(dbData) ? dbData : []).forEach((item) => {
      if (item?.ma_dk) dbMap[String(item.ma_dk)] = item;
    });

    const allMapped = allStudents.map((student) => {
      const maDk = String(
        student?.user?.admission_code ||
        student?.user?.code ||
        student?.id ||
        "",
      );

      const dbRecord = dbMap[maDk] || null;

      return {
        user: {
          iid: student?.user?.iid,
          name: student?.user?.name,
          first_name: student?.user?.first_name,
          last_name: student?.user?.last_name,
          birthday: student?.user?.birthday,
          birth_year: student?.user?.birth_year,
          sex: student?.user?.sex,
          identification_card: student?.user?.identification_card,
          code: maDk,
          last_login: student?.last_login_info || student?.__expand?.last_login_info || null,
        },
        learning: student?.learning_progress
          ? {
            item_iid: student.learning_progress.item_iid,
            total_hour_learned: student.learning_progress.total_hour_learned,
            progress: student.learning_progress.progress,
            passed: student.learning_progress.passed,
            learned: student.learning_progress.learned,
            score_by_rubrik: student.learning_progress.score_by_rubrik || [],
          }
          : null,
        ma_dk: maDk,
        trang_thai: dbRecord
          ? {
            loai_ly_thuyet: dbRecord.loai_ly_thuyet,
            loai_het_mon: dbRecord.loai_het_mon,
            dat_cabin: dbRecord.dat_cabin,
            dat: dbRecord.dat,
            ghi_chu: dbRecord.ghi_chu || null,
          }
          : null,
      };
    });

    const isTrue = (val) => val === true || val === 1 || val === "1" || val === "true";

    // No filtering required (Lấy toàn bộ danh sách lớp lý thuyết trực tuyến)
    const finalFiltered = allMapped;

    // Helpers to format data fields
    function formatSex(sex) {
      if (sex === undefined || sex === null) return "";
      const s = String(sex).trim().toLowerCase();
      if (s === "1" || s === "nam" || s === "male" || s === "true") return "Nam";
      if (s === "0" || s === "nữ" || s === "nu" || s === "female" || s === "false") return "Nữ";
      return sex;
    }

    function formatBirthday(birthday) {
      if (!birthday) return "";
      let d;
      if (typeof birthday === 'number' || !isNaN(Number(birthday))) {
        d = new Date(Number(birthday) * 1000);
      } else {
        d = new Date(birthday);
      }
      if (isNaN(d.getTime())) return birthday;
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }

    const topicsConfig = [
      { key: "Kỹ thuật lái xe", display: "Kỹ thuật lái xe" },
      { key: "Cấu tạo sửa chữa", display: "Cấu tạo sửa chữa" },
      { key: "Đạo đức", display: "Đạo đức, VHGT, PCCC" },
      { key: "PL1", display: "PL1 - Luật trật tự, ATGT" },
      { key: "PL2", display: "PL2 - Biển báo" },
      { key: "PL3", display: "PL3 - Xử lý THGT" },
      { key: "Tổng ôn tập", display: "Tổng ôn tập" },
      { key: "Mô phỏng", display: "Mô phỏng" }
    ];

    const today = new Date();
    const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const aoa = [];
    // Row 1: Title
    aoa.push([`BÁO CÁO KẾT QUẢ HỌC LÝ THUYẾT TRỰC TUYẾN CỦA KHÓA HỌC ${tenKhoa.toUpperCase()}`]);
    // Row 2: Subtitle
    aoa.push([`(Ngày báo cáo : ${formattedToday})`]);
    // Row 3: Blank
    aoa.push([]);
    // Row 4
    aoa.push([
      "STT", "Tên", "Giới tính", "Ngày sinh", "Kết quả toàn khóa học",
      "Tiến độ chương trình đào tạo", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      "Ghi chú"
    ]);
    // Row 5
    aoa.push([
      "", "", "", "", "",
      "Kỹ thuật lái xe", "", "Cấu tạo sửa chữa", "", "Đạo đức, VHGT, PCCC", "",
      "Pháp luật GTĐB", "", "", "", "", "", "", "",
      "Mô phỏng", "",
      ""
    ]);
    // Row 6
    aoa.push([
      "", "", "", "", "",
      "", "", "", "", "", "",
      "PL1 - Luật trật tự, ATGT", "", "PL2 - Biển báo", "", "PL3 - Xử lý THGT", "", "Tổng ôn tập", "",
      "", "",
      ""
    ]);
    // Row 7
    aoa.push([
      "", "", "", "", "",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      "% thời gian môn học", "Trạng thái đạt",
      ""
    ]);

    // Data rows
    finalFiltered.forEach((student, index) => {
      const row = [
        index + 1,
        student.user?.name || "",
        formatSex(student.user?.sex),
        formatBirthday(student.user?.birthday),
        isTrue(student.learning?.passed) ? "Đạt" : "Chưa đạt"
      ];

      const rubriks = student.learning?.score_by_rubrik || [];
      const rubrikMap = {};
      rubriks.forEach((item) => {
        const name = item.name || "";
        const matchedConfig = topicsConfig.find((cfg) => name.toLowerCase().includes(cfg.key.toLowerCase()));
        if (matchedConfig) {
          rubrikMap[matchedConfig.key] = item;
        }
      });

      topicsConfig.forEach((cfg) => {
        const item = rubrikMap[cfg.key];
        if (item) {
          const score = item.score !== undefined && item.score !== null ? Math.round(Number(item.score) * 100) / 100 : 0;
          row.push(score);
          const passed = Number(item.passed) === 1 || item.passed === true;
          row.push(passed ? "Đạt" : "Chưa đạt");
        } else {
          row.push(0);
          row.push("Chưa đạt");
        }
      });

      // Ghi chú
      row.push(student.trang_thai?.ghi_chu || "");

      aoa.push(row);
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("KetQuaHocLyThuyet");

    worksheet.addRows(aoa);

    // Merge Header Cells
    worksheet.mergeCells("A1:V1");
    worksheet.mergeCells("A2:V2");

    // Base columns merge from Row 4 to Row 7
    for (let c of [1, 2, 3, 4, 5, 22]) {
      worksheet.mergeCells(4, c, 7, c);
    }

    worksheet.mergeCells(4, 6, 4, 21); // Tiến độ chương trình đào tạo
    worksheet.mergeCells(5, 6, 6, 7);  // Kỹ thuật lái xe
    worksheet.mergeCells(5, 8, 6, 9);  // Cấu tạo sửa chữa
    worksheet.mergeCells(5, 10, 6, 11); // Đạo đức, VHGT, PCCC
    worksheet.mergeCells(5, 12, 5, 19); // Pháp luật GTĐB
    worksheet.mergeCells(5, 20, 6, 21); // Mô phỏng

    worksheet.mergeCells(6, 12, 6, 13); // PL1
    worksheet.mergeCells(6, 14, 6, 15); // PL2
    worksheet.mergeCells(6, 16, 6, 17); // PL3
    worksheet.mergeCells(6, 18, 6, 19); // Tổng ôn tập

    // Row heights
    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 20;
    worksheet.getRow(3).height = 15;
    worksheet.getRow(4).height = 25;
    worksheet.getRow(5).height = 25;
    worksheet.getRow(6).height = 25;
    worksheet.getRow(7).height = 35;

    const totalRows = aoa.length;
    for (let r = 8; r <= totalRows; r++) {
      worksheet.getRow(r).height = 20;
    }

    // Column widths
    const columnWidths = [
      6,   // A: STT
      25,  // B: Tên
      10,  // C: Giới tính
      12,  // D: Ngày sinh
      15,  // E: Kết quả toàn khóa học
      12,  // F: Kỹ thuật lái xe %
      12,  // G: Kỹ thuật lái xe status
      12,  // H: Cấu tạo sửa chữa %
      12,  // I: Cấu tạo sửa chữa status
      12,  // J: Đạo đức %
      12,  // K: Đạo đức status
      12,  // L: PL1 %
      12,  // M: PL1 status
      12,  // N: PL2 %
      12,  // O: PL2 status
      12,  // P: PL3 %
      12,  // Q: PL3 status
      12,  // R: Tổng ôn tập %
      12,  // S: Tổng ôn tập status
      12,  // T: Mô phỏng %
      12,  // U: Mô phỏng status
      20   // V: Ghi chú
    ];
    columnWidths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });

    // Formatting cell styles
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (rowNumber >= 4) {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          if (rowNumber <= 7) {
            const colIndex = Number(cell.col);
            let shouldBold = true;

            // Remove bold from all cells in Row 7 (% thời gian môn học, Trạng thái đạt)
            if (rowNumber === 7) {
              shouldBold = false;
            }
            // Remove bold from PL1 (col 12, 13), PL2 (col 14, 15), PL3 (col 16, 17) in Row 6
            else if (rowNumber === 6 && colIndex >= 12 && colIndex <= 17) {
              shouldBold = false;
            }

            cell.font = { name: 'Times New Roman', bold: shouldBold, size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          } else {
            cell.font = { name: 'Times New Roman', size: 11 };
            const colIndex = Number(cell.col);
            if (colIndex === 1 || colIndex === 3 || colIndex === 4 || colIndex === 5 || (colIndex >= 6 && colIndex <= 21)) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
          }
        }
      });
    });

    // Format Title & Subtitle
    const titleCell = worksheet.getCell("A1");
    titleCell.font = { name: 'Times New Roman', bold: true, size: 16 };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.font = { name: 'Times New Roman', italic: true, size: 11 };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Disposition', `attachment; filename="BaoCaoLyThuyet_${enrolmentPlanIid}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error("[exportDanhSachHocVienTheoKhoaExcel]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getDanhSachLop,
  getDanhSachHocVien,
  getDanhSachHocVienTheoKhoa,
  searchDanhSachLop,
  getDashboardLyThuyet,
  getChiTietHocVienLyThuyet,
  exportDanhSachHocVienTheoKhoaExcel,
};
