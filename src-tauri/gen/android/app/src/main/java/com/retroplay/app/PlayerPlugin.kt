package com.retroplay.app

import android.app.Activity
import android.content.ComponentName
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors

@InvokeArg
class PlayArgs {
    lateinit var path: String
    var title: String? = null
    var artist: String? = null
}

@InvokeArg
class SeekArgs {
    var position: Double = 0.0
}

@InvokeArg
class VolumeArgs {
    var volume: Double = 1.0
}

/**
 * Bridges the React UI to the native Media3 player (PlaybackService). Playing
 * through ExoPlayer + MediaSession lets audio continue in the background / with
 * the screen off and shows a system media notification. State (position,
 * playing, ended) is pushed back to the webview via plugin events.
 */
@TauriPlugin
class PlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private var controller: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private val main = Handler(Looper.getMainLooper())
    private var polling = false

    override fun load(webView: android.webkit.WebView) {
        main.post { connect() }
    }

    private fun connect() {
        val token = SessionToken(
            activity,
            ComponentName(activity, PlaybackService::class.java),
        )
        val future = MediaController.Builder(activity, token).buildAsync()
        controllerFuture = future
        future.addListener({
            controller = future.get()
            controller?.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_ENDED) {
                        trigger("player-ended", JSObject())
                    }
                    if (state == Player.STATE_READY) {
                        val dur = controller?.duration ?: 0L
                        val payload = JSObject()
                        payload.put("duration", if (dur > 0) dur / 1000.0 else 0.0)
                        trigger("player-ready", payload)
                    }
                    emitState()
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    emitState()
                    if (isPlaying) startPolling() else stopPolling()
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    val payload = JSObject()
                    payload.put("message", error.message ?: "playback error")
                    trigger("player-error", payload)
                }
            })
        }, MoreExecutors.directExecutor())
    }

    private fun emitState() {
        val c = controller ?: return
        val payload = JSObject()
        payload.put("isPlaying", c.isPlaying)
        payload.put("position", c.currentPosition / 1000.0)
        val dur = c.duration
        payload.put("duration", if (dur > 0) dur / 1000.0 else 0.0)
        trigger("player-state", payload)
    }

    // Poll position while playing so the UI seek bar advances smoothly.
    private val poller = object : Runnable {
        override fun run() {
            if (!polling) return
            emitState()
            main.postDelayed(this, 500)
        }
    }

    private fun startPolling() {
        if (polling) return
        polling = true
        main.postDelayed(poller, 500)
    }

    private fun stopPolling() {
        polling = false
        main.removeCallbacks(poller)
    }

    @Command
    fun play(invoke: Invoke) {
        val args = invoke.parseArgs(PlayArgs::class.java)
        main.post {
            val c = controller
            if (c == null) {
                invoke.reject("player not ready")
                return@post
            }
            val metadata = MediaMetadata.Builder()
                .setTitle(args.title ?: "")
                .setArtist(args.artist ?: "")
                .build()
            val uri = if (args.path.startsWith("/")) Uri.fromFile(java.io.File(args.path))
                else Uri.parse(args.path)
            val item = MediaItem.Builder()
                .setUri(uri)
                .setMediaMetadata(metadata)
                .build()
            c.setMediaItem(item)
            c.prepare()
            c.playWhenReady = true
            startPolling()
            emitState()
            invoke.resolve()
        }
    }

    @Command
    fun pause(invoke: Invoke) {
        main.post {
            controller?.pause()
            emitState()
            invoke.resolve()
        }
    }

    @Command
    fun resume(invoke: Invoke) {
        main.post {
            controller?.play()
            startPolling()
            emitState()
            invoke.resolve()
        }
    }

    @Command
    fun seek(invoke: Invoke) {
        val args = invoke.parseArgs(SeekArgs::class.java)
        main.post {
            controller?.seekTo((args.position * 1000).toLong())
            emitState()
            invoke.resolve()
        }
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val args = invoke.parseArgs(VolumeArgs::class.java)
        main.post {
            controller?.volume = args.volume.toFloat()
            invoke.resolve()
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        main.post { controller?.stop(); invoke.resolve() }
    }

    /** Return current playback state so the UI can re-sync (e.g. on resume). */
    @Command
    fun getState(invoke: Invoke) {
        main.post {
            val c = controller
            val payload = JSObject()
            if (c != null) {
                payload.put("isPlaying", c.isPlaying)
                payload.put("position", c.currentPosition / 1000.0)
                val dur = c.duration
                payload.put("duration", if (dur > 0) dur / 1000.0 else 0.0)
            } else {
                payload.put("isPlaying", false)
                payload.put("position", 0.0)
                payload.put("duration", 0.0)
            }
            invoke.resolve(payload)
        }
    }
}
