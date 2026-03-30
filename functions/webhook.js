import { encryptJson } from "../src/crypto.js";
import {
  sendSmsCode,
  exchangePhoneCodeForGrant,
  generateCredByCode
} from "../src/skland_api.js";

const STATE_TTL_SECONDS = 300;

function isValidPhone(phone) {
  return /^1\d{10}$/.test(phone);
}

function parseLoginCommand(text) {
  const match = text.match(/^\/login(?:@\w+)?\s+(\d{11})$/i);
  return match ? match[1] : null;
}

function isCodeText(text) {
  return /^\d{6}$/.test(text);
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

async function getState(env, tgUserId) {
  const raw = await env.SKLAND_STORAGE.get(`state:${tgUserId}`);
  return raw ? JSON.parse(raw) : null;
}

async function setState(env, tgUserId, state) {
  await env.SKLAND_STORAGE.put(`state:${tgUserId}`, JSON.stringify(state), {
    expirationTtl: STATE_TTL_SECONDS
  });
}

async function clearState(env, tgUserId) {
  await env.SKLAND_STORAGE.delete(`state:${tgUserId}`);
}

async function saveUserSecret(env, tgUserId, data) {
  const encrypted = await encryptJson(data, env.ENCRYPTION_KEY);
  await env.SKLAND_STORAGE.put(`user:${tgUserId}`, encrypted);
}

async function handleLogin(message, env) {
  const tgUserId = message.from?.id;
  const chatId = message.chat?.id;
  const phone = parseLoginCommand(message.text || "");

  if (!phone || !isValidPhone(phone)) {
    await sendMessage(env, chatId, "格式错误，请使用 /login 11位手机号");
    return;
  }

  try {
    await sendSmsCode(phone, env);
    const prompt = await sendMessage(env, chatId, "验证码已发送，请在 5 分钟内回复 6 位数字验证码。");

    await setState(env, tgUserId, {
      phone,
      step: "WAIT_CODE",
      chat_id: chatId,
      phone_msg_id: message.message_id,
      prompt_msg_id: prompt.message_id,
      updated_at: Date.now()
    });
  } catch (error) {
    await sendMessage(env, chatId, `验证码发送失败：${error.message || "请稍后重试"}`);
  }
}

async function handleCode(message, env) {
  const tgUserId = message.from?.id;
  const chatId = message.chat?.id;
  const code = message.text || "";
  const state = await getState(env, tgUserId);

  if (!state || state.step !== "WAIT_CODE") {
    return;
  }

  try {
    const grantCode = await exchangePhoneCodeForGrant(state.phone, code, env);
    const auth = await generateCredByCode(grantCode, env);

    await saveUserSecret(env, tgUserId, {
      phone: state.phone,
      cred: auth.cred,
      uid: auth.uid,
      token: auth.token,
      tg_user_id: tgUserId,
      updated_at: new Date().toISOString()
    });

    await Promise.all([
      deleteMessage(env, state.chat_id || chatId, state.phone_msg_id),
      deleteMessage(env, state.chat_id || chatId, state.prompt_msg_id),
      deleteMessage(env, chatId, message.message_id)
    ]);

    await clearState(env, tgUserId);
    await sendMessage(env, chatId, "登录成功，已安全保存凭证并清理敏感消息。");
  } catch (error) {
    await sendMessage(env, chatId, `验证码校验失败：${error.message || "请重试 /login"}`);
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

  if (text.startsWith("/login")) {
    await handleLogin({ ...message, text }, env);
    return new Response("ok", { status: 200 });
  }

  if (isCodeText(text)) {
    await handleCode({ ...message, text }, env);
  }

  return new Response("ok", { status: 200 });
}
