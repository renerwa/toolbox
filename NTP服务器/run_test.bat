@echo off
echo 正在运行NTP服务器测试...

REM 检查Python是否安装
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo 错误: 未找到Python。请确保Python已安装并添加到PATH环境变量中。
    pause
    exit /b 1
)

REM 运行测试脚本
python test_ntp.py %*

echo.
if %ERRORLEVEL% equ 0 (
    echo 测试成功完成！
) else (
    echo 测试失败，请检查错误信息。
)

pause