const { normalizeStatusTime } = require("../helpers/time.helper");
const model = require("../models/cabin.model");
const modelLyThuyet = require("../models/lopLyThuyet.model");
const {
  buildCabinMap,
  getCabinStatus,
  getDanhSachKetQuaCabin,
} = require("../services/cabinApi.service");
const {
  callWithRetry,
  getHocVienTheoKhoa,
} = require("../services/lotusApi.service");
const { paginate } = require("../utils/paginate");

async function getDanhSachDatCabin(req, res) {
  try {
    const { maKhoa, tenKhoa, hoTen, page, limit } = req.query;
    const result = await model.getDatCabin({
      maKhoa,
      tenKhoa,
      hoTen,
      page,
      limit,
    });
    const totalPages = Math.ceil(result.total / result.limit);

    return res.json({
      success: true,
      pagination: {
        total: result.total,
        totalPages,
        page: result.page,
        limit: result.limit,
        hasNext: result.page < totalPages,
        hasPrev: result.page > 1,
      },
      filter: {
        maKhoa: maKhoa || null,
        tenKhoa: tenKhoa || null,
        hoTen: hoTen || null,
      },
      data: result.data.map(normalizeStatusTime),
    });
  } catch (err) {
    console.error("[getDanhSachDatCabin]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getDanhSachHocVienCabin(req, res) {
  try {
    const { enrolmentPlanIid } = req.params;
    const { text, page, limit, trang_thai_cabin, khoa } = req.query;

    const [lotusData, dbData, cabinRaw, cabinNotes] = await Promise.all([
      callWithRetry((auth) =>
        getHocVienTheoKhoa(
          enrolmentPlanIid,
          { page: 1, items_per_page: 500, text },
          auth,
        ),
      ),
      enrolmentPlanIid
        ? modelLyThuyet.getAll({ maKhoa: enrolmentPlanIid })
        : Promise.resolve([]),
      khoa
        ? getDanhSachKetQuaCabin({ khoa, hoTen: text || "" }).then(
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

    // Build maps
    const dbMap = {};
    (Array.isArray(dbData) ? dbData : []).forEach((item) => {
      if (item?.ma_dk) dbMap[String(item.ma_dk)] = item;
    });

    const cabinMap = buildCabinMap(cabinRaw);

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
      const dbRecord = dbMap[maDk] || null;
      const cabinInfo = cabinMap[maDk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };

      // Tính trang_thai
      let trangThai;
      if (dbRecord) {
        trangThai = {
          loai_ly_thuyet: dbRecord.loai_ly_thuyet,
          loai_het_mon: dbRecord.loai_het_mon,
          dat_cabin: dbRecord.dat_cabin,
          dat: dbRecord.dat,
          ghi_chu: dbRecord.ghi_chu || null,
          status_updated_at:
            dbRecord.thoi_gian_thay_doi_trang_thai ||
            dbRecord.updated_at ||
            null,
        };
      } else {
        const scoreByRubrik = student?.learning_progress?.score_by_rubrik || [];
        const autoLyThuyetPassed =
          Array.isArray(scoreByRubrik) &&
          scoreByRubrik.length > 0 &&
          scoreByRubrik.every((item) => Number(item?.passed) !== 0);

        trangThai = {
          loai_ly_thuyet: autoLyThuyetPassed,
          loai_het_mon: false,
          dat_cabin: null,
          dat: null,
          ghi_chu: null,
          status_updated_at: null,
        };
      }

      const trangThaiCabin = getCabinStatus(
        cabinInfo.tong_thoi_gian,
        cabinInfo.so_bai_hoc,
      );

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
        trang_thai: trangThai,
        cabin: {
          tong_thoi_gian: cabinInfo.tong_thoi_gian,
          so_bai_hoc: cabinInfo.so_bai_hoc,
          trang_thai: trangThaiCabin,
          note: cabinNoteMap[maDk] || null,
        },
      };
    });

    // Lọc chỉ học viên đủ điều kiện cabin
    let filtered = allMapped.filter((student) => {
      const tt = student.trang_thai;
      if (!tt) return true;
      return Boolean(tt.loai_ly_thuyet) && Boolean(tt.loai_het_mon);
    });

    // Lọc theo trạng thái cabin nếu có
    if (trang_thai_cabin) {
      filtered = filtered.filter(
        (s) => s.cabin.trang_thai === trang_thai_cabin,
      );
    }

    const { data: pagedData, pagination } = paginate(filtered, page, limit);

    return res.json({ success: true, pagination, data: pagedData });
  } catch (err) {
    console.error("[getDanhSachHocVienCabin]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function upsertCabinNote(req, res) {
  try {
    const { ma_dk, ten_hoc_vien, ghi_chu, ma_khoa, ten_khoa } = req.body;

    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thieu ma_dk" });
    }

    const result = await model.createOrUpdate({
      ma_dk,
      ten_hoc_vien,
      ghi_chu,
      ma_khoa,
      ten_khoa,
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("[upsertCabinNote]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

module.exports = {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
};
