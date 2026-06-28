use id3::TagLike;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Clone)]
pub struct TrackMeta {
    pub path: String,
    pub filename: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_secs: f64,
}

/// True for empty / yt-dlp "NA" / "Unknown ..." placeholder values that
/// should not be used as a real title or artist.
fn is_placeholder(s: &str) -> bool {
    let t = s.trim();
    t.is_empty()
        || t.eq_ignore_ascii_case("NA")
        || t.eq_ignore_ascii_case("Unknown")
        || t.eq_ignore_ascii_case("Unknown Artist")
        || t.eq_ignore_ascii_case("Unknown Album")
}

/// Parse "Artist - Title" from a filename stem. Drops leading placeholder
/// segments first, so "NA - Drake - shabang" → (title="shabang", artist="Drake").
fn parse_filename(filename: &str) -> (String, String) {
    let parts: Vec<&str> = filename
        .split(" - ")
        .map(|p| p.trim())
        .filter(|p| !is_placeholder(p))
        .collect();
    match parts.len() {
        0 => (filename.to_string(), "Unknown Artist".to_string()),
        1 => (parts[0].to_string(), "Unknown Artist".to_string()),
        _ => (parts[1..].join(" - "), parts[0].to_string()),
    }
}

fn read_track_meta(path: &PathBuf) -> Option<TrackMeta> {
    let filename = path.file_stem()?.to_string_lossy().to_string();

    let (mut title, mut artist, mut album) = (String::new(), String::new(), String::new());
    if let Ok(tag) = id3::Tag::read_from_path(path) {
        title = tag.title().unwrap_or("").to_string();
        artist = tag.artist().unwrap_or("").to_string();
        album = tag.album().unwrap_or("").to_string();
    }

    // Fall back to "Artist - Title" filename parsing for any missing field.
    if is_placeholder(&title) || is_placeholder(&artist) {
        let (ft, fa) = parse_filename(&filename);
        if is_placeholder(&title) {
            title = ft;
        }
        if is_placeholder(&artist) {
            artist = fa;
        }
    }
    if is_placeholder(&title) {
        title = filename.clone();
    }
    if is_placeholder(&artist) {
        artist = "Unknown Artist".to_string();
    }
    if is_placeholder(&album) {
        album = "Unknown Album".to_string();
    }

    let duration_secs = mp3_duration::from_path(path)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);

    Some(TrackMeta {
        path: path.to_string_lossy().to_string(),
        filename,
        title,
        artist,
        album,
        duration_secs,
    })
}

#[tauri::command]
fn scan_music_folder(folder: String) -> Vec<TrackMeta> {
    let mut tracks: Vec<TrackMeta> = Vec::new();

    for entry in WalkDir::new(&folder).max_depth(3).into_iter().flatten() {
        let path = entry.path().to_path_buf();
        if let Some(ext) = path.extension() {
            if ext.to_string_lossy().to_lowercase() == "mp3" {
                if let Some(meta) = read_track_meta(&path) {
                    tracks.push(meta);
                }
            }
        }
    }

    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    tracks
}

#[tauri::command]
fn get_track_meta(path: String) -> Option<TrackMeta> {
    read_track_meta(&PathBuf::from(path))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistMeta {
    pub name: String,
    pub tracks: Vec<String>,
}

#[tauri::command]
fn load_playlists(folder: String) -> HashMap<String, Vec<TrackMeta>> {
    let playlists_dir = PathBuf::from(&folder).join(".playlists");
    let mut playlists: HashMap<String, Vec<TrackMeta>> = HashMap::new();

    if !playlists_dir.exists() {
        return playlists;
    }

    if let Ok(entries) = fs::read_dir(&playlists_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let name = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                if let Ok(data) = fs::read_to_string(&path) {
                    if let Ok(paths) = serde_json::from_str::<Vec<String>>(&data) {
                        let tracks: Vec<TrackMeta> = paths
                            .iter()
                            .filter_map(|p| read_track_meta(&PathBuf::from(p)))
                            .collect();
                        playlists.insert(name, tracks);
                    }
                }
            }
        }
    }

    playlists
}

/// Reject playlist names that could escape the `.playlists` directory.
fn safe_playlist_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty()
        || n.contains('/')
        || n.contains('\\')
        || n.contains("..")
        || n.contains(':')
    {
        return Err("Nama playlist tidak valid.".into());
    }
    Ok(n.to_string())
}

#[tauri::command]
fn save_playlist(folder: String, name: String, tracks: Vec<String>) -> Result<(), String> {
    let name = safe_playlist_name(&name)?;
    let playlists_dir = PathBuf::from(&folder).join(".playlists");
    fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;
    let path = playlists_dir.join(format!("{}.json", name));
    let json = serde_json::to_string_pretty(&tracks).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_playlist(folder: String, name: String) -> Result<(), String> {
    let name = safe_playlist_name(&name)?;
    let path = PathBuf::from(&folder).join(".playlists").join(format!("{}.json", name));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LyricsResult {
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub instrumental: bool,
}

#[derive(Debug, Deserialize)]
struct LrclibResponse {
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
    instrumental: bool,
    duration: Option<f64>,
}

/// Noise words that mark a bracketed segment as junk to strip from a title,
/// e.g. "Shabang (Official Audio)" → "Shabang".
const BRACKET_NOISE: &[&str] = &[
    "official", "audio", "video", "lyric", "lyrics", "visualizer", "visualiser",
    "explicit", "remaster", "hd", "4k", "mv", "m/v", "color coded",
];

/// Remove "(...)" / "[...]" groups whose contents contain a noise word.
/// Legitimate parentheses (e.g. part of a real title) are kept.
fn strip_noise_brackets(s: &str) -> String {
    let mut result = String::new();
    let mut buf = String::new();
    let mut open = ' ';
    let mut in_bracket = false;

    for c in s.chars() {
        match c {
            '(' | '[' if !in_bracket => {
                in_bracket = true;
                open = c;
                buf.clear();
            }
            ')' | ']' if in_bracket && ((open == '(' && c == ')') || (open == '[' && c == ']')) => {
                in_bracket = false;
                let low = buf.to_lowercase();
                if !BRACKET_NOISE.iter().any(|n| low.contains(n)) {
                    result.push(open);
                    result.push_str(&buf);
                    result.push(c);
                }
            }
            _ if in_bracket => buf.push(c),
            _ => result.push(c),
        }
    }
    if in_bracket {
        result.push(open);
        result.push_str(&buf);
    }
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Normalize a title for LRCLIB matching: strip noise brackets and a trailing
/// "feat./ft." credit.
fn clean_title(title: &str) -> String {
    let mut s = strip_noise_brackets(title);
    let low = s.to_lowercase();
    for sep in [" feat.", " feat ", " ft.", " ft ", " featuring "] {
        if let Some(idx) = low.find(sep) {
            s.truncate(idx);
            break;
        }
    }
    s.trim().to_string()
}

/// Normalize an artist for LRCLIB matching: drop YouTube " - Topic"/"VEVO" suffixes.
fn clean_artist(artist: &str) -> String {
    let mut s = artist.trim().to_string();
    for suf in [" - Topic", " - topic", "VEVO", "Vevo"] {
        if s.ends_with(suf) {
            s.truncate(s.len() - suf.len());
        }
    }
    s.trim().to_string()
}

#[tauri::command]
async fn fetch_lyrics(
    title: String,
    artist: String,
    album: String,
    duration_secs: f64,
) -> Result<LyricsResult, String> {
    let client = reqwest::Client::new();
    let user_agent = "RetroPlay/1.0.0 (lrclib.net)";

    // Normalize metadata so download-tool noise doesn't break matching.
    let title = clean_title(&title);
    let artist = clean_artist(&artist);
    let artist_known = !is_placeholder(&artist);

    // Strategy: try multiple search queries, prioritize synced > plain > none
    let mut queries: Vec<String> = vec![
        // 1. Exact: title + artist + album + duration
        format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}&album_name={}&duration={}",
            urlencoding::encode(&title),
            urlencoding::encode(&artist),
            urlencoding::encode(&album),
            duration_secs.round() as u64,
        ),
        // 2. Without album
        format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}&duration={}",
            urlencoding::encode(&title),
            urlencoding::encode(&artist),
            duration_secs.round() as u64,
        ),
        // 3. Search: title + artist (returns multiple results)
        format!(
            "https://lrclib.net/api/search?track_name={}&artist_name={}",
            urlencoding::encode(&title),
            urlencoding::encode(&artist),
        ),
    ];

    // 4. Last resort: title-only search, but only when the artist is unknown —
    // otherwise this risks matching a same-titled song by a different artist.
    if !artist_known {
        queries.push(format!(
            "https://lrclib.net/api/search?track_name={}",
            urlencoding::encode(&title),
        ));
    }

    let mut best_synced: Option<String> = None;
    let mut best_plain: Option<String> = None;
    let mut is_instrumental = false;

    for (idx, url) in queries.iter().enumerate() {
        let resp = match client.get(url).header("User-Agent", user_agent).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };

        if !resp.status().is_success() {
            continue;
        }

        if idx < 2 {
            // Single result (get endpoint)
            if let Ok(data) = resp.json::<LrclibResponse>().await {
                if data.instrumental {
                    is_instrumental = true;
                }
                if data.synced_lyrics.is_some() && best_synced.is_none() {
                    best_synced = data.synced_lyrics;
                }
                if data.plain_lyrics.is_some() && best_plain.is_none() {
                    best_plain = data.plain_lyrics;
                }
                if best_synced.is_some() {
                    break; // got synced, perfect
                }
            }
        } else {
            // Search results
            if let Ok(results) = resp.json::<Vec<LrclibResponse>>().await {
                // Sort by closest duration, then prefer synced
                let mut sorted = results;
                sorted.sort_by(|a, b| {
                    let da = a.duration.map(|d| (d - duration_secs).abs()).unwrap_or(f64::MAX);
                    let db = b.duration.map(|d| (d - duration_secs).abs()).unwrap_or(f64::MAX);
                    // Prefer synced over plain
                    let a_score = if a.synced_lyrics.is_some() { 0 } else { 1 };
                    let b_score = if b.synced_lyrics.is_some() { 0 } else { 1 };
                    a_score.cmp(&b_score).then(da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal))
                });

                for r in &sorted {
                    if r.instrumental {
                        is_instrumental = true;
                    }
                    if r.synced_lyrics.is_some() && best_synced.is_none() {
                        best_synced = r.synced_lyrics.clone();
                    }
                    if r.plain_lyrics.is_some() && best_plain.is_none() {
                        best_plain = r.plain_lyrics.clone();
                    }
                    if best_synced.is_some() {
                        break;
                    }
                }
            }
        }
    }

    Ok(LyricsResult {
        synced: best_synced.clone(),
        plain: best_plain.clone(),
        instrumental: is_instrumental && best_plain.is_none() && best_synced.is_none(),
    })
}

/// Download audio from a URL (e.g. YouTube) as MP3 into `folder` using the
/// system `yt-dlp` (which uses ffmpeg internally). Returns a short message
/// naming the downloaded track on success.
#[tauri::command]
async fn download_audio(
    app: tauri::AppHandle,
    folder: String,
    url: String,
) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL tidak valid — tempel link YouTube lengkap.".into());
    }
    if folder.trim().is_empty() {
        return Err("Pilih folder musik dulu.".into());
    }

    let template = format!("{folder}/%(artist,uploader)s - %(track,title)s.%(ext)s");

    let output = app
        .shell()
        .command("yt-dlp")
        .args([
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--embed-metadata",
            "--no-playlist",
            "-o",
            &template,
            url,
        ])
        .output()
        .await
        .map_err(|e| {
            format!(
                "Tidak bisa menjalankan yt-dlp ({e}). Pastikan yt-dlp & ffmpeg \
                 terinstal (lihat PANDUAN.md)."
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: Vec<&str> = stderr.lines().rev().take(3).collect();
        let tail: String = tail.into_iter().rev().collect::<Vec<_>>().join("\n");
        let tail = if tail.trim().is_empty() {
            "yt-dlp gagal tanpa pesan.".to_string()
        } else {
            tail
        };
        return Err(format!("Download gagal:\n{tail}"));
    }

    // Best-effort: ambil nama file hasil dari baris "Destination:" terakhir.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let name = stdout
        .lines()
        .filter(|l| l.contains("Destination:"))
        .filter_map(|l| l.rsplit("Destination:").next())
        .map(|s| s.trim())
        .filter_map(|p| {
            std::path::Path::new(p)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
        })
        .last();

    Ok(match name {
        Some(n) => format!("Ditambahkan: {n}"),
        None => "Lagu berhasil diunduh".to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_music_folder,
            get_track_meta,
            load_playlists,
            save_playlist,
            delete_playlist,
            fetch_lyrics,
            download_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running RetroPlay");
}
