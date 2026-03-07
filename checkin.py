import os
import time
import json
import requests

# ================= 配置区域 =================
# 从 GitHub Secrets 获取环境变量
SKLAND_CRED = os.environ.get("SKLAND_CRED")
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

# 森空岛终末地签到接口
CHECKIN_URL = "https://zonai.skland.com/web/v1/game/endfield/attendance"
# ============================================

def send_telegram_message(message):
    """发送 Telegram 消息"""
    if not TG_BOT_TOKEN or not TG_CHAT_ID:
        print("未配置 Telegram Token 或 Chat ID，跳过消息推送。")
        return
    
    tg_url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        response = requests.post(tg_url, json=payload)
        response.raise_for_status()
        print("Telegram 消息推送成功")
    except Exception as e:
        print(f"Telegram 消息推送失败: {e}")

def do_checkin():
    """执行签到逻辑"""
    if not SKLAND_CRED:
        msg = "❌ **签到失败**\n未找到 `SKLAND_CRED` 环境变量，请检查 GitHub Secrets 配置。"
        print(msg)
        send_telegram_message(msg)
        return

    # 构造请求头
    # 注意：森空岛 API 通常需要动态生成 sign。
    # 这里提供基础的 Header 结构。如果官方严格校验 sign 和 timestamp，
    # 你可能需要引入森空岛的签名算法（通常涉及 HMAC-SHA256、请求路径和时间戳）。
    headers = {
        "cred": SKLAND_CRED,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Content-Type": "application/json;charset=utf-8",
        # "sign": "如果你有签名生成逻辑，请在此处补充",
        # "timestamp": str(int(time.time()))
    }

    try:
        # 发送签到 POST 请求
        response = requests.post(CHECKIN_URL, headers=headers, json={})
        data = response.json()
        
        # 解析响应结果
        if data.get("code") == 0:
            # 签到成功
            awards = data.get("data", {}).get("awards", [])
            award_info = "\n".join([f"- 奖励 ID: `{item.get('resource', {}).get('id', '未知')}` x {item.get('count', 1)}" for item in awards])
            msg = f"✅ **终末地签到成功**\n\n**获得奖励：**\n{award_info}"
        elif data.get("code") == 10001:
            # 通常 10001 表示今日已签到或其他重复操作
            msg = "⚠️ **终末地签到提示**\n今日可能已经签到过，或凭证异常。请检查返回信息。\n返回详情：" + data.get("message", "未知错误")
        else:
            msg = f"❌ **终末地签到失败**\n错误码：`{data.get('code')}`\n错误信息：{data.get('message', '无')}"
            
    except Exception as e:
        msg = f"❌ **签到脚本发生异常**\n```\n{str(e)}\n```"

    print(msg)
    send_telegram_message(msg)

if __name__ == "__main__":
    print("开始执行终末地签到任务...")
    do_checkin()