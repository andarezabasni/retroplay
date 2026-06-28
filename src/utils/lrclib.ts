import { invoke } from "@tauri-apps/api/core";

interface LyricsResult {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}

export async function fetchLyrics(
  title: string,
  artist: string,
  album: string,
  durationSecs: number,
): Promise<LyricsResult> {
  try {
    const result: LyricsResult = await invoke("fetch_lyrics", {
      title,
      artist,
      album,
      durationSecs,
    });
    return result;
  } catch (err) {
    console.error("LRCLIB fetch error:", err);
    return { synced: null, plain: null, instrumental: false };
  }
}
