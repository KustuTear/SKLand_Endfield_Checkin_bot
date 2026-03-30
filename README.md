# SKLand_Endfield_Checkin_bot

基于 GitHub Actions 运行的森空岛《明日方舟：终末地》全自动每日签到脚本，支持通过 Telegram 机器人推送签到结果通知。

## 🚀 使用方法

本项目完全依赖 GitHub Actions 自动运行，无需本地服务器部署。使用前，请务必在你的 GitHub 仓库中配置相应的环境变量。

**配置路径**：
进入你的 GitHub 仓库 -> 点击顶部 `Settings` -> 左侧菜单找到 `Secrets and variables` -> 选择 `Actions` -> 点击绿色的 `New repository secret` 按钮。

## 🔑 环境变量 (Secrets) 配置说明

请严格按照以下名称新建 4 个 Secret 变量：

* **`ENDFIELD_UID`**
    * **说明**：你的《明日方舟：终末地》游戏内角色 UID。
    * **示例**：`123456789`

* **`SKLAND_CRED`**
    * **说明**：森空岛的专属身份登录凭证。
    * **⚠️ 严正注意**：这**不是**鹰角网络通行证 Token！
    * **获取方式**：需要在手机或电脑端对“森空岛”进行网络抓包，在签到请求的 Request Headers（请求头）中寻找 `cred` 字段的值（通常是一长串字母和数字的组合）。

* **`TG_BOT_TOKEN`**
    * **说明**：你的 Telegram 机器人 Token，用于发送通知。
    * **获取方式**：在 Telegram 中向 `@BotFather` 申请创建机器人后获取。

* **`TG_CHAT_ID`**
    * **说明**：接收签到通知的 Telegram 用户 ID 或群组 ID。
    * **注意**：这是一串纯数字 ID，**不是**以 `@` 开头的用户名。你可以通过向 `@userinfobot` 发送消息来获取你自己的数字 ID。

## Cloudflare Pages Functions 版（Telegram Webhook + KV 状态机）

本仓库新增了基于 Cloudflare 的 JS 版本实现：

- `functions/webhook.js`：Telegram Webhook 入口，处理 `/login <手机号>` 与 6 位验证码。
- `src/crypto.js`：使用 Web Crypto API（AES-GCM）加解密用户凭据。
- `src/skland_api.js`：封装森空岛/鹰角接口调用。
- `src/cron.js`：定时签到逻辑（遍历 `user:*`，解密后签到，失败通知用户）。
- `functions/cron.js`：可选的 HTTP 手动触发入口（用 `x-cron-secret` 鉴权）。
- `worker-cron.js`：独立 Worker 的 Cron 入口（用于 `scheduled` 事件）。

### 必要环境变量

- `TG_BOT_TOKEN`：Telegram Bot Token
- `ENCRYPTION_KEY`：用于 AES-GCM 加密的主密钥（建议 32+ 长度随机字符串）
- `CRON_SECRET`：仅用于 `functions/cron.js` 手动触发鉴权

可选接口覆盖变量：

- `SKLAND_SEND_CODE_ENDPOINT`
- `SKLAND_TOKEN_BY_PHONE_CODE_ENDPOINT`
- `SKLAND_GENERATE_CRED_ENDPOINT`
- `SKLAND_ATTENDANCE_ENDPOINT`
- `SKLAND_GAME_ID`

### KV 绑定（重点）

创建 Cloudflare KV 命名空间后，绑定名必须是：`SKLAND_STORAGE`。

#### Pages 项目中绑定

在 Pages 项目设置中：
1. Settings -> Functions -> KV namespace bindings
2. 添加 `Binding name = SKLAND_STORAGE`
3. 选择你创建的 KV 命名空间

#### Worker（Cron）中绑定

可参考 `wrangler.toml.example`：

```toml
[[kv_namespaces]]
binding = "SKLAND_STORAGE"
id = "<YOUR_KV_NAMESPACE_ID>"
```

### Telegram Webhook 配置

部署 Pages 后，将 webhook 指向：

`https://<your-pages-domain>/webhook`

示例：

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-pages-domain>/webhook"
```

### 状态与数据键说明

- 登录状态（5 分钟 TTL）：
  - `state:{tg_user_id}` -> `{ phone, step: "WAIT_CODE", phone_msg_id, prompt_msg_id, chat_id }`
- 用户凭据（加密存储）：
  - `user:{tg_user_id}` -> AES-GCM 加密后的 JSON（`cred`, `uid`, `token`, `phone`）

### 定时签到部署建议

Pages 主要负责 webhook；Cron 建议使用独立 Worker（`worker-cron.js`）并配置 `triggers.crons`。

也可先用 `functions/cron.js` 通过 HTTP 手动触发联调：

```bash
curl -X POST "https://<your-pages-domain>/cron" -H "x-cron-secret: <CRON_SECRET>"
```
