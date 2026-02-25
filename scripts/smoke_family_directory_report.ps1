param(
  [Parameter(Mandatory = $true)]
  [int]$GroupId,

  [string]$ApiBaseUrl = "http://localhost:8000",
  [string]$Username = "admin",
  [string]$Password,
  [string]$OutputPath,
  [string]$PythonExe = "C:/Users/victor/proy/kampus/.venv/Scripts/python.exe"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Password)) {
  $Password = $env:KAMPUS_SMOKE_ADMIN_PASSWORD
}

if ([string]::IsNullOrWhiteSpace($Password)) {
  throw "Debes enviar -Password o definir la variable de entorno KAMPUS_SMOKE_ADMIN_PASSWORD."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = "C:/Users/victor/proy/kampus/tmp_directorio_padres_${GroupId}.xlsx"
}

$tokenBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$tokenResponse = Invoke-RestMethod -Uri "$ApiBaseUrl/api/token/" -Method Post -ContentType "application/json" -Body $tokenBody
$accessToken = $tokenResponse.access

if ([string]::IsNullOrWhiteSpace($accessToken)) {
  throw "No se recibió access token desde $ApiBaseUrl/api/token/."
}

$downloadUrl = "$ApiBaseUrl/api/groups/$GroupId/family-directory-report/"
$response = Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -Headers @{ Authorization = "Bearer $accessToken" } -OutFile $OutputPath -PassThru
$fileSize = (Get-Item $OutputPath).Length

Write-Output "STATUS_CODE=$($response.StatusCode)"
Write-Output "CONTENT_TYPE=$($response.Headers['Content-Type'])"
Write-Output "CONTENT_DISPOSITION=$($response.Headers['Content-Disposition'])"
Write-Output "FILE_PATH=$OutputPath"
Write-Output "FILE_SIZE=$fileSize"

if ($response.StatusCode -ne 200) {
  throw "La descarga no retornó 200."
}

if (-not ($response.Headers['Content-Type'] -like "*spreadsheetml.sheet*")) {
  throw "El Content-Type no corresponde a XLSX."
}

if ($fileSize -le 0) {
  throw "El archivo XLSX se descargó vacío."
}

if (-not (Test-Path $PythonExe)) {
  Write-Warning "No se encontró Python en $PythonExe. Se omite validación de contenido XLSX."
  exit 0
}

$validationCode = @"
from openpyxl import load_workbook
wb = load_workbook(r'''$OutputPath''')
ws = wb.active
headers = [ws.cell(row=1, column=i).value for i in range(1, 7)]
print('HEADERS=' + ' | '.join(str(x) for x in headers))
print('ROWS=' + str(ws.max_row))
"@

& $PythonExe -c $validationCode