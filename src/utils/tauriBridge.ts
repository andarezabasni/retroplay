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
  folder: string,
  title: string,
  artist: string,
  album: string,
  durationSecs: number,
): Promise<LyricsResult> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("fetch_lyrics", { folder, title, artist, album, durationSecs });
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

/** Saved main-window geometry, in physical pixels — physical coordinates are
 *  global across monitors, so mixed-DPI dual-screen setups restore correctly. */
export interface WindowSnapshot {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
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
  shadow: boolean,
): Promise<WindowSnapshot | null> {
  if (!isTauri()) {
    console.log(`[mock] enterFloatWindow(${width}×${height}, ${place})`);
    return null;
  }
  const { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor } =
    await import("@tauri-apps/api/window");
  const win = getCurrentWindow();

  // Unmaximizing teleports the window to its pre-maximize position, which may
  // be on another monitor. Remember the monitor the maximized window was on
  // so exitFloatMode can maximize it back there instead.
  const maximized = await win.isMaximized();
  const homeMonitor = maximized ? await currentMonitor() : null;
  if (maximized) {
    await win.unmaximize();
  }

  // innerSize, not outerSize: setSize() sets the *content* size, so restoring
  // an outer snapshot would grow the window by the frame height every cycle.
  const size = await win.innerSize();
  const pos = await win.outerPosition();
  const snapshot: WindowSnapshot =
    maximized && homeMonitor
      ? {
          // Anchor inside the original monitor; exit re-maximizes from there.
          x: homeMonitor.position.x + 64,
          y: homeMonitor.position.y + 64,
          width: size.width,
          height: size.height,
          maximized: true,
        }
      : { width: size.width, height: size.height, x: pos.x, y: pos.y, maximized };

  await win.setDecorations(false);
  await win.setAlwaysOnTop(true);
  await win.setResizable(false);
  // The DWM drop shadow paints a translucent rounded box behind undecorated
  // windows — on the transparent lyrics overlay it must be off.
  await win.setShadow(shadow);
  // Clear the main window's min-size constraint — otherwise Windows clamps
  // setSize back up to 900×600 and the floating panel never shrinks.
  await win.setMinSize(null);
  await win.setSize(new LogicalSize(width, height));

  const mon = await currentMonitor();
  if (mon) {
    const f = mon.scaleFactor;
    const wPhys = Math.round(width * f);
    const hPhys = Math.round(height * f);
    const x =
      place === "bottom-right"
        ? mon.position.x + mon.size.width - wPhys - Math.round(16 * f)
        : mon.position.x + Math.round((mon.size.width - wPhys) / 2);
    const y = mon.position.y + mon.size.height - hPhys - Math.round(56 * f);
    await win.setPosition(new PhysicalPosition(x, y));
  }
  return snapshot;
}

/** Mini player: bottom-right corner. */
export function enterMiniMode(): Promise<WindowSnapshot | null> {
  return enterFloatWindow(MINI_W, MINI_H, "bottom-right", true);
}

/** Floating lyrics overlay: wide bar at the bottom-center. */
export function enterLyricsOverlay(): Promise<WindowSnapshot | null> {
  return enterFloatWindow(OVERLAY_W, OVERLAY_H, "bottom-center", false);
}

/** Restore the main window from any floating mode. */
export async function exitFloatMode(snap: WindowSnapshot | null): Promise<void> {
  if (!isTauri()) {
    console.log("[mock] exitFloatMode()");
    return;
  }
  const { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition, availableMonitors } =
    await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(false);
  await win.setDecorations(true);
  await win.setResizable(true);
  await win.setShadow(true);
  await win.setMinSize(new LogicalSize(MAIN_MIN_W, MAIN_MIN_H));

  if (!snap) {
    await win.setSize(new LogicalSize(1100, 720));
    await win.center();
    return;
  }

  // The snapshot is in physical pixels. Clamp it onto the monitor it belongs
  // to (the one containing its top-left corner) so the title bar stays
  // reachable — important on dual screens, where the snapshot's monitor is
  // not necessarily the one the floating panel is on now.
  const monitors = await availableMonitors();
  const mon =
    monitors.find(
      (m) =>
        snap.x >= m.position.x &&
        snap.x < m.position.x + m.size.width &&
        snap.y >= m.position.y &&
        snap.y < m.position.y + m.size.height,
    ) ?? monitors[0];

  if (mon) {
    const f = mon.scaleFactor;
    const width = Math.max(snap.width, Math.round(MAIN_MIN_W * f));
    const height = Math.max(snap.height, Math.round(MAIN_MIN_H * f));
    await win.setSize(new PhysicalSize(width, height));
    const maxX = mon.position.x + Math.max(mon.size.width - width, 0);
    const maxY = mon.position.y + Math.max(mon.size.height - height, 0);
    const x = Math.min(Math.max(snap.x, mon.position.x), maxX);
    const y = Math.min(Math.max(snap.y, mon.position.y), maxY);
    await win.setPosition(new PhysicalPosition(x, y));
  } else {
    await win.setSize(new PhysicalSize(snap.width, snap.height));
    await win.setPosition(new PhysicalPosition(snap.x, snap.y));
  }

  // The window is back on its home monitor — now maximize returns it to the
  // maximized state it was in there.
  if (snap.maximized) {
    await win.maximize();
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
