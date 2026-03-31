function getTelegramEndpoint(env, method) {
  return `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`;
}

export async function tgApi(env, method, payload) {
  const response = await fetch(getTelegramEndpoint(env, method), {
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

export async function sendMessage(env, chatId, text) {
  return tgApi(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}
