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

// ─── Mã QR (mặt sau thẻ / ảnh có QR): chính xác tuyệt đối nếu đọc được ───
function ddmmyyyyToIso(s) {
  const m = String(s || "").match(/^(\d{2})(\d{2})(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function parseCccdQr(text) {
  const parts = String(text || "").trim().split("|");
  if (parts.length < 6 || !/^\d{12}$/.test(parts[0])) return null;
  return Object.fromEntries(
    Object.entries({
      cccd: parts[0],
      cmnd_cu: parts[1] || null,
      ho_ten: parts[2] || null,
      ngay_sinh: ddmmyyyyToIso(parts[3]),
      gioi_tinh: parts[4] || null,
      dia_chi: parts[5] || null,
      ngay_cap_cccd: ddmmyyyyToIso(parts[6]),
    }).filter(([, v]) => v),
  );
}

async function quetQr(img, region, width) {
  const jsQR = require("jsqr");
  let s = sharp(img);
  if (region) s = s.extract(region);
  const { data, info } = await s
    .resize({ width, withoutEnlargement: false })
    .normalize()
    .toColourspace("srgb")
    .ensureAlpha() // jsQR cần RGBA 4 kênh
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, {
    inversionAttempts: "attemptBoth",
  });
  return code ? parseCccdQr(code.data) : null;
}

/** Tìm QR CCCD: cả ảnh ở vài kích thước, rồi từng vùng (QR nhỏ trong ảnh chụp cả thẻ) */
async function docQrAnh(buffer) {
  const img = await sharp(buffer, { failOn: "none" }).rotate().toBuffer();
  const { width: W, height: H } = await sharp(img).metadata();
  if (!W || !H) return null;
  for (const w of [1000, 1600, 700]) {
    const r = await quetQr(img, null, w).catch(() => null);
    if (r) return r;
  }
  const hw = Math.floor(W / 2);
  const hh = Math.floor(H / 2);
  const regions = [
    { left: hw, top: 0, width: W - hw, height: hh }, // trên phải (vị trí QR mặt trước thẻ chip)
    { left: 0, top: 0, width: hw, height: hh },
    { left: hw, top: hh, width: W - hw, height: H - hh },
    { left: 0, top: hh, width: hw, height: H - hh },
    { left: Math.floor(W / 4), top: Math.floor(H / 4), width: hw, height: hh },
  ];
  for (const rg of regions) {
    const r = await quetQr(img, rg, 900).catch(() => null);
    if (r) return r;
  }
  return null;
}

// ─── OCR ───
// Các kiểu xử lý ảnh để OCR: ảnh chụp thẻ thật hay bị loá, mờ, nền hoa văn -> thử nhiều kiểu
const BIEN_THE = [
  (s) => s.grayscale().normalize().sharpen(),
  (s) => s.grayscale().normalize().median(3).sharpen({ sigma: 1.5 }).threshold(150),
  (s) => s.grayscale().linear(1.6, -60).sharpen(),
];

async function chuanHoaAnh(buffer, bienThe = 0, goc = 0) {
  let img = sharp(buffer, { failOn: "none" }).rotate();
  if (goc) img = sharp(await img.toBuffer()).rotate(goc);
  const base = await img.toBuffer();
  const meta = await sharp(base).metadata();
  const w = meta.width || 0;
  // chữ trên thẻ nhỏ: phóng ảnh lên ~2000px chiều ngang
  const target = w && w < 2000 ? 2000 : Math.min(w || 2000, 2800);
  return BIEN_THE[bienThe](sharp(base).resize({ width: target, withoutEnlargement: false })).png().toBuffer();
}

// điểm cho kết quả: các trường quan trọng có trọng số cao hơn
function diem(d) {
  const w = { cccd: 4, ho_ten: 3, ngay_sinh: 2, dia_chi: 2, ngay_cap_cccd: 2, gioi_tinh: 1, quoc_tich: 0.5, noi_cap: 0.5 };
  return Object.keys(d).reduce((s, k) => s + (w[k] || 0.5), 0);
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

  // Số CCCD: 12 chữ số (OCR hay chèn khoảng trắng giữa các số, đọc nhầm O->0, l/I->1)
  // chỉ áp dụng cho phần giá trị sau nhãn "Số/No." (vốn toàn chữ số)
  const sua = (s) => s.replace(/[OoDQ]/g, "0").replace(/[lI|!]/g, "1").replace(/[Ss](?=\d)/g, "5").replace(/B(?=\d)/g, "8");
  const gomSo = (s) => s.replace(/(\d)[ .,](?=\d)/g, "$1");
  const re12 = /(?<!\d)0\d{11}(?!\d)/;
  let so = gomSo(text).match(re12);
  if (!so) {
    for (const l of lines) {
      if (!/(số|so|no\b|định danh|identi)/i.test(l)) continue;
      so = gomSo(sua(l.split(/[:：]/).slice(1).join(" ") || l)).match(re12);
      if (so) break;
    }
  }
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
    // mặt sau thẻ chip cũ: "Ngày, tháng, năm/Date, month, year: 10/10/2021"
    if (!out.ngay_cap_cccd && /(ngày,? tháng,? năm cấp|date of issue|ngày cấp|date,? month,? year|tháng,? năm\s*\/)/i.test(l) && !/(sinh|birth|hết hạn|expiry)/i.test(l)) {
      out.ngay_cap_cccd = dateIn(l) || dateIn(lines[i + 1]);
    }
  });

  // tên dự phòng: không thấy nhãn -> dòng chữ HOA 2-6 từ đầu tiên không phải tiêu đề thẻ
  if (!out.ho_ten) {
    const TIEU_DE = /(CỘNG|HÒA|HOÀ|VIỆT NAM|ĐỘC LẬP|TỰ DO|HẠNH PHÚC|CĂN CƯỚC|CÔNG DÂN|SOCIALIST|REPUBLIC|IDENTITY|CITIZEN|CARD|BỘ CÔNG AN|CỤC|CẢNH SÁT|GIÁM ĐỐC|TRƯỞNG|THẺ)/;
    // tên luôn nằm ngay trên dòng "Ngày, tháng, năm sinh / Date of birth"
    const iSinh = lines.findIndex((l) => /(năm sinh|ngày sinh|date of)/i.test(l));
    for (const l of iSinh > 0 ? lines.slice(Math.max(0, iSinh - 3), iSinh) : []) {
      const m = l.match(/[A-ZÀ-Ỹ][A-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹ]*){1,5}/g) || [];
      const best = m.filter((x) => !TIEU_DE.test(x) && x === x.toLocaleUpperCase("vi")).sort((a, b) => b.length - a.length)[0];
      if (best && best.replace(/\s/g, "").length >= 6) {
        out.ho_ten = titleCase(best.trim());
        break;
      }
    }
  }
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
  // 1) QR trên bất kỳ ảnh nào -> dùng luôn (chính xác)
  for (const f of files) {
    const qr = await docQrAnh(f.buffer).catch(() => null);
    if (qr) return { data: qr, nguon: "qr", text: "", do_tin_cay: 100 };
  }

  // 2) OCR từng ảnh: thử các kiểu xử lý / góc xoay, lấy kết quả nhiều trường nhất
  const worker = await getWorker();
  const merged = {};
  const texts = [];
  let conf = 0;
  for (const f of files) {
    let best = null;
    const all = [];
    const thu = async (bienThe, goc) => {
      const img = await chuanHoaAnh(f.buffer, bienThe, goc);
      const { data } = await worker.recognize(img);
      const parsed = parseCccdText(data.text || "");
      const r = { parsed, text: data.text || "", conf: data.confidence || 0, score: diem(parsed) };
      all.push(r);
      if (!best || r.score > best.score) best = r;
      return r;
    };
    const DU = 11; // đủ tốt: có CCCD + họ tên + ngày sinh + địa chỉ
    for (let b = 0; b < BIEN_THE.length && (!best || best.score < DU); b++) await thu(b, 0);
    // không thấy số CCCD hoặc tên -> có thể ảnh bị xoay ngang/ngược
    const thieuChinh = () => !best.parsed.cccd || !best.parsed.ho_ten;
    if (thieuChinh()) for (const g of [90, 270, 180]) if (thieuChinh()) await thu(0, g);
    // gộp: ảnh trước bổ sung các trường ảnh sau còn thiếu
    // ưu tiên kết quả điểm cao nhất, các lần thử khác chỉ điền trường còn thiếu
    for (const r of all.sort((a, b) => b.score - a.score)) {
      for (const [k, v] of Object.entries(r.parsed)) if (!merged[k]) merged[k] = v;
    }
    texts.push(best.text);
    conf += best.conf;
  }
  return { data: merged, nguon: "ocr", text: texts.join("\n"), do_tin_cay: Math.round(conf / files.length) };
}

module.exports = { docAnhCccd, parseCccdText, parseCccdQr };
