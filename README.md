<img width="1672" height="941" alt="ChatGPT Image Jun 28, 2026, 08_06_12 PM" src="https://github.com/user-attachments/assets/6a35af8b-7719-4977-8e08-1315a1d497a4" />

# RetroPlay

An offline desktop music player for local MP3s, with synced lyrics and a retro
look. Built with Tauri, React, and Rust.

Instead of subscribing to Spotify, I decided to create a simple app that suits my wishes, namely a minimalist design and features.
I made this to play my own music — mostly lo-fi and instrumentals — without
paying for streaming, but still get lyrics when I want them.

## Features

- Plays local MP3 files from any folder
- Synced lyrics from LRCLIB that scroll with the song; click a line to jump
- Three lyrics views: side panel, a big Spotify-style focus view, and
  floating desktop lyrics that stay on top of other apps
- Mini player: shrink the whole app into a small always-on-top card with
  playback controls and the current lyric line
- Offline lyrics cache: once lyrics sync, they're saved locally and work
  without internet
- Customizable lyrics overlay: choose text color, font, and size to match
  any wallpaper brightness
- Add songs straight from a YouTube link inside the app
- Playlists: create, rename, multi-select songs to add, remove songs
- Small footprint: it uses the system WebView, so the build is only a few MB

## First Time Setup

When you launch RetroPlay, a guide explains the four main features:

1. **Playlists** — organize your music into custom collections
2. **Mini Player** — floating card that stays on top of other windows
3. **Lyrics Views** — three ways to read: side panel, center focus, or overlay
4. **Offline Cache** — lyrics save locally once synced, no internet needed

You can dismiss this guide anytime—it won't show again unless you clear
browser storage. To see it again, open the browser's developer tools
(`F12`), go to Storage → Local Storage, and delete the
`retroplay_onboarding_shown` entry.

## Lyrics views & mini player

The buttons in the top-right of the Lyrics panel switch views:

- **⛶ Focus** — big centered lyrics that fill the window, like Spotify's
  lyrics screen. Press `Esc` or `✕` to go back.
- **⬓ Floating lyrics** — the window turns into a transparent bar pinned
  above every other app, showing just the current line. Hover over it to
  reveal playback controls and text style options; drag it anywhere;
  double-click or `Esc` to restore the full window.

The **▣** button at the right end of the player bar switches to the mini
player: a small floating card with the song title, controls, and the live
lyric line. Drag it to move, double-click (or **⤢**) to restore.

When the floating lyrics overlay is active, click the gear icon (⚙) to
customize text color, font, and size. These settings persist across restarts.

None of this can draw over the Windows lock screen (`Win+L`) — Windows
doesn't allow any app to do that.

## Requirements

### Common
- Node.js 18+
- Rust
- yt-dlp and ffmpeg — only if you want to download music
- Firefox, logged in to youtube.com — YouTube now rejects anonymous
  downloads ("Sign in to confirm you're not a bot"), so the app reads
  cookies from Firefox.

### Windows
- Visual Studio C++ Build Tools

```powershell
winget install yt-dlp
winget install ffmpeg
```

### Linux (Ubuntu/Debian)

```bash
# Rust dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Optional: for downloading music
sudo apt install yt-dlp ffmpeg
```

### Linux (Fedora/RHEL)

```bash
# Rust dependencies
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel

# Optional: for downloading music
sudo dnf install yt-dlp ffmpeg
```

### Linux (Arch)

```bash
# Rust dependencies
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg

# Optional: for downloading music
sudo pacman -S yt-dlp ffmpeg
```

Keep yt-dlp updated (`yt-dlp -U`) — YouTube changes things often, and an
outdated yt-dlp is the most common reason downloads suddenly stop working.

## Running it (development)

```bash
npm install
npm run tauri dev
```

The first run compiles the Rust backend and takes a few minutes. After that it
starts quickly.

## Adding music

Easiest way: pick your music folder in the app, paste a YouTube link into the
box at the top left, and press Enter. The song downloads into that folder and
shows up in the library.

You can also download from the command line (same flags the app uses):

```powershell
yt-dlp --cookies-from-browser firefox -4 -x --audio-format mp3 --audio-quality 0 --embed-metadata -o "%USERPROFILE%\Music\retroplay\%(artist,uploader)s - %(track,title)s.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
```

If a download fails with "Sign in to confirm you're not a bot", open
Firefox, sign in to youtube.com, and try again. The `-4` flag forces IPv4,
which avoids YouTube's rate limiting (HTTP 429) on some IPv6 connections.

Lyrics are matched by the song's title and artist, so the tags (or the file
name) matter. If a track shows no lyrics, it's almost always because the
metadata is off — naming files `Artist - Title.mp3` is enough. The app also
strips common junk like `NA -`, `(Official Video)`, `feat. ...` and ` - Topic`
before searching, so older downloads usually still work.

## Building

```bash
npm run tauri build
```

### Windows

You get two things under `src-tauri/target/release/`:

- `retroplay.exe` — the standalone app, portable
- `bundle/nsis/RetroPlay_1.0.0_x64-setup.exe` — an installer that also pulls in
  the WebView2 runtime if the target PC doesn't have it

On Windows 11 the plain exe just runs. Older Windows installs may be missing
WebView2, which is why the installer is the safer thing to share.

### Linux

You get under `src-tauri/target/release/bundle/`:

- `deb/retroplay_1.0.0_amd64.deb` — Debian/Ubuntu package
- `appimage/retroplay_1.0.0_amd64.AppImage` — Portable AppImage (works on most distros)

Install the `.deb` with:
```bash
sudo dpkg -i retroplay_1.0.0_amd64.deb
sudo apt-get install -f  # Fix missing dependencies
```

Run the AppImage:
```bash
chmod +x retroplay_1.0.0_amd64.AppImage
./retroplay_1.0.0_amd64.AppImage
```

### macOS

You get under `src-tauri/target/release/bundle/`:

- `macos/RetroPlay.app` — macOS application bundle
- `dmg/RetroPlay_1.0.0_x64.dmg` — DMG installer

## How it works

Lyrics come from [LRCLIB](https://lrclib.net), a free public API. MP3 tags and
durations are read in Rust (id3 + mp3-duration). Playlists are saved as JSON in
a `.playlists` folder next to your music. Lyrics are cached in a `.lyrics`
folder so they're available offline. The UI is React, and Tauri wraps it in
a native window using the system WebView instead of bundling a whole browser.

## Credits

**Made by:** [andreza.dev](https://instagram.com/andreza.dev)

Find me on:
- **GitHub:** [@andarezabasni](https://github.com/andarezabasni)
- **Instagram:** [@andreza.dev](https://instagram.com/andreza.dev)
