# SKLand_Endfield_Checkin_bot

基于 GitHub Actions 运行的《明日方舟：终末地》全自动每日签到脚本，支持通过 Telegram 机器人推送签到结果通知。

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
