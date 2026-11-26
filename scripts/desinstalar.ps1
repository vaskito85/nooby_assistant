# Nooby: desinstalador.
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/vaskito85/nooby_assistant/main/scripts/desinstalar.ps1))) [-Purge] [-Apk]
#   -Purge  borra también tus ajustes (~\.nooby)
#   -Apk    desinstala además la app del celu conectado por USB
param([switch]$Purge, [switch]$Apk)

$ErrorActionPreference = 'Continue'
$Dir = Join-Path $env:LOCALAPPDATA 'Nooby'

Write-Host 'Desinstalando Nooby'

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*Nooby*servidor.mjs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host '    Servidor detenido' }

foreach ($p in (Join-Path ([Environment]::GetFolderPath('Programs')) 'Nooby.lnk'),
               (Join-Path ([Environment]::GetFolderPath('Startup')) 'Nooby.lnk')) {
  if (Test-Path $p) { Remove-Item $p -Force; Write-Host "    Quitado: $p" }
}

if ($Apk) {
  $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
  if (-not $adb) {
    $adb = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter 'adb.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
  }
  if ($adb) { & $adb uninstall com.nooby.asistente; Write-Host '    App del celu desinstalada' }
  else { Write-Host '    No encontré adb: desinstalá la app a mano desde el celu.' }
}

if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force; Write-Host "    Borrado: $Dir" }

if ($Purge) {
  $cfg = Join-Path $env:USERPROFILE '.nooby'
  if (Test-Path $cfg) { Remove-Item $cfg -Recurse -Force; Write-Host "    Borrados tus ajustes: $cfg" }
} else {
  Write-Host '    Tus ajustes quedan en ~\.nooby (usá -Purge para borrarlos).'
}
Write-Host 'Listo.'
