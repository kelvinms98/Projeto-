@echo off
setlocal
cd /d "%~dp0"

echo.
echo ===== NEXUS - Comprar pelo terminal =====
call preparar_python.bat
if errorlevel 1 exit /b 1

set "NEXUS_API_URL=http://127.0.0.1:8081"
".venv\Scripts\python.exe" teste_conexao.py
if errorlevel 1 (
    echo.
    echo [ERRO] O servidor da loja nao respondeu em http://127.0.0.1:8081.
    echo Abra outro terminal e inicie run_web.bat antes de comprar.
    pause
    exit /b 1
)

echo.
".venv\Scripts\python.exe" Comprar.py
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel executar Comprar.py.
    pause
    exit /b 1
)

endlocal
