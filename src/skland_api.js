const OAUTH_GRANT_ENDPOINT = "https://as.hypergryph.com/user/oauth2/v2/grant";
const GENERATE_CRED_ENDPOINT = "https://zonai.skland.com/web/v1/user/auth/generate_cred_by_code";
const BINDING_ENDPOINT = "https://zonai.skland.com/api/v1/game/player/binding";
const ARKNIGHTS_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/api/v1/game/attendance";
const ENDFIELD_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/web/v1/game/endfield/attendance";
const DEFAULT_APP_CODE = "4ca99fa6b56cc2ba";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 12; SM-A5560 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36; SKLand/1.52.1";
const DID_KV_KEY = "meta:skland_did";

const encoder = new TextEncoder();
let cachedDid = "";

function randomHex(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

function normalizeDid(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.startsWith("B") ? value : `B${value}`;
}

async function resolveDid(env) {
  const configured = normalizeDid(env.SKLAND_DID);
  if (configured) {
    cachedDid = configured;
    return configured;
  }

  if (cachedDid) {
    return cachedDid;
  }

  if (env?.SKLAND_STORAGE) {
    try {
      const stored = normalizeDid(await env.SKLAND_STORAGE.get(DID_KV_KEY));
      if (stored) {
        cachedDid = stored;
        return stored;
      }
    } catch {
      // ignore kv read error and fallback to generated did
    }
  }

  const generated = `B${randomHex(32)}`;
  cachedDid = generated;

  if (env?.SKLAND_STORAGE) {
    try {
      await env.SKLAND_STORAGE.put(DID_KV_KEY, generated);
    } catch {
      // ignore kv write error and keep runtime cache
    }
  }

  return generated;
}

function getBaseHeaders(dId, extra = {}) {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept-Encoding": "gzip",
    Connection: "close",
    "X-Requested-With": "com.hypergryph.skland",
    dId,
    ...extra
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null || value === "") {
      delete headers[key];
    }
  }

  return headers;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function md5Hex(input) {
  function cmn(q, a, b, x, s, t) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

  function md5Cycle(state, block) {
    let [a, b, c, d] = state;

    a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586); c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426); c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417); c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101); c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);

    a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632); c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083); c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690); c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784); c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);

    a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463); c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353); c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222); c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835); c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);

    a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415); c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606); c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744); c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379); c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);

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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseResponseError(body, fallback) {
  const message = body?.message || body?.msg || body?.error || "";
  const code = body?.code ?? body?.status;
  if (message && code !== undefined && code !== null) {
    return `${message} (code=${code})`;
  }
  if (message) return message;
  if (code !== undefined && code !== null) return `${fallback} (code=${code})`;
  return fallback;
}

async function readJsonStrict(response, fallbackError) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackError);
  }
}

function isApiSuccess(body, response) {
  if (body && typeof body === "object") {
    if (typeof body.code === "number") {
      return body.code === 0;
    }
    if (typeof body.status === "number") {
      return body.status === 0;
    }
  }
  return response.ok;
}

async function requestJson(method, url, headers, jsonData, fallbackError, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: jsonData === undefined ? undefined : JSON.stringify(jsonData)
      });
      const body = await readJsonStrict(response, fallbackError);

      if (!isApiSuccess(body, response)) {
        const error = new Error(parseResponseError(body, fallbackError));
        error.code = body?.code ?? body?.status ?? response.status;
        throw error;
      }

      return body;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(300);
      }
    }
  }

  throw lastError || new Error(fallbackError);
}

function buildHeaderCa(dId) {
  return {
    platform: "3",
    timestamp: String(Math.floor(Date.now() / 1000)),
    dId,
    vName: "1.0.0"
  };
}

async function generateSignature(token, path, bodyOrQuery, headerCa) {
  const signSource = `${path}${bodyOrQuery}${headerCa.timestamp}${JSON.stringify(headerCa)}`;

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const hmacBuffer = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(signSource));
  return md5Hex(bytesToHex(new Uint8Array(hmacBuffer)));
}

async function buildSignedHeaders(url, method, bodyOrQuery, credential, dId) {
  const parsed = new URL(url);
  const signInput = method === "GET" ? parsed.search.slice(1) : (bodyOrQuery || "");
  const headerCa = buildHeaderCa(dId);
  const sign = await generateSignature(credential.token, parsed.pathname, signInput, headerCa);

  return {
    ...getBaseHeaders(dId, {
      cred: credential.cred,
      sign,
      platform: headerCa.platform,
      timestamp: headerCa.timestamp,
      vName: headerCa.vName
    }),
    dId
  };
}

function normalizeBindings(body) {
  const list = body?.data?.list;
  if (!Array.isArray(list)) {
    return [];
  }

  const bindings = [];
  for (const group of list) {
    if (!["arknights", "endfield"].includes(group?.appCode)) {
      continue;
    }

    for (const binding of group?.bindingList || []) {
      bindings.push({
        appCode: group.appCode,
        gameName: binding?.gameName || (group.appCode === "arknights" ? "明日方舟" : "终末地"),
        nickname: binding?.nickName || "未知角色",
        channelName: binding?.channelName || "未知渠道",
        uid: String(binding?.uid || ""),
        gameId: Number(binding?.gameId) || 1,
        roles: Array.isArray(binding?.roles) ? binding.roles : []
      });
    }
  }

  return bindings;
}

function parseArknightsRewards(body) {
  const awards = body?.data?.awards;
  if (!Array.isArray(awards)) {
    return [];
  }
  return awards.map((item) => `${item?.resource?.name || "未知奖励"}x${Number(item?.count) || 1}`);
}

function parseEndfieldRewards(body) {
  const data = body?.data || {};
  const resourceMap = data.resourceInfoMap || {};
  const rewards = [];

  for (const item of data.awardIds || []) {
    const rewardId = typeof item === "string" ? item : item?.id;
    const info = resourceMap[rewardId] || {};
    rewards.push(`${info.name || rewardId || "未知奖励"}x${Number(info.count) || Number(item?.count) || 1}`);
  }

  return rewards;
}

function isAlreadySignedMessage(message) {
  const text = String(message || "").toLowerCase();
  return ["已签到", "请勿重复", "重复", "already", "签到过", "今日已"].some((keyword) => text.includes(keyword.toLowerCase()));
}

function buildResult({ status, game, nickname, channel, awards = [], error = "" }) {
  return { status, game, nickname, channel, awards, error };
}

export async function exchangeUserTokenForCredential(userToken, env) {
  const dId = await resolveDid(env);

  const grantBody = await requestJson(
    "POST",
    env.SKLAND_OAUTH_GRANT_ENDPOINT || OAUTH_GRANT_ENDPOINT,
    getBaseHeaders(dId, { "Content-Type": "application/json" }),
    {
      appCode: env.SKLAND_APP_CODE || DEFAULT_APP_CODE,
      token: userToken,
      type: 0
    },
    "获取授权码失败"
  );

  const code = grantBody?.data?.code;
  if (!code) {
    throw new Error("获取授权码失败：未返回 code");
  }

  const credBody = await requestJson(
    "POST",
    env.SKLAND_GENERATE_CRED_ENDPOINT || GENERATE_CRED_ENDPOINT,
    getBaseHeaders(dId, { "Content-Type": "application/json" }),
    { code, kind: 1 },
    "换取凭证失败"
  );

  const data = credBody?.data || {};
  if (!data.token || !data.cred) {
    throw new Error("换取凭证失败：返回缺少 token/cred");
  }

  return {
    token: data.token,
    cred: data.cred,
    dId
  };
}

export async function getBindingList(credential, env) {
  const dId = credential.dId || await resolveDid(env);
  const url = env.SKLAND_BINDING_ENDPOINT || BINDING_ENDPOINT;
  const headers = await buildSignedHeaders(url, "GET", "", credential, dId);
  const body = await requestJson("GET", url, headers, undefined, "获取绑定列表失败");
  const bindings = normalizeBindings(body);

  if (bindings.length === 0) {
    throw new Error("未找到可签到的游戏绑定");
  }

  return bindings;
}

async function signArknights(credential, binding, env) {
  const dId = credential.dId || await resolveDid(env);
  const url = env.SKLAND_ARKNIGHTS_ATTENDANCE_ENDPOINT || ARKNIGHTS_ATTENDANCE_ENDPOINT;
  const payload = { gameId: binding.gameId, uid: binding.uid };
  const bodyText = JSON.stringify(payload);
  const headers = await buildSignedHeaders(url, "POST", bodyText, credential, dId);
  headers["Content-Type"] = "application/json";

  try {
    const body = await requestJson("POST", url, headers, payload, "明日方舟签到失败");
    return buildResult({
      status: "success",
      game: "明日方舟",
      nickname: binding.nickname,
      channel: binding.channelName,
      awards: parseArknightsRewards(body)
    });
  } catch (error) {
    if (isAlreadySignedMessage(error.message)) {
      return buildResult({
        status: "already",
        game: "明日方舟",
        nickname: binding.nickname,
        channel: binding.channelName,
        error: error.message
      });
    }
    return buildResult({
      status: "failed",
      game: "明日方舟",
      nickname: binding.nickname,
      channel: binding.channelName,
      error: error.message || "明日方舟签到失败"
    });
  }
}

async function signEndfield(credential, binding, env) {
  const dId = credential.dId || await resolveDid(env);
  const url = env.SKLAND_ENDFIELD_ATTENDANCE_ENDPOINT || ENDFIELD_ATTENDANCE_ENDPOINT;
  const roles = Array.isArray(binding.roles) ? binding.roles : [];

  if (roles.length === 0) {
    return [buildResult({
      status: "failed",
      game: "终末地",
      nickname: binding.nickname,
      channel: binding.channelName,
      error: "没有角色数据"
    })];
  }

  const results = [];
  for (const role of roles) {
    const roleId = String(role?.roleId || "");
    const serverId = String(role?.serverId || "");
    const roleNickname = role?.nickname || binding.nickname;

    if (!roleId || !serverId) {
      results.push(buildResult({
        status: "failed",
        game: "终末地",
        nickname: roleNickname,
        channel: binding.channelName,
        error: "角色数据不完整"
      }));
      continue;
    }

    const headers = await buildSignedHeaders(url, "POST", "", credential, dId);
    headers["Content-Type"] = "application/json";
    headers["sk-game-role"] = `3_${roleId}_${serverId}`;
    headers.referer = "https://game.skland.com/";
    headers.origin = "https://game.skland.com/";

    try {
      const body = await requestJson("POST", url, headers, undefined, "终末地签到失败");
      results.push(buildResult({
        status: "success",
        game: "终末地",
        nickname: roleNickname,
        channel: binding.channelName,
        awards: parseEndfieldRewards(body)
      }));
    } catch (error) {
      if (isAlreadySignedMessage(error.message)) {
        results.push(buildResult({
          status: "already",
          game: "终末地",
          nickname: roleNickname,
          channel: binding.channelName,
          error: error.message
        }));
      } else {
        results.push(buildResult({
          status: "failed",
          game: "终末地",
          nickname: roleNickname,
          channel: binding.channelName,
          error: error.message || "终末地签到失败"
        }));
      }
    }
  }

  return results;
}

export async function validateToken(bindToken, env) {
  const credential = await exchangeUserTokenForCredential(bindToken, env);
  const bindings = await getBindingList(credential, env);

  return {
    summary: {
      arknights: bindings.filter((item) => item.appCode === "arknights").length,
      endfield: bindings.filter((item) => item.appCode === "endfield").reduce((count, item) => count + Math.max(item.roles.length, 1), 0)
    }
  };
}

export async function runSignInForToken(bindToken, env) {
  const credential = await exchangeUserTokenForCredential(bindToken, env);
  const bindings = await getBindingList(credential, env);
  const results = [];

  for (const binding of bindings) {
    if (binding.appCode === "arknights") {
      results.push(await signArknights(credential, binding, env));
    } else if (binding.appCode === "endfield") {
      results.push(...await signEndfield(credential, binding, env));
    }
  }

  return results;
}

export function classifyResults(results) {
  const summary = { success: 0, already: 0, failed: 0 };

  for (const item of results) {
    if (item.status === "success") {
      summary.success += 1;
    } else if (item.status === "already") {
      summary.already += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export function isAuthFailure(error) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes("token") || text.includes("cred") || text.includes("用户未登录") || error?.code === 401;
}
