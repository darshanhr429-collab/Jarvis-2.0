# ============================================
# J.A.R.V.I.S. — Global Command Installer
# Run this ONCE to make 'jarvis' available from anywhere.
# Must be run as Administrator OR in a normal shell (user PATH).
# ============================================

$jarvisDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create a jarvis.cmd in the JARVIS directory
$cmdContent = @"
@echo off
title J.A.R.V.I.S. — Voice Assistant
cd /d "$jarvisDir"
python -u "$jarvisDir\jarvis_desktop.py" %*
"@

$cmdPath = Join-Path $jarvisDir "jarvis.cmd"
Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII

# Add JARVIS directory to User PATH if not already present
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($userPath -notlike "*$jarvisDir*") {
    $newPath = "$userPath;$jarvisDir"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host ""
    Write-Host "  ======================================" -ForegroundColor Cyan
    Write-Host "  J.A.R.V.I.S. COMMAND INSTALLED" -ForegroundColor Cyan
    Write-Host "  ======================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Directory added to PATH: $jarvisDir" -ForegroundColor DarkCyan
    Write-Host "  Command created: jarvis.cmd" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "  >> Open a NEW terminal and type: jarvis" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  J.A.R.V.I.S. path already configured." -ForegroundColor Green
    Write-Host "  Command is ready. Open a terminal and type: jarvis" -ForegroundColor Green
    Write-Host ""
}
