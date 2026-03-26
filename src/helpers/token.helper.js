export async function getCachedToken() {
  if (_tokenPromise && Date.now() > _tokenExpiresAt - 30_000) {
    _tokenPromise = null;
  }
  if (!_tokenPromise) {
    _tokenPromise = getHanhTrinhToken()
      .then((result) => {
        const ttl = (result.expires_in || 600) * 1000;
        _tokenExpiresAt = Date.now() + ttl;
        return result;
      })
      .catch((err) => {
        _tokenPromise = null;
        _tokenExpiresAt = 0;
        throw err;
      });
  }
  return _tokenPromise;
}

export async function withRetry(fn, retries = 3, baseDelayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isCanceled =
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.message === "canceled";
      if (isCanceled) throw err;

      const isRetryable =
        !err?.response?.status ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.response?.status === 429 ||
        err.response?.status >= 500;

      if (!isRetryable || attempt === retries) throw err;
      if (err?.response?.status === 401) throw err;

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      console.warn(
        `[withRetry] attempt ${attempt + 1}/${retries} failed (${err.message}), retry in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
