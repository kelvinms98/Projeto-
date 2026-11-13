@echo off
setlocal
cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js 22.13 ou superior.
    exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) > 22 || (Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) >= 13) ? 0 : 1)"
if errorlevel 1 (
    echo [ERRO] Esta loja requer Node.js 22.13 ou superior.
    exit /b 1
)

if not exist "node_modules\express\package.json" goto install_dependencies
if not exist "node_modules\express-session\package.json" goto install_dependencies
if not exist "node_modules\nunjucks\package.json" goto install_dependencies
if not exist "node_modules\nodemailer\package.json" goto install_dependencies
if not exist "node_modules\dotenv\package.json" goto install_dependencies
if not exist "node_modules\mysql2\package.json" goto install_dependencies
goto done

:install_dependencies
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm nao foi encontrado. Reinstale o Node.js com npm incluido.
    exit /b 1
)
echo Instalando dependencias Node.js da loja...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ERRO] Nao foi possivel instalar as dependencias.
    endlocal
    exit /b 1
)

:done
endlocal
exit /b 0
