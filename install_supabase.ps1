# install_supabase.ps1
# Script para instalar Supabase CLI no Windows
# Execute no PowerShell como Administrador se possível.

function Write-Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-ErrorAndExit($m){ Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }

Write-Info "Verificando se 'supabase' já está instalado..."
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    Write-Info "Supabase CLI já instalado: $(supabase --version)"
    exit 0
}

# Tentar instalar via npm
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Info "npm encontrado. Tentando instalar via npm (global)..."
    try {
        npm install -g supabase --location=global
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Instalação via npm concluída."; supabase --version; exit 0
        }
    } catch {
        Write-Host "Instalação via npm falhou: $_" -ForegroundColor Yellow
    }

    Write-Info "Tentando ajustar prefix do npm para instalar sem permissões..."
    npm config set prefix "$env:USERPROFILE\npm"
    $newPath = "$env:USERPROFILE\npm;$env:Path"
    setx PATH $newPath | Out-Null
    Write-Info "Reabra o PowerShell após executar este script para atualizar PATH, ou execute: $env:USERPROFILE\npm\node_modules\supabase\bin\supabase"
    try {
        npm install -g supabase
        if ($LASTEXITCODE -eq 0) { Write-Info "Instalação via npm (com prefix) concluída."; supabase --version; exit 0 }
    } catch { Write-Host "Ainda falhou: $_" -ForegroundColor Yellow }
}

# Tentar instalar via Scoop
Write-Info "Tentando instalar via Scoop (se disponível)..."
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "Scoop não encontrado. Tentando instalar o Scoop (requer políticas do PowerShell)." -ForegroundColor Yellow
    try {
        iex (New-Object Net.WebClient).DownloadString('https://get.scoop.sh')
    } catch { Write-Host "Falha ao instalar Scoop: $_" -ForegroundColor Yellow }
}

if (Get-Command scoop -ErrorAction SilentlyContinue) {
    scoop install supabase
    if ($LASTEXITCODE -eq 0) { Write-Info "Supabase instalado via Scoop."; supabase --version; exit 0 }
}

# Tentar instalar via Chocolatey
Write-Info "Tentando instalar via Chocolatey..."
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey não encontrado. Para instalar Chocolatey veja https://chocolatey.org/install" -ForegroundColor Yellow
} else {
    choco install supabase -y
    if ($LASTEXITCODE -eq 0) { Write-Info "Supabase instalado via Chocolatey."; supabase --version; exit 0 }
}

Write-ErrorAndExit "Não foi possível instalar automaticamente. Tente executar o script como Administrador, ou instale manualmente via npm/scoop/choco. Consulte a documentação: https://supabase.com/docs/guides/cli"
