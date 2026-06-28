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

export async function deletePlaylist(folder: string, name: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("delete_playlist", { folder, name });
  }
  console.log(`[mock] deletePlaylist("${name}")`);
}

/** Returns true if running inside Tauri desktop app */
export { isTauri };
