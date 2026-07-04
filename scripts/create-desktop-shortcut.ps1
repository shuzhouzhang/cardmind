$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "CardMind.lnk"
$releaseExe = Join-Path $repoRoot "src-tauri\target\release\cardmind.exe"
$launcherScript = Join-Path $repoRoot "scripts\start-cardmind.ps1"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

if (Test-Path -LiteralPath $releaseExe) {
  $shortcut.TargetPath = $releaseExe
  $shortcut.Arguments = ""
  $shortcut.WorkingDirectory = Split-Path -Parent $releaseExe
  $shortcut.IconLocation = $releaseExe
} else {
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherScript`""
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.IconLocation = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"
}

$shortcut.Description = "CardMind local-first desktop app"
$shortcut.Save()

Write-Host "Created shortcut: $shortcutPath"
