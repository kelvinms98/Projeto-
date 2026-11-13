@echo off
setlocal
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" --version >nul 2>&1
    if not errorlevel 1 exit /b 0
    echo [ERRO] O ambiente .venv existe, mas o Python dele nao iniciou.
    echo Reinstale o Python 3.11 ou superior e recrie o ambiente virtual.
    exit /b 1
)

where py >nul 2>&1
if not errorlevel 1 goto create_with_launcher
where python >nul 2>&1
if not errorlevel 1 goto create_with_python

echo [ERRO] Python 3.11 ou superior nao foi encontrado.
echo Instale o Python e marque a opcao para adiciona-lo ao PATH. Depois execute este arquivo novamente.
exit /b 1

:create_with_launcher
echo Criando ambiente Python local .venv...
py -3.11 -m venv .venv >nul 2>&1
if errorlevel 1 py -3 -m venv .venv
if errorlevel 1 goto creation_failed
goto verify_python

:create_with_python
echo Criando ambiente Python local .venv...
python -m venv .venv
if errorlevel 1 goto creation_failed

:verify_python
".venv\Scripts\python.exe" --version
if errorlevel 1 goto creation_failed
exit /b 0

:creation_failed
echo [ERRO] Nao foi possivel criar .venv. Verifique se o Python 3.11 ou superior esta instalado.
exit /b 1
