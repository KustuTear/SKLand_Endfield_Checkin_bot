import { encryptJson, decryptJson } from "../src/crypto.js";
import { validateSklandToken, performAttendance, extractAttendanceRewards, formatRewardLines } from "../src/skland_api.js";

function parseBindCommand(text) {
  const match = text.match(/^\/bind(?:@\w+)?\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const input = match[1].trim();
  const parts = input.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const token = parts[0];
  const uidRaw = parts[1] || null;
  const uid = uidRaw && /^\d+$/.test(uidRaw) ? uidRaw : null;

  return { token, uid };
}

function parseStartOrHelpCommand(text) {
  return /^\/(start|help)(?:@\w+)?$/i.test(text);
}

function parseTestCommand(text) {
  return /^\/test(?:@\w+)?$/i.test(text);
}

async function tgApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || `Telegram API error: ${method}`);
  }
  return body.result;
}

async function sendMessage(env, chatId, text) {
  return tgApi(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function deleteMessage(env, chatId, messageId) {
  if (!messageId) {
    return;
  }
  try {
    await tgApi(env, "deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
  } catch {
    // Ignore deletion failures: message may be already removed or expired.
  }
}

async function saveUserSecret(env, tgUserId, data) {
  const encrypted = await encryptJson(data, env.ENCRYPTION_KEY);
  await env.SKLAND_STORAGE.put(`user:${tgUserId}`, encrypted);
}

async function readUserSecret(env, tgUserId) {
  const encrypted = await env.SKLAND_STORAGE.get(`user:${tgUserId}`);
  if (!encrypted) {
    return null;
  }
  return decryptJson(encrypted, env.ENCRYPTION_KEY);
}

function buildBindGuide() {
  return [
    "绑定方式：",
    "1) 登录 https://www.skland.com/",
    "2) 打开 https://web-api.skland.com/account/info/hg",
    "3) 复制返回 JSON 中 content 字段完整字符串",
    "4) 在这里发送：/bind <token> [uid]",
    "5) 若 /test 提示用户未登录，请补充 uid 重新绑定",
    "6) 绑定后可发送 /test 立即测试签到",
    "默认每日北京时间 0:00 自动签到一次（需启用 Cron）"
  ].join("\n");
}

async function handleBind(message, env) {
  const tgUserId = message.from?.id;
  const chatId = message.chat?.id;
  const bindInput = parseBindCommand(message.text || "");

  if (!bindInput?.token) {
    await sendMessage(env, chatId, "格式错误，请使用：/bind <token> [uid]");
    return;
  }

  try {
    const profile = await validateSklandToken(bindInput.token, env);
    const finalUid = bindInput.uid || profile.uid || null;

    await saveUserSecret(env, tgUserId, {
      phone: null,
      cred: bindInput.token,
      uid: finalUid,
      token: profile.token,
      tg_user_id: tgUserId,
      updated_at: new Date().toISOString()
    });

    await deleteMessage(env, chatId, message.message_id);

    if (!finalUid) {
      await sendMessage(env, chatId, "绑定成功，但未识别到 uid。若 /test 失败，请使用 /bind <token> <uid> 重新绑定。\n默认每日北京时间 0:00 自动签到一次（需启用 Cron）。");
      return;
    }

    await sendMessage(env, chatId, "绑定成功，Token 已加密保存。\n默认每日北京时间 0:00 自动签到一次（需启用 Cron）。\n可发送 /test 立即测试。\n如需更新，请再次发送 /bind <token> [uid]");
  } catch (error) {
    await sendMessage(env, chatId, `绑定失败：${error.message || "Token 无效或服务暂不可用"}`);
  }
}

async function handleTest(message, env) {
  const tgUserId = message.from?.id;
  const chatId = message.chat?.id;

  try {
    const user = await readUserSecret(env, tgUserId);
    if (!user?.cred) {
      await sendMessage(env, chatId, "你还没有绑定，请先发送 /bind <token> [uid]");
      return;
    }

    if (!user.uid) {
      await sendMessage(env, chatId, "缺少 uid，请发送 /bind <token> <uid> 重新绑定后再试。\nuid 可填你游戏内数字 UID。 ");
      return;
    }

    const result = await performAttendance(user, env);
    const rewards = extractAttendanceRewards(result);
    const rewardLines = formatRewardLines(rewards);
    await sendMessage(env, chatId, `手动签到成功，获得奖励：\n${rewardLines}`);
  } catch (error) {
    await sendMessage(env, chatId, `手动签到失败：${error.message || "服务暂不可用"}`);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.TG_BOT_TOKEN || !env?.ENCRYPTION_KEY) {
    return new Response("Missing required env", { status: 500 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const message = update?.message;
  if (!message?.from?.id || !message?.chat?.id || typeof message?.text !== "string") {
    return new Response("ok", { status: 200 });
  }

  const text = message.text.trim();

  if (parseStartOrHelpCommand(text)) {
    await sendMessage(env, message.chat.id, buildBindGuide());
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/bind")) {
    await handleBind({ ...message, text }, env);
    return new Response("ok", { status: 200 });
  }

  if (parseTestCommand(text)) {
    await handleTest({ ...message, text }, env);
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}
