<#
Levanta los dos backends de PreCrop en esta PC y los expone con ngrok.

    powershell -ExecutionPolicy Bypass -File scripts\serve-ngrok.ps1

  -NoVision        no levanta ni expone el backend de vision (api/vision_weeds.py)
  -EvidencePort    puerto del evidence-api (default 8787)
  -VisionPort      puerto del backend de vision (default 8000)
  -VisionPass      password del basic-auth del tunel de vision; si se omite, se genera
  -EvidenceDomain  dominio reservado para evidence (ej. precrop-api.ngrok-free.app)
  -VisionDomain    dominio reservado para vision

Sin dominios reservados la URL cambia en cada arranque y hay que reconfigurar el
front. Se reservan gratis en https://dashboard.ngrok.com/domains (uno por cuenta en
el plan free) y se pasan por parametro o por las variables PRECROP_EVIDENCE_DOMAIN
y PRECROP_VISION_DOMAIN.

El tunel de vision va SIEMPRE con basic-auth: detras esta tu GEMINI_API_KEY y cada
request factura. El evidence-api va abierto: solo sirve el pack y calcula el indice.
El front local no se ve afectado, porque habla con 127.0.0.1, no con el tunel.

Requiere: node >= 20, Python 3.14 con Pillow, y ngrok con el authtoken ya configurado.
#>
param(
  [int]$EvidencePort = 8787,
  [int]$VisionPort = 8000,
  [switch]$NoVision,
  [string]$VisionUser = 'precrop',
  [string]$VisionPass = '',
  [string]$EvidenceDomain = $env:PRECROP_EVIDENCE_DOMAIN,
  [string]$VisionDomain = $env:PRECROP_VISION_DOMAIN
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Test-Port([int]$p) {
  try { (New-Object Net.Sockets.TcpClient('127.0.0.1', $p)).Close(); $true } catch { $false }
}

function Wait-Port([int]$p, [string]$what) {
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-Port $p) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$what no levanto en :$p"
}

# --- evidence-api ---------------------------------------------------------
if (Test-Port $EvidencePort) {
  Write-Host "evidence-api ya responde en :$EvidencePort" -ForegroundColor Yellow
} else {
  Write-Host "Arrancando evidence-api en :$EvidencePort ..."
  $env:PORT = $EvidencePort
  Start-Process node -ArgumentList 'src/server.js' `
    -WorkingDirectory (Join-Path $root 'services\evidence-api') -WindowStyle Minimized
  Wait-Port $EvidencePort 'evidence-api'
  Write-Host "evidence-api arriba" -ForegroundColor Green
}

# --- backend de vision ----------------------------------------------------
$vision = -not $NoVision
if ($vision) {
  if (Test-Port $VisionPort) {
    Write-Host "vision ya responde en :$VisionPort" -ForegroundColor Yellow
  } else {
    # La clave sale del .env del root y solo viaja por el entorno del proceso hijo.
    $envFile = Join-Path $root '.env'
    $key = $env:GEMINI_API_KEY
    if (-not $key -and (Test-Path $envFile)) {
      $line = Select-String -Path $envFile -Pattern '^\s*GEMINI_API_KEY\s*=' | Select-Object -First 1
      if ($line) { $key = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
    }
    if (-not $key) {
      Write-Host "Sin GEMINI_API_KEY (ni en el entorno ni en .env): vision queda afuera." -ForegroundColor Yellow
      $vision = $false
    } else {
      $py = 'C:\Users\Tripulante\AppData\Local\Python\bin\python.exe'
      if (-not (Test-Path $py)) { $py = 'python' }
      Write-Host "Arrancando vision en :$VisionPort ..."
      # --billing-acknowledged: la clave puede facturar. Ver VISION-IA.md.
      $psi = New-Object Diagnostics.ProcessStartInfo
      $psi.FileName = $py
      $psi.Arguments = "-B api/vision_weeds.py --billing-acknowledged --port $VisionPort"
      $psi.WorkingDirectory = $root
      $psi.UseShellExecute = $false
      $psi.EnvironmentVariables['GEMINI_API_KEY'] = $key
      [void][Diagnostics.Process]::Start($psi)
      Wait-Port $VisionPort 'vision'
      Write-Host "vision arriba" -ForegroundColor Green
    }
  }
}

# --- ngrok ----------------------------------------------------------------
if (-not $VisionPass) {
  $VisionPass = -join ((48..57) + (97..122) | Get-Random -Count 14 | ForEach-Object { [char]$_ })
}
if ($VisionPass.Length -lt 8) { throw 'VisionPass necesita al menos 8 caracteres (lo exige ngrok)' }

# El yml se escribe en TEMP, no en el repo: lleva la credencial del tunel de vision.
# add-headers saltea la pagina interstitial de ngrok free, que rompe los fetch del navegador.
$skip = @'
        - actions:
            - type: add-headers
              config:
                headers:
                  ngrok-skip-browser-warning: "true"
'@ + "`n"
function Url-Line([string]$domain) {
  if ($domain) { return "    url: https://$($domain -replace '^https?://', '')`n" }
  return ''
}
$yml = @"
version: "3"
endpoints:
  - name: evidence
$(Url-Line $EvidenceDomain)    upstream:
      url: $EvidencePort
    traffic_policy:
      on_http_request:
$skip
"@
$names = 'evidence'
if ($vision) {
  $names = 'evidence vision'
  $yml += @"
  - name: vision
$(Url-Line $VisionDomain)    upstream:
      url: $VisionPort
    traffic_policy:
      on_http_request:
$skip
        - actions:
            - type: basic-auth
              config:
                credentials:
                  - "${VisionUser}:${VisionPass}"
"@
}
$ymlPath = Join-Path $env:TEMP 'precrop-ngrok.yml'
# Sin BOM: el parser YAML de ngrok no lo tolera.
[IO.File]::WriteAllText($ymlPath, $yml, (New-Object Text.UTF8Encoding $false))

Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host "Abriendo tuneles ($names) ..."
$global = Join-Path $env:LOCALAPPDATA 'ngrok\ngrok.yml'
Start-Process ngrok -ArgumentList "start $names --config `"$global`" --config `"$ymlPath`"" -WindowStyle Minimized

$tunnels = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $t = (Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2).tunnels
    if ($t -and $t.Count -ge $names.Split(' ').Count) { $tunnels = $t; break }
  } catch { }
}
if (-not $tunnels) { throw 'ngrok no publico ninguna URL; ver http://127.0.0.1:4040' }

$evidenceUrl = ($tunnels | Where-Object { $_.name -eq 'evidence' }).public_url
$visionUrl   = ($tunnels | Where-Object { $_.name -eq 'vision' }).public_url

Write-Host ''
Write-Host "evidence-api  $evidenceUrl" -ForegroundColor Green
Write-Host "              $evidenceUrl/health"
if ($visionUrl) {
  Write-Host "vision        $visionUrl" -ForegroundColor Green
  Write-Host "              POST $visionUrl/api/vision/weeds  (multipart: image, point_id)"
  Write-Host "              usuario: $VisionUser   password: $VisionPass" -ForegroundColor Yellow
}
Write-Host "inspector     http://127.0.0.1:4040"
Write-Host ''
Write-Host 'Front local (.env):'
Write-Host "  NEXT_PUBLIC_EVIDENCE_API_URL=$evidenceUrl"
Write-Host "  VISION_BACKEND_URL=http://127.0.0.1:$VisionPort"
Write-Host "  VISION_BACKEND_AUTH="
if ($visionUrl) {
  Write-Host ''
  Write-Host 'Front en Vercel (vercel env add, o el dashboard):'
  Write-Host "  NEXT_PUBLIC_EVIDENCE_API_URL=$evidenceUrl"
  Write-Host "  VISION_BACKEND_URL=$visionUrl"
  Write-Host "  VISION_BACKEND_AUTH=${VisionUser}:${VisionPass}"
}
