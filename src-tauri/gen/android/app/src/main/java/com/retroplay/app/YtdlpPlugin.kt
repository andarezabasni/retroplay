package com.retroplay.app

import android.app.Activity
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File

@InvokeArg
class DownloadArgs {
    lateinit var folder: String
    lateinit var url: String
}

/**
 * Tauri plugin that wraps youtubedl-android (bundled yt-dlp + python + ffmpeg)
 * so the Android build can download YouTube audio on-device, mirroring the
 * desktop sidecar flow. Progress is streamed to the webview via the
 * `download-progress` event, matching the desktop event contract.
 */
@TauriPlugin
class YtdlpPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(Dispatchers.IO)
    @Volatile private var initialized = false

    companion object {
        private const val TAG = "YtdlpPlugin"
        private const val PROCESS_ID = "retroplay-dl"
    }

    override fun load(webView: android.webkit.WebView) {
        // Initialize the bundled binaries once, off the main thread.
        scope.launch {
            try {
                YoutubeDL.getInstance().init(activity.application)
                FFmpeg.getInstance().init(activity.application)
                initialized = true
            } catch (e: Exception) {
                Log.e(TAG, "youtubedl-android init failed", e)
            }
        }
    }

    private fun ensureInit() {
        if (!initialized) {
            YoutubeDL.getInstance().init(activity.application)
            FFmpeg.getInstance().init(activity.application)
            initialized = true
        }
    }

    /** Update the bundled yt-dlp to the latest release (fixes 403/extraction). */
    @Command
    fun updateYtdlp(invoke: Invoke) {
        scope.launch {
            try {
                ensureInit()
                YoutubeDL.getInstance().updateYoutubeDL(
                    activity.application,
                    YoutubeDL.UpdateChannel._NIGHTLY,
                )
                val res = JSObject()
                res.put("message", "yt-dlp updated")
                invoke.resolve(res)
            } catch (e: Exception) {
                invoke.reject(e.message ?: "yt-dlp update failed")
            }
        }
    }

    /** Download audio from `url` as MP3 into `folder`. */
    @Command
    fun download(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadArgs::class.java)
        scope.launch {
            try {
                ensureInit()

                val outDir = File(args.folder)
                if (!outDir.exists()) outDir.mkdirs()

                val request = YoutubeDLRequest(args.url)
                request.addOption("-x")
                request.addOption("--audio-format", "mp3")
                request.addOption("--audio-quality", "0")
                request.addOption("--embed-metadata")
                request.addOption("--no-playlist")
                request.addOption("--no-mtime")
                request.addOption("-o", "${outDir.absolutePath}/%(artist,uploader)s - %(track,title)s.%(ext)s")

                val response = YoutubeDL.getInstance().execute(request, PROCESS_ID) { progress, _, line ->
                    // Forward progress to the webview using the desktop event name.
                    val payload = JSObject()
                    payload.put("percent", if (progress < 0) -1.0 else progress.toDouble())
                    payload.put("stage", if (progress < 0) "converting" else "downloading")
                    trigger("download-progress", payload)
                    Log.d(TAG, line)
                }

                // Best-effort: pull the destination filename from yt-dlp output.
                val name = response.out
                    .lineSequence()
                    .filter { it.contains("Destination:") }
                    .map { it.substringAfterLast("Destination:").trim() }
                    .mapNotNull { File(it).nameWithoutExtension.ifBlank { null } }
                    .lastOrNull()

                val res = JSObject()
                res.put("message", if (name != null) "Added: $name" else "Song downloaded successfully")
                invoke.resolve(res)
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Download failed")
            }
        }
    }

    /** Cancel an in-flight download, if any. */
    @Command
    fun cancel(invoke: Invoke) {
        try {
            YoutubeDL.getInstance().destroyProcessById(PROCESS_ID)
        } catch (_: Exception) {
        }
        invoke.resolve()
    }
}
