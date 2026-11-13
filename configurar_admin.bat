@echo off
setlocal
cd /d "%~dp0"

echo.
echo ===== NEXUS - Configurar administrador =====
where py >nul 2>&1
if not errorlevel 1 (
    py -3 configurar_admin.py
) else (
    python configurar_admin.py
)
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel configurar o administrador.
    pause
    exit /b 1
)

echo.
pause
endlocal
