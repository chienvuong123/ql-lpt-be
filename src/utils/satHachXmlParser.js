const xml2js = require("xml2js");

// Ký hiệu phần thi trong file kết quả sát hạch của Sở/Cục:
// KETQUA_SATHACH_L = lý thuyết, _M = mô phỏng, _H = sa hình (trong hình), _D = đường trường
const PHAN_THI = ["L", "M", "H", "D"];

const FILE_TYPE = {
  DANH_SACH: "danh_sach",
  KET_QUA: "ket_qua",
};

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const text = (v) => {
  if (v == null) return null;
  if (typeof v === "object") return null; // phần tử rỗng có thuộc tính
  const s = String(v).trim();
  return s === "" ? null : s;
};

const toInt = (v) => {
  const s = text(v);
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

// Nhận "19930510", "10/05/1993", "2026-07-07" → "YYYY-MM-DD"
const toDate = (v) => {
  const s = text(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};

// "700" → "07:00", "1330" → "13:30"
const toGio = (v) => {
  const s = text(v);
  if (!s || !/^\d{3,4}$/.test(s)) return s;
  const p = s.padStart(4, "0");
  return `${p.slice(0, 2)}:${p.slice(2)}`;
};

const toImage = (v) => {
  const s = text(v);
  if (!s) return null;
  const buf = Buffer.from(s.replace(/\s+/g, ""), "base64");
  return buf.length > 0 ? buf : null;
};

// File danh sách thí sinh dự sát hạch (gốc <SAT_HACH>, giống cấu trúc BAO_CAO1)
const parseDanhSach = (root) => {
  const kySh = root.DATA?.KY_SH || {};
  const ky = {
    ma_ky_sh: text(kySh.MAKYSH),
    ma_ttsh: text(kySh.MATTSH),
    ngay_sh: toDate(kySh.NGAYSH),
    gio_sh: toGio(kySh.GIOSH),
    so_qd: text(kySh.SOQD),
    ngay_qd: toDate(kySh.NGAYQD),
    chu_tich_hdsh: text(kySh.CHUTICH_HDSH),
  };

  const records = toArray(root.DATA?.NGUOI_LXS?.NGUOI_LX)
    .map((lx) => {
      const hs = lx.HO_SO || {};
      return {
        ma_ky_sh: text(hs.MA_KY_SH) || ky.ma_ky_sh,
        ma_dk: text(lx.MA_DK),
        so_bao_danh: toInt(hs.SO_BAO_DANH),
        ho_ten: text(lx.HO_VA_TEN),
        gioi_tinh: text(lx.GIOI_TINH),
        ngay_sinh: toDate(lx.NGAY_SINH),
        so_cmt: text(lx.SO_CMT),
        hang_gplx: text(hs.HANG_GPLX),
        ma_khoa_hoc: text(hs.MA_KHOA_HOC),
        ma_csdt: text(hs.MA_CSDT),
        noi_dung_sh: toInt(hs.NOI_DUNG_SH),
        so_ho_so: text(hs.SO_HO_SO),
        anh_jp2: toImage(hs.ANH_CHAN_DUNG),
      };
    })
    .filter((r) => r.ma_dk && r.ma_ky_sh);

  return { type: FILE_TYPE.DANH_SACH, ky, records, parts: [] };
};

// File kết quả từng phần thi (gốc <DULIEU_SATHACH>): lý thuyết / sa hình / đường trường.
// Cả 3 loại cùng cấu trúc; file lý thuyết và đường trường còn chứa khối các phần khác với điểm -1,
// nên phần thi của file được xác định là các khối có ít nhất 1 thí sinh có điểm thật (>= 0).
const parseKetQua = (root) => {
  const records = toArray(root.THI_SINH)
    .map((ts) => {
      const diem = {};
      for (const p of PHAN_THI) {
        const kq = ts[`KETQUA_SATHACH_${p}`];
        if (kq === undefined) continue;
        diem[p] = {
          diem: toInt(kq?.DIEM_DAT_DUOC),
          chuan: toInt(kq?.DIEM_CHUAN),
        };
      }
      return {
        ma_ky_sh: text(ts.KY_SAT_HACH),
        ten_ky_sh: text(ts.TEN_KY_SAT_HACH),
        ma_dk: text(ts.MA_DANG_KY),
        so_bao_danh: toInt(ts.SO_BAO_DANH),
        ho_ten: text(ts.HO_TEN),
        ngay_sinh: toDate(ts.NGAY_SINH),
        so_cmt: text(ts.SO_CMT),
        hang_gplx: text(ts.HANG_GPLX),
        anh_jp2: toImage(ts.ANH_CHAN_DUNG),
        diem,
      };
    })
    .filter((r) => r.ma_dk && r.ma_ky_sh);

  let parts = PHAN_THI.filter((p) => records.some((r) => r.diem[p]?.diem != null && r.diem[p].diem >= 0));
  if (parts.length === 0) {
    // Chưa ai có điểm (vd file xuất trước giờ thi): lấy các khối có mặt mà không phải toàn -1
    parts = PHAN_THI.filter((p) => records.some((r) => r.diem[p] && r.diem[p].diem !== -1));
  }

  // Tên kỳ dạng "K26LPT0017" (một số file chỉ ghi lại mã kỳ)
  const tenKy = records.map((r) => r.ten_ky_sh).find((t) => t && t !== records[0]?.ma_ky_sh) || null;

  return { type: FILE_TYPE.KET_QUA, ky: { ma_ky_sh: records[0]?.ma_ky_sh || null, ten_ky_sh: tenKy }, records, parts };
};

const parseBuffer = async (buffer) => {
  const xml = buffer.toString("utf8").replace(/^﻿/, "");
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const result = await parser.parseStringPromise(xml);

  if (result?.SAT_HACH) return parseDanhSach(result.SAT_HACH);
  if (result?.DULIEU_SATHACH) return parseKetQua(result.DULIEU_SATHACH);
  throw new Error("Không nhận diện được file XML sát hạch (cần gốc <SAT_HACH> hoặc <DULIEU_SATHACH>)");
};

module.exports = { parseBuffer, FILE_TYPE, PHAN_THI };
