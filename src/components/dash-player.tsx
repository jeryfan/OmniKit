import { useRef, useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface DashPlayerProps {
  videoUrl: string;
  audioUrl?: string | null;
  autoPlay?: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
// Drift thresholds for playbackRate-based correction (avoids audible seek gaps)
const DRIFT_SOFT = 0.05; // below this: in sync, no correction needed
const DRIFT_HARD = 2.0;  // above this: hard seek (too far gone for rate adjustment)
const RATE_ADJUST = 0.02; // ±2% speed nudge for soft correction
const HIDE_CONTROLS_DELAY = 3000;

export function DashPlayer({ videoUrl, audioUrl, autoPlay, className }: DashPlayerProps) {
  // Fallback: no audio URL → native <video>
  if (!audioUrl) {
    return (
      <video
        key={videoUrl}
        controls
        autoPlay={autoPlay}
        className={`mx-auto w-full ${className ?? ""}`}
        src={videoUrl}
      />
    );
  }

  return (
    <DualPlayer
      videoUrl={videoUrl}
      audioUrl={audioUrl}
      autoPlay={autoPlay}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Dual-element sync player
// ---------------------------------------------------------------------------

interface DualPlayerProps {
  videoUrl: string;
  audioUrl: string;
  autoPlay?: boolean;
  className?: string;
}

function DualPlayer({ videoUrl, audioUrl, autoPlay, className }: DualPlayerProps) {
  const { t } = useLanguage();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ---- UI state (only things that affect rendering) ----
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);

  // ---- High-frequency values stored as refs to avoid re-render spam ----
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const bufferedRef = useRef(0);
  // DOM refs for the progress bar elements
  const progressBarRef = useRef<HTMLDivElement>(null);
  const bufferedBarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  // Internal refs
  const seekingRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoReadyRef = useRef(false);
  const audioReadyRef = useRef(false);
  const wantPlayRef = useRef(autoPlay ?? false);
  const draggingRef = useRef(false);
  const dragTimeRef = useRef(0);
  const playingRef = useRef(false);
  const audioFailedRef = useRef(false);
  const playbackRateRef = useRef(1);
  const rafRef = useRef<number>();

  // Keep refs in sync with state
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { audioFailedRef.current = audioFailed; }, [audioFailed]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);

  // ---- Direct DOM updates for high-frequency changes (no React re-render) ----
  const updateProgressDOM = useCallback(() => {
    const dur = durationRef.current;
    const time = draggingRef.current ? dragTimeRef.current : currentTimeRef.current;
    const pct = dur > 0 ? (time / dur) * 100 : 0;
    const bufPct = dur > 0 ? (bufferedRef.current / dur) * 100 : 0;

    if (progressBarRef.current) progressBarRef.current.style.width = `${pct}%`;
    if (bufferedBarRef.current) bufferedBarRef.current.style.width = `${bufPct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(time)} / ${formatTime(dur)}`;
    }
  }, []);

  // ---- rAF loop for smooth UI updates ----
  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      if (video && !seekingRef.current && !draggingRef.current) {
        currentTimeRef.current = video.currentTime;
        if (video.duration && isFinite(video.duration)) {
          durationRef.current = video.duration;
        }
        if (video.buffered.length > 0) {
          bufferedRef.current = video.buffered.end(video.buffered.length - 1);
        }
      }
      updateProgressDOM();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateProgressDOM]);

  // ---- Auto-hide controls ----
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!draggingRef.current) setShowControls(false);
    }, HIDE_CONTROLS_DELAY);
  }, []);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  // ---- Sync helpers ----
  const syncPlay = useCallback(async () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    try {
      if (audio && !audioFailedRef.current) {
        // Only hard-sync position if significantly drifted (avoids unnecessary seek stutter)
        const drift = Math.abs(video.currentTime - audio.currentTime);
        if (drift > DRIFT_HARD) {
          audio.currentTime = video.currentTime;
        }
        // Restore base playback rate before playing
        const rate = playbackRateRef.current;
        video.playbackRate = rate;
        audio.playbackRate = rate;
        await Promise.all([video.play(), audio.play()]);
      } else {
        await video.play();
      }
      setPlaying(true);
    } catch {
      // autoplay blocked etc.
    }
  }, []);

  const syncPause = useCallback(() => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      syncPause();
    } else {
      syncPlay();
    }
  }, [syncPlay, syncPause]);

  // ---- Initial ready ----
  const tryInitialPlay = useCallback(() => {
    if (!wantPlayRef.current) return;
    if (audioFailedRef.current) {
      if (videoReadyRef.current) {
        wantPlayRef.current = false;
        syncPlay();
      }
      return;
    }
    if (videoReadyRef.current && audioReadyRef.current) {
      wantPlayRef.current = false;
      syncPlay();
    }
  }, [syncPlay]);

  // ---- Seek ----
  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video) return;

      seekingRef.current = true;
      const wasPlaying = playingRef.current;
      video.pause();
      audio?.pause();

      video.currentTime = time;
      if (audio && !audioFailedRef.current) audio.currentTime = time;
      currentTimeRef.current = time;
      updateProgressDOM();

      let videoSeeked = false;
      let audioSeeked = audioFailedRef.current || !audio;

      const onDone = () => {
        if (videoSeeked && audioSeeked) {
          seekingRef.current = false;
          if (wasPlaying) syncPlay();
        }
      };

      video.addEventListener("seeked", () => { videoSeeked = true; onDone(); }, { once: true });
      if (audio && !audioFailedRef.current) {
        audio.addEventListener("seeked", () => { audioSeeked = true; onDone(); }, { once: true });
      }
    },
    [syncPlay, updateProgressDOM],
  );

  // ---- Drift correction via playbackRate nudge (no audible seek gaps) ----
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const onTimeUpdate = () => {
      if (seekingRef.current || !playingRef.current || audioFailedRef.current) return;

      const drift = video.currentTime - audio.currentTime; // positive = audio behind
      const absDrift = Math.abs(drift);
      const baseRate = playbackRateRef.current;

      if (absDrift < DRIFT_SOFT) {
        // In sync — ensure audio is at the base rate
        if (audio.playbackRate !== baseRate) {
          audio.playbackRate = baseRate;
        }
      } else if (absDrift >= DRIFT_HARD) {
        // Way too far — hard seek (rare, e.g. after long buffering stall)
        audio.currentTime = video.currentTime;
        audio.playbackRate = baseRate;
      } else {
        // Soft correction: nudge audio playbackRate by ±2% to catch up/slow down
        audio.playbackRate = drift > 0
          ? baseRate * (1 + RATE_ADJUST)   // audio behind → speed up
          : baseRate * (1 - RATE_ADJUST);  // audio ahead → slow down
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  // ---- Buffering: only show indicator, do NOT pause the other element ----
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    let videoWaiting = false;
    let audioWaiting = false;

    const update = () => setBuffering(videoWaiting || (!audioFailedRef.current && audioWaiting));

    const onVideoWaiting = () => { videoWaiting = true; update(); };
    const onVideoPlaying = () => { videoWaiting = false; update(); };
    const onAudioWaiting = () => { audioWaiting = true; update(); };
    const onAudioPlaying = () => { audioWaiting = false; update(); };

    video.addEventListener("waiting", onVideoWaiting);
    video.addEventListener("playing", onVideoPlaying);
    if (audio) {
      audio.addEventListener("waiting", onAudioWaiting);
      audio.addEventListener("playing", onAudioPlaying);
    }

    return () => {
      video.removeEventListener("waiting", onVideoWaiting);
      video.removeEventListener("playing", onVideoPlaying);
      if (audio) {
        audio.removeEventListener("waiting", onAudioWaiting);
        audio.removeEventListener("playing", onAudioPlaying);
      }
    };
  }, []);

  // ---- Video ended ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => syncPause();
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [syncPause]);

  // ---- Volume & playback rate sync ----
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !audioFailed) {
      audio.volume = volume;
      audio.muted = muted;
    }
    if (audioFailed && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume;
    }
  }, [volume, muted, audioFailed]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    if (audioRef.current && !audioFailed) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, audioFailed]);

  // ---- Fullscreen ----
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ---- Audio error handling ----
  const handleAudioError = useCallback(() => {
    setAudioFailed(true);
    audioFailedRef.current = true;
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // ---- Progress bar drag ----
  const handleProgressMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const dur = durationRef.current;
      if (dur <= 0) return;
      draggingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      dragTimeRef.current = ratio * dur;
      updateProgressDOM();

      const onMove = (ev: globalThis.MouseEvent) => {
        const r = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        dragTimeRef.current = r * durationRef.current;
        updateProgressDOM();
      };

      const onUp = () => {
        draggingRef.current = false;
        seekTo(dragTimeRef.current);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seekTo, updateProgressDOM],
  );

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(Math.max(0, currentTimeRef.current - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(Math.min(durationRef.current, currentTimeRef.current + 5));
          break;
        case "m":
          e.preventDefault();
          setMuted((prev) => !prev);
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, seekTo, toggleFullscreen]);

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-lg bg-black focus:outline-none ${className ?? ""}`}
      tabIndex={0}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playingRef.current && setShowControls(false)}
    >
      {/* Video element (always muted in dual mode unless audio failed) */}
      <video
        ref={videoRef}
        muted={!audioFailed}
        className="mx-auto w-full cursor-pointer"
        style={{ maxHeight: "inherit" }}
        src={videoUrl}
        onClick={togglePlay}
        onCanPlay={() => {
          videoReadyRef.current = true;
          tryInitialPlay();
        }}
      />

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onCanPlay={() => {
          audioReadyRef.current = true;
          tryInitialPlay();
        }}
        onError={handleAudioError}
      />

      {/* Buffering overlay */}
      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <span className="text-sm text-white/80">{t.player.buffering}</span>
          </div>
        </div>
      )}

      {/* Play button overlay (when paused) */}
      {!playing && !buffering && (
        <div
          className="absolute inset-0 flex cursor-pointer items-center justify-center"
          onClick={togglePlay}
        >
          <div className="rounded-full bg-black/50 p-4 backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="h-10 w-10 text-white" fill="white" />
          </div>
        </div>
      )}

      {/* Custom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 transition-opacity duration-300 ${
          showControls || !playing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress bar */}
        <div
          className="group/progress relative mb-2 h-1 cursor-pointer rounded-full bg-white/20 transition-all hover:h-1.5"
          onMouseDown={handleProgressMouseDown}
        >
          {/* Buffered */}
          <div
            ref={bufferedBarRef}
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: "0%" }}
          />
          {/* Progress */}
          <div
            ref={progressBarRef}
            className="absolute inset-y-0 left-0 rounded-full bg-white"
            style={{ width: "0%" }}
          />
          {/* Thumb */}
          <div
            ref={thumbRef}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/progress:opacity-100"
            style={{ left: "0%" }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2 text-white">
          {/* Play/Pause */}
          <button
            className="rounded p-1 transition-colors hover:bg-white/20"
            onClick={togglePlay}
            title={playing ? t.player.pause : t.player.play}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          {/* Volume */}
          {!audioFailed && (
            <div className="group/vol flex items-center">
              <button
                className="rounded p-1 transition-colors hover:bg-white/20"
                onClick={() => setMuted((prev) => !prev)}
                title={muted ? t.player.unmute : t.player.mute}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                className="ml-1 h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 transition-all group-hover/vol:w-16 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>
          )}

          {/* Time */}
          <span ref={timeDisplayRef} className="ml-1 text-xs tabular-nums text-white/80">
            0:00 / 0:00
          </span>

          <div className="flex-1" />

          {/* Playback rate */}
          <button
            className="rounded px-1.5 py-0.5 text-xs font-medium tabular-nums transition-colors hover:bg-white/20"
            onClick={() => {
              const idx = PLAYBACK_RATES.indexOf(playbackRate);
              const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
              setPlaybackRate(next);
            }}
            title={t.player.playbackRate}
          >
            {playbackRate}x
          </button>

          {/* Fullscreen */}
          <button
            className="rounded p-1 transition-colors hover:bg-white/20"
            onClick={toggleFullscreen}
            title={isFullscreen ? t.player.exitFullscreen : t.player.fullscreen}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
