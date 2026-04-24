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
        ? getDanhSachKetQuaCabin({ khoa: maKhoa, hoTen: text || "" }).then(
          (r) => r?.data || [],
        )
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
      filtered = filtered.filter((s) => s.learning?.passed === true);
    } else if (loc_ly_thuyet_online === "chua_dat") {
      filtered = filtered.filter((s) => s.learning?.passed === false);
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

module.exports = {
  getDanhSachLop,
  getDanhSachHocVien,
  getDanhSachHocVienTheoKhoa,
  searchDanhSachLop,
  getDashboardLyThuyet,
};
