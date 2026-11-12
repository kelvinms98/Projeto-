@echo off
setlocal
cd /d "%~dp0"

echo.
echo IMPORTACAO DO BANCO ANTIGO PARA SQLITE
echo Verifique o backup e as instrucoes em LOJA-NEXUS.md.
echo O banco MySQL/MariaDB precisa estar recuperado e com innodb_force_recovery=0.
echo O importador nao remove nem modifica dados do banco antigo.
echo.
choice /C SN /N /M "Deseja continuar? [S/N] "
if errorlevel 2 exit /b 0

call instalar_loja.bat
if errorlevel 1 (
    pause
    exit /b 1
)

call npm run import:mysql
if errorlevel 1 (
    echo.
    echo [ERRO] Importacao cancelada ou nao concluida. Consulte a mensagem acima.
    pause
    exit /b 1
)

pause
endlocal
