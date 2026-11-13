@echo off
setlocal
cd /d "%~dp0"

echo.
echo ===== NEXUS - Configurar e-mail e frete =====
call preparar_python.bat
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel preparar o Python para configurar os servicos.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" configurar_servicos.py
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel configurar os servicos.
    pause
    exit /b 1
)

echo.
pause
endlocal
