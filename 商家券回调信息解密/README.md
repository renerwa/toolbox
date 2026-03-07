# 商家券回调信息解密工具

这是一个用于解密商家券回调信息的Python工具，支持多种常见的加密和编码方式。

## 功能特性

- **Base64解码**: 解码Base64编码的数据
- **AES解密**: 支持AES-CBC、AES-ECB和AES-GCM模式解密
- **微信支付解密**: 专门针对微信支付AES-256-GCM加密的解密功能
- **DES解密**: 支持DES-CBC和DES-ECB模式解密
- **URL解码**: 解码URL编码的数据
- **十六进制解码**: 解码十六进制编码的数据
- **自动解密**: 自动尝试多种解密方式
- **JSON格式化**: 自动格式化JSON输出

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用方法

### 命令行交互模式

```bash
python decrypt_callback.py
```

运行后会显示交互菜单，按提示选择相应的解密方式。

### 编程方式使用

```python
from decrypt_callback import CallbackDecryptor

# 创建解密器实例
decryptor = CallbackDecryptor()

# Base64解码
result = decryptor.base64_decode("SGVsbG8gV29ybGQ=")
print(result)  # Hello World

# AES解密
encrypted_data = "your_encrypted_data"
key = "your_secret_key"
result = decryptor.aes_decrypt(encrypted_data, key)
print(result)

# 微信支付AES-GCM解密
wechat_encrypted = "wechat_encrypted_data"
api_key = "your_wechat_api_key"  # 32字节
nonce = "your_nonce"  # 12字节
aad = "request_url"  # 附加认证数据
result = decryptor.aes_decrypt(wechat_encrypted, api_key, nonce, 'GCM', aad=aad)
print(result)

# 自动尝试多种解密方式
results = decryptor.auto_decrypt(encrypted_data, key)
for method, result in results.items():
    print(f"{method}: {result}")
```

## 支持的解密方式

### 1. Base64解码
- 适用于Base64编码的数据
- 无需密钥

### 2. AES解密
- 支持CBC、ECB和GCM模式
- 密钥长度：16、24或32字节
- CBC/ECB模式：可选IV参数
- GCM模式：需要Nonce（12字节）、可选Tag和AAD参数

### 3. DES解密
- 支持CBC和ECB模式
- 密钥长度：8字节
- 可选IV参数

### 4. URL解码
- 解码URL编码的字符串
- 无需密钥

### 5. 十六进制解码
- 解码十六进制编码的数据
- 无需密钥

### 6. 微信支付AES-GCM解密
- 专门针对微信支付回调数据解密
- 使用AES-256-GCM算法
- 需要API密钥（32字节）、Nonce（12字节）
- 支持AAD附加认证数据
- 自动处理Tag验证

## 注意事项

1. 使用AES/DES解密时，确保密钥和IV的正确性
2. 加密数据通常需要是Base64编码的字符串
3. 微信支付解密需要正确的API密钥、Nonce和AAD数据
4. GCM模式需要Tag进行完整性验证，如果数据中不包含Tag需要单独提供
5. 自动解密功能会尝试所有可能的解密方式，结果中包含成功和失败的尝试
6. 解密后的数据如果是JSON格式，会自动进行格式化

## 常见问题

**Q: 解密失败怎么办？**
A: 检查密钥、IV和加密模式是否正确，确认数据格式是否正确。

**Q: 支持其他加密算法吗？**
A: 目前支持AES（CBC/ECB/GCM）和DES，如需其他算法可以扩展代码。

**Q: 微信支付解密失败怎么办？**
A: 检查API密钥是否正确（32字节），Nonce是否匹配（12字节），AAD数据是否正确（通常是请求URL）。

**Q: 如何处理中文字符？**
A: 工具已支持UTF-8编码，可以正确处理中文字符。