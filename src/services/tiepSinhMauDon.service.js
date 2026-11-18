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

const MAU_DON = {
  don_de_nghi: { file: "don_de_nghi.docx", ten: "Don de nghi hoc lai xe" },
  tu_hoc_a1: { file: "tu_hoc_a1.docx", ten: "Don dang ky tu hoc ly thuyet hang A1" },
  tu_hoc_a: { file: "tu_hoc_a.docx", ten: "Don dang ky tu hoc ly thuyet hang A" },
};

const pad = (n) => String(n).padStart(2, "0");
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
      const pr = s.b ? (rPr ? rPr.replace("</w:rPr>", "<w:b/><w:bCs/></w:rPr>") : "<w:rPr><w:b/><w:bCs/></w:rPr>") : rPr;
      return `<w:r>${pr}<w:t xml:space="preserve">${xmlEscape(s.t)}</w:t></w:r>`;
    })
    .join("");
  return `${open}${pPr}${newRuns}${keep.join("")}</w:p>`;
}

/** Thay đoạn văn đầu tiên có chữ (đã bỏ khoảng trắng) bắt đầu bằng prefix */
function replaceParagraph(xml, prefix, segments) {
  const re = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let done = false;
  return xml.replace(re, (p) => {
    if (done) return p;
    // bỏ qua đoạn chứa bảng/khung lồng nhau để tránh cắt sai
    if (/<w:txbxContent/.test(p)) return p;
    const t = textOf(p).trim();
    if (t.startsWith(prefix)) {
      done = true;
      return rewriteParagraph(p, segments);
    }
    return p;
  });
}

function buildSegments(mau, hs, now) {
  const ten = String(hs.ho_ten || "").toUpperCase();
  const ngaySinh = fmtDate(hs.ngay_sinh);
  const ngayLam = [
    { t: "Hải Phòng, ngày " },
    { t: pad(now.getDate()) },
    { t: " tháng " },
    { t: pad(now.getMonth() + 1) },
    { t: ` năm ${now.getFullYear()}` },
  ];
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

async function taoMauDon(mau, hs) {
  const cfg = MAU_DON[mau];
  if (!cfg) {
    const err = new Error("Mẫu đơn không hợp lệ");
    err.status = 400;
    throw err;
  }
  const buf = fs.readFileSync(path.join(TEMPLATE_DIR, cfg.file));
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");
  for (const [prefix, segs] of buildSegments(mau, hs, new Date())) {
    xml = replaceParagraph(xml, prefix, segs);
  }
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

/** Mẫu đơn mặc định theo hạng: đơn đề nghị + đơn tự học đúng hạng */
function mauTheoHang(hang) {
  return ["don_de_nghi", String(hang || "").toUpperCase() === "A" ? "tu_hoc_a" : "tu_hoc_a1"];
}

module.exports = { MAU_DON, taoMauDon, mauTheoHang };
