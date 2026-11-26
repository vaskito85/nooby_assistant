# Nooby: instalador para Windows.
#   irm https://raw.githubusercontent.com/vaskito85/nooby_assistant/main/scripts/instalar.ps1 | iex
# Instala el servidor de la PC, lo deja arrancando con Windows e instala el APK en el celu por USB.
# Compatible con Windows PowerShell 5.1.

$ErrorActionPreference = 'Stop'
$Repo = 'vaskito85/nooby_assistant'
$Base = "https://github.com/$Repo/releases/latest/download"
$Dir = Join-Path $env:LOCALAPPDATA 'Nooby'
$App = Join-Path $Dir 'app'
$Puerto = 8777

function Paso($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !   $t" -ForegroundColor Yellow }
function Preguntar($t) { $r = Read-Host "    $t [S/n]"; return ($r -eq '' -or $r -match '^[sSyY]') }
function ActualizarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

Write-Host "Instalador de Nooby"

# ---------- 1. La PC ----------
Paso 'Revisando esta PC'
if ($env:OS -ne 'Windows_NT') { throw 'Este instalador es solo para Windows.' }
Ok "Windows $([Environment]::OSVersion.Version)"

# Node.js (corre el servidor)
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Aviso 'No está instalado Node.js (hace falta para el servidor).'
  if (Preguntar 'Instalarlo ahora con winget (OpenJS.NodeJS.LTS)?') {
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    ActualizarPath
    $node = Get-Command node -ErrorAction SilentlyContinue
  }
}
if (-not $node) { throw 'Sin Node.js no se puede seguir. Instalalo desde https://nodejs.org y corré este instalador de nuevo.' }
$major = [int]((& $node.Source -v) -replace '^v(\d+)\..*', '$1')
if ($major -lt 20) { throw "Hace falta Node.js 20 o más nuevo (tenés $(& $node.Source -v))." }
Ok "Node.js $(& $node.Source -v)"

# adb (comunicación USB con el celu)
function BuscarAdb {
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $w = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter 'adb.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($w) { return $w.FullName }
  return $null
}
$adb = BuscarAdb
if (-not $adb) {
  Aviso 'No está instalado adb (Android SDK Platform-Tools), necesario para el cable USB.'
  Write-Host '    Es software de Google bajo los términos del Android SDK: https://developer.android.com/studio/releases/platform-tools'
  if (Preguntar 'Instalarlo ahora con winget (Google.PlatformTools)?') {
    winget install --id Google.PlatformTools -e --accept-source-agreements --accept-package-agreements
    ActualizarPath
    $adb = BuscarAdb
  }
}
if ($adb) { Ok "adb: $adb" } else { Aviso 'Sin adb no se puede usar el celu por USB.' }

# ---------- 2. Descarga ----------
Paso 'Descargando Nooby'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("nooby-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  foreach ($f in 'checksums.txt', 'nooby-pc.zip', 'nooby.apk') {
    Write-Host "    $f ..."
    Invoke-WebRequest -UseBasicParsing "$Base/$f" -OutFile (Join-Path $tmp $f)
  }
  # Versión de la app del celu (opcional: si falta, se reinstala siempre)
  $versionApk = $null
  try {
    Invoke-WebRequest -UseBasicParsing "$Base/apk-version.txt" -OutFile (Join-Path $tmp 'apk-version.txt')
    $versionApk = (Get-Content (Join-Path $tmp 'apk-version.txt') -Raw).Trim()
  } catch { }
  $sumas = @{}
  foreach ($l in Get-Content (Join-Path $tmp 'checksums.txt')) {
    if ($l -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') { $sumas[$Matches[2].Trim()] = $Matches[1].ToLower() }
  }
  foreach ($f in 'nooby-pc.zip', 'nooby.apk') {
    $real = (Get-FileHash (Join-Path $tmp $f) -Algorithm SHA256).Hash.ToLower()
    if ($sumas[$f] -ne $real) { throw "El checksum de $f no coincide: no lo instalo." }
    Ok "$f coincide con el checksum de la Release"
  }

  # ---------- 3. Instalar en la PC ----------
  Paso "Instalando en $App"
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*Nooby*servidor.mjs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  if (Test-Path $App) { Remove-Item $App -Recurse -Force }
  New-Item -ItemType Directory -Path $App -Force | Out-Null
  Expand-Archive (Join-Path $tmp 'nooby-pc.zip') -DestinationPath $App -Force
  Copy-Item (Join-Path $tmp 'nooby.apk') (Join-Path $Dir 'nooby.apk') -Force
  Ok 'Servidor instalado (tus ajustes quedan en ~\.nooby y no se tocan)'

  # Lanzador oculto (sin ventana de consola) que deja el log en servidor.log
  $vbs = Join-Path $Dir 'iniciar.vbs'
  $js = Join-Path $App 'servidor\servidor.mjs'
  $log = Join-Path $Dir 'servidor.log'
  # Ojo con las comillas: cmd /c se come la primera y la última si la línea empieza con comilla,
  # por eso la orden completa va envuelta en un par extra.
  $linea = 'sh.Run "cmd /c """"' + $node.Source + '"" ""' + $js + '"" >> ""' + $log + '"" 2>&1""", 0, False'
  Set-Content -Path $vbs -Encoding ASCII -Value @('Set sh = CreateObject("WScript.Shell")', $linea)

  $ws = New-Object -ComObject WScript.Shell
  function Atajo($ruta) {
    $a = $ws.CreateShortcut($ruta)
    $a.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $a.Arguments = '"' + $vbs + '"'
    $a.WorkingDirectory = $Dir
    $a.Description = 'Servidor de Nooby'
    $a.Save()
  }
  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Nooby.lnk'
  Atajo $menu
  Ok 'Agregado al menú Inicio (buscá "Nooby")'

  Paso 'Inicio con Windows'
  if (Preguntar 'Arrancar Nooby cuando inicies sesión en Windows?') {
    Atajo (Join-Path ([Environment]::GetFolderPath('Startup')) 'Nooby.lnk')
    Ok 'Agregado a la carpeta Inicio (se apaga desde el Administrador de tareas > Inicio)'
  }

  # ---------- 4. Arrancar ----------
  Paso 'Arrancando el servidor'
  Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList ('"' + $vbs + '"')
  $listo = $false
  for ($i = 0; $i -lt 20 -and -not $listo; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $e = Invoke-RestMethod "http://127.0.0.1:$Puerto/api/estado" -TimeoutSec 2
      if ($e.nooby) { $listo = $true }
    } catch { }
  }
  if ($listo) { Ok "Nooby está andando: panel en http://127.0.0.1:$Puerto/#/panel" }
  else {
    Aviso "No respondió en http://127.0.0.1:$Puerto (¿el puerto está ocupado?). Log: $log"
    if (Test-Path $log) { Get-Content $log -Tail 10 | ForEach-Object { Write-Host "        $_" } }
    else { Aviso 'El servidor ni siquiera llegó a escribir el log: el lanzador no arrancó.' }
  }

  # ---------- 5. El celu ----------
  if ($adb) {
    Paso 'App del celu'
    if (Preguntar 'Instalar la app Nooby en un celu conectado por USB ahora?') {
      Write-Host '    La depuración USB permite que una PC autorizada controle el celu. Autorizá solo tus propias PCs.'
      $serial = $null
      while (-not $serial) {
        $lineas = (& $adb devices) -split "`r?`n" | Select-Object -Skip 1
        $dev = $lineas | Where-Object { $_ -match '^\S+\s+device$' } | Select-Object -First 1
        if ($dev) { $serial = ($dev -split '\s+')[0]; break }
        Aviso 'No hay un celu autorizado por USB todavía.'
        Write-Host '    En el celu (Android 5.0 o más nuevo):'
        Write-Host '      1. Ajustes > Acerca del teléfono: tocá "Número de compilación" 7 veces (activa Opciones de desarrollador).'
        Write-Host '      2. Ajustes > Opciones de desarrollador: activá "Depuración USB".'
        Write-Host '      3. Conectalo con un cable de datos (algunos solo cargan) y desbloqueá la pantalla.'
        Write-Host '      4. En "¿Permitir la depuración USB?" tocá Permitir (y marcá "Permitir siempre desde esta computadora").'
        $r = Read-Host '    Enter para volver a revisar, o S para saltear el celu'
        if ($r -match '^[sS]') { break }
      }
      # Solo se reinstala la app si cambió de versión: cada instalación nueva pierde los permisos (cámara).
      # Las mejoras de la cara llegan con el servidor de la PC, sin tocar el celu.
      $instalada = $null
      if ($serial) {
        $linea = (& $adb -s $serial shell dumpsys package com.nooby.asistente) | Select-String 'versionName=' | Select-Object -First 1
        if ($linea) { $instalada = ($linea.ToString() -replace '.*versionName=', '').Trim() }
      }
      if ($serial -and $instalada -and $versionApk -and ($instalada -eq $versionApk)) {
        Ok "La app del celu ya es la versión ${instalada}: no hace falta reinstalarla (conserva sus permisos)"
        # Se reinicia la app para que cargue la web nueva que acaba de instalarse en la PC.
        & $adb -s $serial shell am force-stop com.nooby.asistente | Out-Null
        Start-Sleep -Milliseconds 800
        & $adb -s $serial shell am start -n com.nooby.asistente/.MainActivity | Out-Null
        Ok 'App del celu reiniciada con la versión nueva'
      }
      elseif ($serial) {
        Write-Host "    Instalando en $serial (el celu puede pedir confirmación) ..."
        $apk = Join-Path $Dir 'nooby.apk'
        & $adb -s $serial install -r $apk
        if ($LASTEXITCODE -ne 0) {
          Aviso 'No se pudo actualizar; pruebo desinstalando la versión anterior (cambió la firma) ...'
          & $adb -s $serial uninstall com.nooby.asistente | Out-Null
          & $adb -s $serial install $apk
        }
        if ($LASTEXITCODE -eq 0) {
          Ok 'App Nooby instalada en el celu'
          & $adb -s $serial shell am start -n com.nooby.asistente/.MainActivity | Out-Null
        } else { Aviso ("No pude instalar la app. Probá a mano: adb install -r $apk") }
      }
    }
  }

  Paso 'Para saber'
  Write-Host '    Dejá el celu enchufado: Nooby comparte el puerto por el cable y abre la cara solo.'
  Write-Host "    Panel de ajustes (en la PC): http://127.0.0.1:$Puerto/#/panel"
  Write-Host "    Avisos desde otros programas: POST http://127.0.0.1:$Puerto/api/aviso  con {""texto"":""...""}"
  Write-Host "    Si el celu tiene también PhoneBox, los dos abren su app: usá uno por vez."
  Write-Host '    Actualizar o reparar: corré este instalador de nuevo.'
  Write-Host '    Desinstalar: & ([scriptblock]::Create((irm https://raw.githubusercontent.com/vaskito85/nooby_assistant/main/scripts/desinstalar.ps1))) [-Purge] [-Apk]'
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
