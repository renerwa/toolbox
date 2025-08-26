@echo off
echo 正在启动NTP服务器...

REM 检查Python是否安装
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo 错误: 未找到Python。请确保Python已安装并添加到PATH环境变量中。
    pause
    exit /b 1
)

REM 启动NTP服务器
echo.
echo 按Ctrl+C可以停止服务器
echo.
python ntp_server.py %*

pause