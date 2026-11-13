@echo off
setlocal
cd /d "%~dp0"
echo ===== Assistente de pesquisa NEXUS (Google Gemini) =====

call preparar_python.bat
if errorlevel 1 exit /b 1

echo Conferindo dependencias do assistente...
".venv\Scripts\python.exe" -m pip install -e .
if errorlevel 1 (
    echo [ERRO] Nao foi possivel instalar as dependencias Python do assistente.
    exit /b 1
)

if not exist .env (
    if exist .env.example (
        echo Criando .env a partir de .env.example. Adicione sua GEMINI_API_KEY antes de continuar.
        copy /Y .env.example .env >nul
    )
)

".venv\Scripts\python.exe" -c "from dotenv import load_dotenv; import os; load_dotenv(); raise SystemExit(0 if os.getenv('GEMINI_API_KEY') else 1)"
if errorlevel 1 (
    echo [ERRO] Configure GEMINI_API_KEY no arquivo .env antes de iniciar o assistente.
    exit /b 1
)

echo.
echo Assistente pronto. Digite uma pergunta; digite sair para encerrar.
echo.
".venv\Scripts\python.exe" -m src.agente.cli
endlocal
