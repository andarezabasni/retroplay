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

## Requirements
- Node.js 18+
- Rust
- `yt-dlp` and `ffmpeg` (only if you want downloads)
- Firefox logged in to YouTube (for cookie-based downloads)
- Windows: Visual Studio C++ Build Tools

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
```bash
npm run tauri build
```

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
