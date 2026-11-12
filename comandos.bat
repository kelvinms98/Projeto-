@echo off
setlocal
cd /d "%~dp0"

:menu
cls
echo ==========================================
echo       NEXUS - COMANDOS DA LOJA
echo ==========================================
echo 1 - Iniciar servidor do site
echo 2 - Fazer compra pelo Comprar.py
echo 3 - Testar conexao com o banco local
echo 4 - Executar testes da loja
echo 5 - Importar dados do MySQL antigo
echo 6 - Configurar e-mail e frete
echo 7 - Iniciar buscador de CEP
echo 8 - Iniciar assistente Gemini
echo 9 - Configurar acesso de administrador
echo 0 - Sair
echo.
choice /C 1234567890 /N /M "Escolha uma opcao: "

if errorlevel 10 exit /b 0
if errorlevel 9 goto admin
if errorlevel 8 goto assistente
if errorlevel 7 goto cep
if errorlevel 6 goto configurar
if errorlevel 5 goto importar
if errorlevel 4 goto testes
if errorlevel 3 goto conexao
if errorlevel 2 goto comprar
if errorlevel 1 goto servidor
goto menu

:importar
call importar_mysql.bat
goto menu

:testes
call testes_loja.bat
goto menu

:conexao
call testar_conexao.bat
goto menu

:comprar
call run_comprar.bat
goto menu

:servidor
start "NEXUS - Servidor" "%~dp0run_web.bat"
goto menu

:configurar
call configurar_servicos.bat
goto menu

:cep
start "NEXUS - Buscador CEP" "%~dp0run_cep.bat"
goto menu

:assistente
start "NEXUS - Assistente Gemini" "%~dp0run.bat"
goto menu

:admin
call configurar_admin.bat
goto menu
