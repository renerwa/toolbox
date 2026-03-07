#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
NTP客户端示例
用于测试NTP服务器的简单客户端
"""

import socket
import struct
import time
import datetime
import argparse
import sys
import os

# NTP相关常量
NTP_PORT = 123  # NTP标准端口
NTP_VERSION = 4  # NTP版本
MODE_CLIENT = 3  # 客户端模式
MODE_SERVER = 4  # 服务器模式

# 1970年到1900年的秒数差异
# NTP使用1900年作为纪元，而UNIX使用1970年
TIME_1970 = 2208988800  # 1970-1900，单位为秒


class NTPPacket:
    """NTP数据包格式处理类"""
    
    _FORMAT = "!B B B B 11I"
    
    def __init__(self, version=NTP_VERSION, mode=MODE_CLIENT, tx_timestamp=0):
        self.leap = 0  # 闰秒指示器
        self.version = version  # 版本号
        self.mode = mode  # 模式
        self.stratum = 0  # 层级
        self.poll = 0  # 轮询间隔
        self.precision = 0  # 精度
        self.root_delay = 0  # 到主参考时钟的延迟
        self.root_dispersion = 0  # 主参考时钟的最大误差
        self.ref_id = 0  # 参考ID
        self.ref_timestamp = 0  # 参考时间戳
        self.orig_timestamp = 0  # 原始时间戳
        self.recv_timestamp = 0  # 接收时间戳
        self.tx_timestamp = tx_timestamp  # 发送时间戳
        
        print(f"创建NTP客户端数据包: 版本={version}, 模式={mode}, 发送时间戳={tx_timestamp}")
    
    def to_bytes(self):
        """将NTP数据包转换为字节串"""
        try:
            # 确保所有值在有效范围内
            leap_version_mode = ((self.leap & 0x3) << 6) | ((self.version & 0x7) << 3) | (self.mode & 0x7)
            leap_version_mode = leap_version_mode & 0xFF  # 确保在0-255范围内
            
            # 确保stratum, poll和precision在有效范围内
            stratum = self.stratum & 0xFF  # 确保在0-255范围内
            poll = self.poll & 0xFF  # 确保在0-255范围内
            precision = self.precision & 0xFF if self.precision >= 0 else (self.precision & 0x7F) | 0x80
            
            # 确保所有整数值在有效范围内
            root_delay_int = int(self.root_delay * 2**16) & 0xFFFFFFFF
            root_dispersion_int = int(self.root_dispersion * 2**16) & 0xFFFFFFFF
            ref_id_int = self.ref_id & 0xFFFFFFFF
            
            ref_timestamp_int1 = int(self.ref_timestamp * 2**32) & 0xFFFFFFFF
            ref_timestamp_int2 = int(self.ref_timestamp * 2**32 % 2**32) & 0xFFFFFFFF
            
            orig_timestamp_int1 = int(self.orig_timestamp * 2**32) & 0xFFFFFFFF
            orig_timestamp_int2 = int(self.orig_timestamp * 2**32 % 2**32) & 0xFFFFFFFF
            
            recv_timestamp_int1 = int(self.recv_timestamp * 2**32) & 0xFFFFFFFF
            recv_timestamp_int2 = int(self.recv_timestamp * 2**32 % 2**32) & 0xFFFFFFFF
            
            tx_timestamp_int1 = int(self.tx_timestamp * 2**32) & 0xFFFFFFFF
            tx_timestamp_int2 = int(self.tx_timestamp * 2**32 % 2**32) & 0xFFFFFFFF
            
            print(f"打包NTP客户端数据包: LVM={leap_version_mode}, 层级={stratum}, 轮询={poll}, 精度={precision}")
            
            packed = struct.pack(
                self._FORMAT,
                leap_version_mode,
                stratum,
                poll,
                precision,
                root_delay_int,
                root_dispersion_int,
                ref_id_int,
                ref_timestamp_int1,
                ref_timestamp_int2,
                orig_timestamp_int1,
                orig_timestamp_int2,
                recv_timestamp_int1,
                recv_timestamp_int2,
                tx_timestamp_int1,
                tx_timestamp_int2
            )
            
            print(f"客户端数据包打包成功，长度: {len(packed)} 字节")
            return packed
            
        except Exception as e:
            print(f"打包NTP客户端数据包时出错: {e}")
            import traceback
            print(traceback.format_exc())
            raise
    
    @classmethod
    def from_bytes(cls, data):
        """从字节串解析NTP数据包"""
        try:
            format_size = struct.calcsize(cls._FORMAT)
            print(f"解析NTP服务器响应: 数据长度={len(data)}, 格式大小={format_size}")
            
            if len(data) < format_size:
                print(f"服务器响应数据包长度不足: {len(data)} < {format_size}")
                raise ValueError(f"数据包长度不足: {len(data)} < {format_size}")
            
            unpacked = struct.unpack(cls._FORMAT, data[0:format_size])
            
            packet = cls()
            packet.leap = unpacked[0] >> 6 & 0x3
            packet.version = unpacked[0] >> 3 & 0x7
            packet.mode = unpacked[0] & 0x7
            packet.stratum = unpacked[1]
            packet.poll = unpacked[2]
            packet.precision = unpacked[3]
            packet.root_delay = float(unpacked[4]) / 2**16
            packet.root_dispersion = float(unpacked[5]) / 2**16
            packet.ref_id = unpacked[6]
            # 正确的NTP时间戳解析：高32位是秒，低32位是秒的小数部分
            packet.ref_timestamp = float(unpacked[7]) + float(unpacked[8]) / 2**32
            packet.orig_timestamp = float(unpacked[9]) + float(unpacked[10]) / 2**32
            packet.recv_timestamp = float(unpacked[11]) + float(unpacked[12]) / 2**32
            packet.tx_timestamp = float(unpacked[13]) + float(unpacked[14]) / 2**32
            
            print(f"解析的时间戳: ref={packet.ref_timestamp}, orig={packet.orig_timestamp}, recv={packet.recv_timestamp}, tx={packet.tx_timestamp}")
            
            print(f"解析的NTP服务器响应: 版本={packet.version}, 模式={packet.mode}, 层级={packet.stratum}")
            
            return packet
            
        except Exception as e:
            print(f"解析NTP服务器响应时出错: {e}")
            import traceback
            print(traceback.format_exc())
            raise


def get_ntp_time(host, port=NTP_PORT, timeout=5):
    """从NTP服务器获取时间"""
    # 创建客户端套接字
    client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    client.settimeout(timeout)
    
    try:
        print(f"连接到NTP服务器: {host}:{port}, 超时设置: {timeout}秒")
        
        # 当前时间（UNIX时间戳）
        tx_time = time.time() + TIME_1970  # 转换为NTP时间戳
        print(f"当前本地时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')}")
        print(f"发送时间戳(NTP格式): {tx_time}")
        
        # 创建NTP请求数据包
        request = NTPPacket(mode=MODE_CLIENT, version=NTP_VERSION, tx_timestamp=tx_time)
        
        # 发送请求
        request_bytes = request.to_bytes()
        print(f"发送NTP请求到 {host}:{port}, 数据包大小: {len(request_bytes)} 字节")
        client.sendto(request_bytes, (host, port))
        
        # 接收响应
        print("等待服务器响应...")
        data, address = client.recvfrom(1024)
        print(f"收到来自 {address} 的响应, 数据包大小: {len(data)} 字节")
        
        # 接收时间（用于计算往返延迟）
        rx_time = time.time() + TIME_1970
        print(f"接收时间戳(NTP格式): {rx_time}")
        
        # 解析响应数据包
        response = NTPPacket.from_bytes(data)
        
        # 检查服务器时间戳是否有效
        if response.tx_timestamp <= 0:
            print(f"错误: 服务器返回的发送时间戳无效: {response.tx_timestamp}")
            return None
        
        # 计算时间偏移和往返延迟
        # 时间偏移 = ((接收时间戳 - 原始时间戳) + (发送时间戳 - 目的地时间戳)) / 2
        offset = ((response.recv_timestamp - response.orig_timestamp) + 
                 (response.tx_timestamp - rx_time)) / 2
        
        # 往返延迟 = (目的地时间戳 - 原始时间戳) - (发送时间戳 - 接收时间戳)
        delay = (rx_time - response.orig_timestamp) - (response.tx_timestamp - response.recv_timestamp)
        
        print(f"计算的时间偏移: {offset:.6f} 秒")
        print(f"计算的往返延迟: {delay:.6f} 秒")
        
        # 检查服务器时间戳是否是NTP格式（大于TIME_1970）或UNIX格式
        if response.tx_timestamp > TIME_1970:
            # 如果大于TIME_1970，则是NTP格式，需要转换为UNIX时间戳
            server_time = response.tx_timestamp - TIME_1970
            print(f"服务器时间(NTP格式转UNIX): {server_time}")
        else:
            # 如果小于TIME_1970，可能服务器直接发送了UNIX时间戳
            server_time = response.tx_timestamp
            print(f"服务器时间(UNIX格式): {server_time}")
        
        # 确保服务器时间是有效的（大于1970年）
        if server_time < 0:
            print(f"警告: 服务器时间戳无效（小于1970年）: {server_time}")
            # 使用当前时间作为备用
            server_time = time.time()
            print(f"使用本地时间作为备用: {server_time}")
        
        # 格式化服务器时间
        try:
            server_time_str = datetime.datetime.fromtimestamp(server_time).strftime('%Y-%m-%d %H:%M:%S.%f')
        except (ValueError, OSError) as e:
            print(f"警告: 无法格式化服务器时间: {e}")
            server_time_str = "无效时间格式"
        
        return {
            'offset': offset,
            'delay': delay,
            'tx_time': response.tx_timestamp,
            'server_time': server_time,
            'server_time_str': server_time_str,
            'stratum': response.stratum
        }
        
    except socket.timeout:
        print(f"错误: 连接到 {host}:{port} 超时")
        return None
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        print("详细错误信息:")
        print(traceback.format_exc())
        return None
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description='NTP客户端')
    parser.add_argument('-H', '--host', default='localhost', 
                        help='NTP服务器地址 (默认: localhost)')
    parser.add_argument('-p', '--port', type=int, default=NTP_PORT, 
                        help='NTP服务器端口 (默认: 123)')
    parser.add_argument('-t', '--timeout', type=int, default=5, 
                        help='连接超时时间（秒）(默认: 5)')
    parser.add_argument('-v', '--verbose', action='store_true', 
                        help='显示详细的连接和处理信息')
    
    args = parser.parse_args()
    
    print(f"\n=== NTP客户端 ===")
    print(f"目标服务器: {args.host}:{args.port}")
    print(f"超时设置: {args.timeout}秒")
    print(f"本地时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')}")
    print("正在连接服务器...\n")
    
    # 根据verbose参数决定是否显示详细日志
    if not args.verbose:
        # 临时重定向标准输出以隐藏详细日志
        original_stdout = sys.stdout
        sys.stdout = open(os.devnull, 'w')
    
    try:
        result = get_ntp_time(args.host, args.port, args.timeout)
    finally:
        # 如果重定向了输出，恢复标准输出
        if not args.verbose:
            sys.stdout.close()
            sys.stdout = original_stdout
    
    if result:
        print("\n=== 连接成功 ===")
        print("NTP服务器信息:")
        print(f"层级 (Stratum): {result['stratum']}")
        print(f"时间偏移 (Offset): {result['offset']:.6f} 秒")
        print(f"往返延迟 (Delay): {result['delay']:.6f} 秒")
        print(f"\n服务器时间: {result['server_time_str']}")
        print(f"本地时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')}")
        return 0
    else:
        print("\n=== 连接失败 ===")
        sys.exit(1)


if __name__ == '__main__':
    main()