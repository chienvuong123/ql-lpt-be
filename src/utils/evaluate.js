const HANG_DAO_TAO_CONFIG = {
  B1: {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  B11: {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  "B.01": {
    thoiGian: { banNgay: 9, banDem: 3, tuDong: 0, tong: 12 },
    quangDuong: { banNgay: 590, banDem: 120, tuDong: 0, tong: 710 },
  },
  B2: {
    thoiGian: { banNgay: 15, banDem: 3, tuDong: 2, tong: 20 },
    quangDuong: { banNgay: 610, banDem: 120, tuDong: 80, tong: 810 },
  },
  B: {
    thoiGian: { banNgay: 15, banDem: 3, tuDong: 2, tong: 20 },
    quangDuong: { banNgay: 610, banDem: 120, tuDong: 80, tong: 810 },
  },
  C: {
    thoiGian: { banNgay: 20, banDem: 3, tuDong: 1, tong: 24 },
    quangDuong: { banNgay: 705, banDem: 90, tuDong: 30, tong: 825 },
  },
  C1: {
    thoiGian: { banNgay: 20, banDem: 3, tuDong: 1, tong: 24 },
    quangDuong: { banNgay: 705, banDem: 90, tuDong: 30, tong: 825 },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePlate(plate) {
  if (!plate) return "";
  return plate
    .replace(/[-.\s]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeName(str = "") {
  return str.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

const removeBirthYear = (name = "") => name.replace(/\(\d{4}\)/g, "").trim();

function fmtGio(gio) {
  const g = Math.floor(gio);
  const p = Math.round((gio - g) * 60);
  return `${g}h ${p.toString().padStart(2, "0")}'`;
}

function fmtDateStr(str) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d)
    ? str
    : d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * Xác định biển số xe tự động dựa trên:
 * 1. Nếu có studentInfo với xeB1 + xeB2: xe nào khớp với xe đăng ký VÀ xuất hiện ít hơn
 *    là xe tự động (xe nhiều = số sàn, xe ít = tự động).
 * 2. Nếu không có studentInfo (hoặc chỉ có 1 xe): lấy xe xuất hiện ít nhất
 *    (chỉ khi có từ 2 biển số trở lên).
 */
function getBienSoTuDong(dataSource, studentInfo = null) {
  if (!dataSource || dataSource.length === 0) return null;

  // Đếm số lần xuất hiện mỗi biển số
  const count = {};
  dataSource.forEach((item) => {
    const bs = normalizePlate(item.BienSo);
    if (bs) count[bs] = (count[bs] || 0) + 1;
  });

  const entries = Object.entries(count);
  if (entries.length <= 1) return null; // Chỉ có 1 loại xe → không phân biệt được

  // Nếu có thông tin xe đăng ký với 2 xe
  if (studentInfo) {
    const bs1 = normalizePlate(studentInfo.xeB1);
    const bs2 = normalizePlate(studentInfo.xeB2);

    if (bs1 && bs2) {
      // Xe nào xuất hiện ít hơn trong 2 xe đăng ký → là xe tự động
      const cnt1 = count[bs1] || 0;
      const cnt2 = count[bs2] || 0;
      if (cnt1 === 0 && cnt2 === 0) return null;
      if (cnt1 === 0) return bs2;
      if (cnt2 === 0) return bs1;
      return cnt1 <= cnt2 ? bs1 : bs2;
    }

    // Chỉ có xeB2 (xe tự động được chỉ định rõ)
    if (bs2 && count[bs2]) return bs2;
  }

  // Fallback: xe xuất hiện ít nhất trong tập dữ liệu
  return entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min))[0];
}

// ─── getInvalidSessionIndexes ─────────────────────────────────────────────────
// Các lỗi dẫn đến loại phiên khỏi tổng:
//   1. Tốc độ TB < 18 km/h
//   2. Xe tự động ngoài khung giờ hợp lệ
//   3. Thời gian nghỉ giữa phiên < 15 phút (phiên SAU bị loại)
//   4. Phiên dưới 5 phút
//   5. Sai tên giáo viên so với GV xuất hiện nhiều nhất
//   6. Sai biển số xe so với danh sách đăng ký (nếu có studentInfo)
//   7. Sai giáo viên so với GV đăng ký trong studentInfo (nếu có)

function getInvalidSessionIndexes(dataSource, studentInfo = null) {
  const invalidIndexes = new Set();
  const tuDongLoiIndexes = new Set();
  const invalidReasons = new Map();

  if (!dataSource || dataSource.length === 0)
    return { invalidIndexes, tuDongLoiIndexes, invalidReasons };

  const addReason = (idx, reason) => {
    if (!invalidReasons.has(idx)) invalidReasons.set(idx, []);
    invalidReasons.get(idx).push(reason);
    invalidIndexes.add(idx);
  };

  const MIN_SPEED = 18; // km/h
  const MIN_MINUTES = 5; // phút
  const bienSoTuDong = getBienSoTuDong(dataSource, studentInfo);

  // ── Tên GV hợp lệ = xuất hiện nhiều nhất trong dữ liệu ──
  const gvCount = {};
  dataSource.forEach((item) => {
    const ten = (item.HoTenGV || "").trim();
    if (ten) gvCount[ten] = (gvCount[ten] || 0) + 1;
  });
  const gvEntries = Object.entries(gvCount);
  const tenGVHopLe =
    gvEntries.length > 0
      ? gvEntries.reduce((max, cur) => (cur[1] > max[1] ? cur : max))[0]
      : null;

  // ── GV đăng ký (nếu có studentInfo) ──
  const tenGVDangKy = studentInfo?.giaoVien
    ? normalizeName(removeBirthYear(studentInfo.giaoVien))
    : null;

  // ── Biển số hợp lệ (nếu có studentInfo) ──
  const allowedPlates = studentInfo
    ? new Set(
        [
          normalizePlate(studentInfo.xeB1),
          normalizePlate(studentInfo.xeB2),
        ].filter(Boolean),
      )
    : null;

  // 1. Tốc độ TB < 18 km/h
  dataSource.forEach((phien, idx) => {
    const km = phien.TongQuangDuong || phien.TongQD_raw || 0;
    const giay = phien.TongThoiGian || 0;
    if (giay === 0 || km === 0) return;
    const tocDo = km / (giay / 3600);
    if (tocDo < MIN_SPEED)
      addReason(idx, `Tốc độ TB ${tocDo.toFixed(1)} km/h < ${MIN_SPEED} km/h`);
  });

  // 2. Phiên dưới 5 phút
  dataSource.forEach((phien, idx) => {
    const giay = phien.TongThoiGian || 0;
    if (giay === 0) return;
    const phut = giay / 60;
    if (phut < MIN_MINUTES)
      addReason(
        idx,
        `Phiên quá ngắn: ${phut.toFixed(1)} phút (< ${MIN_MINUTES} phút)`,
      );
  });

  // 3. Xe tự động ngoài khung giờ hợp lệ
  if (bienSoTuDong) {
    dataSource.forEach((phien, idx) => {
      if (normalizePlate(phien.BienSo) !== normalizePlate(bienSoTuDong)) return;
      const thoiDiem = new Date(phien.ThoiDiemDangNhap);
      if (isNaN(thoiDiem)) return;

      const hour = thoiDiem.getHours();
      const minute = thoiDiem.getMinutes();
      const totalMinutes = hour * 60 + minute;

      const SANG_START = 4 * 60 + 45; // 04:45
      const SANG_END = 6 * 60 + 59; // 06:59
      const CHIEU_START = 17 * 60; // 17:00

      const inSangWindow =
        totalMinutes >= SANG_START && totalMinutes <= SANG_END;
      const inChieuWindow = totalMinutes >= CHIEU_START;

      if (!inSangWindow && !inChieuWindow) {
        addReason(
          idx,
          `Xe tự động bắt đầu lúc ${hour}h${String(minute).padStart(2, "0")} — không thuộc khung hợp lệ (04:45–06:59 hoặc từ sau 17:00)`,
        );
        tuDongLoiIndexes.add(idx);
      }
    });
  }

  // 4. Nghỉ giữa phiên < 15 phút → phiên SAU bị loại
  const sorted = [...dataSource]
    .map((item, originalIdx) => ({ item, originalIdx }))
    .sort(
      (a, b) =>
        new Date(a.item.ThoiDiemDangNhap) - new Date(b.item.ThoiDiemDangNhap),
    );

  for (let i = 1; i < sorted.length; i++) {
    const tXuat = new Date(sorted[i - 1].item.ThoiDiemDangXuat);
    const tNhap = new Date(sorted[i].item.ThoiDiemDangNhap);
    if (isNaN(tXuat) || isNaN(tNhap)) continue;
    const nghiPhut = (tNhap - tXuat) / 1000 / 60;
    if (nghiPhut < 15)
      addReason(
        sorted[i].originalIdx,
        `Nghỉ giữa phiên ${nghiPhut.toFixed(0)} phút (< 15 phút)`,
      );
  }

  // 5. Sai tên giáo viên so với GV xuất hiện nhiều nhất
  // if (tenGVHopLe) {
  //   dataSource.forEach((phien, idx) => {
  //     const ten = (phien.HoTenGV || "").trim();
  //     if (!ten)
  //       addReason(idx, `Không có tên giáo viên (GV hợp lệ: "${tenGVHopLe}")`);
  //     else if (ten !== tenGVHopLe)
  //       addReason(idx, `Tên GV "${ten}" khác với GV hợp lệ "${tenGVHopLe}"`);
  //   });
  // }

  // 6. Sai giáo viên so với GV đăng ký (studentInfo)
  if (tenGVDangKy) {
    dataSource.forEach((phien, idx) => {
      const tenPhien = normalizeName(removeBirthYear(phien.HoTenGV || ""));
      if (tenPhien !== tenGVDangKy)
        addReason(
          idx,
          `Tên GV "${phien.HoTenGV || "(trống)"}" không khớp với GV đăng ký "${studentInfo.giaoVien}"`,
        );
    });
  }

  // 7. Sai biển số xe so với danh sách đăng ký (studentInfo)
  if (allowedPlates && allowedPlates.size > 0) {
    dataSource.forEach((phien, idx) => {
      const bs = normalizePlate(phien.BienSo);
      if (bs && !allowedPlates.has(bs))
        addReason(
          idx,
          `Biển số "${phien.BienSo}" không nằm trong danh sách xe đăng ký`,
        );
    });
  }

  return { invalidIndexes, tuDongLoiIndexes, invalidReasons };
}

// ─── Các hàm evaluate cảnh báo (chỉ hiển thị, không ảnh hưởng tổng) ──────────

function evaluateNghiGiuaPhien(dataSource) {
  if (!dataSource || dataSource.length < 2) return [];
  const errors = [];
  const sorted = [...dataSource].sort(
    (a, b) => new Date(a.ThoiDiemDangNhap) - new Date(b.ThoiDiemDangNhap),
  );
  const fmt = (d) =>
    d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  for (let i = 1; i < sorted.length; i++) {
    const tXuat = new Date(sorted[i - 1].ThoiDiemDangXuat);
    const tNhap = new Date(sorted[i].ThoiDiemDangNhap);
    if (isNaN(tXuat) || isNaN(tNhap)) continue;
    const phut = (tNhap - tXuat) / 1000 / 60;
    if (phut < 15) {
      errors.push({
        type: "warning",
        label: "Thời gian nghỉ giữa phiên",
        message: `Phiên ${i} và ${i + 1}: nghỉ chỉ ${phut.toFixed(0)} phút (${fmt(tXuat)} → ${fmt(tNhap)}), yêu cầu ≥ 15 phút.`,
      });
    }
  }
  return errors;
}

function evaluateTocDoPhien(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];
  const MIN_SPEED = 18;
  return dataSource.reduce((acc, phien, idx) => {
    const km = phien.TongQuangDuong || phien.TongQD_raw || 0;
    const giay = phien.TongThoiGian || 0;
    if (giay === 0 || km === 0) return acc;
    const v = km / (giay / 3600);
    if (v < MIN_SPEED) {
      acc.push({
        type: "warning",
        label: "Tốc độ trung bình phiên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tốc độ TB ${v.toFixed(1)} km/h, yêu cầu ≥ ${MIN_SPEED} km/h.`,
      });
    }
    return acc;
  }, []);
}

function evaluateTuDongSau17h(dataSource, studentInfo = null) {
  if (!dataSource || dataSource.length === 0) return [];
  const bienSoTuDong = getBienSoTuDong(dataSource, studentInfo);
  if (!bienSoTuDong) return [];

  return dataSource.reduce((acc, phien, idx) => {
    if (normalizePlate(phien.BienSo) !== normalizePlate(bienSoTuDong))
      return acc;

    const thoiDiem = new Date(phien.ThoiDiemDangNhap);
    if (isNaN(thoiDiem)) return acc;

    const hour = thoiDiem.getHours();
    const minute = thoiDiem.getMinutes();
    const totalMinutes = hour * 60 + minute;
    const timeStr = `${hour}h${String(minute).padStart(2, "0")}`;
    const dateStr = fmtDateStr(phien.ThoiDiemDangNhap);

    const SANG_START = 4 * 60 + 45; // 04:45
    const SANG_END = 7 * 60; // 07:00
    const CHIEU_START = 17 * 60; // 17:00

    const inSangWindow = totalMinutes >= SANG_START && totalMinutes <= SANG_END;
    const inChieuWindow = totalMinutes >= CHIEU_START;
    const loaiPhien = phien.LoaiPhien;

    if (loaiPhien === "SANG" && !inSangWindow) {
      acc.push({
        type: "warning",
        label: "Xe tự động chạy sai giờ phiên sáng",
        message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${phien.BienSo}) bắt đầu lúc ${timeStr} — phiên sáng chỉ hợp lệ từ 04:45 đến 07:00.`,
      });
    } else if (loaiPhien === "CHIEU" && !inChieuWindow) {
      acc.push({
        type: "warning",
        label: "Xe tự động chạy sai giờ phiên chiều",
        message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${phien.BienSo}) bắt đầu lúc ${timeStr} — phiên chiều chỉ hợp lệ từ 17:00 trở đi.`,
      });
    } else if (!loaiPhien && !inSangWindow && !inChieuWindow) {
      acc.push({
        type: "warning",
        label: "Xe tự động chạy ngoài giờ cho phép",
        message: `Phiên ${idx + 1} (${dateStr}): xe tự động (${phien.BienSo}) bắt đầu lúc ${timeStr} — không thuộc khung sáng (04:45–07:00) hoặc chiều (từ 17:00).`,
      });
    }
    return acc;
  }, []);
}

function evaluateSaiGiaoVien(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];
  const gvCount = {};
  dataSource.forEach((item) => {
    const ten = (item.HoTenGV || "").trim();
    if (ten) gvCount[ten] = (gvCount[ten] || 0) + 1;
  });
  const gvEntries = Object.entries(gvCount);
  if (gvEntries.length === 0) return [];
  const tenGVHopLe = gvEntries.reduce((max, cur) =>
    cur[1] > max[1] ? cur : max,
  )[0];

  return dataSource.reduce((acc, phien, idx) => {
    const ten = (phien.HoTenGV || "").trim();
    if (!ten) {
      acc.push({
        type: "warning",
        label: "Sai tên giáo viên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): không có tên giáo viên (GV hợp lệ: "${tenGVHopLe}").`,
      });
    } else if (ten !== tenGVHopLe) {
      acc.push({
        type: "warning",
        label: "Sai tên giáo viên",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tên GV "${ten}" khác với GV hợp lệ "${tenGVHopLe}".`,
      });
    }
    return acc;
  }, []);
}

function evaluatePhienDuoi5Phut(dataSource) {
  if (!dataSource || dataSource.length === 0) return [];
  const MIN_MINUTES = 5;
  return dataSource.reduce((acc, phien, idx) => {
    const giay = phien.TongThoiGian || 0;
    if (giay === 0) return acc;
    const phut = giay / 60;
    if (phut < MIN_MINUTES) {
      acc.push({
        type: "warning",
        label: "Phiên học quá ngắn",
        message: `Phiên ${idx + 1} (${fmtDateStr(phien.ThoiDiemDangNhap)}): tổng thời gian chỉ ${phut.toFixed(1)} phút, yêu cầu ≥ ${MIN_MINUTES} phút.`,
      });
    }
    return acc;
  }, []);
}

function evaluateGiaoVienDangKy(dataSource, studentInfo) {
  if (!studentInfo?.giaoVien) return [];

  const registeredTeacher = normalizeName(
    removeBirthYear(studentInfo.giaoVien),
  );

  const wrongSessions = dataSource.filter((s) => {
    const tenPhien = normalizeName(removeBirthYear(s.HoTenGV || ""));
    return tenPhien !== registeredTeacher;
  });

  if (wrongSessions.length === 0) return [];

  const wrongNames = [
    ...new Set(
      wrongSessions.map((s) => removeBirthYear(s.HoTenGV || "(trống)")),
    ),
  ].join(", ");

  return [
    {
      type: "warning",
      label: "Sai giáo viên đăng ký",
      message: `Đăng ký với GV: "${removeBirthYear(studentInfo.giaoVien)}", nhưng hành trình có phiên dạy bởi: "${wrongNames}" (${wrongSessions.length} phiên không khớp).`,
    },
  ];
}

function evaluateBienSoDangKy(dataSource, studentInfo) {
  if (!studentInfo) return [];

  const registeredPlateB1 = normalizePlate(studentInfo.xeB1);
  const registeredPlateB2 = normalizePlate(studentInfo.xeB2);
  const hasTwoPlates = !!registeredPlateB2;
  const warnings = [];

  if (!registeredPlateB1 && !registeredPlateB2) {
    warnings.push({
      type: "warning",
      label: "Không có thông tin xe",
      message:
        "Học viên không có thông tin biển số xe đăng ký. Không thể kiểm tra biển số.",
    });
    return warnings;
  }

  const allowedPlates = new Set(
    [registeredPlateB1, registeredPlateB2].filter(Boolean),
  );

  const wrongPlateSessions = dataSource.filter(
    (s) => !allowedPlates.has(normalizePlate(s.BienSo)),
  );

  if (wrongPlateSessions.length > 0) {
    const wrongPlates = [
      ...new Set(wrongPlateSessions.map((s) => s.BienSo || "(trống)")),
    ].join(", ");
    const allowedList = [studentInfo.xeB1, studentInfo.xeB2]
      .filter(Boolean)
      .join(", ");

    warnings.push({
      type: "warning",
      label: "Sai biển số xe",
      message: `Xe đăng ký: "${allowedList}", nhưng hành trình có phiên dùng xe: "${wrongPlates}" (${wrongPlateSessions.length} phiên không đúng).`,
    });
  }

  if (hasTwoPlates) {
    const platesUsed = new Set(
      dataSource.map((s) => normalizePlate(s.BienSo)).filter(Boolean),
    );
    if (!platesUsed.has(registeredPlateB1)) {
      warnings.push({
        type: "warning",
        label: "Thiếu phiên xe B1",
        message: `Học viên đăng ký 2 xe nhưng chưa có phiên học nào trên xe B1: "${studentInfo.xeB1}".`,
      });
    }
    if (!platesUsed.has(registeredPlateB2)) {
      warnings.push({
        type: "warning",
        label: "Thiếu phiên xe B2",
        message: `Học viên đăng ký 2 xe nhưng chưa có phiên học nào trên xe B2: "${studentInfo.xeB2}".`,
      });
    }
  }

  return warnings;
}

// ─── computeSummary ───────────────────────────────────────────────────────────
/**
 * Tính tổng hợp giờ/km sau khi đã loại các phiên lỗi.
 *
 * Quy tắc phân loại giờ:
 *   - Ban đêm: dùng ThoiGianBanDem từ API nếu có; fallback theo giờ ≥ 18h.
 *             Xe tự động KHÔNG được tính vào ban đêm.
 *   - Tự động: phiên của xe tự động (bienSoTuDong), chỉ trong giờ hợp lệ.
 *   - Ban ngày: tổng − ban đêm − tự động.
 */
function computeSummary(dataSource, hangDaoTao = "", studentInfo = null) {
  const empty = {
    tongThoiGianChuaLoaiGio: 0,
    tongQuangDuongChuaLoai: 0,
    tongThoiGianGio: 0,
    tongQuangDuong: 0,
    thoiGianBanDemGio: 0,
    quangDuongBanDem: 0,
    thoiGianBanNgayGio: 0,
    quangDuongBanNgay: 0,
    thoiGianTuDongGio: 0,
    quangDuongTuDong: 0,
    tongThoiGianLoiGio: 0,
    tongQuangDuongLoi: 0,
    tuDongLoiGio: 0,
    tuDongLoiKm: 0,
    hangDaoTao,
  };
  if (!dataSource || dataSource.length === 0) return empty;

  const bienSoTuDong = getBienSoTuDong(dataSource, studentInfo);

  const { invalidIndexes, tuDongLoiIndexes } = getInvalidSessionIndexes(
    dataSource,
    studentInfo,
  );

  const t = dataSource.reduce(
    (acc, item, idx) => {
      const isTuDong =
        !!bienSoTuDong &&
        normalizePlate(item.BienSo) === normalizePlate(bienSoTuDong);
      const thoiGianGiay = item.TongThoiGian || 0;
      const quangDuong = item.TongQuangDuong || item.TongQD || 0;

      // Luôn cộng vào tổng thô (kể cả phiên lỗi)
      acc.chuaLoaiGiay += thoiGianGiay;
      acc.chuaLoaiKm += quangDuong;

      if (invalidIndexes.has(idx)) {
        acc.loiGiay += thoiGianGiay;
        acc.loiKm += quangDuong;
        if (tuDongLoiIndexes.has(idx)) {
          acc.tuDongLoiGiay += thoiGianGiay;
          acc.tuDongLoiKm += quangDuong;
        }
        return acc;
      }

      // Phiên hợp lệ
      acc.tongGiay += thoiGianGiay;
      acc.tongKm += quangDuong;

      // ── Xe tự động: KHÔNG tính vào ban đêm ──
      if (isTuDong) {
        acc.tuDongGiay += thoiGianGiay;
        acc.tuDongKm += quangDuong;
        // Không cộng vào demGiay / demKm dù chạy ban đêm
        return acc;
      }

      // ── Xe số sàn: kiểm tra ban đêm ──
      const demGiayAPI = item.ThoiGianBanDem || 0;
      const demKmAPI = item.QuangDuongBanDem || 0;

      if (demGiayAPI > 0) {
        acc.demGiay += demGiayAPI;
        acc.demKm += demKmAPI;
      } else if (item.ThoiDiemDangNhap) {
        const hour = new Date(item.ThoiDiemDangNhap).getHours();
        if (hour >= 18) {
          acc.demGiay += thoiGianGiay;
          acc.demKm += quangDuong;
        }
      }

      return acc;
    },
    {
      chuaLoaiGiay: 0,
      chuaLoaiKm: 0,
      tongGiay: 0,
      tongKm: 0,
      demGiay: 0,
      demKm: 0,
      tuDongGiay: 0,
      tuDongKm: 0,
      loiGiay: 0,
      loiKm: 0,
      tuDongLoiGiay: 0,
      tuDongLoiKm: 0,
    },
  );

  const tongGio = t.tongGiay / 3600;
  const demGio = t.demGiay / 3600;
  const tuDongGio = t.tuDongGiay / 3600;
  // Ban ngày = tổng hợp lệ − ban đêm − tự động (không âm)
  const banNgayGio = Math.max(tongGio - demGio - tuDongGio, 0);
  const banNgayKm = Math.max(t.tongKm - t.demKm - t.tuDongKm, 0);

  return {
    tongThoiGianChuaLoaiGio: t.chuaLoaiGiay / 3600,
    tongQuangDuongChuaLoai: t.chuaLoaiKm,
    tongThoiGianGio: tongGio,
    tongQuangDuong: t.tongKm,
    thoiGianBanDemGio: demGio,
    quangDuongBanDem: t.demKm,
    thoiGianBanNgayGio: banNgayGio,
    quangDuongBanNgay: banNgayKm,
    thoiGianTuDongGio: tuDongGio,
    quangDuongTuDong: t.tuDongKm,
    tongThoiGianLoiGio: t.loiGiay / 3600,
    tongQuangDuongLoi: t.loiKm,
    tuDongLoiGio: t.tuDongLoiGiay / 3600,
    tuDongLoiKm: t.tuDongLoiKm,
    hangDaoTao: dataSource[0]?.HangDaoTao || hangDaoTao,
  };
}

// ─── evaluate ─────────────────────────────────────────────────────────────────
// Không còn kiểm tra quãng đường (đã bỏ theo yêu cầu).
// studentInfo (tuỳ chọn): { giaoVien, xeB1, xeB2 }

function evaluate(summaryData, dataSource = [], studentInfo = null) {
  const errors = [];
  const warnings = [];
  const yeuCauHang =
    HANG_DAO_TAO_CONFIG[summaryData.hangDaoTao] || HANG_DAO_TAO_CONFIG.B1;

  const rules = [
    // ── ERRORS ──
    {
      type: "error",
      label: "Thời gian ban đêm",
      condition: summaryData.thoiGianBanDemGio < yeuCauHang.thoiGian.banDem,
      getMessage: () => {
        const thieu =
          yeuCauHang.thoiGian.banDem - summaryData.thoiGianBanDemGio;
        return `Thời gian ban đêm thiếu ${fmtGio(thieu)} (yêu cầu ${fmtGio(yeuCauHang.thoiGian.banDem)}, thực tế ${fmtGio(summaryData.thoiGianBanDemGio)}).`;
      },
    },
    {
      type: "error",
      label: "Thời gian số tự động",
      condition: summaryData.thoiGianTuDongGio < yeuCauHang.thoiGian.tuDong,
      getMessage: () => {
        const thieu =
          yeuCauHang.thoiGian.tuDong - summaryData.thoiGianTuDongGio;
        return `Thời gian số tự động thiếu ${fmtGio(thieu)} (thực tế ${fmtGio(summaryData.thoiGianTuDongGio)}, yêu cầu ${fmtGio(yeuCauHang.thoiGian.tuDong)}).`;
      },
    },
    {
      type: "error",
      label: "Tổng thời lượng",
      condition: summaryData.tongThoiGianGio < yeuCauHang.thoiGian.tong,
      getMessage: () => {
        const thieu = yeuCauHang.thoiGian.tong - summaryData.tongThoiGianGio;
        return `Tổng thời lượng thiếu ${fmtGio(thieu)} (thực tế ${fmtGio(summaryData.tongThoiGianGio)}, yêu cầu ${fmtGio(yeuCauHang.thoiGian.tong)}).`;
      },
    },
    {
      type: "error",
      label: "Quãng đường ban đêm",
      condition: summaryData.quangDuongBanDem < yeuCauHang.quangDuong.banDem,
      getMessage: () => {
        const thieu =
          yeuCauHang.quangDuong.banDem - summaryData.quangDuongBanDem;
        return `Quãng đường ban đêm thiếu ${thieu.toFixed(2)} km (yêu cầu ${yeuCauHang.quangDuong.banDem} km, thực tế ${summaryData.quangDuongBanDem.toFixed(2)} km).`;
      },
    },
    {
      type: "error",
      label: "Quãng đường số tự động",
      condition: summaryData.quangDuongTuDong < yeuCauHang.quangDuong.tuDong,
      getMessage: () => {
        const thieu =
          yeuCauHang.quangDuong.tuDong - summaryData.quangDuongTuDong;
        return `Quãng đường số tự động thiếu ${thieu.toFixed(2)} km (thực tế ${summaryData.quangDuongTuDong.toFixed(2)} km, yêu cầu ${yeuCauHang.quangDuong.tuDong} km).`;
      },
    },
    {
      type: "error",
      label: "Tổng quãng đường",
      condition: summaryData.tongQuangDuong < yeuCauHang.quangDuong.tong,
      getMessage: () => {
        const thieu = yeuCauHang.quangDuong.tong - summaryData.tongQuangDuong;
        return `Tổng quãng đường thiếu ${thieu.toFixed(2)} km (thực tế ${summaryData.tongQuangDuong.toFixed(2)} km, yêu cầu ${yeuCauHang.quangDuong.tong} km).`;
      },
    },
    // ── WARNINGS ──
    {
      type: "warning",
      label: "Thiếu tên giáo viên",
      condition: !dataSource.some((item) => item.HoTenGV),
      getMessage: () => "Không có tên giáo viên để kiểm tra tính nhất quán.",
    },
    {
      type: "warning",
      label: "Thời gian ban ngày",
      condition: (() => {
        const yc = yeuCauHang.thoiGian.banNgay;
        return yc > 0 && summaryData.thoiGianBanNgayGio / yc < 0.8;
      })(),
      getMessage: () => {
        const yc = yeuCauHang.thoiGian.banNgay;
        const tt = summaryData.thoiGianBanNgayGio;
        const pct = ((1 - tt / yc) * 100).toFixed(1);
        return `Thời gian ban ngày thiếu ${pct}% (thiếu ${fmtGio(yc - tt)}, yêu cầu ${fmtGio(yc)}).`;
      },
    },
    {
      type: "warning",
      label: "Quãng đường ban ngày",
      condition: (() => {
        const yc = yeuCauHang.quangDuong.banNgay;
        return yc > 0 && summaryData.quangDuongBanNgay / yc < 0.8;
      })(),
      getMessage: () => {
        const yc = yeuCauHang.quangDuong.banNgay;
        const tt = summaryData.quangDuongBanNgay;
        const pct = ((1 - tt / yc) * 100).toFixed(1);
        return `Quãng đường ban ngày thiếu ${pct}% (thiếu ${(yc - tt).toFixed(2)} km, yêu cầu ${yc} km).`;
      },
    },
    {
      type: "warning",
      label: "Thời gian số tự động vượt mức",
      condition: (() => {
        const MAX_GIO = 2 + 10 / 60;
        return summaryData.thoiGianTuDongGio > MAX_GIO;
      })(),
      getMessage: () => {
        const MAX_GIO = 2 + 10 / 60;
        const vuot = summaryData.thoiGianTuDongGio - MAX_GIO;
        return `Thời gian số tự động vượt ${fmtGio(vuot)} so với mức tối đa cho phép (thực tế ${fmtGio(summaryData.thoiGianTuDongGio)}, tối đa 2h 10').`;
      },
    },
  ];

  rules.forEach((rule) => {
    if (rule.condition) {
      const issue = {
        type: rule.type,
        label: rule.label,
        message: rule.getMessage(),
      };
      if (rule.type === "error") errors.push(issue);
      else warnings.push(issue);
    }
  });

  // Warnings theo từng phiên
  warnings.push(...evaluateNghiGiuaPhien(dataSource));
  warnings.push(...evaluateTocDoPhien(dataSource));
  warnings.push(...evaluateTuDongSau17h(dataSource, studentInfo));
  warnings.push(...evaluatePhienDuoi5Phut(dataSource));
  warnings.push(...evaluateSaiGiaoVien(dataSource));

  // Kiểm tra theo thông tin đăng ký (nếu có studentInfo)
  if (studentInfo) {
    warnings.push(...evaluateGiaoVienDangKy(dataSource, studentInfo));
    warnings.push(...evaluateBienSoDangKy(dataSource, studentInfo));
  }

  return { status: errors.length === 0 ? "pass" : "fail", errors, warnings };
}

module.exports = {
  computeSummary,
  evaluate,
  getInvalidSessionIndexes,
  getBienSoTuDong,
  HANG_DAO_TAO_CONFIG,
  normalizeName,
  normalizePlate,
};
