# Deploy - Projeção de Estoque
# Execute: .\deploy.ps1

$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\BI\Documents\Davi\Cursor\Projecao-Estoque2.2"
$nodePath = "C:\Program Files\nodejs"
$npmPath = "$env:APPDATA\npm"

# 1) Ir para a pasta do projeto
Set-Location $projectRoot

# 2) Atualizar código
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Git pull falhou." }

# 3) Garantir Node no PATH e gerar build
$env:Path = "$nodePath;$env:Path"
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install falhou." }

npm run build
if ($LASTEXITCODE -ne 0) { throw "Build falhou." }

# 4) Garantir front na porta 5257
& "$npmPath\pm2.cmd" delete projecao-front 2>$null
& "$npmPath\pm2.cmd" start "C:\Program Files\nodejs\node.exe" --name projecao-front -- "C:\Users\BI\Documents\Davi\Cursor\Projecao-Estoque2.2\node_modules\vite\bin\vite.js" preview --host 0.0.0.0 --port 5257 --strictPort

# 5) Reiniciar API
& "$npmPath\pm2.cmd" restart projecao-api

# 6) Persistir e validar
& "$npmPath\pm2.cmd" save
& "$npmPath\pm2.cmd" list
netstat -ano | findstr :5257

Write-Host "`nDeploy concluido com sucesso." -ForegroundColor Green
