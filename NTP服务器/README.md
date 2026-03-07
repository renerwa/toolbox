# Python NTP 服务器

这是一个使用Python实现的简单NTP（网络时间协议）服务器，可用于时间同步。项目包含一个NTP服务器和一个测试用的NTP客户端。

## 功能特点

- 完整实现NTP协议基本功能
- 支持标准NTP客户端请求
- 提供简单的命令行接口
- 包含测试用客户端

## 系统要求

- Python 3.6+
- 标准库依赖（无需额外安装第三方库）

## 使用方法

### 启动NTP服务器

```bash
python ntp_server.py [选项]
```

选项：
- `-H, --host HOST`: 指定监听的主机地址（默认：0.0.0.0，监听所有网络接口）
- `-p, --port PORT`: 指定监听的端口（默认：123，标准NTP端口）
- `-v, --verbose`: 启用详细日志输出

### 使用NTP客户端测试

```bash
python ntp_client.py [选项] 服务器地址
```

选项：
- `-p, --port PORT`: 指定NTP服务器端口（默认：123）
- `-t, --timeout SECONDS`: 指定连接超时时间（默认：5秒）

示例：
```bash
# 测试本地NTP服务器
python ntp_client.py localhost

# 测试指定IP和端口的NTP服务器
python ntp_client.py 192.168.1.100 -p 123
```

## 技术说明

### NTP协议

NTP（网络时间协议）是一种用于在计算机系统之间同步时钟的网络协议。本实现支持NTP版本4的基本功能，包括：

- 标准NTP数据包格式处理
- 时间戳转换（NTP时间戳与UNIX时间戳）
- 基本的服务器响应机制

### 代码结构

- `ntp_server.py`: NTP服务器实现
- `ntp_client.py`: NTP客户端实现（用于测试）

## 注意事项

- 默认使用UDP端口123，这是NTP的标准端口，在某些系统上可能需要管理员/root权限才能绑定
- 本实现主要用于学习和测试目的，生产环境建议使用成熟的NTP服务器软件（如ntpd）

## 许可证

MIT