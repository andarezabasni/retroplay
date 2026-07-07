/**
 * Tauri Bridge — abstracts Tauri APIs so the app can also run in a browser
 * for development. When running outside Tauri, mocks are used.
 */

// ── Detector ──
const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// ── Types ──
export interface Track {
  path: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  duration_secs: number;
}

export interface LyricsResult {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}

// ── Mock Data ──
// Using public domain / CC-licensed audio previews for browser testing
const MOCK_TRACKS: Track[] = [
  {
    path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    filename: "Drake - God's Plan",
    title: "God's Plan",
    artist: "Drake",
    album: "Scorpion",
    duration_secs: 198.5,
  },
  {
    path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    filename: "Drake - One Dance",
    title: "One Dance",
    artist: "Drake",
    album: "Views",
    duration_secs: 173.0,
  },
  {
    path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    filename: "Drake - Hotline Bling",
    title: "Hotline Bling",
    artist: "Drake",
    album: "Views",
    duration_secs: 267.0,
  },
];

// ── LRCLIB fetch (works in both environments) ──
async function fetchLyricsBrowser(
  title: string,
  artist: string,
  album: string,
  durationSecs: number,
): Promise<LyricsResult> {
  try {
    const headers = { "User-Agent": "RetroPlay/1.0.0" };

    // Try multiple queries, prioritize synced > plain
    const urls = [
      `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&album_name=${encodeURIComponent(album)}&duration=${Math.round(durationSecs)}`,
      `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&duration=${Math.round(durationSecs)}`,
      `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
    ];

    let bestSynced: string | null = null;
    let bestPlain: string | null = null;

    for (const url of urls) {
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue;

      const data = await resp.json();

      if (Array.isArray(data)) {
        // Search results — pick closest duration, prefer synced
        const sorted = [...data].sort((a: any, b: any) => {
          const da = a.duration ? Math.abs(a.duration - durationSecs) : 9999;
          const db = b.duration ? Math.abs(b.duration - durationSecs) : 9999;
          // Prefer synced
          const aScore = a.syncedLyrics ? 0 : 1;
          const bScore = b.syncedLyrics ? 0 : 1;
          return aScore - bScore || da - db;
        });
        for (const r of sorted) {
          if (r.syncedLyrics && !bestSynced) bestSynced = r.syncedLyrics;
          if (r.plainLyrics && !bestPlain) bestPlain = r.plainLyrics;
          if (bestSynced) break;
        }
      } else {
        // Single result
        if (data.syncedLyrics && !bestSynced) bestSynced = data.syncedLyrics;
        if (data.plainLyrics && !bestPlain) bestPlain = data.plainLyrics;
      }

      if (bestSynced) break;
    }

    return {
      synced: bestSynced,
      plain: bestPlain,
      instrumental: false,
    };
  } catch {
    return { synced: null, plain: null, instrumental: false };
  }
}

// ── Public API ──

export async function scanMusicFolder(folder: string): Promise<Track[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("scan_music_folder", { folder });
  }
  // Browser mock - return mock tracks with slight delay
  await new Promise((r) => setTimeout(r, 400));
  console.log(`[mock] scanMusicFolder("${folder}") → ${MOCK_TRACKS.length} tracks`);
  return MOCK_TRACKS.map((t) => ({ ...t }));
}

export async function pickFolder(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  // Browser mock - auto-select a virtual folder
  console.log("[mock] pickFolder() → using mock folder");
  return "/mock/music-folder";
}

export async function getTrackAssetUrl(path: string): Promise<string> {
  if (isTauri()) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return convertFileSrc(path);
  }
  // Browser mock — use the path directly (which is a public MP3 URL)
  return path;
}

export async function fetchLyrics(
  title: string,
  artist: string,
  album: string,
  durationSecs: number,
): Promise<LyricsResult> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("fetch_lyrics", { title, artist, album, durationSecs });
  }
  return fetchLyricsBrowser(title, artist, album, durationSecs);
}

export async function downloadAudio(folder: string, url: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("download_audio", { folder, url });
  }
  // Browser mock — simulate a download delay
  await new Promise((r) => setTimeout(r, 1200));
  console.log(`[mock] downloadAudio("${url}")`);
  return "Mock Song berhasil diunduh";
}

export async function loadPlaylists(folder: string): Promise<Record<string, Track[]>> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("load_playlists", { folder });
  }
  return {};
}

export async function savePlaylist(
  folder: string,
  name: string,
  tracks: string[],
): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("save_playlist", { folder, name, tracks });
  }
  console.log(`[mock] savePlaylist("${name}", ${tracks.length} tracks)`);
}

export async function renamePlaylist(
  folder: string,
  oldName: string,
  newName: string,
): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("rename_playlist", { folder, oldName, newName });
  }
  console.log(`[mock] renamePlaylist("${oldName}" → "${newName}")`);
}

export async function deletePlaylist(folder: string, name: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("delete_playlist", { folder, name });
  }
  console.log(`[mock] deletePlaylist("${name}")`);
}

// ── Mini mode (floating always-on-top window) ──

export interface WindowSnapshot {
  width: number;
  height: number;
  x: number;
  y: number;
}

const MINI_W = 380;
const MINI_H = 160;
const OVERLAY_W = 760;
const OVERLAY_H = 190;

/** Main-window minimum size, matching tauri.conf.json. */
const MAIN_MIN_W = 900;
const MAIN_MIN_H = 600;

/**
 * Morph the main window into an undecorated always-on-top floating panel.
 * Returns the previous window geometry so exitFloatMode can restore it.
 */
async function enterFloatWindow(
  width: number,
  height: number,
  place: "bottom-right" | "bottom-center",
): Promise<WindowSnapshot | null> {
  if (!isTauri()) {
    console.log(`[mock] enterFloatWindow(${width}×${height}, ${place})`);
    return null;
  }
  const { getCurrentWindow, LogicalSize, LogicalPosition, currentMonitor } =
    await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  // A maximized window would snapshot its maximized size; unmaximize first
  // so restore returns to a sane floating size.
  if (await win.isMaximized()) {
    await win.unmaximize();
  }
  const factor = await win.scaleFactor();
  const size = (await win.outerSize()).toLogical(factor);
  const pos = (await win.outerPosition()).toLogical(factor);
  const snapshot = { width: size.width, height: size.height, x: pos.x, y: pos.y };

  await win.setDecorations(false);
  await win.setAlwaysOnTop(true);
  await win.setResizable(false);
  // Clear the main window's min-size constraint — otherwise Windows clamps
  // setSize back up to 900×600 and the floating panel never shrinks.
  await win.setMinSize(null);
  await win.setSize(new LogicalSize(width, height));

  const mon = await currentMonitor();
  if (mon) {
    const mSize = mon.size.toLogical(mon.scaleFactor);
    const mPos = mon.position.toLogical(mon.scaleFactor);
    const x =
      place === "bottom-right"
        ? mPos.x + mSize.width - width - 16
        : mPos.x + (mSize.width - width) / 2;
    const y = mPos.y + mSize.height - height - 56;
    await win.setPosition(new LogicalPosition(x, y));
  }
  return snapshot;
}

/** Mini player: bottom-right corner. */
export function enterMiniMode(): Promise<WindowSnapshot | null> {
  return enterFloatWindow(MINI_W, MINI_H, "bottom-right");
}

/** Floating lyrics overlay: wide bar at the bottom-center. */
export function enterLyricsOverlay(): Promise<WindowSnapshot | null> {
  return enterFloatWindow(OVERLAY_W, OVERLAY_H, "bottom-center");
}

/** Restore the main window from any floating mode. */
export async function exitFloatMode(snap: WindowSnapshot | null): Promise<void> {
  if (!isTauri()) {
    console.log("[mock] exitFloatMode()");
    return;
  }
  const { getCurrentWindow, LogicalSize, LogicalPosition } =
    await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(false);
  await win.setDecorations(true);
  await win.setResizable(true);
  await win.setMinSize(new LogicalSize(MAIN_MIN_W, MAIN_MIN_H));
  await win.setSize(new LogicalSize(snap?.width ?? 1100, snap?.height ?? 720));
  if (snap) {
    await win.setPosition(new LogicalPosition(snap.x, snap.y));
  }
}

/** Begin dragging the window (call from a mousedown handler). */
export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

/** Returns true if running inside Tauri desktop app */
export { isTauri };
