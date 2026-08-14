# RetroPlay

RetroPlay is an offline music player for local MP3s, available on desktop and
Android. It supports synced lyrics, playlists, YouTube downloads, and background
playback with media notification controls on Android.

## Features
- Scan a local music folder and play MP3 files
- Shuffle, repeat, seek, and volume controls
- Synced lyrics from LRCLIB, with an offline cache
- Three lyrics modes on desktop: side panel, focus view, and floating overlay
- Mini player that stays on top (desktop)
- Playlists: create, rename, delete, add/remove tracks
- Download audio from a YouTube link with `yt-dlp`, with a live progress bar
- Android: background playback with a system media notification, and audio that
  continues when the app is in the background or the screen is off

## Install

Download the latest release from the [Releases page](https://github.com/andarezabasni/retroplay/releases/latest):

- Windows: `RetroPlay_3.1.0_x64-setup.exe` (recommended) or `RetroPlay_3.1.0_x64_en-US.msi`
- Android: `RetroPlay_3.1.0_android.apk`

On desktop, `yt-dlp` and `ffmpeg` are bundled with the installer. On Android they
are bundled inside the APK. There is nothing else to install.

### Windows install note
The installer is not signed with a paid certificate, so Windows SmartScreen may
show a warning. Choose "More info" then "Run anyway".

### Android install note
The APK is signed with a self-managed key, so enable "Install from unknown
sources" for your file manager or browser when prompted. Downloads are saved to
the app's own music folder and appear in the library automatically.

## YouTube downloads
Paste a YouTube link and RetroPlay downloads the audio as MP3. If YouTube changes
break the bundled `yt-dlp`, RetroPlay updates it to the latest nightly and retries
automatically. On desktop you can also update it manually from the About dialog.

Cookie handling on desktop is automatic: RetroPlay tries downloading without
cookies first, and only if YouTube demands a sign-in does it try cookies from an
installed browser (Firefox, Chrome, Edge, Brave, Chromium, Opera, Vivaldi).

## Build from source

These are only needed to build from source, not to run the installed app.

- Node.js 18+
- Rust
- Windows desktop: Visual Studio C++ Build Tools
- Android: Android SDK + NDK, and a JDK 17 or newer
### Desktop

Fetch the bundled `yt-dlp` and `ffmpeg` binaries once:
```powershell
cd src-tauri/binaries
./download.ps1
```
Then run or build:
```bash
npm install
npm run tauri dev      # run locally
npm run tauri build    # produce installers
```
For browser-only UI testing, use `npm run dev`.

See [src-tauri/binaries/README.md](src-tauri/binaries/README.md) for details.

### Linux dependencies
Install the Tauri system dependencies for your distro.

Example for Debian/Ubuntu:
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Android
```bash
npm run tauri android init     # once, generates the Android project
npm run tauri android dev      # run on a device/emulator
npm run tauri android build --apk
```
Release signing reads `src-tauri/gen/android/keystore.properties`, which is kept
out of version control.

## Project structure
- `src/` — React frontend
- `src-tauri/` — Rust backend
- `src-tauri/gen/android/` — Android project (Kotlin plugins for downloads and
  playback)

## Notes
- First launch shows an onboarding modal.
- Lyrics and playlists are stored next to the selected music folder.
- Floating windows and the mini player are desktop-only.
- On Android, playback uses a native Media3 service; on desktop it uses the
  built-in audio element.
- MP3 metadata is read from tags first, then falls back to the filename.

## Credits
Made by [andreza.dev](https://instagram.com/andreza.dev)
GitHub: [@andarezabasni](https://github.com/andarezabasni)
