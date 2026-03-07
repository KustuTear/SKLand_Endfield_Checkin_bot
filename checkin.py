import os
import time
import json
import requests
import hmac
import hashlib

# ================= 配置区域 =================
SKLAND_CRED = os.environ.get("SKLAND_CRED")
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

CHECKIN_URL = "https://zonai.skland.com/web/v1/game/endfield/attendance"
REFRESH_URL = "https://zonai.skland.com/api/v1/auth/refresh"
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
        requests.post(tg_url, json=payload)
    except Exception as e:
        print(f"Telegram 消息推送失败: {e}")

def get_token(cred):
    """通过 cred 获取用于签名的临时 token"""
    headers = {"cred": cred}
    res = requests.get(REFRESH_URL, headers=headers).json()
    if res.get("code") == 0:
        return res["data"]["token"]
    raise Exception(f"Token 获取失败: {res.get('message', '未知错误')}")

def generate_sign(path, token, timestamp):
    """生成森空岛 API 专属签名"""
    platform = "3"  # 代表网页版
    vName = "1.0.0"
    dId = ""
    
    # 构造 Header 信息结构
    header_json = json.dumps({
        "platform": platform,
        "timestamp": timestamp,
        "dId": dId,
        "vName": vName
    }, separators=(',', ':'))
    
    # 拼接需要签名的数据 (路径 + 请求体 + 时间戳 + 头部信息)
    # 因为终末地签到是空请求体，所以第二项为空字符串 ""
    data_to_sign = path + "" + timestamp + header_json
    
    # 进行 HMAC-SHA256 加密
    hmac_bytes = hmac.new(token.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).digest()
    
    # 将结果转为 hex 字符串后进行 MD5 加密
    sign = hashlib.md5(hmac_bytes.hex().encode('utf-8')).hexdigest()
    
    return sign, platform, vName, dId

def do_checkin():
    """执行签到逻辑"""
    if not SKLAND_CRED:
        msg = "❌ **签到失败**\n未找到 `SKLAND_CRED` 环境变量，请检查 GitHub Secrets 配置。"
        print(msg)
        send_telegram_message(msg)
        return

    try:
        print("正在获取签名 Token...")
        token = get_token(SKLAND_CRED)
        timestamp = str(int(time.time()))
        path = "/web/v1/game/endfield/attendance"
        
        # 计算签名
        sign, platform, vName, dId = generate_sign(path, token, timestamp)
        
        # 构造带签名的请求头
        headers = {
            "cred": SKLAND_CRED,
            "sign": sign,
            "timestamp": timestamp,
            "platform": platform,
            "vName": vName,
            "dId": dId,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json;charset=utf-8"
        }
        
        print("发送签到请求...")
        response = requests.post(CHECKIN_URL, headers=headers)
        data = response.json()
        
        # 解析响应结果
        if data.get("code") == 0:
            awards = data.get("data", {}).get("awards", [])
            award_info = "\n".join([f"- 奖励 ID: `{item.get('resource', {}).get('id', '未知')}` x {item.get('count', 1)}" for item in awards])
            msg = f"✅ **终末地签到成功**\n\n**获得奖励：**\n{award_info}"
        elif data.get("code") == 10001:
            msg = "⚠️ **终末地签到提示**\n今日已经签到过了哦。"
        else:
            msg = f"❌ **终末地签到失败**\n错误码：`{data.get('code')}`\n错误信息：{data.get('message', '无')}"
            
    except Exception as e:
        msg = f"❌ **签到脚本发生异常**\n```\n{str(e)}\n```"

    print(msg)
    send_telegram_message(msg)

if __name__ == "__main__":
    do_checkin()
