const DEFAULT_SEND_CODE_ENDPOINT = "https://as.hypergryph.com/user/auth/v1/send_phone_code";
const DEFAULT_TOKEN_BY_PHONE_CODE_ENDPOINT = "https://as.hypergryph.com/user/auth/v1/token_by_phone_code";
const DEFAULT_GENERATE_CRED_ENDPOINT = "https://zonai.skland.com/api/v1/user/auth/generate_cred_by_code";
const DEFAULT_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/web/v1/game/endfield/attendance";
const DEFAULT_REFRESH_ENDPOINT = "https://zonai.skland.com/api/v1/auth/refresh";

const encoder = new TextEncoder();

const REWARD_NAME_MAP = {
  endfield_attendance_1: "中级作战记录",
  endfield_attendance_2: "初级认知载体",
  endfield_attendance_3: "高级作战记录",
  endfield_attendance_4: "武器检查装置",
  endfield_attendance_5: "武器检查套组",
  endfield_attendance_6: "协议棱柱",
  endfield_attendance_7: "折金券",
  endfield_attendance_8: "嵌晶玉"
};

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
    body: payload === undefined ? undefined : JSON.stringify(payload)
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

function parseRewardKey(rawId) {
  if (!rawId || typeof rawId !== "string") {
    return { key: "", countFromId: null };
  }
  const match = rawId.match(/^(endfield_attendance_\d+)(?:_(\d+))?$/);
  if (!match) {
    return { key: rawId, countFromId: null };
  }
  return {
    key: match[1],
    countFromId: match[2] ? Number(match[2]) : null
  };
}

function normalizeReward(rawId, fallbackCount) {
  const { key, countFromId } = parseRewardKey(rawId);
  return {
    id: key || rawId || "unknown_reward",
    name: REWARD_NAME_MAP[key] || key || rawId || "未知奖励",
    count: countFromId || Number(fallbackCount) || 1
  };
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function md5Hex(input) {
  function cmn(q, a, b, x, s, t) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function md5Cycle(state, k) {
    let [a, b, c, d] = state;

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    state[0] = (state[0] + a) | 0;
    state[1] = (state[1] + b) | 0;
    state[2] = (state[2] + c) | 0;
    state[3] = (state[3] + d) | 0;
  }

  function toWords(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 1) {
      out[i >> 2] = (out[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
    }
    return out;
  }

  const bytes = Array.from(encoder.encode(input));
  const words = toWords(bytes);
  const bitLen = bytes.length * 8;

  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (bitLen % 32));
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;

  const state = [1732584193, -271733879, -1732584194, 271733878];

  for (let i = 0; i < words.length; i += 16) {
    md5Cycle(state, words.slice(i, i + 16));
  }

  const out = new Uint8Array(16);
  for (let i = 0; i < 4; i += 1) {
    out[i * 4] = state[i] & 0xff;
    out[i * 4 + 1] = (state[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (state[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (state[i] >>> 24) & 0xff;
  }

  return bytesToHex(out);
}

async function getSignTokenFromCred(cred, env) {
  const endpoint = env.SKLAND_REFRESH_ENDPOINT || DEFAULT_REFRESH_ENDPOINT;
  const body = await getJson(
    endpoint,
    {
      cred,
      "user-agent": "Mozilla/5.0",
      accept: "application/json"
    },
    "刷新 token 失败"
  );

  const data = body?.data || {};
  const signToken = data.token || data.access_token;
  if (!signToken) {
    throw new Error("刷新 token 失败：未返回签名 token");
  }
  return signToken;
}

async function generateAttendanceSign(path, bodyText, timestamp, signToken, platform, vName, dId) {
  const headerJson = JSON.stringify({
    platform,
    timestamp,
    dId,
    vName
  });

  const toSign = `${path}${bodyText}${timestamp}${headerJson}`;
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signToken),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const hmacBuffer = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(toSign));
  const hmacHex = bytesToHex(new Uint8Array(hmacBuffer));
  return md5Hex(hmacHex);
}

export function extractAttendanceRewards(body) {
  const data = body?.data || {};
  const rewards = [];

  if (Array.isArray(data.awards)) {
    for (const item of data.awards) {
      const rawId = item?.resource?.id || item?.id || "";
      const count = item?.count || item?.resource?.count;
      rewards.push(normalizeReward(rawId, count));
    }
  }

  if (rewards.length === 0 && Array.isArray(data.awardIds)) {
    for (const rawId of data.awardIds) {
      rewards.push(normalizeReward(rawId, null));
    }
  }

  return rewards;
}

export function formatRewardLines(rewards) {
  if (!Array.isArray(rewards) || rewards.length === 0) {
    return "（未返回奖励明细）";
  }
  return rewards.map((reward) => `- ${reward.name} x ${reward.count}`).join("\n");
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
  if (!user?.uid) {
    throw new Error("缺少 uid，请使用 /bind <token> <uid> 重新绑定");
  }

  const endpoint = env.SKLAND_ATTENDANCE_ENDPOINT || DEFAULT_ATTENDANCE_ENDPOINT;
  const path = "/web/v1/game/endfield/attendance";
  const bodyText = "";
  const signToken = await getSignTokenFromCred(user.cred, env);

  const timestamp = String(Math.floor(Date.now() / 1000));
  const platform = "3";
  const vName = "1.0.0";
  const dId = "";
  const sign = await generateAttendanceSign(path, bodyText, timestamp, signToken, platform, vName, dId);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      cred: user.cred,
      sign,
      timestamp,
      platform,
      vName,
      dId,
      "sk-game-role": `3_${user.uid}_1`,
      "user-agent": "Mozilla/5.0",
      accept: "application/json",
      "content-type": "application/json;charset=utf-8"
    }
  });

  const body = await readJson(response, "签到失败");
  if (!isSuccess(body, response)) {
    const error = new Error(getErrorMessage(body, "签到失败"));
    error.code = body?.code ?? body?.status ?? response.status;
    throw error;
  }

  return body;
}

export function isAuthFailure(error) {
  const text = (error?.message || "").toLowerCase();
  return text.includes("cred") || text.includes("token") || text.includes("auth") || error?.code === 401;
}
