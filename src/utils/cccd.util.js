// Excel/Google Sheets thường tự nhận cột CCCD là số nên làm rụng mất các số 0 ở đầu
// (vd "030093016041" -> 30093016041). CCCD Việt Nam luôn đúng 12 số, nên nếu giá trị đọc
// được chỉ toàn chữ số và ngắn hơn 12 ký tự thì đệm lại số 0 ở đầu cho đủ 12 số.
const normalizeCccd = (value) => {
  let text = String(value || "").trim();
  if (text.startsWith("'")) text = text.substring(1).trim();
  if (/^\d+$/.test(text) && text.length > 0 && text.length < 12) {
    return text.padStart(12, "0");
  }
  return text;
};

module.exports = { normalizeCccd };
