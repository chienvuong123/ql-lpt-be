const axios = require("axios");
const crypto = require("crypto");

const LOTUS_BASE = "https://staging-api.lotuslms.com";
const DOMAIN = "lapphuongthanh";
const PASS = "lpt12345";
const ORG_ID = "22197961";

const TEACHER_ACCOUNTS = ["gv03", "gv04", "gv05"];

function randomTeacherAccount() {
  return TEACHER_ACCOUNTS[Math.floor(Math.random() * TEACHER_ACCOUNTS.length)];
}

let tokenCache = {
  token: null,
  iid: null,
  id: null,
  expiredAt: null,
};

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 phút

function isTokenValid() {
  return (
    tokenCache.token &&
    tokenCache.expiredAt &&
    Date.now() < tokenCache.expiredAt
  );
}

function generateSandTokens(iid = 0) {
  const iidNum = parseInt(iid, 10) || 0;
  const sessionId = crypto.randomUUID();

  // Sinh _sand_ri và _sand_rit
  const tStr = `${2 * iidNum + 2451} t i a v s t`;
  const n = crypto.createHash("md5").update(tStr).digest("hex");

  const randomPart = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const r = crypto.createHash("md5").update(randomPart + timestamp).digest("hex"); // _sand_ri

  const keyHex = crypto.createHash("sha256").update(n).digest("hex");
  const keyBytes = Buffer.from(keyHex, "hex");

  const ivBytes = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-cbc", keyBytes, ivBytes);
  let encrypted = cipher.update(r, "utf8", "base64");
  encrypted += cipher.final("base64");

  const requestToken = ivBytes.toString("hex") + ":" + encrypted; // _sand_rit

  return {
    sand_ri: r,
    sand_rit: requestToken,
    sand_session_id: sessionId,
  };
}

async function login() {
  const username = randomTeacherAccount();
  const { sand_ri, sand_rit, sand_session_id } = generateSandTokens(0);

  const data = new URLSearchParams({
    lname: username,
    pass: PASS,
    _sand_domain: DOMAIN,
    _sand_web_url: `https://${DOMAIN}.huelms.com/admin/enrolment-plan`,
    _sand_session_id: sand_session_id,
    _sand_ri: sand_ri,
    _sand_rit: sand_rit,
  });

  const response = await axios.post(`${LOTUS_BASE}/user/login`, data);
  const result = response?.data?.result;

  if (!result?.token) {
    throw new Error("Đăng nhập thất bại, không có token");
  }

  // Lưu vào cache
  tokenCache = {
    token: result.token,
    iid: result.iid,
    id: result.id,
    sessionId: sand_session_id,
    expiredAt: Date.now() + TOKEN_TTL_MS,
  };

  console.log(`[LotusAuth] Đăng nhập thành công: ${username}`);
  return tokenCache;
}

// Lấy token, tự login nếu chưa có hoặc hết hạn
async function getToken() {
  if (isTokenValid()) return tokenCache;
  return await login();
}

// Xóa cache (gọi khi nhận token_invalid)
function invalidateToken() {
  tokenCache = { token: null, iid: null, id: null, expiredAt: null };
}

module.exports = { getToken, invalidateToken, login, generateSandTokens };
