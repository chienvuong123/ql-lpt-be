"use strict";

/**
 * Điền thông tin học viên vào các mẫu đơn Word (thư mục src/templates/tiep-sinh):
 *  - don_de_nghi.docx : Đơn đề nghị học lái xe
 *  - tu_hoc_a1.docx   : Đơn đăng ký tự học các môn lý thuyết hạng A1
 *  - tu_hoc_a.docx    : Đơn đăng ký tự học các môn lý thuyết hạng A (TT14)
 *
 * Cách làm: tìm đoạn văn theo chữ đầu dòng (vd "Tôi là:") rồi thay các chấm "....."
 * bằng dữ liệu, giữ nguyên định dạng (font, cỡ chữ) của đoạn đó.
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "tiep-sinh");

// Bộ hồ sơ in cho học viên (theo thứ tự in): mỗi hạng A / A1 có mẫu riêng
const MAU_DON = {
  phieu_xac_nhan_a1: { file: "phieu_xac_nhan_a1.docx", ten: "Phieu xac nhan hoc vien A1" },
  phieu_xac_nhan_a: { file: "phieu_xac_nhan_a.docx", ten: "Phieu xac nhan hoc vien A" },
  don_de_nghi: { file: "don_de_nghi.docx", ten: "Don de nghi hoc lai xe" },
  tu_hoc_a1: { file: "tu_hoc_a1.docx", ten: "Don dang ky tu hoc ly thuyet hang A1" },
  tu_hoc_a: { file: "tu_hoc_a.docx", ten: "Don dang ky tu hoc ly thuyet hang A" },
  hop_dong_a1: { file: "hop_dong_a1.docx", ten: "Hop dong dao tao lai xe mo to hang A1" },
  hop_dong_a: { file: "hop_dong_a.docx", ten: "Hop dong dao tao lai xe mo to hang A" },
};
// Mã chung (không kèm hạng) -> chọn file theo hạng của hồ sơ
const MAU_CHUNG = ["phieu_xac_nhan", "don_de_nghi", "tu_hoc", "hop_dong"];

function resolveMau(mau, hang) {
  if (MAU_DON[mau]) return mau;
  const suf = String(hang || "").toUpperCase() === "A" ? "a" : "a1";
  return MAU_DON[`${mau}_${suf}`] ? `${mau}_${suf}` : null;
}

// ─── Đọc số tiền bằng chữ ───
const SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function doc3(n, du) {
  const tr = Math.floor(n / 100);
  const ch = Math.floor((n % 100) / 10);
  const dv = n % 10;
  const out = [];
  if (du || tr) out.push(`${SO[tr]} trăm`);
  if (ch > 1) out.push(`${SO[ch]} mươi`);
  else if (ch === 1) out.push("mười");
  else if (dv && (du || tr)) out.push("lẻ");
  if (dv) out.push(dv === 1 && ch > 1 ? "mốt" : dv === 5 && ch ? "lăm" : dv === 4 && ch > 1 ? "tư" : SO[dv]);
  return out.join(" ");
}
function docSoTien(so) {
  let n = Math.round(Number(so) || 0);
  if (!n) return "Không đồng";
  const DV = ["", " nghìn", " triệu", " tỷ"];
  const nhom = [];
  while (n > 0) {
    nhom.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts = [];
  for (let i = nhom.length - 1; i >= 0; i--) {
    if (!nhom[i]) continue;
    parts.push(doc3(nhom[i], i < nhom.length - 1) + DV[i % 4] + (i >= 4 ? " tỷ" : ""));
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
}
const fmtTien = (n) => `${Number(n).toLocaleString("vi-VN")} đồng`;

/** Học phí theo loại hình học (bảng giá trong cấu hình); tong_thu nhập tay được ưu tiên */
function hocPhi(hs, cfg = {}) {
  const so = (v) => {
    const s = String(v ?? "").replace(/[^\d]/g, "");
    return s ? Number(s) : null;
  };
  const lh = String(hs.loai_hinh || "");
  const key = /^hạng\s*a1/i.test(lh) ? "gia_a1" : /côn tay/i.test(lh) ? "gia_a_con_tay" : /tay ga/i.test(lh) ? "gia_a_tay_ga" : null;
  return key ? so(cfg[key]) : null;
}

const fmtDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const xmlEscape = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const textOf = (pXml) =>
  (pXml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&");

/**
 * Viết lại nội dung chữ của 1 đoạn văn.
 * segments: [{ t: "chữ", b: true/false }]
 * Giữ <w:pPr> và các run có hình vẽ/ô (drawing); bỏ các run chữ cũ.
 */
function rewriteParagraph(pXml, segments) {
  const open = pXml.match(/^<w:p(?:\s[^>]*)?>/)[0];
  const pPr = (pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const runs = pXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
  const textRun = runs.find((r) => /<w:t[\s>]/.test(r) && !/<w:drawing|<mc:AlternateContent/.test(r));
  let rPr = textRun ? (textRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0] : "";
  rPr = rPr.replace(/<w:b\/>|<w:bCs\/>/g, "");
  const keep = runs.filter((r) => /<w:drawing|<mc:AlternateContent|<w:pict/.test(r));
  const newRuns = segments
    .filter((s) => s.t !== undefined && s.t !== null && s.t !== "")
    .map((s) => {
      const them = `${s.b ? "<w:b/><w:bCs/>" : ""}${s.i ? "<w:i/><w:iCs/>" : ""}`;
      const pr = them ? (rPr ? rPr.replace("</w:rPr>", `${them}</w:rPr>`) : `<w:rPr>${them}</w:rPr>`) : rPr;
      return `<w:r>${pr}<w:t xml:space="preserve">${xmlEscape(s.t)}</w:t></w:r>`;
    })
    .join("");
  return `${open}${pPr}${newRuns}${keep.join("")}</w:p>`;
}

/**
 * Thay đoạn văn có chữ (đã bỏ khoảng trắng) bắt đầu bằng prefix.
 * segments là mảng -> viết lại chữ; là hàm (pXml) => pXml -> sửa trực tiếp.
 * all = true: thay mọi đoạn khớp (vd phiếu xác nhận có 2 liên giống nhau).
 */
function replaceParagraph(xml, prefix, segments, all = false) {
  const re = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let done = false;
  return xml.replace(re, (p) => {
    if (done) return p;
    // bỏ qua đoạn chứa bảng/khung lồng nhau để tránh cắt sai
    if (/<w:txbxContent/.test(p)) return p;
    const t = textOf(p).trim();
    if (t.startsWith(prefix)) {
      if (!all) done = true;
      return typeof segments === "function" ? segments(p) : rewriteParagraph(p, segments);
    }
    return p;
  });
}

/** Đánh dấu ô chọn thứ idx (chữ "o" font Wingdings = ô trống) thành ô có dấu tích "þ" */
function tichO(idx) {
  return (p) => {
    let i = -1;
    return p.replace(/(<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?Wingdings(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>)o(<\/w:t>)/g, (m, a, b) =>
      ++i === idx ? `${a}þ${b}` : m,
    );
  };
}

/**
 * Ô chọn Wingdings ("o" trống / "þ" đã tích) -> ký tự Unicode ☐ / ☑ font Segoe UI Symbol:
 * hiển thị đúng cả trong Word lẫn trên trình duyệt (trình duyệt không vẽ được Wingdings).
 */
function oVuongUnicode(xml) {
  return xml.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (r) => {
    if (!/w:ascii="Wingdings"/.test(r)) return r;
    const m = r.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/);
    if (!m || !/^[oþ]$/.test(m[1])) return r;
    return r
      .replace(/<w:rFonts [^>]*\/>/, '<w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:cs="Segoe UI Symbol"/>')
      .replace(/<w:sz w:val="\d+"\/>/, '<w:sz w:val="26"/>')
      .replace(/<w:szCs w:val="\d+"\/>/, '<w:szCs w:val="26"/>')
      .replace(/(<w:t(?:\s[^>]*)?>)[oþ](<\/w:t>)/, `$1${m[1] === "þ" ? "☑" : "☐"}$2`);
  });
}

function buildSegments(mau, hs, cfg = {}) {
  const ten = String(hs.ho_ten || "").toUpperCase();
  const ngaySinh = fmtDate(hs.ngay_sinh);
  const ngayCap = fmtDate(hs.ngay_cap_cccd);
  const noiCap = hs.noi_cap || "Cục Cảnh sát QLHC về TTXH";
  const dots = (s, n = 30) => s || ".".repeat(n);
  // để trống ngày làm đơn — học viên tự ghi khi ký
  const ngayLam = [{ t: "Hải Phòng, ngày ........ tháng ........ năm .............." }];

  if (mau.startsWith("phieu_xac_nhan")) {
    const tuKham = /tự khám/i.test(hs.kham_suc_khoe || "");
    const ttKham = /trung tâm/i.test(hs.kham_suc_khoe || "");
    const segs = [
      ["Tổ Tiếp Sinh", [{ t: "Tổ Tiếp Sinh – Mã hồ sơ: " }, { t: hs.ma_ho_so || "", b: true }]],
      ["Họ và tên học viên", [{ t: "Họ và tên học viên: " }, { t: ten, b: true }]],
      ["Địa chỉ", [{ t: "Địa chỉ: " }, { t: dots(hs.dia_chi, 60), b: !!hs.dia_chi }]],
      ["Số CCCD", [{ t: "Số CCCD: " }, { t: dots(hs.cccd), b: !!hs.cccd }, { t: "          Cấp ngày: " }, { t: dots(ngayCap, 20), b: !!ngayCap }]],
      ["Ngày tháng năm sinh", [
        { t: "Ngày tháng năm sinh: " }, { t: dots(ngaySinh, 20), b: !!ngaySinh },
        { t: "          Số điện thoại: " }, { t: dots(hs.dien_thoai, 20), b: !!hs.dien_thoai },
      ]],
    ];
    if (tuKham || ttKham) segs.push(["Khám sức kho", tichO(tuKham ? 0 : 1)]);
    // phiếu hạng A: "Xác nhận đăng ký học: o Xe côn tay (A)  o Xe tay ga (A.02)"
    const lh = String(hs.loai_hinh || "");
    if (/côn tay|tay ga/i.test(lh)) segs.push(["Xác nhận đăng ký học", tichO(/côn tay/i.test(lh) ? 0 : 1)]);
    return segs.map((s) => [...s, true]); // 2 liên giống nhau
  }

  if (mau.startsWith("hop_dong")) {
    const tien = hocPhi(hs, cfg);
    return [
      ["BÊN B", [{ t: "BÊN B: Ông/bà: " }, { t: ten, b: true }]],
      ["Ngày sinh", [
        { t: "Ngày sinh: " }, { t: dots(ngaySinh, 20), b: !!ngaySinh },
        { t: ", số định danh cá nhân: " }, { t: dots(hs.cccd, 20), b: !!hs.cccd },
        { t: " ngày cấp " }, { t: dots(ngayCap, 15), b: !!ngayCap },
        { t: "; nơi cấp: " }, { t: noiCap, b: true },
      ]],
      ["Địa chỉ thường trú", [{ t: "Địa chỉ thường trú: " }, { t: dots(hs.dia_chi, 60), b: !!hs.dia_chi }]],
      ["Điện thoại liên hệ", [{ t: "Điện thoại liên hệ: " }, { t: dots(hs.dien_thoai, 40), b: !!hs.dien_thoai }]],
      ...(tien
        ? [["Số tiền", [{ t: "Số tiền: " }, { t: fmtTien(tien), b: true }, { t: " (Bằng chữ: " }, { t: docSoTien(tien), b: true, i: true }, { t: ")" }]]]
        : []),
    ];
  }

  if (mau === "don_de_nghi") {
    return [
      ["Tôi là", [{ t: "Tôi là: " }, { t: ten, b: true }, { t: "        Ngày, tháng, năm sinh: " }, { t: ngaySinh, b: true }]],
      ["Số Căn cước", [{ t: "Số Căn cước công dân hoặc Căn cước: " }, { t: hs.cccd || "", b: true }]],
      ["Ngày cấp", [
        { t: "Ngày cấp: " },
        { t: fmtDate(hs.ngay_cap_cccd) || "..............................", b: !!hs.ngay_cap_cccd },
        { t: "        nơi cấp: " },
        { t: hs.noi_cap || "Cục Cảnh sát QLHC về TTXH", b: true },
      ]],
      ["Đề nghị cho tôi", [{ t: "Đề nghị cho tôi được học lái xe hạng: " }, { t: hs.hang || "", b: true }]],
      ["Hải Phòng", [{ t: "  " }, ...ngayLam]],
    ];
  }
  return [
    ["Họ và tên", [{ t: "Họ và tên: " }, { t: ten, b: true }, { t: "        Ngày sinh: " }, { t: ngaySinh, b: true }]],
    ["Khóa học", [{ t: "Khóa học: " }, { t: hs.khoa_hoc || "", b: true }]],
    ["Hải Phòng", ngayLam],
  ];
}

async function taoMauDon(mauReq, hs, cauHinh = {}) {
  const mau = resolveMau(mauReq, hs.hang);
  const cfg = mau && MAU_DON[mau];
  if (!cfg) {
    const err = new Error("Mẫu đơn không hợp lệ");
    err.status = 400;
    throw err;
  }
  const buf = fs.readFileSync(path.join(TEMPLATE_DIR, cfg.file));
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");
  for (const [prefix, segs, all] of buildSegments(mau, hs, cauHinh)) {
    xml = replaceParagraph(xml, prefix, segs, all);
  }
  xml = oVuongUnicode(xml);
  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safeName = String(hs.ho_ten || "hoc-vien")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return { buffer: out, fileName: `${cfg.ten} - ${safeName} - ${hs.ma_ho_so || ""}.docx` };
}

/** Bộ hồ sơ in theo hạng: phiếu xác nhận, đơn đề nghị, đơn tự học, hợp đồng */
function mauTheoHang(hang) {
  return MAU_CHUNG.map((m) => resolveMau(m, hang));
}

module.exports = { MAU_DON, MAU_CHUNG, taoMauDon, mauTheoHang, docSoTien };
