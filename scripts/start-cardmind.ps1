$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseExe = Join-Path $repoRoot "src-tauri\target\release\cardmind.exe"
$nodeBin = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$pnpm = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"

if (Test-Path -LiteralPath $releaseExe) {
  Start-Process -FilePath $releaseExe -WorkingDirectory (Split-Path -Parent $releaseExe)
  exit 0
}

if (-not (Test-Path -LiteralPath $pnpm)) {
  throw "Bundled pnpm was not found at $pnpm"
}

$env:Path = "$nodeBin;$env:Path"

Start-Process -FilePath $pnpm `
  -ArgumentList "tauri", "dev" `
  -WorkingDirectory $repoRoot `
  -WindowStyle Normal
