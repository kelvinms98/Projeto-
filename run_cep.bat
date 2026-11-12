@echo off
setlocal
cd /d "%~dp0cep-find-buddy-main"

echo.
echo ===== Buscador Te Achando (CEP) =====
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js 22.13 ou superior nao foi encontrado.
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm nao foi encontrado. Reinstale o Node.js com npm incluido.
    exit /b 1
)

if not exist "node_modules\vite\package.json" (
    echo Instalando dependencias do buscador de CEP...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERRO] Nao foi possivel instalar as dependencias do buscador.
        exit /b 1
    )
)

echo Mantenha esta janela aberta enquanto usar o buscador.
npm run dev -- --host 0.0.0.0
endlocal
