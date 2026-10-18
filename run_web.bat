@echo off
setlocal
cd /d "%~dp0"
echo.
echo ===== Nexus Store + MySQL/XAMPP =====
echo Abra a loja em http://localhost:8081
echo No celular, use o IP deste computador na mesma rede Wi-Fi:
ipconfig | findstr /i "IPv4"
echo Deixe o MySQL do XAMPP iniciado antes de usar a loja.
echo Pressione Ctrl+C para encerrar.
echo.

set "NEXUS_WEB_HOST=0.0.0.0"
set "NEXUS_WEB_PORT=8081"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" app.py
) else (
    py -3 app.py
)

endlocal
