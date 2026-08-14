import { useState, useRef, useCallback, useEffect } from "react";
import {
  isTauri,
  getPlatform,
  nativePlayer,
  onPlayerEvents,
} from "../utils/tauriBridge";

export interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  play: (src: string, meta?: { title?: string; artist?: string }) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export function useAudioPlayer(
  onTrackEnd?: () => void,
  onError?: () => void,
): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const currentSrcRef = useRef<string>("");
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  // On Android, playback runs in the native Media3 service (background + media
  // notification). Elsewhere the HTMLAudioElement plays in the webview.
  const nativeRef = useRef(false);

  // ── Native (Android) playback wiring ──
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const p = await getPlatform();
      if (p !== "android") return;
      nativeRef.current = true;
      unlisten = await onPlayerEvents({
        onState: (s) => {
          setIsPlaying(s.isPlaying);
          setCurrentTime(s.position);
          if (s.duration > 0) setDuration(s.duration);
        },
        onEnded: () => {
          if (repeatRef.current === "one") {
            nativePlayer.seek(0);
            nativePlayer.resume();
            return;
          }
          setIsPlaying(false);
          onTrackEndRef.current?.();
        },
        onError: () => {
          setIsPlaying(false);
          onErrorRef.current?.();
        },
      });
      // Poll state as a reliable fallback so the seek bar, lyrics and play
      // button stay in sync — including play/pause done from the media
      // notification (whose events can be missed while backgrounded).
      pollTimer = setInterval(async () => {
        try {
          const s = await nativePlayer.getState();
          if (!s) return;
          setIsPlaying(s.isPlaying);
          setCurrentTime(s.position);
          if (s.duration > 0) setDuration(s.duration);
        } catch {
          // ignore transient poll errors
        }
      }, 500);
    })();
    return () => {
      unlisten?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  // ── Webview (desktop / browser) playback wiring ──
  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.7;
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (!nativeRef.current) setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (!nativeRef.current) setDuration(audio.duration);
    };
    const onEnded = () => {
      if (nativeRef.current) return;
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
      }
      setIsPlaying(false);
      onTrackEndRef.current?.();
    };
    const onErr = () => {
      if (nativeRef.current) return;
      if (audio.src && audio.error) {
        setIsPlaying(false);
        onErrorRef.current?.();
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const play = useCallback(
    (src: string, meta?: { title?: string; artist?: string }) => {
      if (nativeRef.current) {
        currentSrcRef.current = src;
        nativePlayer
          .play(src, meta?.title ?? "", meta?.artist ?? "")
          .then(() => setIsPlaying(true))
          .catch(console.error);
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      if (currentSrcRef.current !== src) {
        audio.src = src;
        currentSrcRef.current = src;
      }
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    },
    [],
  );

  const pause = useCallback(() => {
    if (nativeRef.current) {
      nativePlayer.pause().catch(console.error);
      setIsPlaying(false);
      return;
    }
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (nativeRef.current) {
      nativePlayer.resume().then(() => setIsPlaying(true)).catch(console.error);
      return;
    }
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const seek = useCallback((time: number) => {
    if (nativeRef.current) {
      nativePlayer.seek(time).catch(console.error);
      setCurrentTime(time);
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (nativeRef.current) {
      nativePlayer.setVolume(vol).catch(console.error);
      return;
    }
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  return {
    isPlaying, currentTime, duration, volume, shuffle, repeat,
    play, pause, resume, togglePlay, seek, setVolume, toggleShuffle, cycleRepeat,
  };
}
