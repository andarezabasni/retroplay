# Bundled binaries (sidecars)

RetroPlay bundles `yt-dlp` and `ffmpeg` as Tauri **sidecars** so end users can
install the app **once** and download songs without installing anything else.

## What is a sidecar?

A sidecar is an external executable that Tauri packages inside the app and ships
next to the main binary. At runtime the backend calls the bundled `yt-dlp`
(which uses the bundled `ffmpeg`) instead of relying on tools installed on the
user's machine. If a user already has `yt-dlp` on their PATH, RetroPlay falls
back to it automatically.

> Users do **not** download anything extra. Only you (the developer) place the
> binaries here once, before building the installer.

## Required files (Windows, x86_64)

Tauri looks for each binary with the host **target triple** suffix:

```
binaries/yt-dlp-x86_64-pc-windows-msvc.exe
binaries/ffmpeg-x86_64-pc-windows-msvc.exe
```

These files are git-ignored (they are large). Run the setup script to fetch
them automatically:

```powershell
cd src-tauri/binaries
./download.ps1
```

To find your own target triple, run:

```powershell
rustc -Vv   # look at the "host:" line
```

For other platforms, place `yt-dlp` / `ffmpeg` with the matching suffix, e.g.
`yt-dlp-aarch64-apple-darwin`, `ffmpeg-x86_64-unknown-linux-gnu`.
