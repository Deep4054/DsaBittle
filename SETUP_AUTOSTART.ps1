PowerShell
# Run this ONCE to add backend to Windows startup
# It will auto-start whenever you log in

$batPath    = "E:\GENAI\DsaBittle\START_BACKEND.bat"
$startupDir = [System.Environment]::GetFolderPath('Startup')
$shortcut   = Join-Path $startupDir "DSA-Engine-Backend.lnk"

$WScriptShell = New-Object -ComObject WScript.Shell
$link = $WScriptShell.CreateShortcut($shortcut)
$link.TargetPath       = $batPath
$link.WorkingDirectory = "E:\GENAI\DsaBittle\backend"
$link.WindowStyle      = 7    # 7 = minimized
$link.Description      = "DSA Dopamine Engine Backend Auto-Start"
$link.Save()

Write-Host ""
Write-Host "✅ Backend will now auto-start on every Windows login!" -ForegroundColor Green
Write-Host "   Shortcut added to: $shortcut" -ForegroundColor Cyan
Write-Host ""
Write-Host "To REMOVE auto-start, delete: $shortcut" -ForegroundColor Yellow
