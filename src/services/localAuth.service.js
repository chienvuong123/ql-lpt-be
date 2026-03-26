const axios = require("axios");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";

let hanhTrinhTokenCache = {
  token: null,
  expiredAt: null,
};

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 phút

function isHanhTrinhTokenValid() {
  return (
    hanhTrinhTokenCache.token &&
    hanhTrinhTokenCache.expiredAt &&
    Date.now() < hanhTrinhTokenCache.expiredAt
  );
}

async function loginHanhTrinh() {
  const response = await axios.post(`${HANH_TRINH_BASE}/api/Login`, {
    username: "chienvx",
    password: "@chienvx",
  });

  // Điều chỉnh field sau khi xem log
  const token =
    response.data?.token || response.data?.Token || response.data?.access_token;

  if (!token) {
    throw new Error("Đăng nhập HanhTrinh thất bại, không có token");
  }

  hanhTrinhTokenCache = {
    token,
    expiredAt: Date.now() + TOKEN_TTL_MS,
  };

  console.log("[HanhTrinhAuth] Đăng nhập thành công");
  return hanhTrinhTokenCache;
}

async function getHanhTrinhToken() {
  if (isHanhTrinhTokenValid()) return;
  return await loginHanhTrinh();
}

async function getHanhTrinhToken2() {
  if (isHanhTrinhTokenValid()) return hanhTrinhTokenCache;
  return await loginHanhTrinh();
}

function invalidateHanhTrinhToken() {
  hanhTrinhTokenCache = { token: null, expiredAt: null };
}

module.exports = {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
  loginHanhTrinh,
  getHanhTrinhToken2,
};
