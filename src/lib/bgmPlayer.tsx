import { createContext, useContext, useRef, useState, useCallback, useEffect, type RefObject, type MutableRefObject } from 'react';
import type { ReactNode } from 'react';

interface BgmTrack {
  id: number;
  name: string;
  artist: string;
  coverUrl: string;
}

interface BgmPlayerState {
  isPlaying: boolean;
  songUrl: string;
  currentTrack: BgmTrack | null;
  playMode: 'list' | 'single' | 'shuffle';
  tracks: { id: number; name: string; ar: { name: string }[]; dt: number }[];
  selectedTrackId: number | null;
  volume: number;
}

interface BgmPlayerContextType extends BgmPlayerState {
  audioRef: RefObject<HTMLAudioElement | null>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSongUrl: (url: string) => void;
  setCurrentTrack: (track: BgmTrack | null) => void;
  setPlayMode: (mode: 'list' | 'single' | 'shuffle') => void;
  setTracks: (tracks: { id: number; name: string; ar: { name: string }[]; dt: number }[]) => void;
  setSelectedTrackId: (id: number | null) => void;
  setVolume: (v: number) => void;
  playNext: () => void;
  playPrev: () => void;
  onTrackChangeRef: MutableRefObject<((id: number) => void) | null>;
}

const BgmPlayerContext = createContext<BgmPlayerContextType | null>(null);

export function useBgmPlayer() {
  const ctx = useContext(BgmPlayerContext);
  if (!ctx) throw new Error('useBgmPlayer must be used within BgmPlayerProvider');
  return ctx;
}

export function BgmPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onTrackChangeRef = useRef<((id: number) => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [songUrl, setSongUrlState] = useState('');
  const directUrlRef = useRef('');
  const usingProxyRef = useRef(false);
  const [currentTrack, setCurrentTrack] = useState<BgmTrack | null>(null);
  const [playMode, setPlayModeState] = useState<'list' | 'single' | 'shuffle'>('list');
  const [tracks, setTracksState] = useState<{ id: number; name: string; ar: { name: string }[]; dt: number }[]>([]);
  const [selectedTrackId, setSelectedTrackIdState] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(1);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const selectedTrackIdRef = useRef(selectedTrackId);
  selectedTrackIdRef.current = selectedTrackId;
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;

  const setSongUrl = useCallback((url: string) => {
    setSongUrlState(url);
    directUrlRef.current = url;
    usingProxyRef.current = false;
  }, []);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const setPlayMode = useCallback((mode: 'list' | 'single' | 'shuffle') => {
    setPlayModeState(mode);
  }, []);

  const setTracks = useCallback((t: { id: number; name: string; ar: { name: string }[]; dt: number }[]) => {
    setTracksState(t);
  }, []);

  const setSelectedTrackId = useCallback((id: number | null) => {
    setSelectedTrackIdState(id);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
  }, []);

  const playNext = useCallback(() => {
    const currentTracks = tracksRef.current;
    const currentId = selectedTrackIdRef.current;
    const mode = playModeRef.current;
    if (currentTracks.length === 0) return;
    const currentIdx = currentTracks.findIndex(t => t.id === currentId);
    let nextIdx: number;
    if (mode === 'shuffle') {
      if (currentTracks.length === 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * currentTracks.length);
        } while (nextIdx === currentIdx);
      }
    } else {
      nextIdx = (currentIdx + 1) % currentTracks.length;
    }
    const nextId = currentTracks[nextIdx].id;
    setSelectedTrackIdState(nextId);
    if (onTrackChangeRef.current) onTrackChangeRef.current(nextId);
  }, []);

  const playPrev = useCallback(() => {
    const currentTracks = tracksRef.current;
    const currentId = selectedTrackIdRef.current;
    if (currentTracks.length === 0) return;
    const currentIdx = currentTracks.findIndex(t => t.id === currentId);
    const prevIdx = (currentIdx - 1 + currentTracks.length) % currentTracks.length;
    const prevId = currentTracks[prevIdx].id;
    setSelectedTrackIdState(prevId);
    if (onTrackChangeRef.current) onTrackChangeRef.current(prevId);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !songUrl) return;

    const handleCanPlay = () => {
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    };

    const handleEnded = () => {
      const currentTracks = tracksRef.current;
      const mode = playModeRef.current;
      if (currentTracks.length === 0) return;
      if (mode === 'single') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        playNext();
      }
    };

    const handleError = (e: Event) => {
      const err = (e.target as HTMLAudioElement).error;
      console.error('[BGM] Audio error:', err?.message, 'code:', err?.code);
      if (!usingProxyRef.current && directUrlRef.current && !directUrlRef.current.startsWith('/')) {
        console.log('[BGM] Falling back to proxy for:', directUrlRef.current);
        usingProxyRef.current = true;
        setSongUrlState(`/api/netease/music?url=${encodeURIComponent(directUrlRef.current)}`);
      }
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    if (isPlaying) {
      if (audio.readyState >= 3) {
        audio.play().catch(() => {});
      }
    } else {
      audio.pause();
    }

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [isPlaying, songUrl, playNext]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name,
        artist: currentTrack.artist,
        artwork: currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [playNext, playPrev]);

  return (
    <BgmPlayerContext.Provider value={{
      isPlaying, songUrl, currentTrack, playMode, tracks, selectedTrackId, volume,
      audioRef, play, pause, togglePlay, setSongUrl, setCurrentTrack,
      setPlayMode, setTracks, setSelectedTrackId, setVolume, playNext, playPrev,
      onTrackChangeRef,
    }}>
      {children}
      {songUrl && <audio ref={audioRef} src={songUrl} preload="auto" className="hidden" />}
    </BgmPlayerContext.Provider>
  );
}
