import os
import time
import json
import requests
import hmac
import hashlib

# ================= 配置区域 =================
SKLAND_CRED = os.environ.get("SKLAND_CRED")
ENDFIELD_UID = os.environ.get("ENDFIELD_UID")
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

CHECKIN_URL = "https://zonai.skland.com/web/v1/game/endfield/attendance"
REFRESH_URL = "https://zonai.skland.com/api/v1/auth/refresh"

# 🎒 奖励翻译字典：已更新为最新的真实名称数据
REWARD_DICT = {
    "1": "中级作战记录",
    "2": "初级认知载体",
    "3": "高级作战记录",
    "4": "武器检查装置",
    "5": "武器检查套组",
    "6": "协议棱柱",
    "7": "折金券",
    "8": "嵌晶玉"
}
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
    platform = "3"  
    vName = "1.0.0"
    dId = ""
    
    header_json = json.dumps({
        "platform": platform,
        "timestamp": timestamp,
        "dId": dId,
        "vName": vName
    }, separators=(',', ':'))
    
    data_to_sign = path + "" + timestamp + header_json
    hmac_bytes = hmac.new(token.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).digest()
    sign = hashlib.md5(hmac_bytes.hex().encode('utf-8')).hexdigest()
    
    return sign, platform, vName, dId

def do_checkin():
    """执行签到逻辑"""
    if not SKLAND_CRED or not ENDFIELD_UID:
        msg = "❌ **签到失败**\n未找到 `SKLAND_CRED` 或 `ENDFIELD_UID` 环境变量，请检查 GitHub Secrets 配置。"
        print(msg)
        send_telegram_message(msg)
        return

    try:
        print("正在获取签名 Token...")
        token = get_token(SKLAND_CRED)
        timestamp = str(int(time.time()))
        path = "/web/v1/game/endfield/attendance"
        
        sign, platform, vName, dId = generate_sign(path, token, timestamp)
        
        headers = {
            "cred": SKLAND_CRED,
            "sign": sign,
            "timestamp": timestamp,
            "platform": platform,
            "vName": vName,
            "dId": dId,
            "sk-game-role": f"3_{ENDFIELD_UID}_1", 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json;charset=utf-8"
        }
        
        print("发送签到请求...")
        response = requests.post(CHECKIN_URL, headers=headers)
        data = response.json()
        print("服务器返回详情:", data)
        
        if data.get("code") == 0:
            awards = data.get("data", {}).get("awards", [])
            if not awards and "awardIds" in data.get("data", {}):
                awards = data["data"]["awardIds"]
            
            if awards:
                award_lines = []
                for item in awards:
                    # 获取原始 ID，例如 endfield_attendance_2_5
                    raw_id = item.get('resource', {}).get('id', item.get('id', '未知'))
                    item_name = raw_id
                    item_count = item.get('count', 1)
                    
                    # 尝试解析 endfield_attendance_物品ID_数量 格式
                    if raw_id.startswith("endfield_attendance_"):
                        parts = raw_id.split("_")
                        if len(parts) >= 4:
                            item_id = parts[2]       # 提取出物品 ID 
                            item_count = parts[3]    # 提取出真实数量 
                            # 从字典里查中文名，查不到就显示“未知物品(ID)”
                            item_name = REWARD_DICT.get(item_id, f"未知物品({item_id})")
                            
                    award_lines.append(f"- {item_name} x {item_count}")
                
                award_info = "\n".join(award_lines)
                msg = f"✅ **终末地签到成功**\n\n**获得奖励：**\n{award_info}"
            else:
                msg = "✅ **终末地签到成功！**\n（奖励已发放至游戏内）"
        elif data.get("code") == 10001 and "已经" in data.get("message", ""):
            msg = "⚠️ **终末地签到提示**\n今日已经签到过了哦。"
        else:
            msg = f"❌ **终末地签到失败**\n错误码：`{data.get('code')}`\n错误信息：{data.get('message', '无')}"
            
    except Exception as e:
        msg = f"❌ **签到脚本发生异常**\n```\n{str(e)}\n```"

    print(msg)
    send_telegram_message(msg)

if __name__ == "__main__":
    do_checkin()
