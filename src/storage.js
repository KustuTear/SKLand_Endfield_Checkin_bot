import { decryptJson, encryptJson } from "./crypto.js";

const USER_PREFIX = "user:";

function userKey(tgUserId) {
  return `${USER_PREFIX}${tgUserId}`;
}

function normalizeRecord(tgUserId, data = {}) {
  const bindings = Array.isArray(data.bindings)
    ? data.bindings
        .filter((item) => item && typeof item.token === "string" && item.token.trim())
        .map((item) => ({
          token: item.token.trim(),
          addedAt: item.addedAt || new Date().toISOString()
        }))
    : [];

  return {
    tgUserId: String(tgUserId),
    chatId: data.chatId ?? null,
    bindings,
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

export async function getUserRecord(env, tgUserId) {
  const encrypted = await env.SKLAND_STORAGE.get(userKey(tgUserId));
  if (!encrypted) {
    return null;
  }

  const data = await decryptJson(encrypted, env.ENCRYPTION_KEY);
  return normalizeRecord(tgUserId, data);
}

export async function putUserRecord(env, tgUserId, data) {
  const normalized = normalizeRecord(tgUserId, data);
  normalized.updatedAt = new Date().toISOString();
  const encrypted = await encryptJson(normalized, env.ENCRYPTION_KEY);
  await env.SKLAND_STORAGE.put(userKey(tgUserId), encrypted);
  return normalized;
}

export async function deleteUserRecord(env, tgUserId) {
  await env.SKLAND_STORAGE.delete(userKey(tgUserId));
}

export async function listAllUserKeys(kv) {
  const keys = [];
  let cursor;

  do {
    const page = await kv.list({ prefix: USER_PREFIX, cursor, limit: 1000 });
    for (const item of page.keys || []) {
      keys.push(item.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return keys;
}
