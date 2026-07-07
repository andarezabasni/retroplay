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
  renamePlaylist,
  deletePlaylist,
  enterMiniMode,
  enterLyricsOverlay,
  exitFloatMode,
  startWindowDrag,
  isTauri,
  type Track,
  type WindowSnapshot,
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
  const [editingPlaylist, setEditingPlaylist] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [miniMode, setMiniMode] = useState(false);
  const [lyricsView, setLyricsView] = useState<"panel" | "focus" | "overlay">("panel");
  const winSnapshot = useRef<WindowSnapshot | null>(null);
  const focusContainerRef = useRef<HTMLDivElement>(null);

  // Floating-lyrics text style, persisted so it survives restarts.
  interface OverlayStyle {
    color: "amber" | "white" | "black" | "mint";
    font: "retro" | "clean";
    size: "s" | "m" | "l";
  }
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>(() => {
    const fallback: OverlayStyle = { color: "amber", font: "retro", size: "m" };
    try {
      return {
        ...fallback,
        ...JSON.parse(localStorage.getItem("retroplay_overlay_style") || "{}"),
      };
    } catch {
      return fallback;
    }
  });
  const [overlaySettingsOpen, setOverlaySettingsOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem("retroplay_overlay_style", JSON.stringify(overlayStyle));
  }, [overlayStyle]);
  const [ytUrl, setYtUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricsReq = useRef(0);

  // Source tracks: full library or active playlist
  const sourceTracks = activePlaylist && playlists[activePlaylist]
    ? playlists[activePlaylist]
    : tracks;

  const currentTrack = currentIndex >= 0 ? sourceTracks[currentIndex] : null;

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

  function startRename(name: string) {
    setEditingPlaylist(name);
    setEditName(name);
  }

  async function commitRename(oldName: string) {
    const newName = editName.trim();
    setEditingPlaylist(null);
    if (!newName || newName === oldName || !musicFolder) return;
    if (/[\/\\:]|\.\./.test(newName) || playlists[newName]) return;
    try {
      await renamePlaylist(musicFolder, oldName, newName);
    } catch (err) {
      console.error("Rename playlist error:", err);
      return;
    }
    setPlaylists((prev) => {
      const next: Record<string, Track[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k === oldName ? newName : k] = v;
      }
      return next;
    });
    if (activePlaylist === oldName) setActivePlaylist(newName);
  }

  // ── Multi-select ──

  function toggleSelectMode() {
    setSelectMode((on) => !on);
    setSelected(new Set());
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  /** Re-point currentIndex at the playing track after its list changed. */
  function syncCurrentIndex(newList: Track[]) {
    if (!currentTrack) return;
    const path = currentTrack.path;
    setCurrentIndex(newList.findIndex((t) => t.path === path));
  }

  async function addSelectedToPlaylist(playlistName: string) {
    if (!musicFolder || selected.size === 0) return;
    const list = playlists[playlistName] || [];
    const existing = new Set(list.map((t) => t.path));
    const toAdd = sourceTracks.filter(
      (t) => selected.has(t.path) && !existing.has(t.path)
    );
    if (toAdd.length > 0) {
      const updated = [...list, ...toAdd];
      await savePlaylist(musicFolder, playlistName, updated.map((t) => t.path));
      setPlaylists((prev) => ({ ...prev, [playlistName]: updated }));
      if (activePlaylist === playlistName) syncCurrentIndex(updated);
    }
    setSelected(new Set());
    setSelectMode(false);
  }

  async function removeSelectedFromPlaylist() {
    if (!musicFolder || !activePlaylist || selected.size === 0) return;
    const list = playlists[activePlaylist] || [];
    const updated = list.filter((t) => !selected.has(t.path));
    await savePlaylist(musicFolder, activePlaylist, updated.map((t) => t.path));
    setPlaylists((prev) => ({ ...prev, [activePlaylist]: updated }));
    syncCurrentIndex(updated);
    setSelected(new Set());
    setSelectMode(false);
  }

  async function removeTrackFromPlaylist(path: string) {
    if (!musicFolder || !activePlaylist) return;
    const list = playlists[activePlaylist] || [];
    const updated = list.filter((t) => t.path !== path);
    await savePlaylist(musicFolder, activePlaylist, updated.map((t) => t.path));
    setPlaylists((prev) => ({ ...prev, [activePlaylist]: updated }));
    syncCurrentIndex(updated);
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
    const cur = currentTrack;
    setActivePlaylist(name);
    setSelectMode(false);
    setSelected(new Set());
    // Keep "now playing" pointing at the same song in the new list.
    const newList = name && playlists[name] ? playlists[name] : tracks;
    setCurrentIndex(cur ? newList.findIndex((t) => t.path === cur.path) : -1);
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
      musicFolder, track.title, track.artist, track.album, track.duration_secs
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

  // Serialize float-mode transitions: a double-click would otherwise snapshot
  // the window mid-morph and corrupt the saved geometry.
  const floatTransition = useRef(false);

  async function toggleMiniMode() {
    if (floatTransition.current || lyricsView === "overlay") return;
    floatTransition.current = true;
    try {
      if (!miniMode) {
        winSnapshot.current = await enterMiniMode();
        setMiniMode(true);
      } else {
        await exitFloatMode(winSnapshot.current);
        setMiniMode(false);
      }
    } finally {
      floatTransition.current = false;
    }
  }

  async function enterOverlay() {
    if (floatTransition.current || lyricsView === "overlay" || miniMode) return;
    floatTransition.current = true;
    try {
      winSnapshot.current = await enterLyricsOverlay();
      setLyricsView("overlay");
    } finally {
      floatTransition.current = false;
    }
  }

  async function exitOverlay() {
    if (floatTransition.current) return;
    floatTransition.current = true;
    try {
      await exitFloatMode(winSnapshot.current);
      setLyricsView("panel");
    } finally {
      floatTransition.current = false;
    }
  }

  // Transparent window background while the lyrics overlay is active.
  useEffect(() => {
    document.documentElement.classList.toggle(
      "overlay-mode",
      lyricsView === "overlay"
    );
  }, [lyricsView]);

  // Esc leaves focus / overlay lyrics view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lyricsView === "focus") setLyricsView("panel");
      else if (lyricsView === "overlay") exitOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lyricsView]);

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

  // Auto-scroll lyrics (panel or focus view, whichever is mounted)
  useEffect(() => {
    const container =
      lyricsView === "focus"
        ? focusContainerRef.current
        : lyricsContainerRef.current;
    if (activeLine < 0 || !container) return;
    const lineEl = container.children[activeLine] as HTMLElement;
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLine, lyricsView]);

  // Filter tracks
  const filteredTracks = sourceTracks.filter((t) => {
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });

  // Get plain lyrics as lines for display
  const plainLyricsLines = lyricsStatus === "plain" && lyricsCache[
    currentTrack ? `${currentTrack.artist}::${currentTrack.title}` : ""
  ]?.plain?.split("\n").filter(Boolean) || [];

  // ── Floating lyrics overlay ──
  if (lyricsView === "overlay") {
    const isInteractive = (el: EventTarget) =>
      (el as HTMLElement).closest?.("button");
    const curLine =
      lyricsStatus === "synced" && activeLine >= 0 && lrcLines[activeLine]
        ? lrcLines[activeLine].text
        : "";
    const nextLine =
      lyricsStatus === "synced" && activeLine >= 0 && lrcLines[activeLine + 1]
        ? lrcLines[activeLine + 1].text
        : "";
    return (
      <div
        className={`lyrics-overlay ov-color-${overlayStyle.color} ov-font-${overlayStyle.font} ov-size-${overlayStyle.size}`}
        onMouseDown={(e) => {
          if (e.button === 0 && !isInteractive(e.target)) startWindowDrag();
        }}
        onDoubleClick={(e) => {
          if (!isInteractive(e.target)) exitOverlay();
        }}
      >
        <div className="overlay-controls">
          <button className="mini-btn" onClick={handlePrev} title="Previous">⏮</button>
          <button
            className="mini-btn"
            onClick={currentTrack ? player.togglePlay : undefined}
            title={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? "⏸" : "▶"}
          </button>
          <button className="mini-btn" onClick={handleNext} title="Next">⏭</button>
          <span className="overlay-track">
            {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : "RETROPLAY"}
          </span>
          <button
            className={`mini-btn ${overlaySettingsOpen ? "mini-expand" : ""}`}
            onClick={() => setOverlaySettingsOpen((o) => !o)}
            title="Text style settings"
          >⚙</button>
          <button
            className="mini-btn mini-expand"
            onClick={exitOverlay}
            title="Back to full view"
          >⤢</button>
        </div>
        {overlaySettingsOpen && (
          <div className="overlay-settings">
            {(["amber", "white", "black", "mint"] as const).map((c) => (
              <button
                key={c}
                className={`ov-swatch ov-swatch-${c} ${overlayStyle.color === c ? "active" : ""}`}
                onClick={() => setOverlayStyle((s) => ({ ...s, color: c }))}
                title={`Text color: ${c}`}
              />
            ))}
            <span className="ov-sep" />
            <button
              className={`ov-opt ${overlayStyle.font === "retro" ? "active" : ""}`}
              onClick={() => setOverlayStyle((s) => ({ ...s, font: "retro" }))}
              title="Monospace retro font"
            >MONO</button>
            <button
              className={`ov-opt ${overlayStyle.font === "clean" ? "active" : ""}`}
              onClick={() => setOverlayStyle((s) => ({ ...s, font: "clean" }))}
              title="Clean sans-serif font"
            >CLEAN</button>
            <span className="ov-sep" />
            {(["s", "m", "l"] as const).map((sz) => (
              <button
                key={sz}
                className={`ov-opt ${overlayStyle.size === sz ? "active" : ""}`}
                onClick={() => setOverlayStyle((s) => ({ ...s, size: sz }))}
                title={`Text size ${sz.toUpperCase()}`}
              >{sz.toUpperCase()}</button>
            ))}
          </div>
        )}
        <div className="overlay-line">
          {curLine ||
            (lyricsStatus === "synced"
              ? "♪"
              : currentTrack
              ? currentTrack.title
              : "♪")}
        </div>
        {nextLine && <div className="overlay-next">{nextLine}</div>}
      </div>
    );
  }

  // ── Mini player (floating mode) ──
  if (miniMode) {
    const miniLyric =
      lyricsStatus === "synced" && activeLine >= 0 && lrcLines[activeLine]
        ? lrcLines[activeLine].text
        : lyricsStatus === "instrumental"
        ? "~ instrumental ~"
        : "";
    const isInteractive = (el: EventTarget) =>
      (el as HTMLElement).closest?.("button, .mini-progress");
    return (
      <div
        className="mini-player"
        onMouseDown={(e) => {
          if (e.button === 0 && !isInteractive(e.target)) startWindowDrag();
        }}
        onDoubleClick={(e) => {
          if (!isInteractive(e.target)) toggleMiniMode();
        }}
        title="Drag to move — double-click to restore"
      >
        <div className="mini-top">
          <div className="mini-info">
            <div className="mini-title">
              {currentTrack ? currentTrack.title : "RETROPLAY"}
            </div>
            <div className="mini-artist">
              {currentTrack ? currentTrack.artist : "no signal"}
            </div>
          </div>
          <button
            className="mini-btn mini-expand"
            onClick={toggleMiniMode}
            title="Back to full view"
          >⤢</button>
        </div>
        <div className="mini-lyric">
          {miniLyric || "♪"}
        </div>
        <div className="mini-bottom">
          <div className="mini-controls">
            <button className="mini-btn" onClick={handlePrev} title="Previous">⏮</button>
            <button
              className="mini-btn mini-play"
              onClick={currentTrack ? player.togglePlay : undefined}
              title={player.isPlaying ? "Pause" : "Play"}
            >
              {player.isPlaying ? "⏸" : "▶"}
            </button>
            <button className="mini-btn" onClick={handleNext} title="Next">⏭</button>
          </div>
          <div className="mini-progress" onClick={handleProgressClick}>
            <div
              className="mini-progress-fill"
              style={{
                width: player.duration
                  ? `${(player.currentTime / player.duration) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <span className="mini-time">{formatTime(player.currentTime)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {isMock && (
        <div className="mock-banner">
          🧪 BROWSER MOCK MODE — Run <code>npm run tauri dev</code> for full desktop app
        </div>
      )}
      {lyricsView === "focus" ? (
        /* ── Focus Lyrics View (Spotify-style) ── */
        <div className="lyrics-focus">
          <button
            className="focus-close"
            onClick={() => setLyricsView("panel")}
            title="Close focus view (Esc)"
          >✕</button>
          <div className="focus-header">
            <div className="focus-title">
              {currentTrack ? currentTrack.title : "NO SIGNAL"}
            </div>
            <div className="focus-artist">
              {currentTrack ? currentTrack.artist : "select a track"}
            </div>
          </div>
          {lyricsStatus === "synced" && lrcLines.length > 0 ? (
            <div className="focus-container" ref={focusContainerRef}>
              {lrcLines.map((line, i) => (
                <div
                  key={i}
                  className={`focus-line ${i === activeLine ? "active" : i < activeLine ? "past" : ""
                    }`}
                  onClick={() => player.seek(line.time)}
                >
                  {line.text || "♪"}
                </div>
              ))}
            </div>
          ) : lyricsStatus === "plain" && plainLyricsLines.length > 0 ? (
            <div className="focus-container">
              {plainLyricsLines.map((line, i) => (
                <div key={i} className="focus-line past">{line}</div>
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
        </div>
      ) : (
      <>
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
                {editingPlaylist === name ? (
                  <input
                    className="playlist-name-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(name);
                      if (e.key === "Escape") {
                        // Reset first so the blur that follows commits a no-op.
                        setEditName(name);
                        setEditingPlaylist(null);
                      }
                    }}
                    onBlur={() => commitRename(name)}
                  />
                ) : (
                  <>
                    <span>♪ {name}</span>
                    <span className="playlist-count">{plTracks.length}</span>
                    <button
                      className="playlist-edit-btn"
                      onClick={(e) => { e.stopPropagation(); startRename(name); }}
                      title="Rename playlist"
                    >✎</button>
                    <button
                      className="playlist-delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(name); }}
                      title="Delete playlist"
                    >×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {sourceTracks.length > 0 && (
          <div className="track-toolbar">
            <button
              className={`select-mode-btn ${selectMode ? "active" : ""}`}
              onClick={toggleSelectMode}
            >
              {selectMode ? `✕ Cancel (${selected.size})` : "☑ Select"}
            </button>
            {selectMode && selected.size > 0 && (
              <>
                {Object.keys(playlists).length > 0 && (
                  <select
                    className="playlist-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addSelectedToPlaylist(e.target.value);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="" disabled>+ Add to…</option>
                    {Object.keys(playlists).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
                {activePlaylist && (
                  <button
                    className="select-remove-btn"
                    onClick={removeSelectedFromPlaylist}
                    title="Remove selected from this playlist"
                  >× Remove</button>
                )}
              </>
            )}
          </div>
        )}

        <div className="track-list">
          {filteredTracks.map((track) => {
            const realIndex = sourceTracks.indexOf(track);
            return (
              <div
                key={track.path}
                className={`track-item ${realIndex === currentIndex ? "active" : ""}`}
                onClick={() =>
                  selectMode ? toggleSelected(track.path) : selectTrack(realIndex)
                }
              >
                {selectMode ? (
                  <div
                    className={`track-check ${selected.has(track.path) ? "checked" : ""}`}
                  >
                    {selected.has(track.path) ? "✓" : ""}
                  </div>
                ) : (
                  <div
                    className={`track-indicator ${realIndex === currentIndex && player.isPlaying ? "playing" : ""
                      }`}
                  />
                )}
                <div className="track-info">
                  <div className="track-title">{track.title}</div>
                  <div className="track-artist">{track.artist}</div>
                </div>
                <div className="track-duration">
                  {formatTime(track.duration_secs)}
                </div>
                {activePlaylist && !selectMode && (
                  <button
                    className="track-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrackFromPlaylist(track.path);
                    }}
                    title="Remove from playlist"
                  >×</button>
                )}
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
        <div className="lyrics-header">
          <span>Lyrics</span>
          <div className="lyrics-mode-btns">
            <button
              className="lyrics-mode-btn"
              onClick={() => setLyricsView("focus")}
              title="Focus view — big centered lyrics"
            >⛶</button>
            {isTauri() && (
              <button
                className="lyrics-mode-btn"
                onClick={enterOverlay}
                title="Floating lyrics on top of other apps"
              >⬓</button>
            )}
          </div>
        </div>
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
      </>
      )}

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
          {isTauri() && (
            <button
              className="ctrl-btn mini-toggle"
              onClick={toggleMiniMode}
              title="Mini player"
            >▣</button>
          )}
        </div>
      </div>
    </div>
  );
}
