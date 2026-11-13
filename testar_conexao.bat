@echo off
setlocal
cd /d "%~dp0"

call preparar_python.bat
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel preparar o Python para testar a conexao.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" teste_conexao.py
pause
endlocal
