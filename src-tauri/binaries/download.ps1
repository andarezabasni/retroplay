<#
.SYNOPSIS
  Downloads yt-dlp.exe and ffmpeg.exe and names them with the Rust host target
  triple so Tauri can bundle them as sidecars.

.DESCRIPTION
  Run this once (per machine / target) before `npm run tauri build`:

      cd src-tauri/binaries
      ./download.ps1

  It fetches:
    - yt-dlp.exe  (latest release from GitHub)
    - ffmpeg.exe  (latest gyan.dev essentials build)

  and saves them as:
    - yt-dlp-<triple>.exe
    - ffmpeg-<triple>.exe
#>

$ErrorActionPreference = "Stop"

# Some Windows PowerShell 5.x defaults to TLS 1.0; GitHub/gyan require TLS 1.2.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Resolve the host target triple from rustc (e.g. x86_64-pc-windows-msvc).
$triple = (& rustc -Vv | Select-String "^host:").ToString().Split(":")[1].Trim()
if (-not $triple) { throw "Could not determine Rust host target triple. Is rustc installed?" }
Write-Host "Target triple: $triple" -ForegroundColor Cyan

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ytDest = Join-Path $here "yt-dlp-$triple.exe"
$ffDest = Join-Path $here "ffmpeg-$triple.exe"

# ── yt-dlp ──
# Always fetch the latest yt-dlp nightly: YouTube changes often break older
# builds with HTTP 403 / extraction errors, and the nightly channel ships
# fixes before stable, so a stable bundled binary rots faster.
Write-Host "Downloading latest yt-dlp (nightly)..." -ForegroundColor Cyan
$ytUrl = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe"
Invoke-WebRequest -Uri $ytUrl -OutFile $ytDest
Write-Host "  -> $ytDest" -ForegroundColor Green

# ── ffmpeg ──
if (Test-Path $ffDest) {
  Write-Host "ffmpeg already present, skipping." -ForegroundColor DarkGray
} else {
  Write-Host "Downloading ffmpeg (this can take a minute)..." -ForegroundColor Cyan
  $zipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
  $tmpZip = Join-Path $env:TEMP "ffmpeg-retroplay.zip"
  $tmpDir = Join-Path $env:TEMP "ffmpeg-retroplay"
  Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip
  if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
  Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
  $ffSrc = Get-ChildItem -Path $tmpDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
  if (-not $ffSrc) { throw "ffmpeg.exe not found inside the downloaded archive." }
  Copy-Item -Path $ffSrc.FullName -Destination $ffDest -Force
  Remove-Item -Force $tmpZip
  Remove-Item -Recurse -Force $tmpDir
  Write-Host "  -> $ffDest" -ForegroundColor Green
}

Write-Host "`nDone. You can now run 'npm run tauri build'." -ForegroundColor Green
