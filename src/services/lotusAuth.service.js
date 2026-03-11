const axios = require("axios");

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

async function login() {
  const username = randomTeacherAccount();
  const sessionId = crypto.randomUUID();

  const data = new URLSearchParams({
    lname: username,
    pass: PASS,
    _sand_domain: DOMAIN,
    _sand_web_url: `https://${DOMAIN}.huelms.com/admin/enrolment-plan`,
    _sand_session_id: sessionId,
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
    sessionId,
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

module.exports = { getToken, invalidateToken, login };
