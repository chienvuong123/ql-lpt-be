// Đọc thông tin CCCD từ ảnh (ảnh chụp thẻ / ảnh chụp màn hình VNeID) bằng OCR (tesseract.js, tiếng Việt)
const path = require("path");
const sharp = require("sharp");

// 2 worker chạy song song (mỗi ảnh OCR nhiều kiểu xử lý -> nhanh gấp đôi)
const SO_WORKER = 2;
let _poolPromise = null;
function getWorkers() {
  if (!_poolPromise) {
    const { createWorker } = require("tesseract.js");
    const opts = {
      // lần đầu tải dữ liệu ngôn ngữ rồi lưu lại, các lần sau dùng bản đã lưu
      cachePath: path.join(__dirname, "../../.tessdata"),
    };
    _poolPromise = Promise.all(Array.from({ length: SO_WORKER }, () => createWorker("vie", 1, opts))).catch((err) => {
      _poolPromise = null;
      throw err;
    });
  }
  return _poolPromise;
}

// Worker riêng đọc 1 dòng (dòng họ tên cắt riêng) — không đổi cấu hình các worker chính
let _dongPromise = null;
function getWorkerDong() {
  if (!_dongPromise) {
    const { createWorker } = require("tesseract.js");
    _dongPromise = createWorker("vie", 1, { cachePath: path.join(__dirname, "../../.tessdata") })
      .then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: "7" }); // 1 dòng
        return w;
      })
      .catch((err) => {
        _dongPromise = null;
        throw err;
      });
  }
  return _dongPromise;
}
// worker dòng dùng chung giữa các job song song -> xếp hàng
let _dongQueue = Promise.resolve();
function docMotDong(buf) {
  const job = _dongQueue.then(async () => (await getWorkerDong()).recognize(buf));
  _dongQueue = job.catch(() => {});
  return job;
}

/** Chạy danh sách việc trên pool worker, giữ đúng thứ tự kết quả */
async function chayPool(jobs) {
  const workers = await getWorkers();
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    workers.map(async (w) => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i](w);
      }
    }),
  );
  return out;
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
/**
 * Tách chữ khỏi nền hoa văn màu: chữ trên thẻ đen / xanh đậm (cả 3 kênh màu đều tối),
 * nền là màu nhạt -> lấy kênh sáng nhất của mỗi điểm ảnh rồi phân ngưỡng.
 */
async function tachNenMau(s, nguong) {
  const { data, info } = await s.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0, j = 0; j < out.length; i += ch, j++) {
    const m = ch >= 3 ? Math.max(data[i], data[i + 1], data[i + 2]) : data[i];
    out[j] = m < nguong ? 0 : 255;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } });
}

// Các kiểu xử lý ảnh để OCR (ảnh chụp thẻ hay bị loá, mờ, nền hoa văn) -> chạy hết rồi lấy đa số.
// [chiều rộng tối thiểu, hàm xử lý]
const BIEN_THE = [
  [2000, async (s) => s.grayscale().normalize().sharpen()],
  [2000, async (s) => s.grayscale().normalize().median(3).sharpen({ sigma: 1.5 }).threshold(150)],
  [2600, async (s) => s.grayscale().normalize()],
  [2400, async (s) => tachNenMau(s, 140)],
];

async function chuanHoaAnh(buffer, bienThe = 0, goc = 0) {
  let img = sharp(buffer, { failOn: "none" }).rotate();
  if (goc) img = sharp(await img.toBuffer()).rotate(goc);
  const base = await img.toBuffer();
  const meta = await sharp(base).metadata();
  const w = meta.width || 0;
  const [minW, fn] = BIEN_THE[bienThe];
  // chữ trên thẻ nhỏ: phóng ảnh lên đủ lớn
  const target = w && w < minW ? minW : Math.min(w || minW, 2800);
  const s = sharp(base).resize({ width: target, withoutEnlargement: false, kernel: "lanczos3" });
  return (await fn(s)).png().toBuffer();
}

// ─── Gộp kết quả nhiều lần OCR ───
const boDau = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
const KHOA_SO_SANH = (v) => String(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Mỗi trường: lấy giá trị xuất hiện nhiều nhất giữa các lần OCR (hoà -> lần thử trước) */
function bauChon(list) {
  const out = {};
  const keys = new Set(list.flatMap((p) => Object.keys(p)));
  for (const k of keys) {
    const dem = new Map();
    list.forEach((p, i) => {
      if (!p[k]) return;
      const key = KHOA_SO_SANH(p[k]);
      const cur = dem.get(key) || { v: p[k], n: 0, i };
      cur.n++;
      dem.set(key, cur);
    });
    const best = [...dem.values()].sort((a, b) => b.n - a.n || a.i - b.i)[0];
    if (best) out[k] = best.v;
  }
  return out;
}

// ─── Sửa địa chỉ theo danh mục địa danh Việt Nam (tỉnh/huyện/xã, trước & sau sáp nhập 2025) ───
let _diaDanh = null;
// dia_danh_vn.json: { t: tỉnh/TP trung ương, h: quận/huyện/thị xã/TP thuộc tỉnh, x: xã/phường/thị trấn }
function diaDanh() {
  if (!_diaDanh) {
    const data = require("../data/dia_danh_vn.json");
    _diaDanh = {};
    for (const [cap, list] of Object.entries(data)) {
      const exact = new Set(list);
      const byKey = new Map();
      for (const n of list) {
        const k = boDau(n);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(n);
      }
      _diaDanh[cap] = { exact, byKey };
    }
  }
  return _diaDanh;
}
// tiền tố -> các cấp hành chính được phép
const TIEN_TO = {
  "Thành phố": ["t", "h"],
  Tỉnh: ["t"],
  Quận: ["h"],
  Huyện: ["h"],
  "Thị xã": ["h"],
  Phường: ["x"],
  Xã: ["x"],
  "Thị trấn": ["x"],
  "Đặc khu": ["x", "h"],
};
const TIEN_TO_KEY = new Map(Object.keys(TIEN_TO).map((t) => [boDau(t), t]));
// số ký tự khác nhau giữa 2 chuỗi cùng độ dài (sau khi bỏ dấu giống nhau)
const khacDau = (a, b) => {
  const x = [...a];
  const y = [...b];
  return x.length === y.length ? x.reduce((n, c, i) => n + (c !== y[i] ? 1 : 0), 0) : 99;
};

// Họ phổ biến (Kinh + các dân tộc). OCR hay đọc sai dấu trên chữ HOA: "LÒ" -> "LÔ"/"LO"
const HO = `Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đào Đoàn Vương Trịnh Trương Đinh
  Lâm Phùng Mai Tô Hà Tạ Lương Lưu Cao Quách Tăng Thái Châu Văn Kiều Khúc Mạc Nghiêm Nông Lò Lường Quàng Cầm Vì Sùng
  Giàng Thào Mùa Vàng Lầu Hầu Tòng Lù Chảo Bàn Triệu Hứa Đàm La Ma Mông Lục Âu Ông Doãn Khổng Lại Lã Từ Tống Thân Chu
  Diệp Giáp Kim Lạc Nhữ Ninh Phí Quan Tiêu Trang Ứng Xa Yên Kha Khương Bế Bạch Biện Cù Đồng Đường Hàn Hồng Mẫn
  Nhâm Quản Sầm Tôn Thạch Danh Sơn Lèo Lộc Mè Tẩn Phàn Hảng Vừ Hờ Chang Giàng Sình Lỳ Cứ Ly Tráng Hạng Sùng Vừ Lý`
  .split(/\s+/)
  .filter(Boolean);
const HO_SET = new Set(HO);
const HO_KEY = HO.reduce((m, h) => m.set(boDau(h), [...(m.get(boDau(h)) || []), h]), new Map());

// ─── Bảng tần suất âm tiết tên người, dựng từ tên học viên đã có trong DB ───
// Chỉ giữ số lần xuất hiện của từng âm tiết trong bộ nhớ (không lưu / gửi danh sách tên đi đâu)
const NGUON_TEN = [
  ["hoc_vien", "ho_ten"],
  ["google_sheet_data", "ten_hoc_vien"],
  ["google_sheet_a1", "ho_ten"],
  ["hoc_vien_da_tot_nghiep", "ho_ten"],
  ["trang_thai_hoc_vien", "ho_ten"],
  ["sat_hach_thi_sinh", "ho_ten"],
  ["gplx_hoan", "ho_ten"],
];
let _amTiet = null; // { at: Date, dem: Map(form -> n), theoKhoa: Map(khoá bỏ dấu -> Map(form -> n)) }
const titleWord = (w) => w.charAt(0).toLocaleUpperCase("vi") + w.slice(1).toLocaleLowerCase("vi");

async function amTietTen() {
  if (_amTiet && Date.now() - _amTiet.at < 6 * 3600 * 1000) return _amTiet;
  const dem = new Map();
  try {
    const connectSQL = require("../configs/sql");
    const pool = await connectSQL();
    for (const [tbl, col] of NGUON_TEN) {
      const r = await pool
        .request()
        .query(`IF OBJECT_ID('${tbl}') IS NOT NULL SELECT ${col} AS t FROM ${tbl} WHERE ${col} IS NOT NULL`)
        .catch(() => null);
      for (const row of r?.recordset || []) {
        for (const w of nfc(row.t).match(/\p{L}+/gu) || []) {
          const f = titleWord(w);
          dem.set(f, (dem.get(f) || 0) + 1);
        }
      }
    }
  } catch (e) {
    console.warn("[OCR] Không dựng được bảng âm tiết tên:", e.message);
  }
  const theoKhoa = new Map();
  for (const [f, n] of dem) {
    const k = boDau(f);
    if (!theoKhoa.has(k)) theoKhoa.set(k, new Map());
    theoKhoa.get(k).set(f, n);
  }
  _amTiet = { at: Date.now(), dem, theoKhoa };
  return _amTiet;
}

/**
 * Chọn họ tên từ nhiều lần đọc (cả ảnh + dòng tên cắt riêng):
 *  - bỏ chữ rác đầu/cuối (không phải âm tiết tên nào: "Mt", "Ii"...)
 *  - mỗi vị trí: điểm = số lần đọc ra + mức phổ biến trong tên thật (Tường >> Tưỡng)
 */
/**
 * Cắt riêng dòng họ tên (dòng dưới nhãn "Họ, chữ đệm và tên / Full name"), phóng to,
 * đọc lại ở chế độ 1 dòng với vài kiểu xử lý -> dấu trên chữ HOA đọc chính xác hơn.
 */
async function docDongTen(img, data, goc0) {
  const lines = (data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []));
  const i = lines.findIndex((l) => /(chữ đệm|full name|họ và tên)/i.test(l.text || ""));
  if (i < 0) return [];
  // tên cùng dòng với nhãn (thẻ cũ "Họ và tên: NGUYỄN VĂN A") -> bỏ qua, chỉ xử lý tên ở dòng riêng
  const sauNhan = (lines[i].text || "").split(/[:：]/).slice(1).join(" ");
  if (/[A-ZÀ-Ỹ]{2,}\s+[A-ZÀ-Ỹ]{2,}/.test(sauNhan)) return [];
  const ln = lines[i + 1];
  if (!ln?.bbox || !/[A-ZÀ-Ỹ]{2,}/.test(ln.text || "")) return [];
  const meta = await sharp(img).metadata();
  // cắt từ ẢNH GỐC (ảnh đã làm nét làm nhoè dấu nhỏ): quy đổi toạ độ theo tỉ lệ phóng
  const goc = await sharp(goc0, { failOn: "none" }).rotate().toBuffer();
  const gm = await sharp(goc).metadata();
  const k = gm.width / meta.width;
  // chỉ lấy vùng các chữ IN HOA của tên (bỏ hoa văn / ký tự rác 2 bên dòng)
  const words = (ln.words || []).filter((w) => /^[^p{L}]*[A-ZÀ-Ỹ]{2,}[^p{L}]*$/u.test((w.text || "").trim()) && w.bbox);
  const bb = words.length
    ? {
        x0: Math.min(...words.map((w) => w.bbox.x0)),
        y0: Math.min(...words.map((w) => w.bbox.y0)),
        x1: Math.max(...words.map((w) => w.bbox.x1)),
        y1: Math.max(...words.map((w) => w.bbox.y1)),
      }
    : ln.bbox;
  // khung chữ không tính dấu phía trên chữ HOA (Á, Ề...) -> nới lên trên ~60% chiều cao chữ
  const cao = bb.y1 - bb.y0;
  const pad = 14;
  const padTren = Math.max(pad, Math.round(cao * 0.6));
  const left = Math.max(0, bb.x0 - pad);
  const top = Math.max(0, bb.y0 - padTren);
  const box = {
    left: Math.round(left * k),
    top: Math.round(top * k),
    width: Math.round(Math.min(meta.width - left, bb.x1 - bb.x0 + 2 * pad) * k),
    height: Math.round(Math.min(meta.height - top, bb.y1 - top + pad) * k),
  };
  box.width = Math.min(box.width, gm.width - box.left);
  box.height = Math.min(box.height, gm.height - box.top);
  if (box.width < 10 || box.height < 5) return [];
  const out = [];
  for (const h of [120, 160]) {
    const base = sharp(goc).extract(box).resize({ height: h, kernel: "lanczos3" }).grayscale().normalize();
    for (const nguong of [0, 140]) {
      const buf = await (nguong ? base.clone().threshold(nguong) : base.clone()).png().toBuffer();
      const { data: r } = await docMotDong(buf);
      if (r.text?.trim()) out.push(nfc(r.text.trim()));
    }
  }
  return out;
}

// docs: [{ text, w }] — w = trọng số của lần đọc (dòng tên cắt riêng, phóng to: tin cậy hơn)
function chonHoTen(docs, at) {
  const coTen = at.theoKhoa.size > 0;
  const laTen = (w) => !coTen || at.theoKhoa.has(boDau(w));
  const sach = docs
    .map((d) => ({ w: d.w ?? 1, ws: (String(d.text || "").match(/\p{L}+/gu) || []).map(titleWord) }))
    .map(({ w, ws }) => {
      let a = 0;
      let b = ws.length;
      while (a < b && !laTen(ws[a])) a++;
      while (b > a && !laTen(ws[b - 1])) b--;
      return { w, ws: ws.slice(a, b) };
    })
    .filter(({ ws }) => ws.length >= 2 && ws.length <= 7);
  if (!sach.length) return null;
  // số chữ phổ biến nhất giữa các lần đọc (theo trọng số)
  const demLen = new Map();
  sach.forEach(({ w, ws }) => demLen.set(ws.length, (demLen.get(ws.length) || 0) + w));
  const len = [...demLen.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
  const cung = sach.filter(({ ws }) => ws.length === len);
  const coDau = (s) => /[̀-ͯ]/.test(s.normalize("NFD")) || /đ/i.test(s);
  const out = [];
  for (let i = 0; i < len; i++) {
    const docRa = new Map(); // dạng -> tổng trọng số đọc ra
    cung.forEach(({ w, ws }) => docRa.set(ws[i], (docRa.get(ws[i]) || 0) + w));
    // nhóm theo chữ bỏ dấu, lấy nhóm được đọc ra nhiều nhất
    const nhom = new Map();
    for (const [f, n] of docRa) nhom.set(boDau(f), (nhom.get(boDau(f)) || 0) + n);
    const khoa = [...nhom.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const ungVien = [...docRa.keys()].filter((f) => boDau(f) === khoa);
    // OCR hay làm MẤT dấu hơn là thêm dấu: có dạng có dấu (là tên thật) được đọc ra -> trừ điểm dạng không dấu
    const coDangDau = ungVien.some((f) => coDau(f) && (at.dem.get(f) || 0) >= 3);
    const diemCua = (f) =>
      docRa.get(f) + 2 * Math.log10(1 + (at.dem.get(f) || 0)) - (coDangDau && !coDau(f) ? 5 : 0);
    out.push(ungVien.sort((x, y) => diemCua(y) - diemCua(x))[0]);
  }
  return out.join(" ");
}

/** Sửa họ (từ đầu tiên) nếu không phải họ đã biết và chỉ khớp 1 họ khi bỏ dấu */
function suaHo(hoTen, at) {
  if (!hoTen) return hoTen;
  const [ho, ...rest] = hoTen.split(" ");
  // họ đã có trong danh sách, hoặc là âm tiết có thật trong tên học viên (vd "Tráng") -> giữ nguyên
  if (HO_SET.has(ho) || (at?.dem.get(ho) || 0) >= 3) return hoTen;
  const cands = HO_KEY.get(boDau(ho)) || [];
  return cands.length === 1 ? [cands[0], ...rest].join(" ") : hoTen;
}

/** "Bản Cọ, Xã Tuân Giáo, Tỉnh Điện Biên" -> "Bản Cọ, Xã Tuần Giáo, Tỉnh Điện Biên" */
function suaDiaChi(value) {
  if (!value) return value;
  const dd = diaDanh();
  return value
    .split(/\s*,\s*/)
    .map((seg) => {
      const m = seg.match(/^(\S+(?:\s+\S+)?)\s+(.+)$/);
      if (!m) return seg;
      // tiền tố 1 hoặc 2 từ (Xã / Thị trấn ...)
      let tienTo = null;
      let ten = null;
      for (const [a, b] of [
        [m[1], m[2]],
        [seg.split(/\s+/)[0], seg.split(/\s+/).slice(1).join(" ")],
      ]) {
        const t = TIEN_TO_KEY.get(boDau(a));
        if (t) {
          tienTo = t;
          ten = b;
          break;
        }
      }
      if (!tienTo) return seg;
      const caps = TIEN_TO[tienTo].map((c) => dd[c]);
      if (caps.some((c) => c.exact.has(ten))) return `${tienTo} ${ten}`;
      const cands = [...new Set(caps.flatMap((c) => c.byKey.get(boDau(ten)) || []))];
      if (!cands.length) return `${tienTo} ${ten}`;
      const best = cands.map((c) => [c, khacDau(c, ten)]).sort((x, y) => x[1] - y[1]);
      // chỉ sửa khi rõ ràng: 1 ứng viên, hoặc ứng viên gần nhất hơn hẳn ứng viên thứ hai
      if (best.length === 1 || best[0][1] < best[1][1]) return `${tienTo} ${best[0][0]}`;
      return `${tienTo} ${ten}`;
    })
    .join(", ");
}

/**
 * Sửa dấu theo ngữ cảnh:cùng một cụm 2 từ (bỏ dấu giống nhau) xuất hiện nhiều lần trong ảnh
 * -> dùng dạng có dấu xuất hiện nhiều nhất. VD "Tuân Giáo" (1 lần) -> "Tuần Giáo" (5 lần).
 */
function suaDauTheoNguCanh(value, texts) {
  if (!value) return value;
  const dem = new Map(); // khoá bỏ dấu -> Map(dạng -> số lần)
  for (const t of texts) {
    for (const line of nfc(t).split(/\r?\n/)) {
      const ws = line.match(/[\p{L}]+/gu) || [];
      for (let i = 0; i + 1 < ws.length; i++) {
        const form = `${ws[i]} ${ws[i + 1]}`;
        const key = boDau(form);
        if (!dem.has(key)) dem.set(key, new Map());
        const m = dem.get(key);
        m.set(form, (m.get(form) || 0) + 1);
      }
    }
  }
  const parts = value.split(/(\s+|,\s*)/);
  const idx = parts.map((p, i) => (/^[\p{L}]+$/u.test(p) ? i : -1)).filter((i) => i >= 0);
  for (let a = 0; a + 1 < idx.length; a++) {
    const [i, j] = [idx[a], idx[a + 1]];
    if (j !== i + 2 || !/^\s+$/.test(parts[i + 1])) continue; // chỉ 2 từ liền nhau, không qua dấu phẩy
    const form = `${parts[i]} ${parts[j]}`;
    const forms = dem.get(boDau(form));
    if (!forms) continue;
    const [bestForm, n] = [...forms.entries()].sort((x, y) => y[1] - x[1])[0];
    if (bestForm !== form && n > (forms.get(form) || 0)) {
      const [w1, w2] = bestForm.split(" ");
      parts[i] = w1;
      parts[j] = w2;
    }
  }
  return parts.join("");
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
// OCR hay làm mất 1 dấu "/": "2710/2008", "27/102008", "27102008"
const DATE_RE_THIEU = [
  /(?<!\d)(\d{2})(\d{2})\s*[/\-.]\s*(\d{4})(?!\d)/,
  /(?<!\d)(\d{2})\s*[/\-.]\s*(\d{2})(\d{4})(?!\d)/,
  /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/,
];
function dateIn(s) {
  const str = String(s || "");
  for (const re of [DATE_RE, ...DATE_RE_THIEU]) {
    const m = str.match(re);
    const d = m && toIso(m[1], m[2], m[3]);
    if (d) return d;
  }
  return null;
}

/**
 * Số CCCD 12 số: chữ số thứ 4 = giới tính + thế kỷ sinh, chữ số 5-6 = 2 số cuối năm sinh
 * (0/1: 1900-1999 nam/nữ, 2/3: 2000-2099, 4/5: 2100…, 6/7: 2200…, 8/9: 2300…)
 */
function thongTinTuCccd(cccd) {
  const s = String(cccd || "");
  if (!/^\d{12}$/.test(s)) return null;
  const ma = Number(s[3]);
  return { gioi_tinh: ma % 2 === 0 ? "Nam" : "Nữ", nam_sinh: 1900 + Math.floor(ma / 2) * 100 + Number(s.slice(4, 6)) };
}

/** Mọi ngày trong văn bản trừ dòng ngày cấp / hết hạn / cập nhật */
function cacNgaySinh(text) {
  return nfc(text)
    .split(/\r?\n/)
    .filter((l) => !/(cấp|issue|hết hạn|expiry|giá trị|cập nhật|\d{1,2}:\d{2})/i.test(l))
    .map(dateIn)
    .filter(Boolean);
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
  // bỏ ký tự rác đầu dòng (vd ". Bản Cọ")
  first = first.replace(/^[^\p{L}\p{N}]+/u, "").trim();
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
    // nhãn hay bị đọc sai ("ii tính / Sex") -> chỉ cần "tính" hoặc "Sex" đứng ngay trước Nam/Nữ
    if (!out.gioi_tinh && /(tính|sex)/i.test(l)) {
      const m = (l + " " + (lines[i + 1] || "")).match(/(?:tính|sex)\s*[/:.]?\s*(?:sex\s*[:.]?\s*)?(nam|nữ|nu)(?![\p{L}])/iu);
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
  // ngày sinh dự phòng: ngày đầu tiên không nằm trên dòng ngày cấp / hết hạn / cập nhật
  if (!out.ngay_sinh) {
    for (const l of lines) {
      if (/(cấp|issue|hết hạn|expiry|giá trị|cập nhật|\d{1,2}:\d{2})/i.test(l)) continue;
      const d = dateIn(l);
      if (d) {
        out.ngay_sinh = d;
        break;
      }
    }
  }
  // Số CCCD quyết định giới tính và năm sinh (chính xác hơn chữ đọc được)
  const tt = thongTinTuCccd(out.cccd);
  if (tt) {
    out.gioi_tinh = tt.gioi_tinh;
    if (out.ngay_sinh && Number(out.ngay_sinh.slice(0, 4)) !== tt.nam_sinh) delete out.ngay_sinh;
  }
  if (out.ngay_sinh && out.ngay_sinh === out.ngay_cap_cccd) delete out.ngay_sinh;
  // tên: bỏ chữ rác cuối do đường kẻ dọc bị đọc thành "I", "II", "l"...
  if (out.ho_ten) out.ho_ten = out.ho_ten.replace(/(\s+[IiLl|1]{1,3})+$/u, "").trim();
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

  // 2) OCR từng ảnh: chạy mọi kiểu xử lý ảnh (song song), mỗi trường lấy giá trị đa số
  const merged = {};
  const ngaySinhCacLan = []; // mọi ngày đọc được (không phải ngày cấp) ở mọi lần OCR -> chọn ngày khớp năm sinh
  const texts = [];
  let conf = 0;
  for (const f of files) {
    const thu = (bienThe, goc) => async (worker) => {
      const img = await chuanHoaAnh(f.buffer, bienThe, goc);
      // kiểu đầu tiên: lấy thêm vị trí các dòng để cắt riêng dòng họ tên
      const { data } = await worker.recognize(img, {}, bienThe === 0 ? { blocks: true } : {});
      const text = data.text || "";
      const parsed = parseCccdText(text);
      const tenDong = bienThe === 0 ? await docDongTen(img, data, f.buffer).catch(() => []) : [];
      return { parsed, text, conf: data.confidence || 0, score: diem(parsed), tenDong };
    };
    let all = await chayPool(BIEN_THE.map((_, b) => thu(b, 0)));
    // không thấy số CCCD hoặc tên ở mọi kiểu -> có thể ảnh bị xoay ngang/ngược
    const thieuChinh = () => !all.some((r) => r.parsed.cccd) || !all.some((r) => r.parsed.ho_ten);
    for (const g of [90, 270, 180]) {
      if (!thieuChinh()) break;
      const r = await chayPool([thu(0, g), thu(1, g)]);
      // chỉ giữ góc xoay nếu đọc được nhiều hơn
      if (Math.max(...r.map((x) => x.score)) > Math.max(...all.map((x) => x.score))) all = r;
    }
    const allTexts = all.map((r) => r.text);
    for (const t of allTexts) ngaySinhCacLan.push(...cacNgaySinh(t));
    const data = bauChon(all.map((r) => r.parsed));
    for (const k of ["dia_chi", "noi_o_hien_tai"]) if (data[k]) data[k] = suaDiaChi(suaDauTheoNguCanh(data[k], allTexts));
    // Họ tên: gộp mọi lần đọc (cả ảnh + dòng tên cắt riêng) và đối chiếu bảng âm tiết tên thật
    const docTen = [
      ...all.filter((r) => r.parsed.ho_ten).map((r) => ({ text: r.parsed.ho_ten, w: 1 })),
      ...all.flatMap((r) => r.tenDong || []).map((t) => ({ text: t, w: 2 })),
    ];
    if (docTen.length) {
      const tot = chonHoTen(docTen, await amTietTen());
      if (tot) data.ho_ten = tot;
    }
    if (data.ho_ten) data.ho_ten = suaHo(data.ho_ten, await amTietTen());
    // ảnh trước bổ sung trường ảnh sau còn thiếu (mặt trước + mặt sau)
    for (const [k, v] of Object.entries(data)) if (!merged[k]) merged[k] = v;
    const best = all.reduce((a, b) => (b.score > a.score ? b : a));
    texts.push(best.text);
    conf += best.conf;
  }
  if (!merged.dia_chi && merged.noi_o_hien_tai) merged.dia_chi = merged.noi_o_hien_tai;
  // Số CCCD quyết định giới tính; ngày sinh phải khớp năm sinh mã hoá trong số CCCD
  const tt = thongTinTuCccd(merged.cccd);
  if (tt) {
    merged.gioi_tinh = tt.gioi_tinh;
    if (!merged.ngay_sinh || Number(merged.ngay_sinh.slice(0, 4)) !== tt.nam_sinh) {
      const hop = ngaySinhCacLan.filter((d) => Number(d.slice(0, 4)) === tt.nam_sinh);
      if (hop.length) merged.ngay_sinh = bauChon(hop.map((d) => ({ d }))).d;
      else delete merged.ngay_sinh;
    }
  }
  return { data: merged, nguon: "ocr", text: texts.join("\n"), do_tin_cay: Math.round(conf / files.length) };
}

module.exports = { docAnhCccd, parseCccdText, parseCccdQr, suaDiaChi, suaHo, amTietTen, chonHoTen };
