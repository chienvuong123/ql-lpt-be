const axios = require("axios");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 10000;

// Tài khoản hệ MỚI (tenant 31011) — các khóa K26B01x/K26C10x đều nằm ở tenant này
const NEW_USERNAME = process.env.HANH_TRINH_NEW_USERNAME || "dltx_lpt_31011";
const NEW_PASSWORD = process.env.HANH_TRINH_NEW_PASSWORD || "@tcdbvn";

let datNewTokenCache = {
  token: null,
  expiredAt: null,
};

function isDatNewTokenValid() {
  return (
    datNewTokenCache.token &&
    datNewTokenCache.expiredAt &&
    Date.now() < datNewTokenCache.expiredAt
  );
}

function buildTokenPayload() {
  if (!isDatNewTokenValid()) return null;

  return {
    token: datNewTokenCache.token,
    expires_in: Math.max(
      1,
      Math.floor((datNewTokenCache.expiredAt - Date.now()) / 1000)
    ),
    expiredAt: datNewTokenCache.expiredAt,
  };
}

async function loginDatNew() {
  let response;

  try {
    response = await axios.post(
      `${HANH_TRINH_BASE}/api/Login`,
      {
        Username: NEW_USERNAME,
        Password: NEW_PASSWORD,
      },
      { timeout: LOGIN_TIMEOUT_MS }
    );
  } catch (error) {
    const status = error?.response?.status;
    const apiMessage =
      error?.response?.data?.message ||
      error?.response?.data?.Message ||
      error?.response?.data?.error;

    if ([400, 401, 403].includes(status)) {
      throw new Error(
        `Dang nhap tai khoan moi that bai${apiMessage ? `: ${apiMessage}` : ""}`
      );
    }

    throw new Error(
      `Khong the dang nhap tai khoan moi${error.message ? `: ${error.message}` : ""}`
    );
  }

  const token =
    response.data?.token || response.data?.Token || response.data?.access_token;

  if (!token) {
    throw new Error("Dang nhap tai khoan moi that bai, khong co token");
  }

  datNewTokenCache = {
    token,
    expiredAt: Date.now() + TOKEN_TTL_MS,
  };

  console.log("[DatNewAuth] Dang nhap thanh cong");
  return buildTokenPayload();
}

async function getDatNewToken() {
  const cachedToken = buildTokenPayload();
  if (cachedToken) return cachedToken;
  return loginDatNew();
}

function invalidateDatNewToken() {
  datNewTokenCache = { token: null, expiredAt: null };
}

module.exports = {
  getDatNewToken,
  invalidateDatNewToken,
  loginDatNew,
};
