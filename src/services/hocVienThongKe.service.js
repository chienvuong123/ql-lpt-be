"use strict";

/**
 * Thống kê bổ sung cho "Báo cáo học viên hàng loạt" chỉ từ mã đăng ký:
 *  - Thông tin học viên (họ tên, CCCD, khóa) lấy từ bảng hoc_vien
 *  - Cabin: tổng thời gian + số bài (API thongtintap theo maDK)
 *  - Lý thuyết: tiến độ + điểm từng môn (Lotus LMS, fallback bảng backup)
 */

const mssql = require("mssql");
const connectSQL = require("../configs/sql");
const {
  getKetQuaTapByMaDk,
  buildCabinMap,
  getCabinStatus,
} = require("./cabinApi.service");
const {
  getLopHocLyThuyet,
  getHocVienTheoKhoa,
  callWithRetry,
} = require("./lotusApi.service");

const CONCURRENCY = 8;
const LOP_CACHE_TTL_MS = 10 * 60 * 1000;
const SQL_CHUNK = 900; // SQL Server giới hạn 2100 tham số / câu lệnh

async function mapConcurrent(items, limit, fn) {
  const result = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        result[i] = await fn(items[i], i);
      } catch (err) {
        result[i] = { error: err?.message || "Unknown error" };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return result;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function queryIn(sqlBuilder, values, type = mssql.VarChar) {
  if (!values.length) return [];
  const pool = await connectSQL();
  const rows = [];
  for (const part of chunk(values, SQL_CHUNK)) {
    const request = pool.request();
    const names = part.map((v, i) => {
      request.input(`p${i}`, type, v);
      return `@p${i}`;
    });
    const result = await request.query(sqlBuilder(names.join(",")));
    rows.push(...(result.recordset || []));
  }
  return rows;
}

// ─── Thông tin học viên ─────────────────────────────────────
async function getHocVienInfoMap(maDkList) {
  const rows = await queryIn(
    (inList) => `
      SELECT ma_dk, ho_ten, cccd, ma_khoa, hang, hang_gplx
      FROM [dbo].[hoc_vien] WITH (NOLOCK)
      WHERE ma_dk IN (${inList})`,
    maDkList,
  ).catch((err) => {
    console.error("[hocVienThongKe] hoc_vien:", err.message);
    return [];
  });
  return new Map(rows.map((r) => [r.ma_dk, r]));
}

// ─── Cabin ─────────────────────────────────────
async function getCabinOne(maDk) {
  const raw = await getKetQuaTapByMaDk(maDk);
  const records = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  const cb = buildCabinMap(records)[maDk];
  if (!cb) {
    return {
      tong_thoi_gian_giay: 0,
      so_bai_hoc: 0,
      trang_thai: "chua_hoc",
      bai_hoc: [],
      thong_tin: null,
    };
  }
  return {
    tong_thoi_gian_giay: cb.tong_thoi_gian,
    so_bai_hoc: cb.so_bai_hoc,
    trang_thai: getCabinStatus(cb.tong_thoi_gian, cb.so_bai_hoc),
    bai_hoc: cb.bai_hoc.map((b) => ({ ten_bai: b.ten_bai, giay: b.tong_thoi_gian })),
    // Dùng làm dữ liệu dự phòng khi học viên chưa có trong bảng hoc_vien
    thong_tin: { ho_ten: cb.ho_ten, cccd: cb.cccd, ma_khoa: cb.ma_khoa },
  };
}

// ─── Lý thuyết ─────────────────────────────────────
let _lopCache = { ts: 0, map: null };

async function getLopIidByCodeMap() {
  if (_lopCache.map && Date.now() - _lopCache.ts < LOP_CACHE_TTL_MS) {
    return _lopCache.map;
  }
  try {
    const data = await callWithRetry((auth) => getLopHocLyThuyet({}, auth));
    const list = Array.isArray(data?.result) ? data.result : [];
    const map = new Map(
      list.filter((l) => l?.code && l?.iid).map((l) => [String(l.code), String(l.iid)]),
    );
    _lopCache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    console.error("[hocVienThongKe] lop ly thuyet:", err.message);
    return _lopCache.map || new Map();
  }
}

function parseRubrik(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return parsed?.score_by_rubrik || parsed?.score_by_rubric || [];
  } catch {
    return [];
  }
}

function buildLyThuyet(progress, rubrik, nguon, capNhat = null) {
  const list = parseRubrik(rubrik);
  // Phần tử "Bảng tổng hợp / Bảng điểm" là điểm tổng -> không lặp lại trong danh sách môn
  const mon = list
    .filter((r) => r?.name && !/bảng (tổng hợp|điểm)/i.test(r.name))
    .map((r) => ({
      ten: r.name,
      diem: Number(r.score) || 0,
      dat: Number(r.passed) === 1,
    }));
  // Màn "Quản lý học viên lý thuyết" luôn có cột Tổng ôn tập (thiếu => 0, chưa đạt)
  if (list.length && !mon.some((m) => /tổng ôn tập/i.test(m.ten))) {
    const idx = mon.findIndex((m) => /mô phỏng/i.test(m.ten));
    const item = { ten: "Tổng ôn tập", diem: 0, dat: false };
    if (idx >= 0) mon.splice(idx, 0, item);
    else mon.push(item);
  }
  return {
    nguon,
    tien_do: progress === null || progress === undefined ? null : Number(progress),
    // Giống màn "Quản lý học viên lý thuyết": đạt chương trình khi mọi mục đều passed
    dat_chuong_trinh: list.length ? list.every((r) => Number(r?.passed) !== 0) : null,
    mon,
    cap_nhat: capNhat,
  };
}

async function getBackupLyThuyetMap(keys) {
  const rows = await queryIn(
    (inList) => `
      SELECT ma_dk, enrolment_plan_iid, progress, score_by_rubrik, updated_at
      FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] WITH (NOLOCK)
      WHERE ma_dk IN (${inList})`,
    keys,
  ).catch((err) => {
    console.error("[hocVienThongKe] backup ly thuyet:", err.message);
    return [];
  });
  return new Map(rows.map((r) => [r.ma_dk, r]));
}

async function getLyThuyetOne({ maDk, cccd, maKhoa }, lopMap, backupMap) {
  // Bảng backup có khi lưu theo mã ĐK, có khi theo CCCD
  const backup = backupMap.get(maDk) || (cccd ? backupMap.get(cccd) : null) || null;
  const iid = (maKhoa && lopMap.get(maKhoa)) || backup?.enrolment_plan_iid || null;

  if (iid && cccd) {
    try {
      const data = await callWithRetry((auth) =>
        getHocVienTheoKhoa(iid, { text: cccd, items_per_page: 20 }, auth),
      );
      const members = Array.isArray(data?.result) ? data.result : [];
      const member = members.find((m) => {
        const card = String(m?.user?.identification_card || "").trim();
        const code = String(m?.user?.code || "").trim();
        return card === cccd || code === cccd;
      });
      if (member) {
        const lp = member.learning_progress || {};
        return buildLyThuyet(
          lp.progress,
          lp.score_by_rubrik,
          data?._is_backup ? "backup" : "lms",
        );
      }
    } catch (err) {
      console.warn(`[hocVienThongKe] LMS ${maDk}:`, err.message);
    }
  }

  if (backup) {
    return buildLyThuyet(backup.progress, backup.score_by_rubrik, "backup", backup.updated_at);
  }
  return { nguon: null, tien_do: null, mon: [], cap_nhat: null };
}

/**
 * Trả về Map maDk -> { hoTen, cccd, maKhoa, hang, cabin, lyThuyet }
 */
async function getThongKeHocVien(maDkList) {
  const [infoMap, cabinList] = await Promise.all([
    getHocVienInfoMap(maDkList),
    mapConcurrent(maDkList, CONCURRENCY, (maDk) => getCabinOne(maDk)),
  ]);

  const base = maDkList.map((maDk, i) => {
    const info = infoMap.get(maDk) || {};
    const cabin = cabinList[i] || {};
    const fallback = cabin.thong_tin || {};
    return {
      maDk,
      hoTen: info.ho_ten || fallback.ho_ten || null,
      cccd: String(info.cccd || fallback.cccd || "").trim() || null,
      maKhoa: info.ma_khoa || fallback.ma_khoa || null,
      hang: info.hang || info.hang_gplx || null,
      cabin: cabin.error
        ? { loi: cabin.error, tong_thoi_gian_giay: null, so_bai_hoc: null, bai_hoc: [] }
        : {
            tong_thoi_gian_giay: cabin.tong_thoi_gian_giay,
            so_bai_hoc: cabin.so_bai_hoc,
            trang_thai: cabin.trang_thai,
            bai_hoc: cabin.bai_hoc,
          },
    };
  });

  const backupKeys = [
    ...new Set(base.flatMap((b) => [b.maDk, b.cccd]).filter(Boolean)),
  ];
  const [lopMap, backupMap] = await Promise.all([
    getLopIidByCodeMap(),
    getBackupLyThuyetMap(backupKeys),
  ]);

  const lyThuyetList = await mapConcurrent(base, CONCURRENCY, (b) =>
    getLyThuyetOne(b, lopMap, backupMap),
  );

  return new Map(
    base.map((b, i) => {
      const lt = lyThuyetList[i];
      return [
        b.maDk,
        {
          ...b,
          lyThuyet: lt?.error
            ? { nguon: null, tien_do: null, mon: [], loi: lt.error }
            : lt,
        },
      ];
    }),
  );
}

module.exports = { getThongKeHocVien };
