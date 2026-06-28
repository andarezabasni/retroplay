import { useState, useRef, useCallback, useEffect } from "react";

export interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  play: (src: string) => void;
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

  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.7;
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
      }
      setIsPlaying(false);
      onTrackEndRef.current?.();
    };
    const onError = () => {
      // Hanya laporkan bila memang ada sumber yang gagal dimuat
      if (audio.src && audio.error) {
        setIsPlaying(false);
        onErrorRef.current?.();
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const play = useCallback((src: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentSrcRef.current !== src) {
      audio.src = src;
      currentSrcRef.current = src;
    }
    audio.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current) {
      audioRef.current.volume = vol;
      setVolumeState(vol);
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
