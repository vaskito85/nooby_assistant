# Instala el APK de Nooby en el celu conectado por USB.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\instalar-apk.ps1 -Apk "C:\ruta\app-debug.apk"
param(
  [Parameter(Mandatory = $true)][string]$Apk,
  [string]$Adb = 'adb'
)

if (-not (Test-Path $Apk)) { Write-Error "No encuentro el APK: $Apk"; exit 1 }

& $Adb devices
# -r reinstala conservando datos. Si la firma cambió (cada compilación de CI genera una clave de debug nueva),
# Android lo rechaza: en ese caso se desinstala la versión anterior y se instala de nuevo.
& $Adb install -r $Apk
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Falló la instalación; pruebo desinstalando la versión anterior...'
  & $Adb uninstall com.nooby.asistente | Out-Null
  & $Adb install $Apk
}
if ($LASTEXITCODE -eq 0) { Write-Host 'Listo. Abrí "Nooby" en el celu (o dejá corriendo el servidor: lo abre solo).' }
