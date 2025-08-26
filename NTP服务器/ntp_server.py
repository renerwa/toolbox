#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
NTP服务器实现
基于Python的简单NTP服务器，用于时间同步
"""

import socket
import struct
import time
import threading
import logging
import argparse
import os
import datetime
from ntp_config import NTPConfig, create_default_config_file

# 配置日志
logging.basicConfig(
    level=logging.DEBUG,  # 设置为DEBUG级别以显示更多信息
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('ntp_server')

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
    
    def __init__(self, version=NTP_VERSION, mode=MODE_SERVER, tx_timestamp=0):
        self.leap = 0  # 闰秒指示器
        self.version = version  # 版本号
        self.mode = mode  # 模式
        self.stratum = 1  # 层级，1表示主参考时钟
        self.poll = 10  # 轮询间隔，2^10 = 1024秒
        self.precision = 0  # 精度
        self.root_delay = 0  # 到主参考时钟的延迟
        self.root_dispersion = 0  # 主参考时钟的最大误差
        self.ref_id = 0  # 参考ID
        self.ref_timestamp = 0  # 参考时间戳
        self.orig_timestamp = 0  # 原始时间戳
        self.recv_timestamp = 0  # 接收时间戳
        self.tx_timestamp = tx_timestamp  # 发送时间戳
        
        logger.debug(f"创建NTP数据包: 版本={version}, 模式={mode}, 发送时间戳={tx_timestamp}")
    
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
            
            # 正确的NTP时间戳打包：高32位是秒，低32位是秒的小数部分
            ref_timestamp_int1 = int(self.ref_timestamp) & 0xFFFFFFFF
            ref_timestamp_int2 = int((self.ref_timestamp - int(self.ref_timestamp)) * 2**32) & 0xFFFFFFFF
            
            orig_timestamp_int1 = int(self.orig_timestamp) & 0xFFFFFFFF
            orig_timestamp_int2 = int((self.orig_timestamp - int(self.orig_timestamp)) * 2**32) & 0xFFFFFFFF
            
            recv_timestamp_int1 = int(self.recv_timestamp) & 0xFFFFFFFF
            recv_timestamp_int2 = int((self.recv_timestamp - int(self.recv_timestamp)) * 2**32) & 0xFFFFFFFF
            
            tx_timestamp_int1 = int(self.tx_timestamp) & 0xFFFFFFFF
            tx_timestamp_int2 = int((self.tx_timestamp - int(self.tx_timestamp)) * 2**32) & 0xFFFFFFFF
            
            logger.debug(f"打包时间戳: ref=({ref_timestamp_int1}, {ref_timestamp_int2}), orig=({orig_timestamp_int1}, {orig_timestamp_int2}), recv=({recv_timestamp_int1}, {recv_timestamp_int2}), tx=({tx_timestamp_int1}, {tx_timestamp_int2})")
            
            logger.debug(f"打包NTP数据包: LVM={leap_version_mode}, 层级={stratum}, 轮询={poll}, 精度={precision}")
            logger.debug(f"UNIX时间戳: ref={self.ref_timestamp}, orig={self.orig_timestamp}, recv={self.recv_timestamp}, tx={self.tx_timestamp}")
            
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
            
            logger.debug(f"打包成功，数据包长度: {len(packed)} 字节")
            return packed
            
        except Exception as e:
            logger.error(f"打包NTP数据包时出错: {e}")
            logger.exception("打包错误详情:")
            raise
    
    @classmethod
    def from_bytes(cls, data):
        """从字节串解析NTP数据包"""
        try:
            format_size = struct.calcsize(cls._FORMAT)
            logger.debug(f"解析NTP数据包: 数据长度={len(data)}, 格式大小={format_size}")
            
            if len(data) < format_size:
                logger.error(f"数据包长度不足: {len(data)} < {format_size}")
                raise ValueError(f"数据包长度不足: {len(data)} < {format_size}")
            
            unpacked = struct.unpack(cls._FORMAT, data[0:format_size])
            logger.debug(f"解包成功: {unpacked}")
            
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
            packet.ref_timestamp = float(unpacked[7]) / 2**32 + float(unpacked[8]) / 2**64
            packet.orig_timestamp = float(unpacked[9]) / 2**32 + float(unpacked[10]) / 2**64
            packet.recv_timestamp = float(unpacked[11]) / 2**32 + float(unpacked[12]) / 2**64
            packet.tx_timestamp = float(unpacked[13]) / 2**32 + float(unpacked[14]) / 2**64
            
            logger.debug(f"解析的NTP数据包: 版本={packet.version}, 模式={packet.mode}, 层级={packet.stratum}")
            logger.debug(f"时间戳: ref={packet.ref_timestamp}, orig={packet.orig_timestamp}, recv={packet.recv_timestamp}, tx={packet.tx_timestamp}")
            
            return packet
            
        except Exception as e:
            logger.error(f"解析NTP数据包时出错: {e}")
            logger.exception("解析错误详情:")
            raise


class NTPServer:
    """NTP服务器实现"""
    
    def __init__(self, host='0.0.0.0', port=NTP_PORT, config=None):
        self.host = host
        self.port = port
        self.sock = None
        self.running = False
        self.config = config or NTPConfig()
        
        # 如果命令行参数覆盖了配置文件中的设置，则更新配置
        if host != '0.0.0.0':
            self.config.set('server', 'host', host)
        if port != NTP_PORT:
            self.config.set('server', 'port', port)
            
        # 从配置中获取设置
        self.host = self.config.get('server', 'host')
        self.port = self.config.get('server', 'port')
        self.stratum = self.config.get('server', 'stratum')
    
    def start(self):
        """启动NTP服务器"""
        try:
            # 创建UDP套接字
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.bind((self.host, self.port))
            
            logger.info(f"NTP服务器已启动，监听 {self.host}:{self.port}")
            logger.debug(f"服务器配置: 层级={self.stratum}, 轮询间隔={self.config.get('advanced', 'poll_interval')}, 精度={self.config.get('advanced', 'precision')}")
            self.running = True
            
            # 启动处理线程
            self.server_thread = threading.Thread(target=self._serve)
            self.server_thread.daemon = True
            self.server_thread.start()
            
            # 主线程等待中断
            try:
                while self.running:
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info("接收到中断信号，正在关闭服务器...")
            finally:
                self.stop()
                
        except Exception as e:
            logger.error(f"启动服务器时出错: {e}")
            logger.exception("详细错误信息:")
            self.stop()
    
    def stop(self):
        """停止NTP服务器"""
        self.running = False
        if self.sock:
            self.sock.close()
            logger.info("NTP服务器已关闭")
    
    def _serve(self):
        """处理NTP请求的主循环"""
        logger.debug(f"服务器开始监听请求，地址: {self.host}:{self.port}")
        self.sock.settimeout(1)  # 设置超时，以便能够定期检查self.running
        
        while self.running:
            try:
                # 接收数据包
                logger.debug("等待接收数据包...")
                try:
                    data, addr = self.sock.recvfrom(1024)
                    logger.info(f"收到来自 {addr} 的NTP请求")
                    
                    # 处理请求并发送响应
                    threading.Thread(target=self._handle_request, args=(data, addr)).start()
                except socket.timeout:
                    # 超时只是为了检查self.running，不是错误
                    continue
                    
            except Exception as e:
                if self.running:  # 只在服务器运行时记录错误
                    logger.error(f"处理请求时出错: {e}")
                    logger.exception("详细错误信息:")
    
    def _handle_request(self, data, addr):
        """处理单个NTP请求"""
        try:
            logger.debug(f"开始处理来自 {addr} 的请求，数据长度: {len(data)} 字节")
            
            # 解析接收到的NTP数据包
            try:
                recv_packet = NTPPacket.from_bytes(data)
                logger.debug(f"解析的NTP数据包: 版本={recv_packet.version}, 模式={recv_packet.mode}, 发送时间戳={recv_packet.tx_timestamp}")
            except Exception as parse_error:
                logger.error(f"解析NTP数据包时出错: {parse_error}")
                logger.exception("解析错误详情:")
                return
            
            # 当前时间（UNIX时间戳）
            current_time = time.time()
            
            # 设置接收和发送时间戳（NTP格式）
            recv_time = current_time  # 使用UNIX时间戳
            tx_time = current_time    # 使用UNIX时间戳
            
            logger.debug(f"当前UNIX时间: {current_time}")
            logger.debug(f"接收UNIX时间: {recv_time}, 发送UNIX时间: {tx_time}")
            logger.debug(f"当前本地时间: {datetime.datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S.%f')}")
            
            # 创建响应数据包
            resp_packet = NTPPacket(mode=MODE_SERVER, version=recv_packet.version)
            resp_packet.stratum = self.stratum
            resp_packet.ref_timestamp = current_time  # 参考时间戳（UNIX格式）
            resp_packet.orig_timestamp = recv_packet.tx_timestamp  # 客户端的发送时间戳
            resp_packet.recv_timestamp = recv_time  # 服务器接收时间戳（UNIX格式）
            resp_packet.tx_timestamp = tx_time  # 服务器发送时间戳（UNIX格式）
            
            # 设置高级参数（如果在配置中指定）
            if self.config:
                resp_packet.poll = self.config.get('advanced', 'poll_interval')
                resp_packet.precision = self.config.get('advanced', 'precision')
                
                # 设置参考时钟ID
                ref_clock = self.config.get('advanced', 'reference_clock')
                if ref_clock == 'LOCL':
                    resp_packet.ref_id = 0x4C4F434C  # 'LOCL'的ASCII码
            
            logger.debug(f"响应数据包: 层级={resp_packet.stratum}, 原始时间戳={resp_packet.orig_timestamp}, 接收时间戳={resp_packet.recv_timestamp}, 发送时间戳={resp_packet.tx_timestamp}")
            
            # 计算并记录预期的客户端时间偏移和延迟
            # 客户端将使用以下公式计算偏移：
            # offset = ((t2 - t1) + (t3 - t4)) / 2
            # 其中：t1=orig_timestamp, t2=recv_timestamp, t3=tx_timestamp, t4=客户端接收时间
            # 由于我们不知道t4，这里只是估算
            t4_estimate = current_time + 0.001  # 估计客户端接收时间（当前时间+1毫秒）
            expected_offset = ((resp_packet.recv_timestamp - resp_packet.orig_timestamp) + 
                             (resp_packet.tx_timestamp - t4_estimate)) / 2
            
            # 客户端将使用以下公式计算延迟：
            # delay = (t4 - t1) - (t3 - t2)
            expected_delay = ((t4_estimate - resp_packet.orig_timestamp) - 
                           (resp_packet.tx_timestamp - resp_packet.recv_timestamp))
            
            logger.debug(f"预期的客户端时间偏移: {expected_offset:.6f} 秒")
            logger.debug(f"预期的客户端往返延迟: {expected_delay:.6f} 秒")
            logger.debug(f"客户端应该计算的服务器UNIX时间: {tx_time}")
            
            # 延时30秒再发送响应
            # logger.info(f"延时40秒后再向 {addr} 发送响应...")
            # time.sleep(40)
            
            # 发送响应
            try:
                response_bytes = resp_packet.to_bytes()
                logger.debug(f"响应数据包长度: {len(response_bytes)} 字节")
                self.sock.sendto(response_bytes, addr)
                logger.info(f"已向 {addr} 发送NTP响应")
            except Exception as send_error:
                logger.error(f"发送响应时出错: {send_error}")
                logger.exception("发送错误详情:")
                return
            
        except Exception as e:
            logger.error(f"处理请求时出错: {e}")
            logger.exception("处理错误详情:")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='Python NTP服务器')
    parser.add_argument('-H', '--host', default='0.0.0.0', help='监听主机 (默认: 0.0.0.0)')
    parser.add_argument('-p', '--port', type=int, default=NTP_PORT, help=f'监听端口 (默认: {NTP_PORT})')
    parser.add_argument('-v', '--verbose', action='store_true', help='启用详细日志')
    parser.add_argument('-c', '--config', help='配置文件路径')
    parser.add_argument('--create-config', help='创建默认配置文件并退出')
    
    args = parser.parse_args()
    
    # 创建默认配置文件
    if args.create_config:
        if create_default_config_file(args.create_config):
            print(f"已创建默认配置文件: {args.create_config}")
        else:
            print(f"创建默认配置文件失败")
        return
    
    # 加载配置
    config = None
    if args.config:
        if not os.path.exists(args.config):
            print(f"错误: 配置文件 {args.config} 不存在")
            return
        config = NTPConfig(args.config)
    
    # 设置日志
    log_level = logging.DEBUG if args.verbose else logging.INFO
    log_format = config.get('logging', 'format') if config else '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    log_file = config.get('logging', 'file') if config else None
    
    if log_file:
        logging.basicConfig(level=log_level, format=log_format, filename=log_file)
    else:
        logging.basicConfig(level=log_level, format=log_format)
    
    # 启动服务器
    server = NTPServer(host=args.host, port=args.port, config=config)
    server.start()


if __name__ == '__main__':
    main()