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
- Add songs straight from a YouTube link inside the app
- Playlists: create, rename, multi-select songs to add, remove songs
- Small footprint: it uses the system WebView, so the build is only a few MB

## Lyrics views & mini player

The buttons in the top-right of the Lyrics panel switch views:

- **⛶ Focus** — big centered lyrics that fill the window, like Spotify's
  lyrics screen. Press `Esc` or `✕` to go back.
- **⬓ Floating lyrics** — the window turns into a transparent bar pinned
  above every other app, showing just the current line. Hover over it to
  reveal playback controls; drag it anywhere; double-click or `Esc` to
  restore the full window.

The **▣** button at the right end of the player bar switches to the mini
player: a small floating card with the song title, controls, and the live
lyric line. Drag it to move, double-click (or **⤢**) to restore.

None of this can draw over the Windows lock screen (`Win+L`) — Windows
doesn't allow any app to do that.

## Requirements

- Node.js 18+
- Rust (with the Visual Studio C++ Build Tools on Windows)
- yt-dlp and ffmpeg — only if you want to download music
- Firefox, logged in to youtube.com — YouTube now rejects anonymous
  downloads ("Sign in to confirm you're not a bot"), so the app reads
  cookies from Firefox. Chrome doesn't work for this: its cookies are
  encrypted in a way yt-dlp can't read on Windows.

On Windows you can get yt-dlp and ffmpeg with:

```powershell
winget install yt-dlp
winget install ffmpeg
```

Keep yt-dlp updated (`yt-dlp -U`) — YouTube changes things often, and an
outdated yt-dlp is the most common reason downloads suddenly stop working.

## Running it (development)

```powershell
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

```powershell
npm run tauri build
```

You get two things under `src-tauri/target/release/`:

- `retroplay.exe` — the standalone app, portable
- `bundle/nsis/RetroPlay_1.0.0_x64-setup.exe` — an installer that also pulls in
  the WebView2 runtime if the target PC doesn't have it

On Windows 11 the plain exe just runs. Older Windows installs may be missing
WebView2, which is why the installer is the safer thing to share.

## How it works

Lyrics come from [LRCLIB](https://lrclib.net), a free public API. MP3 tags and
durations are read in Rust (id3 + mp3-duration). Playlists are saved as JSON in
a `.playlists` folder next to your music. The UI is React, and Tauri wraps it in
a native window using the system WebView instead of bundling a whole browser.
