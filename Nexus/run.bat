@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo ===== Iniciando projeto Assistente de Pesquisa =====

if not exist .venv (
    echo Criando ambiente virtual .venv...
    py -3.11 -m venv .venv 2>nul || py -3 -m venv .venv
)

echo Ativando ambiente virtual...
call .venv\Scripts\activate.bat

echo Instalando dependências...
pip install -e ".[dev]"

if not exist .env (
    if exist .env.example (
        echo Criando .env a partir de .env.example...
        copy /Y .env.example .env >nul
    )
)
echo.
echo ===== PRONTO =====
echo Edite .env e configure GEMINI_API_KEY antes de executar.
echo Para iniciar o agente, digite uma pergunta ou "sair" para encerrar.
echo.
python -m src.agente.cli
endlocal