#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
商家券回调信息解密工具
支持多种解密方式：AES、DES、Base64等
"""

import base64
import json
import hashlib
from Crypto.Cipher import AES, DES
from Crypto.Util.Padding import unpad
from Crypto.Protocol.KDF import PBKDF2
import binascii


class CallbackDecryptor:
    """商家券回调信息解密器"""
    
    def __init__(self):
        self.supported_methods = ['aes', 'des', 'base64', 'url_decode']
    
    def base64_decode(self, encrypted_data):
        """Base64解码"""
        try:
            decoded = base64.b64decode(encrypted_data)
            return decoded.decode('utf-8')
        except Exception as e:
            return f"Base64解码失败: {str(e)}"
    
    def aes_decrypt(self, encrypted_data, key, iv=None, mode='CBC', tag=None, aad=None):
        """AES解密"""
        try:
            # 如果是base64编码的数据，先解码
            if isinstance(encrypted_data, str):
                encrypted_data = base64.b64decode(encrypted_data)
            
            # 确保key长度正确
            if len(key) not in [16, 24, 32]:
                key = hashlib.md5(key.encode()).digest()  # 16字节
            elif isinstance(key, str):
                key = key.encode('utf-8')
            
            if mode.upper() == 'CBC':
                if iv is None:
                    iv = b'\x00' * 16  # 默认IV
                elif isinstance(iv, str):
                    iv = iv.encode('utf-8')[:16]
                
                cipher = AES.new(key, AES.MODE_CBC, iv)
                decrypted = cipher.decrypt(encrypted_data)
                # 去除PKCS7填充
                decrypted = unpad(decrypted, AES.block_size)
                
            elif mode.upper() == 'ECB':
                cipher = AES.new(key, AES.MODE_ECB)
                decrypted = cipher.decrypt(encrypted_data)
                # 去除PKCS7填充
                decrypted = unpad(decrypted, AES.block_size)
                
            elif mode.upper() == 'GCM':
                if iv is None:
                    iv = b'\x00' * 12  # GCM默认使用12字节nonce
                elif isinstance(iv, str):
                    iv = iv.encode('utf-8')[:12]
                
                cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
                
                # 如果有附加认证数据
                if aad:
                    if isinstance(aad, str):
                        aad = aad.encode('utf-8')
                    cipher.update(aad)
                
                # GCM模式需要tag进行验证
                if tag:
                    if isinstance(tag, str):
                        tag = base64.b64decode(tag)
                    decrypted = cipher.decrypt_and_verify(encrypted_data, tag)
                else:
                    # 如果没有提供tag，尝试从数据末尾提取（假设tag在最后16字节）
                    if len(encrypted_data) > 16:
                        ciphertext = encrypted_data[:-16]
                        tag = encrypted_data[-16:]
                        decrypted = cipher.decrypt_and_verify(ciphertext, tag)
                    else:
                        return "GCM模式需要提供tag或数据长度不足"
            else:
                return "不支持的AES模式"
            
            return decrypted.decode('utf-8')
            
        except Exception as e:
            return f"AES解密失败: {str(e)}"
    
    def des_decrypt(self, encrypted_data, key, iv=None, mode='CBC'):
        """DES解密"""
        try:
            if isinstance(encrypted_data, str):
                encrypted_data = base64.b64decode(encrypted_data)
            
            # DES密钥必须是8字节
            if isinstance(key, str):
                key = key.encode('utf-8')[:8].ljust(8, b'\x00')
            
            if mode.upper() == 'CBC':
                if iv is None:
                    iv = b'\x00' * 8
                elif isinstance(iv, str):
                    iv = iv.encode('utf-8')[:8]
                
                cipher = DES.new(key, DES.MODE_CBC, iv)
            elif mode.upper() == 'ECB':
                cipher = DES.new(key, DES.MODE_ECB)
            else:
                return "不支持的DES模式"
            
            decrypted = cipher.decrypt(encrypted_data)
            decrypted = unpad(decrypted, DES.block_size)
            return decrypted.decode('utf-8')
            
        except Exception as e:
            return f"DES解密失败: {str(e)}"
    
    def url_decode(self, encoded_data):
        """URL解码"""
        try:
            import urllib.parse
            return urllib.parse.unquote(encoded_data)
        except Exception as e:
            return f"URL解码失败: {str(e)}"
    
    def hex_decode(self, hex_data):
        """十六进制解码"""
        try:
            decoded = binascii.unhexlify(hex_data)
            return decoded.decode('utf-8')
        except Exception as e:
            return f"十六进制解码失败: {str(e)}"
    
    def auto_decrypt(self, encrypted_data, key=None, iv=None, tag=None, aad=None):
        """自动尝试多种解密方式"""
        results = {}
        
        # 尝试Base64解码
        results['base64'] = self.base64_decode(encrypted_data)
        
        # 尝试URL解码
        results['url_decode'] = self.url_decode(encrypted_data)
        
        # 尝试十六进制解码
        results['hex_decode'] = self.hex_decode(encrypted_data)
        
        if key:
            # 尝试AES解密
            results['aes_cbc'] = self.aes_decrypt(encrypted_data, key, iv, mode='CBC')
            results['aes_ecb'] = self.aes_decrypt(encrypted_data, key, mode='ECB')
            results['aes_gcm'] = self.aes_decrypt(encrypted_data, key, iv, mode='GCM', tag=tag, aad=aad)
            
            # 尝试DES解密
            results['des_cbc'] = self.des_decrypt(encrypted_data, key, iv, mode='CBC')
            results['des_ecb'] = self.des_decrypt(encrypted_data, key, mode='ECB')
        
        return results
    
    def format_json(self, data):
        """格式化JSON数据"""
        try:
            if isinstance(data, str):
                parsed = json.loads(data)
                return json.dumps(parsed, ensure_ascii=False, indent=2)
            return json.dumps(data, ensure_ascii=False, indent=2)
        except:
            return data


def main():
    """主函数 - 命令行交互"""
    decryptor = CallbackDecryptor()
    
    print("=" * 50)
    print("商家券回调信息解密工具")
    print("=" * 50)
    
    while True:
        print("\n请选择操作:")
        print("1. Base64解码")
        print("2. AES解密")
        print("3. DES解密")
        print("4. URL解码")
        print("5. 十六进制解码")
        print("6. 微信支付AES-GCM解密")
        print("7. 自动尝试解密")
        print("0. 退出")
        
        choice = input("\n请输入选择 (0-7): ").strip()
        
        if choice == '0':
            print("再见!")
            break
        
        if choice not in ['1', '2', '3', '4', '5', '6', '7']:
            print("无效选择，请重新输入")
            continue
        
        encrypted_data = input("\n请输入要解密的数据: ").strip()
        if not encrypted_data:
            print("数据不能为空")
            continue
        
        if choice == '1':
            result = decryptor.base64_decode(encrypted_data)
            print(f"\nBase64解码结果:\n{result}")
            
        elif choice == '2':
            key = input("请输入AES密钥: ").strip()
            iv = input("请输入IV/Nonce (可选，回车跳过): ").strip() or None
            mode = input("请输入模式 (CBC/ECB/GCM，默认CBC): ").strip() or 'CBC'
            
            if mode.upper() == 'GCM':
                tag = input("请输入Tag (GCM模式必需，可选回车跳过): ").strip() or None
                aad = input("请输入associated_data附加认证数据 (可选，回车跳过): ").strip() or None
                result = decryptor.aes_decrypt(encrypted_data, key, iv, mode, tag, aad)
            else:
                result = decryptor.aes_decrypt(encrypted_data, key, iv, mode)
            print(f"\nAES解密结果:\n{result}")
            
        elif choice == '3':
            key = input("请输入DES密钥: ").strip()
            iv = input("请输入IV (可选，回车跳过): ").strip() or None
            mode = input("请输入模式 (CBC/ECB，默认CBC): ").strip() or 'CBC'
            result = decryptor.des_decrypt(encrypted_data, key, iv, mode)
            print(f"\nDES解密结果:\n{result}")
            
        elif choice == '4':
            result = decryptor.url_decode(encrypted_data)
            print(f"\nURL解码结果:\n{result}")
            
        elif choice == '5':
            result = decryptor.hex_decode(encrypted_data)
            print(f"\n十六进制解码结果:\n{result}")
            
        elif choice == '6':
            print("\n微信支付AES-256-GCM解密")
            key = input("请输入API密钥 (对应商户或者服务商的APIV3 密钥，32字节): ").strip()
            nonce = input("请输入Nonce (12字节): ").strip()
            aad = input("请输入associated_data附加认证数据 (通常是 coupon ): ").strip() or None
            tag = input("请输入Tag (可选，如果数据中不包含): ").strip() or None
            
            result = decryptor.aes_decrypt(encrypted_data, key, nonce, 'GCM', tag, aad)
            print(f"\n微信支付解密结果:\n{result}")
            
        elif choice == '7':
            key = input("请输入密钥 (可选，用于AES/DES解密): ").strip() or None
            iv = input("请输入IV/Nonce (可选): ").strip() or None
            tag = input("请输入Tag (GCM模式可选): ").strip() or None
            aad = input("请输入AAD (GCM模式可选): ").strip() or None
            
            results = decryptor.auto_decrypt(encrypted_data, key, iv, tag, aad)
            print("\n自动解密结果:")
            for method, result in results.items():
                print(f"\n{method.upper()}:")
                if result and not result.startswith(method.split('_')[0] + '解密失败'):
                    formatted = decryptor.format_json(result)
                    print(formatted)
                else:
                    print(result)
        
        # 询问是否继续
        continue_choice = input("\n是否继续? (y/n): ").strip().lower()
        if continue_choice not in ['y', 'yes', '是']:
            break


if __name__ == "__main__":
    main()