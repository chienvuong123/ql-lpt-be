const hocVienTHService = require("./hocVienTH.service");
const dkMappingModel = require("../models/dkMapping.model");

const normalizeCccd = (val) => String(val || "").replace(/\s+/g, "").trim();

// So sánh học viên trả về từ /api/hoc-vien-th với roster local theo (cccd + khóa) —
// trả về danh sách các thay đổi ma_dk_cu -> ma_dk_moi cần áp dụng (chưa ghi DB).
async function previewMaDkSync() {
  const apiStudents = await hocVienTHService.getHocVienTHByFixedCourses();

  const tenKhoaList = [...new Set(apiStudents.map((s) => s.ten_khoa).filter(Boolean))];
  const localRoster = tenKhoaList.length
    ? await dkMappingModel.getHocVienForCourses(tenKhoaList)
    : [];

  const localByKey = new Map();
  localRoster.forEach((row) => {
    const cccd = normalizeCccd(row.cccd);
    if (!cccd) return;
    localByKey.set(`${cccd}|${row.ten_khoa}`, row);
  });

  const changes = [];
  const seenMaDk = new Set();

  for (const s of apiStudents) {
    const cccd = normalizeCccd(s.cccd);
    if (!cccd || !s.ma_dk) continue;

    const local = localByKey.get(`${cccd}|${s.ten_khoa}`);
    if (!local) continue;
    if (local.ma_dk === s.ma_dk) continue; // đã đồng bộ, không cần đổi
    if (seenMaDk.has(local.ma_dk)) continue; // tránh xử lý trùng nếu API trả về lặp
    seenMaDk.add(local.ma_dk);

    changes.push({
      hoc_vien_id: local.id,
      ma_khoa: local.ma_khoa,
      ten_khoa: local.ten_khoa,
      ho_ten: local.ho_ten || s.ten,
      cccd: local.cccd,
      ma_dk_cu: local.ma_dk,
      ma_dk_moi: s.ma_dk,
    });
  }

  return {
    totalApiStudents: apiStudents.length,
    totalLocalStudents: localRoster.length,
    totalChanges: changes.length,
    changes,
  };
}

// Áp dụng thật sự: cascade update ma_dk trên toàn bộ bảng liên quan cho từng thay đổi.
async function applyMaDkSync() {
  const preview = await previewMaDkSync();
  let applied = 0;
  const errors = [];

  for (const change of preview.changes) {
    try {
      await dkMappingModel.applyMaDkChange(change);
      applied++;
    } catch (err) {
      errors.push({
        ma_dk_cu: change.ma_dk_cu,
        ma_dk_moi: change.ma_dk_moi,
        ho_ten: change.ho_ten,
        error: err.message,
      });
    }
  }

  return {
    totalChanges: preview.totalChanges,
    applied,
    failed: errors.length,
    errors,
  };
}

module.exports = { previewMaDkSync, applyMaDkSync };
