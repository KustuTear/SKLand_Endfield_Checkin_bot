import { encryptJson } from "../src/crypto.js";
import { validateSklandToken } from "../src/skland_api.js";

function parseBindCommand(text) {
  const match = text.match(/^\/bind(?:@\w+)?\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function parseStartOrHelpCommand(text) {
  return /^\/(start|help)(?:@\w+)?$/i.test(text);
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

function buildBindGuide() {
  return [
    "绑定方式：",
    "1) 登录 https://www.skland.com/",
    "2) 打开 https://web-api.skland.com/account/info/hg",
    "3) 复制返回 JSON 中 content 字段完整字符串",
    "4) 在这里发送：/bind <你的content字符串>"
  ].join("\n");
}

async function handleBind(message, env) {
  const tgUserId = message.from?.id;
  const chatId = message.chat?.id;
  const bindToken = parseBindCommand(message.text || "");

  if (!bindToken) {
    await sendMessage(env, chatId, "格式错误，请使用：/bind <森空岛token>");
    return;
  }

  try {
    const profile = await validateSklandToken(bindToken, env);

    await saveUserSecret(env, tgUserId, {
      phone: null,
      cred: bindToken,
      uid: profile.uid,
      token: profile.token,
      tg_user_id: tgUserId,
      updated_at: new Date().toISOString()
    });

    await deleteMessage(env, chatId, message.message_id);
    await sendMessage(env, chatId, "绑定成功，Token 已加密保存。后续将自动签到。\n如需更新，请再次发送 /bind <token>");
  } catch (error) {
    await sendMessage(env, chatId, `绑定失败：${error.message || "Token 无效或服务暂不可用"}`);
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

  return new Response("ok", { status: 200 });
}
