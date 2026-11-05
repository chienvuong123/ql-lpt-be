const connectSQL = require("../configs/sql");
const sql = require("mssql");
const repository = require("../repositories/satHach.repository");
const Parser = require("../utils/satHachXmlParser");
const { jp2ToJpeg, isJp2 } = require("../utils/jp2.util");

const { COT_DIEM } = repository;

const TRANG_THAI = {
  DAT: "DAT",
  TRUOT: "TRUOT",
  CHUA_THI: "CHUA_THI", // phần phải thi nhưng chưa có điểm / vắng (-1)
  DUNG_THI: "DUNG_THI", // phần chưa thi vì đã trượt phần khác
  KHONG_THI: "KHONG_THI", // phần không nằm trong nội dung sát hạch của thí sinh
  BAO_LUU: "BAO_LUU", // phần không phải thi vì đã đạt ở kỳ trước (cùng CCCD)
  CHUA_HOAN_THANH: "CHUA_HOAN_THANH", // kết quả chung: chưa trượt phần nào nhưng còn phần chưa thi
};

// NOI_DUNG_SH trong file danh sách → các phần phải thi.
// Suy ra từ dữ liệu kỳ 3050362036 (07/07/2026): thí sinh có điểm phần nào trong 3 file kết quả.
const NOI_DUNG_SH = {
  2: { parts: ["L"], ten: "Lý thuyết" },
  3: { parts: ["L", "H"], ten: "Lý thuyết + Sa hình" },
  4: { parts: ["L", "H", "D"], ten: "Lý thuyết + Sa hình + Đường trường" },
  5: { parts: ["H", "D"], ten: "Sa hình + Đường trường" },
  6: { parts: ["D"], ten: "Đường trường" },
  7: { parts: ["H"], ten: "Sa hình" },
  8: { parts: ["H"], ten: "Sa hình" },
  11: { parts: ["L", "H", "D"], ten: "Thi mới (LT + Sa hình + Đường trường)" },
  18: { parts: ["L", "D"], ten: "Lý thuyết + Đường trường" },
};

// Điểm đạt mặc định khi file không ghi điểm chuẩn.
// Riêng đường trường: DIEM_CHUAN trong file là thang điểm (100), điểm đạt là 80.
const DIEM_DAT_MAC_DINH = { M: 35, H: 80, D: 80 };

const nguongDat = (p, chuan) => {
  if (p === "D") return chuan != null && chuan < 100 ? chuan : DIEM_DAT_MAC_DINH.D;
  return chuan ?? DIEM_DAT_MAC_DINH[p] ?? null;
};

const coDiem = (diem) => diem != null && diem >= 0;

const danhGiaPhan = (p, diem, chuan) => {
  if (!coDiem(diem)) return TRANG_THAI.CHUA_THI;
  const nguong = nguongDat(p, chuan);
  if (nguong == null) return TRANG_THAI.CHUA_THI;
  return diem >= nguong ? TRANG_THAI.DAT : TRANG_THAI.TRUOT;
};

// Gắn trạng thái từng phần + kết quả chung cho 1 dòng thí sinh
const danhGiaThiSinh = (row) => {
  const cauHinh = NOI_DUNG_SH[row.noi_dung_sh];
  // Mô phỏng chỉ tính khi có điểm thật (các kỳ hiện tại file trả -1 cho tất cả)
  const coDiemM = coDiem(row[COT_DIEM.M.diem]);
  let required = cauHinh ? [...cauHinh.parts] : ["L", "H", "D"].filter((p) => coDiem(row[COT_DIEM[p].diem]));
  if (coDiemM && !required.includes("M")) required = ["L", "M", "H", "D"].filter((p) => p === "M" || required.includes(p));

  const phan = {};
  for (const p of Object.keys(COT_DIEM)) {
    const diem = row[COT_DIEM[p].diem];
    const chuan = row[COT_DIEM[p].chuan];
    const batBuoc = required.includes(p);
    let trangThai = danhGiaPhan(p, diem, chuan);
    if (!batBuoc && trangThai === TRANG_THAI.CHUA_THI) trangThai = TRANG_THAI.KHONG_THI;
    phan[p] = {
      diem: coDiem(diem) ? diem : null,
      diem_dat: nguongDat(p, chuan),
      diem_toi_da: p === "D" ? chuan ?? 100 : null,
      bat_buoc: batBuoc,
      trang_thai: trangThai,
    };
  }

  let ketQua;
  if (Object.values(phan).some((x) => x.trang_thai === TRANG_THAI.TRUOT)) {
    ketQua = TRANG_THAI.TRUOT;
    // Trượt phần trước thì không được thi các phần sau
    for (const x of Object.values(phan)) {
      if (x.trang_thai === TRANG_THAI.CHUA_THI) x.trang_thai = TRANG_THAI.DUNG_THI;
    }
  } else if (required.length > 0 && required.every((p) => phan[p].trang_thai === TRANG_THAI.DAT)) ketQua = TRANG_THAI.DAT;
  else ketQua = TRANG_THAI.CHUA_HOAN_THANH;

  return {
    ...row,
    noi_dung_sh_ten: cauHinh?.ten || (row.noi_dung_sh != null ? `Nội dung ${row.noi_dung_sh}` : null),
    phan_thi: required,
    ly_thuyet: phan.L,
    mo_phong: phan.M,
    sa_hinh: phan.H,
    duong_truong: phan.D,
    ket_qua: ketQua,
  };
};

const PHAN_KEYS = ["ly_thuyet", "mo_phong", "sa_hinh", "duong_truong"];

/**
 * Thi lại: phần không phải thi ở kỳ này nhưng đã đạt ở kỳ trước (cùng CCCD) → bảo lưu, kèm kỳ đã đạt.
 * lichSuTheoCmt: Map CCCD → các lần thi đã đánh giá, kỳ mới nhất trước.
 */
const ganBaoLuu = (row, ngaySh, lichSuTheoCmt) => {
  const lichSu = (lichSuTheoCmt.get(row.so_cmt) || []).filter((h) => h.ma_ky_sh !== row.ma_ky_sh && h.ngay_sh < ngaySh);
  if (lichSu.length === 0) return row;
  const kq = { ...row };
  for (const key of PHAN_KEYS) {
    if (kq[key].trang_thai !== TRANG_THAI.KHONG_THI) continue;
    const truoc = lichSu.find((h) => h[key].trang_thai === TRANG_THAI.DAT);
    if (!truoc) continue;
    kq[key] = {
      ...kq[key],
      trang_thai: TRANG_THAI.BAO_LUU,
      dat_truoc: { ma_ky_sh: truoc.ma_ky_sh, ten_ky_sh: truoc.ten_ky_sh, ngay_sh: truoc.ngay_sh, diem: truoc[key].diem },
    };
  }
  return kq;
};

const nhomTheoCmt = (rows) => {
  const map = new Map();
  for (const r of rows) {
    if (!r.so_cmt) continue;
    if (!map.has(r.so_cmt)) map.set(r.so_cmt, []);
    map.get(r.so_cmt).push(r);
  }
  return map;
};

const thongKe = (rows) => {
  const tk = {
    tong: rows.length,
    dat: 0,
    truot: 0,
    chua_hoan_thanh: 0,
    phan: {},
    theo_hang: {},
  };
  for (const key of PHAN_KEYS) {
    tk.phan[key] = { tong: 0, dat: 0, truot: 0, chua_thi: 0, ty_le_dat: null };
  }

  for (const r of rows) {
    if (r.ket_qua === TRANG_THAI.DAT) tk.dat++;
    else if (r.ket_qua === TRANG_THAI.TRUOT) tk.truot++;
    else tk.chua_hoan_thanh++;

    const hang = r.hang_gplx || "Khác";
    tk.theo_hang[hang] = tk.theo_hang[hang] || { tong: 0, dat: 0, truot: 0, chua_hoan_thanh: 0 };
    tk.theo_hang[hang].tong++;
    if (r.ket_qua === TRANG_THAI.DAT) tk.theo_hang[hang].dat++;
    else if (r.ket_qua === TRANG_THAI.TRUOT) tk.theo_hang[hang].truot++;
    else tk.theo_hang[hang].chua_hoan_thanh++;

    for (const key of Object.keys(tk.phan)) {
      const p = r[key];
      if ([TRANG_THAI.KHONG_THI, TRANG_THAI.DUNG_THI, TRANG_THAI.BAO_LUU].includes(p.trang_thai)) continue;
      const s = tk.phan[key];
      s.tong++;
      if (p.trang_thai === TRANG_THAI.DAT) s.dat++;
      else if (p.trang_thai === TRANG_THAI.TRUOT) s.truot++;
      else s.chua_thi++;
    }
  }

  for (const s of Object.values(tk.phan)) {
    const daThi = s.dat + s.truot;
    s.ty_le_dat = daThi > 0 ? Math.round((s.dat / daThi) * 1000) / 10 : null;
  }
  return tk;
};

const LOAI_FILE_THEO_PHAN = { L: "ly_thuyet", M: "mo_phong", H: "sa_hinh", D: "duong_truong" };

/**
 * Import 1..n file XML của ngày thi. Mỗi file tự nhận diện loại:
 * danh sách (<SAT_HACH>) hoặc kết quả lý thuyết / sa hình / đường trường (<DULIEU_SATHACH>).
 * File danh sách được ghi trước để thông tin cá nhân lấy từ nguồn chuẩn.
 */
const importXml = async (files, { ngayThi } = {}) => {
  await repository.createTableIfNotExists();

  const parsed = [];
  for (const f of files) {
    const tenFile = Buffer.from(f.originalname, "latin1").toString("utf8");
    try {
      const data = await Parser.parseBuffer(f.buffer);
      parsed.push({ tenFile, ...data });
    } catch (err) {
      parsed.push({ tenFile, error: err.message });
    }
  }
  parsed.sort((a, b) => (a.type === Parser.FILE_TYPE.DANH_SACH ? -1 : 0) - (b.type === Parser.FILE_TYPE.DANH_SACH ? -1 : 0));

  const pool = await connectSQL();
  const ketQuaFile = [];
  const kySet = new Set();

  for (const file of parsed) {
    if (file.error) {
      ketQuaFile.push({ ten_file: file.tenFile, loai: null, loi: file.error });
      continue;
    }

    const isDanhSach = file.type === Parser.FILE_TYPE.DANH_SACH;
    const loai = isDanhSach ? ["danh_sach"] : file.parts.map((p) => LOAI_FILE_THEO_PHAN[p]);
    if (!isDanhSach && file.parts.length === 0) {
      ketQuaFile.push({ ten_file: file.tenFile, loai: null, loi: "File không có điểm phần thi nào" });
      continue;
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const kyTrongFile = [...new Set(file.records.map((r) => r.ma_ky_sh))];
      for (const maKy of kyTrongFile) {
        await repository.upsertKy(tx, {
          ...(maKy === file.ky.ma_ky_sh ? file.ky : {}),
          ma_ky_sh: maKy,
          // ngày thi chọn trên giao diện chỉ dùng khi kỳ chưa có ngày (chưa import file danh sách)
          ngay_sh_du_phong: ngayThi || null,
        });
        for (const l of loai) await repository.markFileImported(tx, maKy, l, file.tenFile);
        kySet.add(maKy);
      }

      let inserted = 0;
      let updated = 0;
      for (const rec of file.records) {
        const action = await repository.upsertThiSinh(tx, rec, { overwriteBase: isDanhSach, parts: file.parts });
        if (action === "inserted") inserted++;
        else updated++;
      }
      await tx.commit();
      ketQuaFile.push({ ten_file: file.tenFile, loai, so_thi_sinh: file.records.length, inserted, updated, ma_ky_sh: kyTrongFile });
    } catch (err) {
      await tx.rollback().catch(() => { });
      ketQuaFile.push({ ten_file: file.tenFile, loai, loi: err.message });
    }
  }

  return { files: ketQuaFile, ma_ky_sh: [...kySet] };
};

const getKyList = async () => {
  await repository.createTableIfNotExists();
  return repository.getKyList();
};

const getKetQuaKy = async (maKySh) => {
  await repository.createTableIfNotExists();
  const ky = await repository.getKy(maKySh);
  if (!ky) return null;
  const lichSuTheoCmt = nhomTheoCmt((await repository.getLichSuTruocKy(maKySh)).map(danhGiaThiSinh));
  const rows = (await repository.getThiSinhByKy([maKySh]))
    .map(danhGiaThiSinh)
    .map((r) => ganBaoLuu(r, ky.ngay_sh, lichSuTheoCmt));
  return { ky, rows, thong_ke: thongKe(rows) };
};

// Tỷ lệ đạt từng phần thi qua các kỳ gần nhất (biểu đồ)
const getThongKeCacKy = async (limit = 5, denKy = null) => {
  await repository.createTableIfNotExists();
  let kyList = await repository.getKyList();
  if (denKy) {
    const idx = kyList.findIndex((k) => k.ma_ky_sh === denKy);
    if (idx >= 0) kyList = kyList.slice(idx);
  }
  kyList = kyList.slice(0, limit);
  const rows = (await repository.getThiSinhByKy(kyList.map((k) => k.ma_ky_sh))).map(danhGiaThiSinh);
  return kyList
    .map((k) => {
      const tk = thongKe(rows.filter((r) => r.ma_ky_sh === k.ma_ky_sh));
      return {
        ma_ky_sh: k.ma_ky_sh,
        ten_ky_sh: k.ten_ky_sh,
        ngay_sh: k.ngay_sh,
        tong: tk.tong,
        dat: tk.dat,
        ly_thuyet: tk.phan.ly_thuyet.ty_le_dat,
        sa_hinh: tk.phan.sa_hinh.ty_le_dat,
        duong_truong: tk.phan.duong_truong.ty_le_dat,
      };
    })
    .reverse();
};

const getLichSu = async ({ soCmt, maDk }) => {
  await repository.createTableIfNotExists();
  const rows = (await repository.getLichSu({ soCmt, maDk })).map(danhGiaThiSinh);
  const lichSuTheoCmt = nhomTheoCmt(rows);
  return rows.map((r) => ganBaoLuu(r, r.ngay_sh, lichSuTheoCmt));
};

// Trả ảnh JPEG; lần đầu chuyển từ JPEG 2000 rồi lưu lại để lần sau khỏi giải mã
const getAnh = async (maKySh, id) => {
  const row = await repository.getAnh(maKySh, id);
  if (!row) return null;
  if (row.anh_jpeg) return { buffer: row.anh_jpeg, contentType: "image/jpeg" };
  if (!row.anh_jp2) return null;
  if (!isJp2(row.anh_jp2)) return { buffer: row.anh_jp2, contentType: "image/jpeg" };

  const jpeg = await jp2ToJpeg(row.anh_jp2);
  await repository.saveAnhJpeg(row.id, jpeg);
  return { buffer: jpeg, contentType: "image/jpeg" };
};

module.exports = {
  TRANG_THAI,
  danhGiaThiSinh,
  thongKe,
  importXml,
  getKyList,
  getKetQuaKy,
  getThongKeCacKy,
  getLichSu,
  getAnh,
};
