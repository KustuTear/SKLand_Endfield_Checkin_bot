const DEFAULT_SEND_CODE_ENDPOINT = "https://as.hypergryph.com/user/auth/v1/send_phone_code";
const DEFAULT_TOKEN_BY_PHONE_CODE_ENDPOINT = "https://as.hypergryph.com/user/auth/v1/token_by_phone_code";
const DEFAULT_GENERATE_CRED_ENDPOINT = "https://zonai.skland.com/api/v1/user/auth/generate_cred_by_code";
const DEFAULT_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/api/v1/game/attendance";
const DEFAULT_REFRESH_ENDPOINT = "https://zonai.skland.com/api/v1/auth/refresh";

function randomDid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildBaseHeaders(extra = {}) {
  const headers = {
    "content-type": "application/json",
    platform: "1",
    v: "1.0.0",
    d_id: randomDid(),
    ...extra
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      delete headers[key];
    }
  }

  return headers;
}

function getErrorMessage(body, fallback) {
  if (!body || typeof body !== "object") {
    return fallback;
  }
  return body.message || body.msg || body.error || fallback;
}

function isSuccess(body, response) {
  if (body && typeof body === "object") {
    if (typeof body.code === "number") {
      return body.code === 0;
    }
    if (typeof body.status === "number") {
      return body.status === 0;
    }
    if (typeof body.success === "boolean") {
      return body.success;
    }
  }
  return response.ok;
}

async function readJson(response, fallbackError) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackError);
  }
}

async function postJson(url, payload, headers, fallbackError) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const body = await readJson(response, fallbackError);

  if (!isSuccess(body, response)) {
    const error = new Error(getErrorMessage(body, fallbackError));
    error.code = body?.code ?? body?.status ?? response.status;
    throw error;
  }

  return body;
}

async function getJson(url, headers, fallbackError) {
  const response = await fetch(url, { method: "GET", headers });
  const body = await readJson(response, fallbackError);

  if (!isSuccess(body, response)) {
    const error = new Error(getErrorMessage(body, fallbackError));
    error.code = body?.code ?? body?.status ?? response.status;
    throw error;
  }

  return body;
}

function pickGrantCode(body) {
  const data = body?.data || body;
  return data?.grant_code || data?.grantCode || data?.code || null;
}

function pickCredPayload(body) {
  const data = body?.data || body;
  return {
    cred: data?.cred || data?.token || null,
    token: data?.token || data?.access_token || null,
    uid: data?.uid || data?.game_uid || data?.user_uid || null
  };
}

export async function sendSmsCode(phone, env) {
  const endpoint = env.SKLAND_SEND_CODE_ENDPOINT || DEFAULT_SEND_CODE_ENDPOINT;
  const payload = {
    phone,
    ...(env.SKLAND_SMS_CHANNEL ? { channel: env.SKLAND_SMS_CHANNEL } : {})
  };

  return postJson(
    endpoint,
    payload,
    buildBaseHeaders(),
    "发送验证码失败，请稍后重试"
  );
}

export async function exchangePhoneCodeForGrant(phone, code, env) {
  const endpoint = env.SKLAND_TOKEN_BY_PHONE_CODE_ENDPOINT || DEFAULT_TOKEN_BY_PHONE_CODE_ENDPOINT;
  const body = await postJson(
    endpoint,
    {
      phone,
      code,
      phone_code: code
    },
    buildBaseHeaders(),
    "验证码校验失败"
  );

  const grantCode = pickGrantCode(body);
  if (!grantCode) {
    throw new Error("未获取到 grant_code");
  }
  return grantCode;
}

export async function generateCredByCode(grantCode, env) {
  const endpoint = env.SKLAND_GENERATE_CRED_ENDPOINT || DEFAULT_GENERATE_CRED_ENDPOINT;
  const body = await postJson(
    endpoint,
    {
      kind: 1,
      code: grantCode
    },
    buildBaseHeaders(),
    "登录换取凭证失败"
  );

  const result = pickCredPayload(body);
  if (!result.cred) {
    throw new Error("未获取到 cred");
  }
  return result;
}

export async function validateSklandToken(cred, env) {
  const endpoint = env.SKLAND_REFRESH_ENDPOINT || DEFAULT_REFRESH_ENDPOINT;
  const body = await getJson(
    endpoint,
    buildBaseHeaders({ cred }),
    "Token 校验失败"
  );

  const data = body?.data || {};
  return {
    token: data.token || data.access_token || null,
    uid: data.uid || data.game_uid || data.user_uid || null
  };
}

export async function performAttendance(user, env) {
  const endpoint = env.SKLAND_ATTENDANCE_ENDPOINT || DEFAULT_ATTENDANCE_ENDPOINT;
  const payload = {
    uid: user.uid,
    game_uid: user.uid,
    game_id: env.SKLAND_GAME_ID || "endfield"
  };

  return postJson(
    endpoint,
    payload,
    buildBaseHeaders({
      cred: user.cred,
      authorization: user.token ? `Bearer ${user.token}` : undefined
    }),
    "签到失败"
  );
}

export function isAuthFailure(error) {
  const text = (error?.message || "").toLowerCase();
  return text.includes("cred") || text.includes("token") || text.includes("auth") || error?.code === 401;
}
