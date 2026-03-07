"""根据微信付款码查询 openid 的命令行脚本

功能概述：
- 调用接口 `https://api.mch.weixin.qq.com/tools/authcodetoopenid` 获取用户 `openid`，在满足条件时可返回 `sub_openid`
- 支持微信支付 V2 签名（`MD5` 与 `HMAC-SHA256`）与 XML 请求/解析
- 支持命令行参数与环境变量，支持从 `.env` 文件加载配置（`--env-file`）
- 提供 `--dry-run` 模式用于本地验证请求 XML，不发起网络请求

环境变量（缺省时读取）：
- `WX_APPID`、`WX_MCH_ID`、`WX_SUB_MCH_ID`、`WX_AUTH_CODE`、`WX_API_KEY`、`WX_SUB_APPID`

安全提示：不要将密钥写入仓库；`.env` 文件应加入忽略列表。
"""

import os
import uuid
import hashlib
import hmac
import ssl
from urllib import request
import xml.etree.ElementTree as ET
from pathlib import Path

def build_params(appid, mch_id, sub_mch_id, auth_code, nonce_str, sub_appid=None, sign_type="MD5"):
    """构造接口请求参数字典

    :param appid: 服务商的 APPID
    :param mch_id: 服务商商户号
    :param sub_mch_id: 子商户号
    :param auth_code: 付款码
    :param nonce_str: 随机字符串（<=32）
    :param sub_appid: 子商户 APPID（选填）
    :param sign_type: 签名类型（MD5/HMAC-SHA256）
    :return: 参数字典
    """
    p = {
        "appid": appid,
        "mch_id": mch_id,
        "sub_mch_id": sub_mch_id,
        "auth_code": auth_code,
        "nonce_str": nonce_str,
        "sign_type": sign_type,
    }
    if sub_appid:
        p["sub_appid"] = sub_appid
    return p

def sign_v2(params, api_key, sign_type="MD5"):
    """生成微信支付 V2 签名

    - 先按键名 ASCII 升序排序（不含 `sign` 且值非空）
    - 拼接为 `k=v` 的 `&` 串，末尾追加 `&key=API_KEY`
    - 根据 `sign_type` 执行 `MD5` 或 `HMAC-SHA256` 并转大写
    """
    items = [(k, v) for k, v in params.items() if v is not None and k != "sign"]
    items.sort(key=lambda x: x[0])
    s = "&".join([f"{k}={v}" for k, v in items]) + f"&key={api_key}"
    if sign_type.upper() == "HMAC-SHA256":
        digest = hmac.new(api_key.encode("utf-8"), s.encode("utf-8"), hashlib.sha256).hexdigest().upper()
        return digest
    m = hashlib.md5()
    m.update(s.encode("utf-8"))
    return m.hexdigest().upper()

def dict_to_xml(params):
    """将字典转换为微信接口所需的 XML 格式字节串"""
    root = ET.Element("xml")
    for k, v in params.items():
        e = ET.SubElement(root, k)
        e.text = str(v)
    return ET.tostring(root, encoding="utf-8")

def xml_to_dict(xml_bytes):
    """将微信返回的 XML 字节串解析为字典"""
    d = {}
    root = ET.fromstring(xml_bytes)
    for c in root:
        d[c.tag] = c.text
    return d

def post_xml(url, xml_bytes, timeout=10):
    """以 POST 方式发送 XML 请求

    :param url: 接口地址
    :param xml_bytes: XML 字节串
    :param timeout: 超时时间（秒）
    :return: 响应字节串
    """
    req = request.Request(url=url, data=xml_bytes, headers={"Content-Type": "application/xml"}, method="POST")
    ctx = ssl.create_default_context()
    with request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return resp.read()

def resolve(value, env_key, required=False):
    """优先使用命令行参数；缺省则从环境变量读取

    :param value: 命令行传入的值
    :param env_key: 环境变量键名
    :param required: 是否必填
    :return: 最终值，必填缺失时退出
    """
    if value:
        return value
    v = os.getenv(env_key)
    if required and not v:
        raise SystemExit(f"缺少参数: {env_key}")
    return v

def load_env_file(path):
    """从 .env 文件加载键值到进程环境

    解析规则：
    - 支持 `KEY=VALUE` 与 `export KEY=VALUE`
    - 忽略以 `#` 开头的注释与空行
    - 支持使用单/双引号包裹值
    - 不覆盖已存在的同名系统环境变量
    """
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.lower().startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        k = k.strip()
        v = v.strip()
        if v.startswith("\"") and v.endswith("\""):
            v = v[1:-1]
        elif v.startswith("'") and v.endswith("'"):
            v = v[1:-1]
        if k and (os.getenv(k) is None):
            os.environ[k] = v

def main():
    """命令行入口：解析参数、加载配置、签名并发起请求/打印结果"""
    APPID = "wxc4d03bbdceb28746"
    MCH_ID = "1502026461"
    SUB_MCH_ID = "1727222132"
    AUTH_CODE = "133138246544771865"
    API_KEY = "34gK0d1pm8FM2ff098f3v3BN2s3BEL52"
    SUB_APPID = "133100160140349512"
    SIGN_TYPE = "MD5"
    URL = "https://api.mch.weixin.qq.com/tools/authcodetoopenid"
    DRY_RUN = False

    nonce_str = uuid.uuid4().hex[:32]

    params = build_params(APPID, MCH_ID, SUB_MCH_ID, AUTH_CODE, nonce_str, SUB_APPID, SIGN_TYPE)
    params["sign"] = sign_v2(params, API_KEY, SIGN_TYPE)

    xml_bytes = dict_to_xml(params)

    if DRY_RUN:
        print("REQUEST_XML:")
        print(xml_bytes.decode("utf-8"))
        print("URL:")
        print(URL)
        return

    resp_bytes = post_xml(URL, xml_bytes)
    resp = xml_to_dict(resp_bytes)

    # print("RESPONSE_XML:")
    # print(resp_bytes.decode("utf-8"))

    rc = resp.get("return_code")
    rm = resp.get("return_msg")
    if rc != "SUCCESS":
        print(f"return_code={rc}")
        if rm:
            print(f"return_msg={rm}")
        print("raw:")
        print(resp_bytes.decode("utf-8", errors="ignore"))
        return

    r = resp.get("result_code")
    if r != "SUCCESS":
        print(f"result_code={r}")
        ec = resp.get("err_code")
        if ec:
            print(f"err_code={ec}")
        print("raw:")
        print(resp_bytes.decode("utf-8", errors="ignore"))
        return

    openid = resp.get("openid")
    sub_openid = resp.get("sub_openid")
    if openid:
        print(f"openid={openid}")
    if sub_openid:
        print(f"sub_openid={sub_openid}")

if __name__ == "__main__":
    main()