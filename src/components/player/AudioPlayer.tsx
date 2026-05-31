import { useState, useEffect, useRef, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Loader2, Clock } from 'lucide-react';
import { getSongUrl, getProxyAudioUrl, prefetchSongUrls, formatDuration, type TrackItem } from '../../services/musicApi';

export type PlayMode = 'sequential' | 'repeatOne' | 'repeatAll' | 'shuffle';

interface AudioPlayerProps {
  queue: TrackItem[];
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  playMode: PlayMode;
  onPlayModeChange: (mode: PlayMode) => void;
}

const PlayModeIcon: Record<PlayMode, typeof Repeat> = {
  sequential: Repeat,
  repeatOne: Repeat1,
  repeatAll: Repeat,
  shuffle: Shuffle,
};

const PlayModeColors: Record<PlayMode, string> = {
  sequential: 'text-white/30',
  repeatOne: 'text-white',
  repeatAll: 'text-white',
  shuffle: 'text-white',
};

const modeCycle: PlayMode[] = ['sequential', 'repeatAll', 'shuffle', 'repeatOne'];
const PREFETCH_COUNT = 3;
const TIMER_OPTIONS = [5, 10, 15, 30, 60];

export function AudioPlayer({ queue, currentIndex, onNext, onPrev, playMode, onPlayModeChange }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedTrackIdRef = useRef<number | null>(null);
  const currentTrackIdRef = useRef<number | null>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const customTimerInputRef = useRef<HTMLInputElement | null>(null);

  const currentTrack = queue[currentIndex] || null;

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (timerTickRef.current) { clearInterval(timerTickRef.current); timerTickRef.current = null; }
  }, []);

  const startTimer = useCallback((minutes: number) => {
    stopTimer();
    setTimerMinutes(minutes);
    setTimerRemaining(minutes * 60);
    setShowTimer(false);

    const startTime = Date.now();
    const totalMs = minutes * 60 * 1000;

    timerTickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      setTimerRemaining(remaining);
    }, 1000);

    timerRef.current = setTimeout(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }
      stopTimer();
      setTimerMinutes(null);
      setTimerRemaining(0);
    }, totalMs);
  }, [stopTimer]);

  const cancelTimer = useCallback(() => {
    stopTimer();
    setTimerMinutes(null);
    setTimerRemaining(0);
    setShowTimer(false);
  }, [stopTimer]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const cleanupAudio = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    audio.pause();
    audio.src = '';
    audio.remove();
  }, []);

  const preloadNextTrack = useCallback(async (startIndex: number, len: number) => {
    if (len <= 1) return;

    const idsToPrefetch: number[] = [];
    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const idx = (startIndex + i) % len;
      if (idx !== startIndex) idsToPrefetch.push(queue[idx].id);
    }

    prefetchSongUrls(idsToPrefetch).catch(() => {});

    const nextIdx = (startIndex + 1) % len;
    if (nextIdx === startIndex) return;

    const nextTrack = queue[nextIdx];
    if (preloadedTrackIdRef.current === nextTrack.id) return;

    if (preloadAudioRef.current) {
      cleanupAudio(preloadAudioRef.current);
      preloadAudioRef.current = null;
    }

    try {
      const url = await getSongUrl(nextTrack.id);
      if (!url) return;

      const proxyUrl = getProxyAudioUrl(url);
      const preloadAudio = new Audio();
      preloadAudio.preload = 'auto';
      preloadAudio.volume = 0;
      preloadAudio.src = proxyUrl;
      preloadAudio.load();

      preloadAudioRef.current = preloadAudio;
      preloadedTrackIdRef.current = nextTrack.id;
    } catch {}
  }, [queue, cleanupAudio]);

  const loadAndPlay = useCallback(async (track: TrackItem) => {
    if (currentTrackIdRef.current === track.id) return;

    cleanupAudio(audioRef.current);
    audioRef.current = null;
    currentTrackIdRef.current = track.id;

    setLoading(true);
    setError('');
    setCurrentTime(0);
    setDuration(0);

    const len = queue.length;

    let audio: HTMLAudioElement;

    if (preloadAudioRef.current && preloadedTrackIdRef.current === track.id) {
      audio = preloadAudioRef.current;
      preloadAudioRef.current = null;
      preloadedTrackIdRef.current = null;
      audio.volume = muted ? 0 : volume;
      if (audio.error) {
        audio = new Audio();
        audio.preload = 'auto';
        audio.volume = muted ? 0 : volume;
      }
    } else {
      try {
        const rawUrl = await getSongUrl(track.id);
        if (!rawUrl) {
          setError('无法获取播放地址');
          setLoading(false);
          return;
        }
        const proxyUrl = getProxyAudioUrl(rawUrl);
        audio = new Audio();
        audio.preload = 'auto';
        audio.volume = muted ? 0 : volume;
        audio.src = proxyUrl;
      } catch {
        setLoading(false);
        setError('播放失败');
        return;
      }
    }

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setError('');
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      onNext();
    });

    audio.addEventListener('error', () => {
      setLoading(false);
      setError('播放失败');
      setIsPlaying(false);
    });

    audio.addEventListener('canplay', () => {
      setLoading(false);
      setError('');
    });

    audioRef.current = audio;

    try {
      await audio.play();
      setIsPlaying(true);
      setLoading(false);
      setError('');
      preloadNextTrack(currentIndex, len);
    } catch {
      setLoading(false);
      setError('播放失败');
      setIsPlaying(false);
    }
  }, [volume, muted, cleanupAudio, onNext, currentIndex, queue.length, preloadNextTrack]);

  useEffect(() => {
    if (currentTrack && currentTrack.id !== currentTrackIdRef.current) {
      loadAndPlay(currentTrack);
    }
  }, [currentTrack, loadAndPlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  useEffect(() => {
    return () => {
      cleanupAudio(audioRef.current);
      cleanupAudio(preloadAudioRef.current);
      stopTimer();
    };
  }, [cleanupAudio, stopTimer]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => { setIsPlaying(true); setError(''); }).catch(() => setIsPlaying(false));
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const handleVolumeChange = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(ratio);
    setMuted(ratio === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => !prev);
  }, []);

  const cyclePlayMode = useCallback(() => {
    const idx = modeCycle.indexOf(playMode);
    onPlayModeChange(modeCycle[(idx + 1) % modeCycle.length]);
  }, [playMode, onPlayModeChange]);

  const handleVolumeHover = useCallback((enter: boolean) => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    if (enter) {
      setShowVolume(true);
    } else {
      volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 300);
    }
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const ModeIcon = PlayModeIcon[playMode];
  const modeColor = PlayModeColors[playMode];

  const formatTimerRemaining = () => {
    const min = Math.floor(timerRemaining / 60);
    const sec = timerRemaining % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/50 backdrop-blur">
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {currentTrack?.albumCover && (
              <img src={currentTrack.albumCover} className="w-7 h-7 rounded object-cover shrink-0" alt="" />
            )}
            <div className="min-w-0">
              {loading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                  <span className="text-[9px] text-white/40">加载中...</span>
                </div>
              ) : error && !isPlaying ? (
                <div className="text-[9px] text-red-400/70 truncate">{error}</div>
              ) : currentTrack ? (
                <>
                  <div className="text-[10px] tracking-wider text-white/70 truncate">{currentTrack.name}</div>
                  <div className="text-[8px] text-white/30 truncate">{currentTrack.artist}</div>
                </>
              ) : (
                <div className="text-[9px] text-white/20">No track selected</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 relative">
            <div className="relative">
              <button
                onClick={() => setShowTimer(!showTimer)}
                className={`p-1.5 transition ${timerMinutes !== null ? 'text-white/70' : 'text-white/30 hover:text-white/50'}`}
                title="Timer"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              {showTimer && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white/10 border border-white/20 backdrop-blur-xl p-2 flex flex-col gap-1.5 z-10 rounded shadow-lg min-w-[180px]">
                  <div className="flex gap-1">
                    {TIMER_OPTIONS.map((m) => (
                      <button
                        key={m}
                        onClick={() => startTimer(m)}
                        className={`px-2 py-1 text-[9px] tracking-wider rounded transition whitespace-nowrap ${
                          timerMinutes === m ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-white/10 pt-1.5">
                    <input
                      ref={customTimerInputRef}
                      type="number"
                      min="1"
                      max="999"
                      placeholder="自定义"
                      className="w-14 px-2 py-1 text-[9px] bg-white/5 border border-white/10 text-white/70 placeholder-white/20 focus:outline-none focus:border-white/30 text-center rounded"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (val > 0) startTimer(val);
                        }
                      }}
                    />
                    <span className="text-[9px] text-white/30">分钟</span>
                    <button
                      onClick={() => {
                        const val = customTimerInputRef.current ? parseInt(customTimerInputRef.current.value) : NaN;
                        if (val > 0) startTimer(val);
                      }}
                      className="px-2 py-1 text-[9px] tracking-wider rounded text-white/40 hover:text-white/60 hover:bg-white/5 transition border border-white/10"
                    >
                      OK
                    </button>
                    {timerMinutes !== null && (
                      <button
                        onClick={cancelTimer}
                        className="px-2 py-1 text-[9px] tracking-wider rounded text-red-400/60 hover:text-red-400 transition"
                      >
                        Off
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={cyclePlayMode}
              className={`p-1.5 transition ${modeColor}`}
              title={playMode}
            >
              <ModeIcon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onPrev}
              disabled={queue.length === 0}
              className="p-1.5 text-white/40 hover:text-white/70 transition disabled:opacity-20"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              disabled={queue.length === 0 || loading}
              className="p-1.5 text-white/80 hover:text-white transition disabled:opacity-30"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={onNext}
              disabled={queue.length === 0}
              className="p-1.5 text-white/40 hover:text-white/70 transition disabled:opacity-20"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <div
              className="relative flex items-center"
              onMouseEnter={() => handleVolumeHover(true)}
              onMouseLeave={() => handleVolumeHover(false)}
            >
              <button onClick={toggleMute} className="p-1.5 text-white/40 hover:text-white/70 transition">
                {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <div
                className={`overflow-hidden transition-all ${showVolume ? 'w-16 opacity-100' : 'w-0 opacity-0'}`}
              >
                <div
                  className="h-1 bg-white/10 rounded cursor-pointer"
                  onClick={handleVolumeChange}
                >
                  <div
                    className="h-full bg-white/60 rounded transition-all"
                    style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <span className="text-[8px] text-white/20 w-20 text-right shrink-0">
            {timerMinutes !== null ? (
              <span className="text-white/40">{formatTimerRemaining()}</span>
            ) : duration > 0 ? (
              `${formatDuration(currentTime * 1000)} / ${formatDuration(duration * 1000)}`
            ) : (
              ''
            )}
          </span>
        </div>

        <div
          className="h-1 bg-white/5 rounded cursor-pointer group mt-1"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white/30 group-hover:bg-white/50 rounded transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}