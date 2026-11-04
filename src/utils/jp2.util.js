const openjpeg = require("openjpeg");
const sharp = require("sharp");

// Ảnh chân dung trong file XML sát hạch là JPEG 2000 — trình duyệt (Chrome/Edge) không hiển thị được,
// còn sharp bản dựng sẵn không có codec jp2k, nên giải mã bằng openjpeg (JS) rồi nén lại JPEG.
// openjpeg trả dữ liệu dạng planar (RRR...GGG...BBB...), phải đổi sang interleaved cho sharp.
const jp2ToJpeg = async (jp2Buffer) => {
  const img = openjpeg(new Uint8Array(jp2Buffer), "jp2");
  const { width, height, data } = img || {};
  if (!width || !height || !data) throw new Error("Không giải mã được ảnh JPEG 2000");

  const n = width * height;
  const channels = Math.round(data.length / n);
  let raw;
  if (channels === 1) {
    raw = Buffer.from(data);
  } else {
    raw = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      raw[i * 3] = data[i];
      raw[i * 3 + 1] = data[n + i];
      raw[i * 3 + 2] = data[2 * n + i];
    }
  }

  return sharp(raw, { raw: { width, height, channels: channels === 1 ? 1 : 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
};

const isJp2 = (buf) =>
  buf && buf.length > 12 && buf.slice(4, 8).toString("ascii") === "jP  ";

module.exports = { jp2ToJpeg, isJp2 };
