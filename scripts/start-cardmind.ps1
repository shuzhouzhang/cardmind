$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeBin = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$pnpm = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"

if (-not (Test-Path -LiteralPath $pnpm)) {
  throw "Bundled pnpm was not found at $pnpm"
}

$env:Path = "$nodeBin;$env:Path"

Start-Process -FilePath $pnpm `
  -ArgumentList "--filter", "@cardmind/api", "dev" `
  -WorkingDirectory $repoRoot `
  -WindowStyle Minimized

Start-Process -FilePath $pnpm `
  -ArgumentList "--filter", "@cardmind/web", "dev" `
  -WorkingDirectory $repoRoot `
  -WindowStyle Minimized

Start-Sleep -Seconds 4
Start-Process "http://127.0.0.1:5173"
