@echo off
setlocal
cd /d %~dp0
echo.
echo ===== Registro de Entregas =====
echo Abra neste computador: http://localhost:8080
echo Abra pela rede Wi-Fi: http://192.168.15.72:8080
echo O computador e os celulares precisam estar na mesma rede.
echo Pressione Ctrl+C para encerrar.
echo.
py -m http.server 8080 --bind 0.0.0.0
endlocal
