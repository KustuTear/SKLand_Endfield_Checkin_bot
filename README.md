# SKLand Endfield Checkin Bot

基于 Cloudflare Workers 的 Telegram webhook 签到机器人。

## 功能

- `/start` 或 `/help`：显示使用说明
- `/bind <token1,token2>`：绑定一个或多个森空岛 token，多个 token 使用英文逗号分隔
- `/test`：仅测试当前 `message.from.id` 对应记录
- `/clear`：仅清空当前 `message.from.id` 对应记录
- 每天北京时间 00:00 自动签到一次
- 使用 `SKLAND_STORAGE` KV 加密保存 token

## 必要配置

### Wrangler

在 `wrangler.toml` 中填入你自己的 KV namespace id：

- `SKLAND_STORAGE`

### Secrets

执行以下命令写入 Worker secret：

```bash
wrangler secret put TG_BOT_TOKEN
wrangler secret put ENCRYPTION_KEY
```

## 部署后操作

1. 部署 Worker
2. 将 Telegram webhook 指向 `https://<your-worker-domain>/webhook`

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker-domain>/webhook"
```

## 备注

- `/start` 中的 token 获取说明参考森空岛网页 `https://web-api.skland.com/account/info/hg` 的 `content` 字段。
- 自动签到 cron `0 16 * * *` 为 UTC 时间，对应北京时间每天 00:00。
