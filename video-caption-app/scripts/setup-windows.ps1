[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $projectRoot "bin"
$appDataDir = $env:APPDATA

if ([string]::IsNullOrWhiteSpace($appDataDir)) {
  throw "APPDATA is not set. Cannot determine userData models path."
}

$modelsDir = Join-Path $appDataDir "video-caption-app\models"
$modelPath = Join-Path $modelsDir "ggml-base.en.bin"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
$minBytes = [int64](10MB)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

New-Item -ItemType Directory -Path $binDir -Force | Out-Null
Write-Host "[OK] Ensured bin directory exists: $binDir"
Write-Host "[INFO] Place ffmpeg.exe, ffprobe.exe, and whisper.exe in this folder."

New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
Write-Host "[OK] Ensured models directory exists: $modelsDir"

$shouldDownload = $true
if ((Test-Path -Path $modelPath -PathType Leaf) -and -not $Force) {
  $shouldDownload = $false
  Write-Host "[SKIP] Model already exists: $modelPath"
  Write-Host "[INFO] Use -Force to re-download."
}

if ($shouldDownload) {
  Write-Host "[INFO] Downloading model from: $modelUrl"
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath -UseBasicParsing
  Write-Host "[OK] Download completed: $modelPath"
}

if (-not (Test-Path -Path $modelPath -PathType Leaf)) {
  throw "Model file is missing after setup: $modelPath"
}

$fileInfo = Get-Item -Path $modelPath
if ($fileInfo.Length -le $minBytes) {
  throw "Model file is too small ($($fileInfo.Length) bytes). Expected > 10MB. Delete it and re-run this script with -Force."
}

Write-Host "[OK] Model size check passed: $($fileInfo.Length) bytes"
Write-Host "[SUCCESS] Whisper model ready at: $modelPath"
