# RetroPlay

RetroPlay is an offline desktop music player for local MP3s. It supports synced lyrics, playlists, a floating mini player, and optional YouTube downloads.

## Features
- Scan a local music folder and play MP3 files
- Shuffle, repeat, seek, and volume controls
- Lyrics from LRCLIB
- Three lyrics modes: side panel, focus view, and floating overlay
- Mini player that stays on top
- Playlists: create, rename, delete, add/remove tracks
- Offline lyrics cache
- Download audio from YouTube with `yt-dlp`

## Install

Download the latest installer from the [Releases page](https://github.com/andarezabasni/retroplay/releases/latest):

- Windows: `RetroPlay_x64-setup.exe` (recommended) or `RetroPlay_x64_en-US.msi`
- Linux: `RetroPlay_amd64.AppImage` or `RetroPlay_amd64.deb`

`yt-dlp` and `ffmpeg` are bundled with the installer, so there is nothing else to
install.

## Requirements

These are only needed to build from source, not to run the installed app.

- Node.js 18+
- Rust
- Windows: Visual Studio C++ Build Tools

YouTube cookie handling is automatic: RetroPlay tries downloading without cookies
first, and only if YouTube demands a sign-in does it try cookies from an installed
browser (Firefox, Chrome, Edge, Brave, Chromium, Opera, Vivaldi).

### Linux
Install the Tauri system dependencies for your distro.

Example for Debian/Ubuntu:
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

## Run
```bash
npm install
npm run tauri dev
```

For browser-only UI testing, use:
```bash
npm run dev
```

## Build

Before building, fetch the bundled `yt-dlp` and `ffmpeg` binaries once:
```powershell
cd src-tauri/binaries
./download.ps1
```
Then build:
```bash
npm run tauri build
```
See [src-tauri/binaries/README.md](src-tauri/binaries/README.md) for details.

## Project structure
- `src/` — React frontend
- `src-tauri/` — Rust backend

## Notes
- First launch shows an onboarding modal.
- Lyrics and playlists are stored next to the selected music folder.
- Floating windows work only in the Tauri desktop app.
- MP3 metadata is read from tags first, then falls back to the filename.

## Credits
Made by [andreza.dev](https://instagram.com/andreza.dev)
GitHub: [@andarezabasni](https://github.com/andarezabasni)
