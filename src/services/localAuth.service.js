const axios = require("axios");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 10000;

let hanhTrinhTokenCache = {
  token: null,
  expiredAt: null,
};

function isHanhTrinhTokenValid() {
  return (
    hanhTrinhTokenCache.token &&
    hanhTrinhTokenCache.expiredAt &&
    Date.now() < hanhTrinhTokenCache.expiredAt
  );
}

function buildTokenPayload() {
  if (!isHanhTrinhTokenValid()) return null;

  return {
    token: hanhTrinhTokenCache.token,
    expires_in: Math.max(
      1,
      Math.floor((hanhTrinhTokenCache.expiredAt - Date.now()) / 1000),
    ),
    expiredAt: hanhTrinhTokenCache.expiredAt,
  };
}

async function loginHanhTrinh() {
  let response;

  try {
    response = await axios.post(
      `${HANH_TRINH_BASE}/api/Login`,
      {
        username: "chienvx",
        password: "@chienvx",
      },
      { timeout: LOGIN_TIMEOUT_MS },
    );
  } catch (error) {
    const status = error?.response?.status;
    const apiMessage =
      error?.response?.data?.message ||
      error?.response?.data?.Message ||
      error?.response?.data?.error;

    if ([400, 401, 403].includes(status)) {
      throw new Error(
        `Dang nhap HanhTrinh that bai${apiMessage ? `: ${apiMessage}` : ""}`,
      );
    }

    throw new Error(
      `Khong the dang nhap HanhTrinh${error.message ? `: ${error.message}` : ""}`,
    );
  }

  const token =
    response.data?.token || response.data?.Token || response.data?.access_token;

  if (!token) {
    throw new Error("Dang nhap HanhTrinh that bai, khong co token");
  }

  hanhTrinhTokenCache = {
    token,
    expiredAt: Date.now() + TOKEN_TTL_MS,
  };

  console.log("[HanhTrinhAuth] Dang nhap thanh cong");
  return buildTokenPayload();
}

async function getHanhTrinhToken() {
  const cachedToken = buildTokenPayload();
  if (cachedToken) return cachedToken;
  return loginHanhTrinh();
}

async function getHanhTrinhToken2() {
  return getHanhTrinhToken();
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
