#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
NTP服务器配置文件
包含NTP服务器的默认配置选项
"""

import os
import json
import logging

# 默认配置
DEFAULT_CONFIG = {
    # 服务器设置
    "server": {
        "host": "0.0.0.0",  # 监听所有网络接口
        "port": 123,  # 标准NTP端口
        "stratum": 1,  # 时钟层级（1表示主参考时钟）
    },
    
    # 日志设置
    "logging": {
        "level": "INFO",  # 日志级别: DEBUG, INFO, WARNING, ERROR, CRITICAL
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        "file": None,  # 日志文件路径，None表示仅输出到控制台
    },
    
    # 高级设置
    "advanced": {
        "poll_interval": 1024,  # 轮询间隔（秒）
        "precision": -18,  # 系统时钟精度（以2的幂表示，-18表示约1微秒）
        "reference_clock": "LOCL",  # 参考时钟标识符
    }
}


class NTPConfig:
    """NTP服务器配置管理类"""
    
    def __init__(self, config_file=None):
        """初始化配置"""
        self.config = DEFAULT_CONFIG.copy()
        self.config_file = config_file
        
        # 如果指定了配置文件，则加载它
        if config_file and os.path.exists(config_file):
            self.load_config()
    
    def load_config(self):
        """从文件加载配置"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                
                # 递归更新配置
                self._update_config(self.config, user_config)
                
            logging.info(f"已从 {self.config_file} 加载配置")
        except Exception as e:
            logging.error(f"加载配置文件时出错: {e}")
    
    def save_config(self, config_file=None):
        """保存配置到文件"""
        if config_file:
            self.config_file = config_file
            
        if not self.config_file:
            logging.error("未指定配置文件路径")
            return False
            
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=4, ensure_ascii=False)
                
            logging.info(f"配置已保存到 {self.config_file}")
            return True
        except Exception as e:
            logging.error(f"保存配置文件时出错: {e}")
            return False
    
    def get(self, section, key=None):
        """获取配置项"""
        if key is None:
            return self.config.get(section, {})
        
        return self.config.get(section, {}).get(key)
    
    def set(self, section, key, value):
        """设置配置项"""
        if section not in self.config:
            self.config[section] = {}
            
        self.config[section][key] = value
    
    def _update_config(self, target, source):
        """递归更新配置字典"""
        for key, value in source.items():
            if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                self._update_config(target[key], value)
            else:
                target[key] = value


# 创建默认配置实例
config = NTPConfig()


def create_default_config_file(file_path):
    """创建默认配置文件"""
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        
        # 创建配置对象并保存
        conf = NTPConfig()
        conf.save_config(file_path)
        
        return True
    except Exception as e:
        logging.error(f"创建默认配置文件时出错: {e}")
        return False


if __name__ == "__main__":
    # 设置日志
    logging.basicConfig(level=logging.INFO, 
                        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # 示例：创建默认配置文件
    import sys
    
    if len(sys.argv) > 1:
        config_path = sys.argv[1]
    else:
        config_path = "ntp_config.json"
    
    if create_default_config_file(config_path):
        print(f"已创建默认配置文件: {config_path}")
    else:
        print(f"创建默认配置文件失败")