@echo off
setlocal
cd /d "%~dp0"

call preparar_python.bat
if errorlevel 1 exit /b 1

".venv\Scripts\python.exe" teste_conexao.py
if errorlevel 1 pause
endlocal
