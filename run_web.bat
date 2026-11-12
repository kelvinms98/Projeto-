@echo off
setlocal
cd /d "%~dp0"

set "NEXUS_WEB_HOST=0.0.0.0"
set "NEXUS_WEB_PORT=8081"

echo.
echo ===== NEXUS Store - Node.js + SQLite =====
echo Abra a loja em http://localhost:8081
echo No celular, use o IPv4 deste computador na mesma rede Wi-Fi:
ipconfig | findstr /i "IPv4"
echo.
echo Mantenha este terminal aberto enquanto usar a loja.
echo Pressione Ctrl+C para encerrar.
echo.

call instalar_loja.bat
if errorlevel 1 exit /b 1

node --check server.js
if errorlevel 1 (
    echo [ERRO] Ha um erro de sintaxe em server.js.
    pause
    exit /b 1
)

node server.js
endlocal
