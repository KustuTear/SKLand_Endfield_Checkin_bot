import {
  createClient,
  STORAGE_CREDENTIAL_KEY,
  STORAGE_DID_KEY,
  STORAGE_OAUTH_TOKEN_KEY
} from "skland-kit";
import { createHash, createHmac } from "node:crypto";

const DEFAULT_APP_CODE = "4ca99fa6b56cc2ba";
const DID_KV_KEY = "meta:skland_did";
const BINDING_ENDPOINT = "https://zonai.skland.com/api/v1/game/player/binding";
const ARKNIGHTS_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/api/v1/game/attendance";
const ENDFIELD_ATTENDANCE_ENDPOINT = "https://zonai.skland.com/web/v1/game/endfield/attendance";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 12; SM-A5560 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36; SKLand/1.52.1";

function normalizeDid(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.startsWith("B") ? value : `B${value}`;
}

function md5Hex(input) {
  return createHash("md5").update(input).digest("hex");
}

function extractErrorDetail(error) {
  const baseMessage = String(error?.message || "请求异常").trim();
  const cause = error?.cause;
  const causeCode = cause?.code ?? cause?.status;
  const causeMessage = cause?.message || cause?.msg || cause?.error;

  if (causeMessage && causeCode !== undefined && causeCode !== null) {
    return `${causeMessage} (code=${causeCode})`;
  }
  if (causeMessage) {
    return String(causeMessage);
  }
  if (causeCode !== undefined && causeCode !== null) {
    return `${baseMessage} (code=${causeCode})`;
  }
  return baseMessage;
}

async function hmacSha256Hex(key, data) {
  return createHmac("sha256", key).update(data).digest("hex");
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

async function requestJson(method, url, headers, body, fallbackMessage) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  const code = data?.code ?? data?.status;
  const ok = response.ok && (code === undefined || code === 0);
  if (!ok) {
    const message = data?.message || data?.msg || data?.error || fallbackMessage;
    const error = new Error(code !== undefined ? `${message} (code=${code})` : message);
    error.code = code;
    error.cause = data;
    throw error;
  }

  return data;
}

async function getSession(client) {
  const token = await client.storage.getItem(STORAGE_OAUTH_TOKEN_KEY);
  const cred = await client.storage.getItem(STORAGE_CREDENTIAL_KEY);
  const dId = normalizeDid(await client.storage.getItem(STORAGE_DID_KEY));
  if (!token || !cred || !dId) {
    throw new Error("会话缺失：未获取到 token/cred/dId");
  }
  return { token: String(token), cred: String(cred), dId };
}

async function buildSignedHeaders(url, method, bodyOrQuery, session) {
  const parsed = new URL(url);
  const signInput = method === "GET" ? parsed.search.slice(1) : (bodyOrQuery || "");
  const headerCa = {
    platform: "3",
    timestamp: String(Math.floor(Date.now() / 1000)),
    dId: session.dId,
    vName: "1.0.0"
  };
  const source = `${parsed.pathname}${signInput}${headerCa.timestamp}${JSON.stringify(headerCa)}`;
  const hmacHex = await hmacSha256Hex(session.token, source);
  const sign = md5Hex(hmacHex);

  return getBaseHeaders(session.dId, {
    cred: session.cred,
    sign,
    platform: headerCa.platform,
    timestamp: headerCa.timestamp,
    vName: headerCa.vName
  });
}

async function getBindingViaSignedRequest(client, env) {
  const session = await getSession(client);
  const url = env?.SKLAND_BINDING_ENDPOINT || BINDING_ENDPOINT;
  const headers = await buildSignedHeaders(url, "GET", "", session);
  return requestJson("GET", url, headers, undefined, "获取绑定列表失败");
}

function isAlreadySignedMessage(message) {
  const text = String(message || "").toLowerCase();
  return ["已签到", "请勿重复", "重复", "already", "签到过", "今日已"].some((keyword) => text.includes(keyword.toLowerCase()));
}

function getTodayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isTodayAttended(status) {
  if (typeof status?.hasToday === "boolean") {
    return status.hasToday;
  }

  if (Array.isArray(status?.records)) {
    const today = getTodayInShanghai();
    return status.records.some((item) => {
      const ts = Number(item?.ts);
      if (!Number.isFinite(ts) || ts <= 0) return false;
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(ts * 1000));
      return date === today;
    });
  }

  return false;
}

function parseArknightsRewards(data) {
  const awards = data?.awards;
  if (!Array.isArray(awards)) return [];
  return awards.map((item) => `${item?.resource?.name || "未知奖励"}x${Number(item?.count) || 1}`);
}

function parseEndfieldRewards(data) {
  const awardIds = Array.isArray(data?.awardIds) ? data.awardIds : [];
  const resourceInfoMap = data?.resourceInfoMap || {};
  return awardIds.map((item) => {
    const id = item?.id;
    const info = resourceInfoMap[id] || {};
    return `${info?.name || id || "未知奖励"}x${Number(info?.count) || 1}`;
  });
}

function normalizeBindings(bindingResponse) {
  const list = bindingResponse?.data?.list || bindingResponse?.list;
  if (!Array.isArray(list)) return [];

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
        gameId: Number(binding?.gameId) || (group.appCode === "endfield" ? 3 : 1),
        roles: Array.isArray(binding?.roles) ? binding.roles : []
      });
    }
  }

  return bindings;
}

function buildResult({ status, game, nickname, channel, awards = [], error = "" }) {
  return { status, game, nickname, channel, awards, error };
}

async function hydrateDid(client, env) {
  const configuredDid = normalizeDid(env?.SKLAND_DID);
  if (configuredDid) {
    await client.storage.setItem(STORAGE_DID_KEY, configuredDid);
    return configuredDid;
  }

  if (!env?.SKLAND_STORAGE) {
    return "";
  }

  const storedDid = normalizeDid(await env.SKLAND_STORAGE.get(DID_KV_KEY));
  if (storedDid) {
    await client.storage.setItem(STORAGE_DID_KEY, storedDid);
  }
  return storedDid;
}

async function persistDid(client, env) {
  if (!env?.SKLAND_STORAGE) return;
  const did = normalizeDid(await client.storage.getItem(STORAGE_DID_KEY));
  if (!did) return;
  await env.SKLAND_STORAGE.put(DID_KV_KEY, did);
}

async function createSignedInClient(bindToken, env) {
  const client = createClient();
  await hydrateDid(client, env);

  const appCode = env?.SKLAND_APP_CODE || DEFAULT_APP_CODE;
  const grantData = await client.collections.hypergryph.grantAuthorizeCode(bindToken, { appCode, type: 0 });
  const code = grantData?.code;
  if (!code) {
    throw new Error("获取授权码失败：未返回 code");
  }

  await client.signIn(code);
  await persistDid(client, env);
  return client;
}

async function getBindingsByToken(bindToken, env) {
  const client = await createSignedInClient(bindToken, env);
  const data = await getBindingViaSignedRequest(client, env);
  const bindings = normalizeBindings(data);
  if (bindings.length === 0) {
    throw new Error("未找到可签到的游戏绑定");
  }
  return { client, bindings };
}

async function signArknights(client, binding, env) {
  const session = await getSession(client);
  const url = env?.SKLAND_ARKNIGHTS_ATTENDANCE_ENDPOINT || ARKNIGHTS_ATTENDANCE_ENDPOINT;
  const payload = { uid: binding.uid, gameId: binding.gameId };
  const bodyText = JSON.stringify(payload);
  const headers = await buildSignedHeaders(url, "POST", bodyText, session);
  headers["Content-Type"] = "application/json";

  try {
    const data = await requestJson("POST", url, headers, payload, "明日方舟签到失败");
    return buildResult({
      status: "success",
      game: "明日方舟",
      nickname: binding.nickname,
      channel: binding.channelName,
      awards: parseArknightsRewards(data)
    });
  } catch (error) {
    const message = extractErrorDetail(error);
    if (isAlreadySignedMessage(message)) {
      return buildResult({
        status: "already",
        game: "明日方舟",
        nickname: binding.nickname,
        channel: binding.channelName,
        error: message
      });
    }

    return buildResult({
      status: "failed",
      game: "明日方舟",
      nickname: binding.nickname,
      channel: binding.channelName,
      error: message
    });
  }
}

async function signEndfield(client, binding) {
  const session = await getSession(client);
  const url = ENDFIELD_ATTENDANCE_ENDPOINT;
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

    const headers = await buildSignedHeaders(url, "POST", "", session);
    headers["Content-Type"] = "application/json";
    headers["sk-game-role"] = `3_${roleId}_${serverId}`;
    headers.referer = "https://game.skland.com/";
    headers.origin = "https://game.skland.com/";

    try {
      const data = await requestJson("POST", url, headers, undefined, "终末地签到失败");
      results.push(buildResult({
        status: "success",
        game: "终末地",
        nickname: roleNickname,
        channel: binding.channelName,
        awards: parseEndfieldRewards(data)
      }));
    } catch (error) {
      const message = extractErrorDetail(error);
      if (isAlreadySignedMessage(message)) {
        results.push(buildResult({
          status: "already",
          game: "终末地",
          nickname: roleNickname,
          channel: binding.channelName,
          error: message
        }));
      } else {
        results.push(buildResult({
          status: "failed",
          game: "终末地",
          nickname: roleNickname,
          channel: binding.channelName,
          error: message
        }));
      }
    }
  }

  return results;
}

export async function validateToken(bindToken, env) {
  try {
    const { bindings } = await getBindingsByToken(bindToken, env);
    return {
      summary: {
        arknights: bindings.filter((item) => item.appCode === "arknights").length,
        endfield: bindings
          .filter((item) => item.appCode === "endfield")
          .reduce((count, item) => count + Math.max(item.roles.length, 1), 0)
      }
    };
  } catch (error) {
    throw new Error(extractErrorDetail(error));
  }
}

export async function runSignInForToken(bindToken, env) {
  try {
    const { client, bindings } = await getBindingsByToken(bindToken, env);
    const results = [];

    for (const binding of bindings) {
      if (binding.appCode === "arknights") {
        results.push(await signArknights(client, binding, env));
      } else if (binding.appCode === "endfield") {
        results.push(...await signEndfield(client, binding, env));
      }
    }

    return results;
  } catch (error) {
    throw new Error(extractErrorDetail(error));
  }
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
  return (
    text.includes("token")
    || text.includes("cred")
    || text.includes("用户未登录")
    || text.includes("授权")
    || text.includes("登录")
    || text.includes("code=401")
  );
}
