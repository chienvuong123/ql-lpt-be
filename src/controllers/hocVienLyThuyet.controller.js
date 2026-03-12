const {
  getLopHocLyThuyet,
  getHocVienTheoKhoa,
  callWithRetry,
} = require("../services/lotusApi.service");
const model = require("../models/lopLyThuyet.model");
const { paginate } = require("../utils/paginate");

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
    console.log(extraParams);

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
    const { maKhoa, text, page, limit } = req.query;

    const [lotusData, dbData] = await Promise.all([
      callWithRetry((auth) =>
        getHocVienTheoKhoa(
          enrolmentPlanIid,
          { page: 1, items_per_page: 500, text },
          auth,
        ),
      ),
      enrolmentPlanIid
        ? model.getAll({ maKhoa: enrolmentPlanIid })
        : Promise.resolve([]),
    ]);

    const allStudents = Array.isArray(lotusData?.result)
      ? lotusData.result
      : [];

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
      };
    });

    const { data: pagedData, pagination } = paginate(allMapped, page, limit);

    return res.json({ success: true, pagination, data: pagedData });
  } catch (err) {
    console.error("[getDanhSachHocVienTheoKhoa]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getDanhSachLop,
  getDanhSachHocVien,
  getDanhSachHocVienTheoKhoa,
  searchDanhSachLop,
};
