export interface Track {
  path: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  duration_secs: number;
}

export interface CachedLyrics {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}
