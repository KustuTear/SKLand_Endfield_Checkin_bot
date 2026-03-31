import { decryptJson } from "./crypto.js";
import { performAttendance, isAuthFailure } from "./skland_api.js";

async function tgApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || "Telegram API call failed");
  }

  return body.result;
}

async function notifyUser(env, tgUserId, text) {
  try {
    await tgApi(env, "sendMessage", {
      chat_id: Number(tgUserId),
      text
    });
  } catch {
    // Avoid throwing in scheduled task because notification is best effort.
  }
}

async function listAllUserKeys(kv) {
  const keys = [];
  let cursor;

  do {
    const page = await kv.list({ prefix: "user:", cursor, limit: 1000 });
    for (const item of page.keys || []) {
      keys.push(item.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return keys;
}

export async function runDailyCheckin(env) {
  const keyNames = await listAllUserKeys(env.SKLAND_STORAGE);
  let success = 0;
  let failed = 0;

  for (const key of keyNames) {
    const tgUserId = key.slice("user:".length);

    try {
      const encrypted = await env.SKLAND_STORAGE.get(key);
      if (!encrypted) {
        continue;
      }

      const user = await decryptJson(encrypted, env.ENCRYPTION_KEY);
      await performAttendance(user, env);
      success += 1;
    } catch (error) {
      failed += 1;
      const msg = isAuthFailure(error)
        ? "自动签到失败：凭证可能已失效，请重新发送 /bind 进行绑定。"
        : `自动签到失败：${error.message || "服务暂时不可用"}`;

      await notifyUser(env, tgUserId, msg);
    }
  }

  return { total: keyNames.length, success, failed };
}

export async function scheduled(_event, env, _ctx) {
  if (!env?.TG_BOT_TOKEN || !env?.ENCRYPTION_KEY) {
    return;
  }

  await runDailyCheckin(env);
}

