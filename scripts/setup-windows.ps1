[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "runtime-dependencies.json"
$binDir = Join-Path $projectRoot "bin"
$stagingDir = Join-Path $projectRoot ".runtime-staging"
$downloadDir = Join-Path $stagingDir "downloads"
$extractDir = Join-Path $stagingDir "extract"
$appDataDir = $env:APPDATA

if ([string]::IsNullOrWhiteSpace($appDataDir)) {
  throw "APPDATA is not set. Cannot determine the userData models path."
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Runtime dependency manifest is missing: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) {
  throw "Unsupported runtime dependency manifest schema: $($manifest.schemaVersion)"
}

# Keep the established profile location when the app's display/package name changes.
$modelsDir = Join-Path $appDataDir "video-caption-app\models"
$modelPath = Join-Path $modelsDir $manifest.components.model.name

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is missing: $Path"
  }

  $actual = Get-Sha256 -Path $Path
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "$Label failed SHA-256 verification. Expected $Expected but received $actual."
  }

  Write-Host "[OK] SHA-256 verified: $Label"
}

function Get-VerifiedDownload {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ((Test-Path -LiteralPath $DestinationPath -PathType Leaf) -and -not $Force) {
    try {
      Assert-Sha256 -Path $DestinationPath -Expected $ExpectedSha256 -Label "$Label cached artifact"
      return $DestinationPath
    } catch {
      Write-Warning "$Label cached artifact is invalid and will be downloaded again."
    }
  }

  $partialPath = "$DestinationPath.partial"
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }

  Write-Host "[INFO] Downloading pinned $Label artifact: $Url"
  try {
    Invoke-WebRequest -Uri $Url -OutFile $partialPath -UseBasicParsing
    Assert-Sha256 -Path $partialPath -Expected $ExpectedSha256 -Label "$Label download"
    Move-Item -LiteralPath $partialPath -Destination $DestinationPath -Force
  } finally {
    if (Test-Path -LiteralPath $partialPath) {
      Remove-Item -LiteralPath $partialPath -Force
    }
  }

  return $DestinationPath
}

function Install-ArchiveComponent {
  param(
    [Parameter(Mandatory = $true)][string]$ComponentName,
    [Parameter(Mandatory = $true)]$Component
  )

  $archivePath = Join-Path $downloadDir "$ComponentName-$($Component.version).zip"
  Get-VerifiedDownload `
    -Url $Component.archive.url `
    -ExpectedSha256 $Component.archive.sha256 `
    -DestinationPath $archivePath `
    -Label "$ComponentName $($Component.version)" | Out-Null

  $componentExtractDir = Join-Path $extractDir "$ComponentName-$($Component.version)"
  if (Test-Path -LiteralPath $componentExtractDir) {
    Remove-Item -LiteralPath $componentExtractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $componentExtractDir -Force | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $componentExtractDir -Force

  foreach ($property in $Component.files.PSObject.Properties) {
    $destinationName = $property.Name
    $fileDefinition = $property.Value
    $matches = @(Get-ChildItem -LiteralPath $componentExtractDir -Recurse -File | Where-Object Name -eq $fileDefinition.archiveName)
    if ($matches.Count -ne 1) {
      throw "Expected exactly one $($fileDefinition.archiveName) in $ComponentName archive, found $($matches.Count)."
    }

    $sourcePath = $matches[0].FullName
    Assert-Sha256 -Path $sourcePath -Expected $fileDefinition.sha256 -Label "$ComponentName/$($fileDefinition.archiveName)"

    $destinationPath = Join-Path $binDir $destinationName
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    Assert-Sha256 -Path $destinationPath -Expected $fileDefinition.sha256 -Label "installed bin/$destinationName"
  }
}

New-Item -ItemType Directory -Path $binDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null

Install-ArchiveComponent -ComponentName "ffmpeg" -Component $manifest.components.ffmpeg
Install-ArchiveComponent -ComponentName "whisper" -Component $manifest.components.whisper

if ((Test-Path -LiteralPath $modelPath -PathType Leaf) -and -not $Force) {
  try {
    Assert-Sha256 -Path $modelPath -Expected $manifest.components.model.sha256 -Label "Whisper model $($manifest.components.model.name)"
  } catch {
    Write-Warning "Installed model is invalid and will be downloaded again."
    Get-VerifiedDownload `
      -Url $manifest.components.model.url `
      -ExpectedSha256 $manifest.components.model.sha256 `
      -DestinationPath $modelPath `
      -Label "Whisper model $($manifest.components.model.name)" | Out-Null
  }
} else {
  Get-VerifiedDownload `
    -Url $manifest.components.model.url `
    -ExpectedSha256 $manifest.components.model.sha256 `
    -DestinationPath $modelPath `
    -Label "Whisper model $($manifest.components.model.name)" | Out-Null
}

Assert-Sha256 -Path $modelPath -Expected $manifest.components.model.sha256 -Label "installed model/$($manifest.components.model.name)"

$expectedNativeFiles = @(
  $manifest.components.ffmpeg.files.PSObject.Properties.Name
  $manifest.components.whisper.files.PSObject.Properties.Name
)
$unexpectedNativeFiles = @(
  Get-ChildItem -LiteralPath $binDir -File |
    Where-Object { $_.Extension -in @(".exe", ".dll") -and $_.Name -notin $expectedNativeFiles }
)
foreach ($unexpectedFile in $unexpectedNativeFiles) {
  Write-Warning "Ignoring unneeded native file that is not in the runtime allowlist: $($unexpectedFile.FullName)"
}

Write-Host "[SUCCESS] Pinned and verified native runtime is ready."
Write-Host "[INFO] Manifest: $manifestPath"
