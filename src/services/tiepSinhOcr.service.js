// Đọc thông tin CCCD từ ảnh (ảnh chụp thẻ / ảnh chụp màn hình VNeID) bằng OCR (tesseract.js, tiếng Việt)
const path = require("path");
const sharp = require("sharp");

let _workerPromise = null;
function getWorker() {
  if (!_workerPromise) {
    const { createWorker } = require("tesseract.js");
    _workerPromise = createWorker("vie", 1, {
      // lần đầu tải dữ liệu ngôn ngữ (~10MB) rồi lưu lại, các lần sau dùng bản đã lưu
      cachePath: path.join(__dirname, "../../.tessdata"),
    }).catch((err) => {
      _workerPromise = null;
      throw err;
    });
  }
  return _workerPromise;
}

// Chuẩn hoá ảnh để OCR: xoay theo EXIF, xám, phóng to ảnh nhỏ, tăng tương phản
async function chuanHoaAnh(buffer) {
  const img = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width || 0;
  const target = w && w < 1400 ? 1400 : Math.min(w || 2000, 2600);
  return img.resize({ width: target, withoutEnlargement: false }).grayscale().normalize().sharpen().png().toBuffer();
}

const nfc = (s) => String(s || "").normalize("NFC");

function toIso(d, m, y) {
  const dd = Number(d);
  const mm = Number(m);
  const yy = Number(y);
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 1900 && yy <= 2100)) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
const DATE_RE = /(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/;
function dateIn(s) {
  const m = String(s || "").match(DATE_RE);
  return m ? toIso(m[1], m[2], m[3]) : null;
}

function titleCase(s) {
  return s
    .toLocaleLowerCase("vi")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("vi") + w.slice(1))
    .join(" ");
}

// nhãn các mục trên thẻ / VNeID (để biết chỗ dừng khi đọc giá trị nhiều dòng)
const LABEL_RE =
  /(số định danh|personal ident|họ,? chữ đệm|họ và tên|full name|ngày,? tháng,? năm|date of|giới tính|sex|quốc tịch|nationality|quê quán|place of origin|nơi sinh|nơi đăng ký khai sinh|nơi thường trú|nơi cư trú|place of residence|nơi tạm trú|nơi ở hiện tại|dân tộc|tôn giáo|đặc điểm|có giá trị|date of expiry|cập nhật|thẻ căn cước|lịch sử)/i;

// dòng "sạch" = phần lớn là chữ cái (loại dòng rác do hoa văn nền)
function sach(l) {
  const letters = (l.match(/[A-Za-zÀ-ỹ0-9]/g) || []).length;
  const bad = (l.match(/[^A-Za-zÀ-ỹ0-9\s,./-]/g) || []).length;
  return letters >= 3 && bad / Math.max(1, l.length) < 0.08;
}

function valueAfter(lines, i, { multi = false } = {}) {
  const line = lines[i];
  const idx = line.search(/[:：]/);
  let first = idx >= 0 ? line.slice(idx + 1).trim() : "";
  // bỏ phần nhãn tiếng Anh còn dính lại (vd "Place of residence:")
  first = first.replace(/^[A-Za-z /]+:\s*/, "").trim();
  const out = [];
  if (first && !/^-+$/.test(first)) out.push(first);
  for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
    const l = lines[j].trim();
    if (!l) continue;
    if (LABEL_RE.test(l) || !sach(l)) break;
    if (out.length && !multi) break;
    out.push(l);
    if (!multi) break;
  }
  return out.join(", ").replace(/\s+/g, " ").replace(/^[-–\s]+$/, "").trim();
}

/** Tách các trường từ văn bản OCR */
function parseCccdText(raw) {
  const text = nfc(raw);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[|_~`"“”]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = {};

  // Số CCCD: 12 chữ số (OCR hay chèn khoảng trắng giữa các số)
  const so = text.replace(/(\d)[ .](?=\d)/g, "$1").match(/(?<!\d)0\d{11}(?!\d)/);
  if (so) out.cccd = so[0];

  lines.forEach((l, i) => {
    const low = l.toLowerCase();
    if (!out.ho_ten && /(họ,? chữ đệm|họ và tên|full name)/i.test(l)) {
      // tên trên thẻ viết HOA: lấy cụm chữ HOA dài nhất ở dòng nhãn hoặc 2 dòng sau
      const cands = [l.split(/[:：]/).slice(1).join(" "), lines[i + 1] || "", lines[i + 2] || ""];
      for (const c of cands) {
        const m = c.match(/[A-ZÀ-Ỹ][A-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹ]*)+/g);
        const best = (m || []).sort((a, b) => b.length - a.length)[0];
        if (best && best.trim().split(/\s+/).length >= 2) {
          out.ho_ten = titleCase(best.trim());
          break;
        }
      }
    }
    if (!out.ngay_sinh && /(ngày,? tháng,? năm sinh|date of birth)/i.test(l)) {
      out.ngay_sinh = dateIn(l) || dateIn(lines[i + 1]);
    }
    if (!out.gioi_tinh && /(giới tính|sex)/i.test(l)) {
      const m = (l + " " + (lines[i + 1] || "")).match(/(?:giới tính|sex)[^A-Za-zÀ-ỹ]*(?:\/\s*sex)?[^A-Za-zÀ-ỹ]*(nam|nữ|nu)\b/i);
      if (m) out.gioi_tinh = /^n[ữu]$/i.test(m[1]) ? "Nữ" : "Nam";
    }
    if (!out.quoc_tich && /(quốc tịch|nationality)/i.test(l)) {
      const m = l.match(/(việt nam)/i);
      if (m) out.quoc_tich = "Việt Nam";
    }
    if (!out.dia_chi && /(nơi thường trú|nơi cư trú|place of residence)/i.test(l)) {
      const v = valueAfter(lines, i, { multi: true });
      if (v && v !== "---") out.dia_chi = v;
    }
    if (!out.noi_o_hien_tai && /nơi ở hiện tại/i.test(low)) {
      const v = valueAfter(lines, i, { multi: true });
      if (v && v !== "---") out.noi_o_hien_tai = v;
    }
    if (!out.ngay_cap_cccd && /(ngày,? tháng,? năm cấp|date of issue|ngày cấp)/i.test(l)) {
      out.ngay_cap_cccd = dateIn(l) || dateIn(lines[i + 1]);
    }
  });

  // ngày sinh dự phòng: ngày đầu tiên trong văn bản
  if (!out.ngay_sinh) out.ngay_sinh = dateIn(text);
  if (!out.gioi_tinh) {
    const m = text.match(/\b(Nam|Nữ)\b/);
    if (m) out.gioi_tinh = m[1];
  }
  // nơi cấp theo mặt sau thẻ
  if (/cục cảnh sát|qlhc|quản lý hành chính/i.test(text)) out.noi_cap = "Cục Cảnh sát QLHC về TTXH";
  else if (/bộ công an/i.test(text) && /(ngày cấp|date of issue)/i.test(text)) out.noi_cap = "Bộ Công an";

  if (!out.dia_chi && out.noi_o_hien_tai) out.dia_chi = out.noi_o_hien_tai;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

/** OCR nhiều ảnh (mặt trước + mặt sau) -> thông tin gộp */
async function docAnhCccd(files = []) {
  if (!files.length) {
    const e = new Error("Chưa có ảnh CCCD");
    e.status = 400;
    throw e;
  }
  const worker = await getWorker();
  const texts = [];
  let conf = 0;
  for (const f of files) {
    const img = await chuanHoaAnh(f.buffer);
    const { data } = await worker.recognize(img);
    texts.push(data.text || "");
    conf += data.confidence || 0;
  }
  const text = texts.join("\n");
  const data = parseCccdText(text);
  return { data, text, do_tin_cay: Math.round(conf / files.length) };
}

module.exports = { docAnhCccd, parseCccdText };
