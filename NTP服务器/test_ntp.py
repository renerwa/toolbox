#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
NTP服务器测试脚本
用于测试NTP服务器和客户端功能
"""

import subprocess
import time
import sys
import os
import signal
import argparse

# 默认设置
DEFAULT_PORT = 12300  # 使用非标准端口进行测试，避免需要管理员权限


def run_server(port=DEFAULT_PORT, verbose=False):
    """启动NTP服务器进程"""
    cmd = [sys.executable, 'ntp_server.py', '-p', str(port)]
    if verbose:
        cmd.append('-v')
    
    print(f"启动NTP服务器: {' '.join(cmd)}")
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def run_client(host='localhost', port=DEFAULT_PORT, verbose=False):
    """运行NTP客户端并获取结果"""
    cmd = [sys.executable, 'ntp_client.py', host, '-p', str(port)]
    print(f"运行NTP客户端: {' '.join(cmd)}")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"客户端返回错误代码: {result.returncode}")
        print(f"标准输出: {result.stdout}")
        print(f"错误输出: {result.stderr}")
    return result.returncode, result.stdout, result.stderr


def test_ntp_server(port=DEFAULT_PORT, verbose=False):
    """测试NTP服务器功能"""
    print("\n=== 开始NTP服务器测试 ===")
    
    # 启动服务器
    server_process = run_server(port, verbose)
    
    try:
        # 等待服务器启动
        print("等待服务器启动...")
        time.sleep(2)
        
        # 运行客户端测试
        print("\n测试1: 本地连接测试")
        returncode, stdout, stderr = run_client('localhost', port, verbose)
        
        if returncode == 0:
            print("✓ 本地连接测试成功")
            if verbose:
                print("\n输出:")
                print(stdout)
        else:
            print("✗ 本地连接测试失败")
            print("\n错误输出:")
            print(stderr)
            return False
        
        # 测试IP地址连接
        print("\n测试2: IP地址连接测试")
        returncode, stdout, stderr = run_client('127.0.0.1', port, verbose)
        
        if returncode == 0:
            print("✓ IP地址连接测试成功")
            if verbose:
                print("\n输出:")
                print(stdout)
        else:
            print("✗ IP地址连接测试失败")
            print("\n错误输出:")
            print(stderr)
            return False
        
        print("\n所有测试通过！")
        return True
        
    finally:
        # 终止服务器进程
        print("\n正在关闭NTP服务器...")
        if sys.platform == 'win32':
            server_process.terminate()
        else:
            os.kill(server_process.pid, signal.SIGTERM)
        
        server_process.wait(timeout=5)
        print("NTP服务器已关闭")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='NTP服务器测试脚本')
    parser.add_argument('-p', '--port', type=int, default=DEFAULT_PORT, 
                        help=f'测试用端口 (默认: {DEFAULT_PORT})')
    parser.add_argument('-v', '--verbose', action='store_true', 
                        help='启用详细输出')
    
    args = parser.parse_args()
    
    # 运行测试
    success = test_ntp_server(args.port, args.verbose)
    
    # 返回适当的退出码
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()