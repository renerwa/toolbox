@echo off
setlocal enabledelayedexpansion
echo NTP客户端

REM 检查Python是否安装
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo 错误: 未找到Python。请确保Python已安装并添加到PATH环境变量中。
    pause
    exit /b 1
)

REM 检查是否提供了服务器地址
if "%~1"=="" (
    echo 用法: %~nx0 [服务器地址] [选项]
    echo 示例: %~nx0 localhost
    echo 示例: %~nx0 time.windows.com
    echo.
    set /p SERVER_ADDR=请输入NTP服务器地址: 
) else (
    set SERVER_ADDR=%~1
)

REM 移除第一个参数（服务器地址）
set ARGS=
if not "%~2"=="" (
    set ARGS=%*
    set ARGS=!ARGS:%~1=!
)

REM 运行NTP客户端
python ntp_client.py %SERVER_ADDR% %ARGS%

pause