@echo off
setlocal
cd /d "%~dp0"

call instalar_loja.bat
if errorlevel 1 (
    pause
    exit /b 1
)

call npm test
if errorlevel 1 (
    echo.
    echo [ERRO] Um ou mais testes falharam.
    pause
    exit /b 1
)

echo.
echo Testes da loja concluidos com sucesso.
pause
endlocal
