import { deleteUserRecord, getUserRecord, listAllUserKeys, putUserRecord } from "./storage.js";
import { sendMessage } from "./telegram.js";
import { classifyResults, isAuthFailure, runSignInForToken, validateToken } from "./skland_api.js";

function parseCommand(text) {
  const trimmed = String(text || "").trim();

  if (/^\/(start|help)(?:@\w+)?$/i.test(trimmed)) {
    return { name: "start", args: "" };
  }
  if (/^\/test(?:@\w+)?$/i.test(trimmed)) {
    return { name: "test", args: "" };
  }
  if (/^\/clear(?:@\w+)?$/i.test(trimmed)) {
    return { name: "clear", args: "" };
  }

  const bindMatch = trimmed.match(/^\/bind(?:@\w+)?\s+(.+)$/i);
  if (bindMatch) {
    return { name: "bind", args: bindMatch[1].trim() };
  }

  return { name: "", args: "" };
}

function parseBindTokens(raw) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskToken(token) {
  if (token.length <= 10) {
    return token;
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function buildStartMessage() {
  return [
    "欢迎使用森空岛签到 Bot。",
    "",
    "可用命令：",
    "/bind <token1,token2> 绑定一个或多个 token，多个 token 用英文逗号分隔",
    "/test 立即测试当前 Telegram 账号已绑定 token 的签到",
    "/clear 清空当前 Telegram 账号已保存的全部 token",
    "",
    "使用步骤：",
    "1. 登录森空岛网页端。",
    "2. 打开 https://web-api.skland.com/account/info/hg 。",
    "3. 复制返回 JSON 中 content 字段的完整字符串。",
    "4. 发送 /bind <token> 完成绑定。",
    "",
    "说明：",
    "- /test 和 /clear 只会操作你自己的 Telegram 账号记录。",
    "- 每天北京时间 00:00 会自动执行一次签到。"
  ].join("\n");
}

function formatSingleResult(result) {
  if (result.status === "success") {
    const detail = result.awards.length > 0 ? ` (${result.awards.join("，")})` : "";
    return `✅ ${result.game} - ${result.nickname}: 签到成功${detail}`;
  }
  if (result.status === "already") {
    return `ℹ️ ${result.game} - ${result.nickname}: 今日已签到`;
  }
  return `❌ ${result.game} - ${result.nickname}: ${result.error || "签到失败"}`;
}

function formatTokenExecution(index, token, results, errorMessage = "") {
  const lines = [`Token ${index} (${maskToken(token)})`];

  if (errorMessage) {
    lines.push(`❌ 处理失败: ${errorMessage}`);
    return lines.join("\n");
  }

  const summary = classifyResults(results);
  for (const item of results) {
    lines.push(formatSingleResult(item));
  }

  if (summary.failed === 0 && summary.already > 0 && summary.success === 0) {
    lines.push("总结: 该 Token 下所有游戏账户今日已签到。");
  } else if (summary.failed === 0) {
    lines.push("总结: 该 Token 下游戏账户已全部完成签到。");
  } else {
    lines.push(`总结: 成功 ${summary.success}，已签到 ${summary.already}，失败 ${summary.failed}。`);
  }

  return lines.join("\n");
}

async function executeBindings(record, env) {
  const reports = [];

  for (let i = 0; i < record.bindings.length; i += 1) {
    const binding = record.bindings[i];
    try {
      const results = await runSignInForToken(binding.token, env);
      reports.push({
        token: binding.token,
        results,
        error: ""
      });
    } catch (error) {
      reports.push({
        token: binding.token,
        results: [],
        error: error?.message || "签到失败",
        authFailure: isAuthFailure(error)
      });
    }
  }

  return reports;
}

function buildExecutionMessage(title, reports) {
  const lines = [title, ""];

  for (let i = 0; i < reports.length; i += 1) {
    const report = reports[i];
    lines.push(formatTokenExecution(i + 1, report.token, report.results, report.error));
    if (report.authFailure) {
      lines.push("提示: 该 Token 可能已失效，请重新使用 /bind 绑定。");
    }
    if (i !== reports.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function handleBind(message, env) {
  const tgUserId = String(message.from.id);
  const chatId = message.chat.id;
  const command = parseCommand(message.text);
  const tokens = parseBindTokens(command.args);

  if (tokens.length === 0) {
    await sendMessage(env, chatId, "绑定失败：请使用 /bind <token1,token2>，多个 token 用英文逗号分隔。");
    return;
  }

  const existingRecord = (await getUserRecord(env, tgUserId)) || {
    tgUserId,
    chatId,
    bindings: []
  };
  const existingTokens = new Set(existingRecord.bindings.map((item) => item.token));
  const nextBindings = [...existingRecord.bindings];
  const successLines = [];
  const skippedLines = [];
  const failedLines = [];

  for (const token of tokens) {
    if (existingTokens.has(token)) {
      skippedLines.push(`- ${maskToken(token)} 已存在，跳过`);
      continue;
    }

    try {
      const validated = await validateToken(token, env);
      nextBindings.push({
        token,
        addedAt: new Date().toISOString()
      });
      existingTokens.add(token);
      successLines.push(
        `- ${maskToken(token)} 绑定成功，明日方舟 ${validated.summary.arknights} 个绑定，终末地 ${validated.summary.endfield} 个角色`
      );
    } catch (error) {
      failedLines.push(`- ${maskToken(token)} 绑定失败：${error?.message || "校验失败"}`);
    }
  }

  if (successLines.length > 0) {
    await putUserRecord(env, tgUserId, {
      ...existingRecord,
      chatId,
      bindings: nextBindings
    });
  }

  const lines = [];
  if (successLines.length > 0) {
    lines.push("绑定结果：成功");
    lines.push(...successLines);
  }
  if (skippedLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("重复项：");
    lines.push(...skippedLines);
  }
  if (failedLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("失败项：");
    lines.push(...failedLines);
  }
  if (lines.length === 0) {
    lines.push("绑定失败：没有可处理的 token。");
  }

  await sendMessage(env, chatId, lines.join("\n"));
}

async function handleTest(message, env) {
  const tgUserId = String(message.from.id);
  const chatId = message.chat.id;
  const record = await getUserRecord(env, tgUserId);

  if (!record || record.bindings.length === 0) {
    await sendMessage(env, chatId, "测试失败：你还没有绑定 token，请先发送 /bind <token>。");
    return;
  }

  if (record.chatId !== chatId) {
    await putUserRecord(env, tgUserId, { ...record, chatId });
  }

  const reports = await executeBindings(record, env);
  await sendMessage(env, chatId, buildExecutionMessage("签到测试结果：", reports));
}

async function handleClear(message, env) {
  const tgUserId = String(message.from.id);
  const chatId = message.chat.id;
  const record = await getUserRecord(env, tgUserId);

  if (!record || record.bindings.length === 0) {
    await sendMessage(env, chatId, "清空完成：当前账号没有已保存的 token。");
    return;
  }

  await deleteUserRecord(env, tgUserId);
  await sendMessage(env, chatId, `清空成功：已删除你名下保存的 ${record.bindings.length} 个 token。`);
}

async function handleMessage(message, env) {
  if (!message?.from?.id || !message?.chat?.id || typeof message?.text !== "string") {
    return;
  }

  const parsed = parseCommand(message.text);
  if (parsed.name === "start") {
    await sendMessage(env, message.chat.id, buildStartMessage());
    return;
  }
  if (parsed.name === "bind") {
    await handleBind(message, env);
    return;
  }
  if (parsed.name === "test") {
    await handleTest(message, env);
    return;
  }
  if (parsed.name === "clear") {
    await handleClear(message, env);
  }
}

async function runScheduled(env) {
  const keys = await listAllUserKeys(env.SKLAND_STORAGE);
  let totalUsers = 0;
  let totalTokens = 0;

  for (const key of keys) {
    const tgUserId = key.slice("user:".length);
    const record = await getUserRecord(env, tgUserId);
    if (!record || record.bindings.length === 0) {
      continue;
    }

    totalUsers += 1;
    totalTokens += record.bindings.length;
    const reports = await executeBindings(record, env);

    try {
      const chatId = record.chatId || Number(record.tgUserId);
      await sendMessage(env, chatId, buildExecutionMessage("每日自动签到结果：", reports));
    } catch (error) {
      console.error("scheduled:notify_failed", {
        tgUserId: record.tgUserId,
        message: error?.message || "unknown"
      });
    }
  }

  return { totalUsers, totalTokens };
}

function ensureRequiredEnv(env) {
  const missing = [];
  if (!env?.TG_BOT_TOKEN) missing.push("TG_BOT_TOKEN");
  if (!env?.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!env?.SKLAND_STORAGE) missing.push("SKLAND_STORAGE");
  return missing;
}

export default {
  async fetch(request, env) {
    const missing = ensureRequiredEnv(env);
    if (missing.length > 0) {
      return new Response(`Missing env: ${missing.join(", ")}`, { status: 500 });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("ok", { status: 200 });
    }

    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    try {
      await handleMessage(update?.message, env);
    } catch (error) {
      console.error("webhook:error", error);
      const chatId = update?.message?.chat?.id;
      if (chatId) {
        try {
          await sendMessage(env, chatId, `处理失败：${error?.message || "服务暂时不可用"}`);
        } catch {
          // ignore send failure
        }
      }
    }

    return new Response("ok", { status: 200 });
  },

  async scheduled(_event, env, _ctx) {
    const missing = ensureRequiredEnv(env);
    if (missing.length > 0) {
      console.error("scheduled:missing_env", missing);
      return;
    }

    const result = await runScheduled(env);
    console.log("scheduled:completed", result);
  }
};
