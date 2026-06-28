import { useState, useEffect, useCallback, useRef } from "react";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import {
  scanMusicFolder,
  pickFolder,
  getTrackAssetUrl,
  fetchLyrics,
  downloadAudio,
  loadPlaylists,
  savePlaylist,
  deletePlaylist,
  isTauri,
  type Track,
} from "./utils/tauriBridge";
import { parseLrc, findActiveLine, LrcLine } from "./utils/lrc";
import { formatTime } from "./utils/format";
import { CachedLyrics } from "./utils/types";
import "./styles/retro.css";

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [search, setSearch] = useState("");
  const [isMock, setIsMock] = useState(false);
  const [musicFolder, setMusicFolder] = useState<string>(() =>
    localStorage.getItem("retroplay_folder") || ""
  );
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [lyricsStatus, setLyricsStatus] = useState<string>("");
  const [lyricsCache, setLyricsCache] = useState<Record<string, CachedLyrics>>({});
  const [playlists, setPlaylists] = useState<Record<string, Track[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showPlaylistInput, setShowPlaylistInput] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricsReq = useRef(0);

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;

  // Source tracks: full library or active playlist
  const sourceTracks = activePlaylist && playlists[activePlaylist]
    ? playlists[activePlaylist]
    : tracks;

  const playerRef = useRef<any>(null);

  const handleTrackEnd = useCallback(() => {
    const p = playerRef.current;
    if (!p || sourceTracks.length === 0) return;
    if (p.shuffle) {
      selectTrack(Math.floor(Math.random() * sourceTracks.length));
    } else if (currentIndex < sourceTracks.length - 1) {
      selectTrack(currentIndex + 1);
    } else if (p.repeat === "all") {
      selectTrack(0);
    }
  }, [sourceTracks.length, currentIndex]);

  const player = useAudioPlayer(handleTrackEnd, () =>
    setPlaybackError("Gagal memutar track — file mungkin rusak atau hilang.")
  );
  playerRef.current = player;

  // Scan folder on load (or auto-mock in browser)
  useEffect(() => {
    if (!isTauri()) {
      scanFolder("/mock");
      setIsMock(true);
      return;
    }
    if (musicFolder) {
      scanFolder(musicFolder);
      loadPlaylistsData(musicFolder);
    }
  }, [musicFolder]);

  async function scanFolder(folder: string) {
    try {
      const result: Track[] = await scanMusicFolder(folder);
      setTracks(result);
    } catch (err) {
      console.error("Scan error:", err);
    }
  }

  async function handlePickFolder() {
    const selected = await pickFolder();
    if (selected) {
      setMusicFolder(selected);
      localStorage.setItem("retroplay_folder", selected);
    }
  }

  async function handleDownload() {
    const url = ytUrl.trim();
    if (!url || !musicFolder || downloading) return;
    setDownloading(true);
    setDownloadMsg("Mengunduh… (bisa 1–2 menit)");
    try {
      const result = await downloadAudio(musicFolder, url);
      setDownloadMsg(`✓ ${result}`);
      setYtUrl("");
      await scanFolder(musicFolder);
    } catch (err) {
      setDownloadMsg(`✕ ${err}`);
    } finally {
      setDownloading(false);
    }
  }

  async function loadPlaylistsData(folder: string) {
    try {
      const result: Record<string, Track[]> = await loadPlaylists(folder);
      setPlaylists(result);
    } catch (err) {
      console.error("Load playlists error:", err);
    }
  }

  async function createPlaylist() {
    const name = newPlaylistName.trim();
    if (!name || !musicFolder || playlists[name]) return;
    if (/[\/\\:]|\.\./.test(name)) {
      setNewPlaylistName("");
      return;
    }
    await savePlaylist(musicFolder, name, []);
    setPlaylists((prev) => ({ ...prev, [name]: [] }));
    setNewPlaylistName("");
    setShowPlaylistInput(false);
  }

  async function handleDeletePlaylist(name: string) {
    if (!musicFolder) return;
    await deletePlaylist(musicFolder, name);
    setPlaylists((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activePlaylist === name) setActivePlaylist(null);
  }

  async function handleAddToPlaylist(playlistName: string) {
    if (!currentTrack || !musicFolder) return;
    const currentList = playlists[playlistName] || [];
    if (currentList.some((t) => t.path === currentTrack.path)) return;
    const updated = [...currentList, currentTrack];
    const paths = updated.map((t) => t.path);
    await savePlaylist(musicFolder, playlistName, paths);
    setPlaylists((prev) => ({ ...prev, [playlistName]: updated }));
  }

  function selectPlaylist(name: string | null) {
    setActivePlaylist(name);
  }

  async function selectTrack(index: number) {
    const track = sourceTracks[index];
    if (!track) return;
    // Token to ignore stale lyrics results when switching tracks quickly.
    const reqId = ++lyricsReq.current;
    setCurrentIndex(index);
    setLrcLines([]);
    setPlaybackError("");

    const assetUrl = await getTrackAssetUrl(track.path);
    if (assetUrl) {
      player.play(assetUrl);
    } else {
      // Browser mock — just simulate playback
      console.log(`[mock] Playing: ${track.title} — ${track.artist}`);
    }

    // Fetch lyrics
    const cacheKey = `${track.artist}::${track.title}`;
    if (lyricsCache[cacheKey]) {
      const cached = lyricsCache[cacheKey];
      if (cached.synced) {
        setLrcLines(parseLrc(cached.synced));
        setLyricsStatus("synced");
      } else if (cached.instrumental) {
        setLyricsStatus("instrumental");
      } else if (cached.plain) {
        setLyricsStatus("plain");
      } else {
        setLyricsStatus("not-found");
      }
      return;
    }

    setLyricsStatus("fetching");
    const result = await fetchLyrics(
      track.title, track.artist, track.album, track.duration_secs
    );
    setLyricsCache((prev) => ({ ...prev, [cacheKey]: result }));

    // Track berganti selagi fetch berjalan → abaikan hasil lama.
    if (reqId !== lyricsReq.current) return;

    if (result.synced) {
      setLrcLines(parseLrc(result.synced));
      setLyricsStatus("synced");
    } else if (result.instrumental) {
      setLyricsStatus("instrumental");
    } else if (result.plain) {
      setLyricsStatus("plain");
    } else {
      setLyricsStatus("not-found");
    }
  }

  function handlePrev() {
    if (currentIndex > 0) selectTrack(currentIndex - 1);
    else if (player.repeat === "all") selectTrack(sourceTracks.length - 1);
  }

  function handleNext() {
    if (player.shuffle) {
      selectTrack(Math.floor(Math.random() * sourceTracks.length));
    } else if (currentIndex < sourceTracks.length - 1) {
      selectTrack(currentIndex + 1);
    } else if (player.repeat === "all") {
      selectTrack(0);
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    player.seek(pct * player.duration);
  }

  // Active lyrics line
  const activeLine = findActiveLine(lrcLines, player.currentTime);

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeLine < 0 || !lyricsContainerRef.current) return;
    const container = lyricsContainerRef.current;
    const lineEl = container.children[activeLine] as HTMLElement;
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLine]);

  // Filter tracks
  const filteredTracks = sourceTracks.filter((t) => {
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });

  // Get plain lyrics as lines for display
  const plainLyricsLines = lyricsStatus === "plain" && lyricsCache[
    currentTrack ? `${currentTrack.artist}::${currentTrack.title}` : ""
  ]?.plain?.split("\n").filter(Boolean) || [];

  return (
    <div className="app-layout">
      {isMock && (
        <div className="mock-banner">
          🧪 BROWSER MOCK MODE — Run <code>npm run tauri dev</code> for full desktop app
        </div>
      )}
      {/* ── Library Panel ── */}
      <div className="library-panel">
        <div className="library-header">
          <h1>RETROPLAY</h1>
          <input
            className="library-search"
            type="text"
            placeholder="Search tracks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="folder-select-btn" onClick={handlePickFolder}>
            {musicFolder
              ? `♪ ${musicFolder.split("\\").pop() || musicFolder.split("/").pop()}`
              : "Select Music Folder"}
          </button>

          {musicFolder && (
            <>
              <div className="yt-add">
                <input
                  className="yt-input"
                  type="text"
                  placeholder="Paste link YouTube…"
                  value={ytUrl}
                  disabled={downloading}
                  onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDownload()}
                />
                <button
                  className="yt-btn"
                  onClick={handleDownload}
                  disabled={downloading || !ytUrl.trim()}
                  title="Download lagu dari link"
                >
                  {downloading ? "…" : "↓"}
                </button>
              </div>
              {downloadMsg && <div className="yt-status">{downloadMsg}</div>}
            </>
          )}
        </div>

        {/* ── Playlists ── */}
        {musicFolder && (
          <div className="playlist-section">
            <div className="playlist-header">
              <span className="playlist-title">PLAYLISTS</span>
              <button
                className="playlist-add-btn"
                onClick={() => setShowPlaylistInput(!showPlaylistInput)}
                title="New playlist"
              >+</button>
            </div>
            {showPlaylistInput && (
              <div className="playlist-input-row">
                <input
                  className="playlist-name-input"
                  type="text"
                  placeholder="Playlist name..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
                />
                <button className="playlist-create-btn" onClick={createPlaylist}>✓</button>
              </div>
            )}
            <div
              className={`playlist-item ${activePlaylist === null ? "active" : ""}`}
              onClick={() => selectPlaylist(null)}
            >
              <span>📚 All Tracks</span>
              <span className="playlist-count">{tracks.length}</span>
            </div>
            {Object.entries(playlists).map(([name, plTracks]) => (
              <div
                key={name}
                className={`playlist-item ${activePlaylist === name ? "active" : ""}`}
                onClick={() => selectPlaylist(name)}
              >
                <span>♪ {name}</span>
                <span className="playlist-count">{plTracks.length}</span>
                <button
                  className="playlist-delete-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(name); }}
                  title="Delete playlist"
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div className="track-list">
          {filteredTracks.map((track, i) => {
            const realIndex = sourceTracks.indexOf(track);
            return (
              <div
                key={track.path}
                className={`track-item ${realIndex === currentIndex ? "active" : ""}`}
                onClick={() => selectTrack(realIndex)}
              >
                <div
                  className={`track-indicator ${realIndex === currentIndex && player.isPlaying ? "playing" : ""
                    }`}
                />
                <div className="track-info">
                  <div className="track-title">{track.title}</div>
                  <div className="track-artist">{track.artist}</div>
                </div>
                <div className="track-duration">
                  {formatTime(track.duration_secs)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="library-stats">
          {tracks.length} tracks
          {musicFolder && ` — ${musicFolder.split("\\").pop() || musicFolder.split("/").pop()}`}
        </div>
      </div>

      {/* ── Center Panel ── */}
      <div className="center-panel">
        {currentTrack ? (
          <>
            <div className="now-playing-art">
              <div className={`vinyl-disc ${player.isPlaying ? "spinning" : ""}`} />
            </div>
            <div className="now-playing-info">
              <div className="now-playing-title">{currentTrack.title}</div>
              <div className="now-playing-artist">{currentTrack.artist}</div>
              {playbackError && (
                <div className="playback-error">{playbackError}</div>
              )}
              {Object.keys(playlists).length > 0 && (
                <div className="add-to-playlist">
                  <select
                    className="playlist-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddToPlaylist(e.target.value);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="" disabled>+ Add to playlist</option>
                    {Object.keys(playlists).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>NO SIGNAL</h2>
            <p>
              Select a music folder and<br />
              pick a track to start playing
            </p>
          </div>
        )}
      </div>

      {/* ── Lyrics Panel ── */}
      <div className="lyrics-panel">
        <div className="lyrics-header">Lyrics</div>
        {lyricsStatus === "synced" && lrcLines.length > 0 ? (
          <div className="lyrics-container" ref={lyricsContainerRef}>
            {lrcLines.map((line, i) => (
              <div
                key={i}
                className={`lyrics-line ${i === activeLine ? "active" : i < activeLine ? "past" : ""
                  }`}
                onClick={() => player.seek(line.time)}
              >
                {line.text}
              </div>
            ))}
          </div>
        ) : lyricsStatus === "plain" && plainLyricsLines.length > 0 ? (
          <div className="lyrics-container">
            {plainLyricsLines.map((line, i) => (
              <div key={i} className="lyrics-line past">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="lyrics-empty">
            <div className="icon">♪</div>
            {lyricsStatus === "fetching" && "Fetching lyrics..."}
            {lyricsStatus === "instrumental" && "Instrumental track"}
            {lyricsStatus === "not-found" && "No lyrics available"}
            {!lyricsStatus && (currentTrack ? "Loading..." : "Select a track")}
          </div>
        )}
        {lyricsStatus && lyricsStatus !== "fetching" && currentTrack && (
          <div className="lyrics-status">
            {lyricsStatus === "synced" && "● synced lyrics via lrclib.net"}
            {lyricsStatus === "plain" && "○ plain lyrics (not synced)"}
            {lyricsStatus === "instrumental" && "◇ instrumental"}
            {lyricsStatus === "not-found" && "✕ lyrics not found"}
          </div>
        )}
        {lyricsStatus === "fetching" && (
          <div className="lyrics-status fetching">fetching from lrclib.net...</div>
        )}
      </div>

      {/* ── Player Bar ── */}
      <div className="player-bar">
        <div className="controls">
          <button
            className={`ctrl-btn ${player.shuffle ? "active" : ""}`}
            onClick={player.toggleShuffle}
            title="Shuffle"
          >⇌</button>
          <button className="ctrl-btn" onClick={handlePrev} title="Previous">⏮</button>
          <button
            className="ctrl-btn play-btn"
            onClick={currentTrack ? player.togglePlay : undefined}
            title={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? "⏸" : "▶"}
          </button>
          <button className="ctrl-btn" onClick={handleNext} title="Next">⏭</button>
          <button
            className={`ctrl-btn ${player.repeat !== "off" ? "active" : ""}`}
            onClick={player.cycleRepeat}
            title={`Repeat: ${player.repeat}`}
          >
            {player.repeat === "one" ? "⟳1" : "⟳"}
          </button>
        </div>

        <div className="progress-section">
          <span className="time-display">{formatTime(player.currentTime)}</span>
          <div className="progress-bar-container" onClick={handleProgressClick}>
            <div
              className="progress-bar-fill"
              style={{
                width: player.duration
                  ? `${(player.currentTime / player.duration) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <span className="time-display">{formatTime(player.duration)}</span>
        </div>

        <div className="volume-section">
          <span className="volume-label">VOL</span>
          <input
            className="volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.volume}
            onChange={(e) => player.setVolume(parseFloat(e.target.value))}
          />
          <span className="volume-label">{Math.round(player.volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
