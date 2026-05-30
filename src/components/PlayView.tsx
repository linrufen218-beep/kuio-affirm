import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Music, Mic, Timer, Check, Smartphone, SkipForward, SkipBack, Shuffle, Repeat, Repeat1, Layers, Ear, QrCode, RefreshCw, LogOut, Volume2, Trash2, Edit3, Pencil } from 'lucide-react';
import { SubliminalConfig } from '../lib/audioEngine';
import { useBgmPlayer } from '../lib/bgmPlayer';
import { getSavedAudioList, loadAudioBuffer, loadAudioBlobUrl, deleteAudioBuffer, removeSavedAudio, renameSavedAudio, type SavedAudio } from '../lib/audioStorage';

interface PlayViewProps {
  affirmations: string;
  subliminalMix: { buffer: AudioBuffer | null; logs: any[] };
  subConfig: SubliminalConfig;
  setSubConfig: (val: SubliminalConfig) => void;
  key?: string;
}

interface NeteasePlaylist {
  id: number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
}

interface NeteaseTrack {
  id: number;
  name: string;
  ar: { id: number; name: string }[];
  al: { id: number; name: string; picUrl: string };
  dt: number;
}

type QrStatus = 'idle' | 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error';
type LoginMethod = 'qr' | 'phone';

export default function PlayView({ affirmations, subliminalMix, subConfig, setSubConfig }: PlayViewProps) {
  const bgm = useBgmPlayer();
  const [activeTab, setActiveTab] = useState<'voice' | 'bgm'>('voice');
  const [voicePlaying, setVoicePlaying] = useState(false);  
  const [timer, setTimer] = useState<number | null>(null);
  const [showTimer, setShowTimer] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [neteaseCookie, setNeteaseCookie] = useState<string>('');
  const [userInfo, setUserInfo] = useState<{ nickname: string; avatarUrl: string; uid: number } | null>(null);

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [qrStatus, setQrStatus] = useState<QrStatus>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrKey, setQrKey] = useState<string>('');

  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaCountdown, setCaptchaCountdown] = useState(0);
  const [phoneLoginLoading, setPhoneLoginLoading] = useState(false);
  const [phoneLoginError, setPhoneLoginError] = useState('');
  const captchaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [isLoadingSong, setIsLoadingSong] = useState(false);

  const [savedAudios, setSavedAudios] = useState<SavedAudio[]>([]);
  const [selectedAudioIds, setSelectedAudioIds] = useState<Set<string>>(new Set());
  const [playingAudioIds, setPlayingAudioIds] = useState<Set<string>>(new Set());
  const [subVolume, setSubVolume] = useState(1);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const subAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const subAudioUrlsRef = useRef<Map<string, string>>(new Map());

  const qrCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = () => setSavedAudios(getSavedAudioList());
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, []);

  const stopAllSubAudios = useCallback(() => {
    subAudioElementsRef.current.forEach((audio) => {
      try { audio.pause(); audio.currentTime = 0; } catch {}
    });
    subAudioElementsRef.current.clear();
    subAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    subAudioUrlsRef.current.clear();
    setPlayingAudioIds(new Set());
  }, []);

  const playSelectedAudios = useCallback(async () => {
    stopAllSubAudios();
    if (selectedAudioIds.size === 0) return;

    const newPlayingIds = new Set<string>();
    for (const id of selectedAudioIds) {
      try {
        let blobUrl = subAudioUrlsRef.current.get(id);
        if (!blobUrl) {
          blobUrl = await loadAudioBlobUrl(id);
          if (!blobUrl) continue;
          subAudioUrlsRef.current.set(id, blobUrl);
        }

        const audio = new Audio(blobUrl);
        audio.loop = true;
        audio.volume = subVolume;
        audio.play().catch((e) => console.error('Sub audio play error:', e));
        subAudioElementsRef.current.set(id, audio);
        newPlayingIds.add(id);
      } catch (e) {
        console.error('Failed to play audio:', id, e);
      }
    }
    setPlayingAudioIds(newPlayingIds);
  }, [selectedAudioIds, subVolume, stopAllSubAudios]);

  const handleDeleteAudio = useCallback(async (id: string) => {
    await deleteAudioBuffer(id);
    const newList = removeSavedAudio(id);
    setSavedAudios(newList);
    setSelectedAudioIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleRenameAudio = useCallback((id: string) => {
    const newList = renameSavedAudio(id, renameValue);
    setSavedAudios(newList);
    setRenamingId(null);
  }, [renameValue]);

  const toggleAudioSelection = useCallback((id: string) => {
    setSelectedAudioIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    subAudioElementsRef.current.forEach((audio) => {
      audio.volume = subVolume;
    });
  }, [subVolume]);

  useEffect(() => {
    if (playingAudioIds.size > 0 && 'mediaSession' in navigator) {
      const names = savedAudios
        .filter(a => playingAudioIds.has(a.id))
        .map(a => a.name)
        .join(', ');
      navigator.mediaSession.metadata = new MediaMetadata({
        title: names || 'Subliminal Audio',
        artist: 'KUIO Affirm',
      });
    }
  }, [playingAudioIds, savedAudios]);

  useEffect(() => {
    const saved = localStorage.getItem('netease_cookie');
    if (saved) {
      setNeteaseCookie(saved);
      setIsLoggedIn(true);
      fetchUserInfo(saved);
    }
  }, []);

  useEffect(() => {
    if (timer === null) return;
    const timeout = setTimeout(() => {
      bgm.pause();
      stopAllSubAudios();
      setVoicePlaying(false);
      setTimer(null);
    }, timer * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [timer]);

  useEffect(() => {
    if (captchaCountdown <= 0) {
      if (captchaTimerRef.current) {
        clearInterval(captchaTimerRef.current);
        captchaTimerRef.current = null;
      }
      return;
    }
    if (!captchaTimerRef.current) {
      captchaTimerRef.current = setInterval(() => {
        setCaptchaCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (captchaTimerRef.current) {
        clearInterval(captchaTimerRef.current);
        captchaTimerRef.current = null;
      }
    };
  }, [captchaCountdown > 0]);

  const neteaseFetch = useCallback(async (endpoint: string, params: Record<string, string> = {}) => {
    const path = endpoint.replace(/^\/+/, '');
    const query = new URLSearchParams(params).toString();
    const url = `/api/netease/${path}${query ? '?' + query : ''}`;
    const headers: Record<string, string> = {};
    if (neteaseCookie) headers['Cookie'] = neteaseCookie;
    
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);
        
        if (!res.ok) {
          const text = await res.text();
          console.error(`[neteaseFetch] ${endpoint} HTTP ${res.status}:`, text.substring(0, 300));
          try { return JSON.parse(text); } catch { return { code: res.status, message: `HTTP ${res.status}` }; }
        }
        
        const setCookieHeader = res.headers.get('set-cookie');
        if (setCookieHeader) {
          const newCookie = setCookieHeader.split(',').map(c => c.split(';')[0].trim()).join('; ');
          const merged = neteaseCookie 
            ? neteaseCookie + '; ' + newCookie 
            : newCookie;
          setNeteaseCookie(merged);
          localStorage.setItem('netease_cookie', merged);
        }
        
        return await res.json();
      } catch (e: any) {
        console.error(`[neteaseFetch] ${endpoint} attempt ${attempt + 1} error:`, e.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          return { code: -1, message: `网络请求失败: ${e.name === 'AbortError' ? '请求超时' : e.message}` };
        }
      }
    }
    return { code: -1, message: '网络请求失败' };
  }, [neteaseCookie]);

  const fetchUserInfo = useCallback(async (cookie?: string) => {
    try {
      const headers: Record<string, string> = {};
      const c = cookie || neteaseCookie;
      if (c) headers['Cookie'] = c;
      const res = await fetch('/api/netease/user/account', { headers });
      const data = await res.json();
      if (data.code === 200 && data.profile) {
        setUserInfo({
          nickname: data.profile.nickname,
          avatarUrl: data.profile.avatarUrl,
          uid: data.profile.userId,
        });
        setIsLoggedIn(true);
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  }, [neteaseCookie]);

  const sendCaptcha = useCallback(async () => {
    if (!phone || phone.length < 11) {
      setPhoneLoginError('请输入正确的手机号');
      return;
    }
    setPhoneLoginError('');
    try {
      const res = await neteaseFetch('/captcha/sent', { phone, ctcode: '86' });
      console.log('[sendCaptcha] Response:', JSON.stringify(res));
      if (res.code === 200) {
        setCaptchaCountdown(60);
      } else {
        const msg = res.message || res.msg || (typeof res.data === 'string' ? '' : res.data?.message) || '';
        setPhoneLoginError(msg || `验证码发送失败 (${JSON.stringify(res).substring(0, 100)})`);
      }
    } catch (e: any) {
      console.error('[sendCaptcha] Error:', e);
      setPhoneLoginError(`网络错误: ${e.message || '请重试'}`);
    }
  }, [phone, neteaseFetch]);

  const loginWithPhone = useCallback(async () => {
    if (!phone || !captcha) {
      setPhoneLoginError('请输入手机号和验证码');
      return;
    }
    setPhoneLoginLoading(true);
    setPhoneLoginError('');
    try {
      const res = await neteaseFetch('/login/cellphone', { phone, captcha, countrycode: '86' });
      console.log('[loginWithPhone] Response:', JSON.stringify(res));
      if (res.code === 200) {
        const cookieStr = res.cookie || '';
        if (cookieStr) {
          const parsed = typeof cookieStr === 'string' 
            ? cookieStr.split(';').map(c => c.trim()).filter(c => c).join('; ')
            : cookieStr;
          const merged = neteaseCookie ? neteaseCookie + '; ' + parsed : parsed;
          setNeteaseCookie(merged);
          localStorage.setItem('netease_cookie', merged);
        }
        setIsLoggedIn(true);
        setTimeout(() => fetchUserInfo(), 500);
      } else {
        const msg = res.message || res.msg || (typeof res.data === 'string' ? '' : res.data?.message) || '';
        setPhoneLoginError(msg || `登录失败 (${JSON.stringify(res).substring(0, 100)})`);
      }
    } catch (e: any) {
      console.error('[loginWithPhone] Error:', e);
      setPhoneLoginError(`网络错误: ${e.message || '请重试'}`);
    } finally {
      setPhoneLoginLoading(false);
    }
  }, [phone, captcha, neteaseFetch, neteaseCookie, fetchUserInfo]);

  const generateQrCode = useCallback(async () => {
    setQrStatus('loading');
    setQrDataUrl('');
    try {
      const keyRes = await neteaseFetch('/login/qr/key', { timestamp: Date.now().toString() });
      if (keyRes.code !== 200 || !keyRes.data?.unikey) {
        setQrStatus('error');
        return;
      }
      const key = keyRes.data.unikey;
      setQrKey(key);

      const qrRes = await neteaseFetch('/login/qr/create', { key, qrimg: 'true', timestamp: Date.now().toString() });
      if (qrRes.code === 200 && qrRes.data?.qrimg) {
        setQrDataUrl(qrRes.data.qrimg);
        setQrStatus('waiting');
        startQrCheck(key);
      } else {
        setQrStatus('error');
      }
    } catch {
      setQrStatus('error');
    }
  }, [neteaseFetch]);

  const startQrCheck = useCallback((key: string) => {
    if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
    
    qrCheckTimerRef.current = setInterval(async () => {
      try {
        const res = await neteaseFetch('/login/qr/check', { key, timestamp: Date.now().toString() });
        
        if (res.code === 800) {
          setQrStatus('expired');
          if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
        } else if (res.code === 802) {
          setQrStatus('scanned');
        } else if (res.code === 803) {
          setQrStatus('success');
          if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
          
          const cookieStr = res.cookie || '';
          if (cookieStr) {
            const parsed = cookieStr.split(';').map(c => c.trim()).filter(c => c).join('; ');
            const merged = neteaseCookie ? neteaseCookie + '; ' + parsed : parsed;
            setNeteaseCookie(merged);
            localStorage.setItem('netease_cookie', merged);
          }
          
          setIsLoggedIn(true);
          setTimeout(() => fetchUserInfo(), 500);
        }
      } catch {
        if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
        setQrStatus('error');
      }
    }, 3000);
  }, [neteaseFetch, neteaseCookie, fetchUserInfo]);

  useEffect(() => {
    return () => {
      if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
      if (captchaTimerRef.current) clearInterval(captchaTimerRef.current);
    };
  }, []);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setNeteaseCookie('');
    setUserInfo(null);
    setPlaylists([]);
    bgm.setTracks([]);
    bgm.setSelectedTrackId(null);
    bgm.setSongUrl('');
    bgm.pause();
    bgm.setCurrentTrack(null);
    setPhone('');
    setCaptcha('');
    setPhoneLoginError('');
    localStorage.removeItem('netease_cookie');
    if (qrCheckTimerRef.current) clearInterval(qrCheckTimerRef.current);
    setQrStatus('idle');
    setQrDataUrl('');
  }, [bgm]);

  useEffect(() => {
    if (isLoggedIn && userInfo?.uid && playlists.length === 0) {
      fetchPlaylists();
    }
  }, [isLoggedIn, userInfo]);

  const fetchPlaylists = useCallback(async () => {
    if (!userInfo?.uid) return;
    try {
      const res = await neteaseFetch('/user/playlist', { uid: userInfo.uid.toString(), limit: '30', timestamp: Date.now().toString() });
      if (res.code === 200 && res.playlist) {
        setPlaylists(res.playlist.map((p: any) => ({
          id: p.id,
          name: p.name,
          coverImgUrl: p.coverImgUrl,
          trackCount: p.trackCount,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch playlists:', e);
    }
  }, [neteaseFetch, userInfo]);

  const fetchPlaylistTracks = useCallback(async (playlistId: number) => {
    try {
      const res = await neteaseFetch('/playlist/track/all', { id: playlistId.toString(), limit: '200', timestamp: Date.now().toString() });
      if (res.code === 200 && res.songs) {
        bgm.setTracks(res.songs.map((s: any) => ({
          id: s.id,
          name: s.name,
          ar: s.ar || [],
          dt: s.dt || 0,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch tracks:', e);
    }
  }, [neteaseFetch, bgm]);

  const fetchSongUrl = useCallback(async (songId: number) => {
    setIsLoadingSong(true);
    try {
      let res = await neteaseFetch('/song/url', { id: songId.toString() });
      if (res.code === 200 && res.data?.[0]?.url) {
        const originalUrl = res.data[0].url;
        const proxyUrl = `/api/netease/music?url=${encodeURIComponent(originalUrl)}`;
        const track = bgm.tracks.find(t => t.id === songId);
        bgm.setCurrentTrack({
          id: songId,
          name: track?.name || '',
          artist: track?.ar.map(a => a.name).join(' / ') || '',
          coverUrl: '',
        });
        bgm.setSongUrl(proxyUrl);
        bgm.play();
      } else {
        res = await neteaseFetch('/song/url/v1', { id: songId.toString(), level: 'standard' });
        if (res.code === 200 && res.data?.[0]?.url) {
          const originalUrl = res.data[0].url;
          const proxyUrl = `/api/netease/music?url=${encodeURIComponent(originalUrl)}`;
          const track = bgm.tracks.find(t => t.id === songId);
          bgm.setCurrentTrack({
            id: songId,
            name: track?.name || '',
            artist: track?.ar.map(a => a.name).join(' / ') || '',
            coverUrl: '',
          });
          bgm.setSongUrl(proxyUrl);
          bgm.play();
        } else {
          console.warn('No playable URL for this song:', JSON.stringify(res).substring(0, 200));
        }
      }
    } catch (e) {
      console.error('Failed to fetch song URL:', e);
    } finally {
      setIsLoadingSong(false);
    }
  }, [neteaseFetch, bgm]);

  useEffect(() => {
    bgm.onTrackChangeRef.current = (id: number) => {
      fetchSongUrl(id);
    };
    return () => { bgm.onTrackChangeRef.current = null; };
  }, [bgm.onTrackChangeRef, fetchSongUrl]);

  const handleSelectPlaylist = useCallback((id: number) => {
    setSelectedPlaylistId(id);
    fetchPlaylistTracks(id);
  }, [fetchPlaylistTracks]);

  const handleSelectTrack = useCallback((trackId: number) => {
    if (isLoadingSong) return;
    bgm.setSelectedTrackId(trackId);
    fetchSongUrl(trackId);
  }, [fetchSongUrl, isLoadingSong, bgm]);

  const activeTrack = bgm.tracks.find(t => t.id === bgm.selectedTrackId);
  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      className="flex flex-col relative w-full h-full max-w-lg mx-auto p-3 md:p-4 z-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex justify-center gap-8 md:gap-16 mb-6 shrink-0 pt-4">
        <button 
          onClick={() => setActiveTab('voice')}
          className={`flex items-center gap-2 text-[9px] tracking-[0.2em] uppercase pb-2 transition-all border-b ${
            activeTab === 'voice' ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/70'
          }`}
        >
          <Mic className="w-3.5 h-3.5" /> Subliminal Stream
        </button>
        <button 
          onClick={() => setActiveTab('bgm')}
          className={`flex items-center gap-2 text-[9px] tracking-[0.2em] uppercase pb-2 transition-all border-b ${
            activeTab === 'bgm' ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/70'
          }`}
        >
          <Music className="w-3.5 h-3.5" /> Background Music
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          
          {activeTab === 'voice' && (
            <motion.div 
              key="voice"
              className="absolute inset-0 flex flex-col h-full"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex-1 overflow-y-auto no-scrollbar relative mb-4 flex flex-col">
                {savedAudios.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/30 text-[10px] uppercase tracking-widest gap-4 opacity-50">
                     <Layers className="w-8 h-8 opacity-50" />
                     暂无保存的音频
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {savedAudios.map((audio) => (
                      <div 
                        key={audio.id}
                        className={`flex items-center gap-3 p-3 border transition-colors cursor-pointer ${
                          selectedAudioIds.has(audio.id) ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                        onClick={() => toggleAudioSelection(audio.id)}
                      >
                        <div className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                          selectedAudioIds.has(audio.id) ? 'border-[#ff3a3a] bg-[#ff3a3a]/20' : 'border-white/20'
                        }`}>
                          {selectedAudioIds.has(audio.id) && <Check className="w-3 h-3 text-[#ff3a3a]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {renamingId === audio.id ? (
                            <input 
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameAudio(audio.id); if (e.key === 'Escape') setRenamingId(null); }}
                              onBlur={() => handleRenameAudio(audio.id)}
                              className="w-full bg-transparent border-b border-white/30 text-sm font-serif tracking-wider text-white focus:outline-none"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="text-sm font-serif tracking-wider text-white truncate block">
                              {audio.name}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-white/30 font-mono shrink-0">
                          {Math.floor(audio.duration / 60)}:{(Math.floor(audio.duration % 60)).toString().padStart(2, '0')}
                        </span>
                        {playingAudioIds.has(audio.id) && (
                          <span className="text-[8px] tracking-wider text-[#ff3a3a] shrink-0 uppercase">Playing</span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(audio.id);
                            setRenameValue(audio.name);
                          }}
                          className="p-1 text-white/30 hover:text-white transition-colors shrink-0"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAudio(audio.id);
                          }}
                          className="p-1 text-white/30 hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-full bg-white/10 backdrop-blur-2xl border border-white/20 px-3 md:px-4 py-2 shrink-0 flex flex-wrap items-center gap-2 md:gap-3 shadow-2xl z-20 rounded-sm relative">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <h3 className="font-serif text-xs md:text-sm tracking-wider text-white truncate">
                    {playingAudioIds.size > 0 ? `${playingAudioIds.size} 条音频播放中` : 'Subliminal'}
                  </h3>
                  {timer && <span className="text-[9px] md:text-[10px] tracking-wider text-[#ff3a3a] shrink-0">{timer}M</span>}
                </div>
                <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <Volume2 className="w-3 h-3 text-white/40" />
                    <input 
                      type="range" 
                      min="0" max="1" step="0.01"
                      value={subVolume}
                      onChange={(e) => setSubVolume(parseFloat(e.target.value))}
                      className="w-10 md:w-14 h-1 accent-white/60"
                    />
                  </div>
                  <button 
                    onClick={() => setSubConfig({...subConfig, binaural: !subConfig.binaural})}
                    className={`p-1.5 transition-colors ${subConfig.binaural ? 'text-purple-300' : 'text-white/40 hover:text-white'}`}
                    title="Binaural Beats"
                  >
                    <Ear className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    disabled={selectedAudioIds.size === 0}
                    className="w-8 h-8 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-[#8E93A2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => playingAudioIds.size > 0 ? stopAllSubAudios() : playSelectedAudios()}
                  >
                    {playingAudioIds.size > 0 ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                  <div className="relative">
                    <button 
                      onClick={() => setShowTimer(!showTimer)}
                      className={`p-1.5 transition-colors ${timer ? 'text-[#ff3a3a]' : 'text-white/40 hover:text-white'}`}
                    >
                      <Timer className="w-3.5 h-3.5" />
                    </button>
                    <AnimatePresence>
                      {showTimer && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 bottom-full mb-2 w-32 bg-[#8E93A2]/95 backdrop-blur-xl border border-white/20 p-2 shadow-2xl z-50 text-left"
                        >
                          <div className="space-y-1">
                            {[15, 30, 45, 60].map(t => (
                              <button key={t} onClick={() => { setTimer(t); setShowTimer(false); }} className="w-full flex justify-between items-center px-3 py-2 text-[10px] text-white hover:bg-white/10 transition-colors uppercase">
                                {t} MIN {timer === t && <Check className="w-3 h-3" />}
                              </button>
                            ))}
                            <button onClick={() => { setTimer(null); setShowTimer(false); }} className="w-full text-left px-3 py-2 text-[10px] text-white/50 hover:bg-white/10 transition-colors mt-1 border-t border-white/10 uppercase">
                              O F F
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'bgm' && (
            <motion.div 
              key="bgm"
              className="absolute inset-0 flex flex-col h-full"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            >
              {!isLoggedIn ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[120px] pb-2 text-center bg-white/5 border border-white/10 px-6">
                  <h3 className="font-serif text-lg tracking-widest text-white mb-2">网易云音乐</h3>
                  <p className="text-[9px] tracking-[0.2em] text-white/40 uppercase mb-6">登录以查看你的歌单</p>

                  <div className="flex gap-4 mb-8">
                    <button 
                      onClick={() => setLoginMethod('phone')}
                      className={`flex items-center gap-2 px-4 py-2 text-[9px] tracking-[0.2em] uppercase border transition-all ${
                        loginMethod === 'phone' 
                          ? 'border-[#ff3a3a]/50 text-[#ff3a3a] bg-[#ff3a3a]/10' 
                          : 'border-white/10 text-white/40 hover:border-white/30'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" /> 手机号登录
                    </button>
                    <button 
                      onClick={() => setLoginMethod('qr')}
                      className={`flex items-center gap-2 px-4 py-2 text-[9px] tracking-[0.2em] uppercase border transition-all ${
                        loginMethod === 'qr' 
                          ? 'border-[#ff3a3a]/50 text-[#ff3a3a] bg-[#ff3a3a]/10' 
                          : 'border-white/10 text-white/40 hover:border-white/30'
                      }`}
                    >
                      <QrCode className="w-3 h-3" /> 扫码登录
                    </button>
                  </div>

                  <div className="w-full max-w-xs flex flex-col items-center">
                    {loginMethod === 'phone' && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="w-full flex flex-col gap-4"
                      >
                        <div className="flex gap-2">
                          <div className="flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/5 text-[10px] text-white/50 tracking-widest shrink-0">
                            +86
                          </div>
                          <input 
                            type="tel"
                            value={phone}
                            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setPhoneLoginError(''); }}
                            placeholder="手机号"
                            className="flex-1 bg-transparent border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40 transition-colors"
                          />
                        </div>

                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={captcha}
                            onChange={(e) => { setCaptcha(e.target.value.replace(/\D/g, '').slice(0, 6)); setPhoneLoginError(''); }}
                            placeholder="验证码"
                            maxLength={6}
                            className="flex-1 bg-transparent border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40 transition-colors"
                          />
                          <button 
                            onClick={sendCaptcha}
                            disabled={captchaCountdown > 0 || phone.length < 11}
                            className="px-4 py-2 text-[9px] tracking-[0.15em] uppercase border border-white/20 text-white hover:bg-white hover:text-[#8E93A2] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white shrink-0"
                          >
                            {captchaCountdown > 0 ? `${captchaCountdown}s` : '获取验证码'}
                          </button>
                        </div>

                        {phoneLoginError && (
                          <p className="text-[9px] tracking-wider text-red-400/70 uppercase">{phoneLoginError}</p>
                        )}

                        <button 
                          onClick={loginWithPhone}
                          disabled={phoneLoginLoading || !phone || !captcha}
                          className="w-full py-3 text-[10px] tracking-[0.3em] text-white uppercase border border-[#ff3a3a]/30 bg-[#ff3a3a]/10 hover:bg-[#ff3a3a]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {phoneLoginLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-3 h-3 border-t border-l border-white/60 rounded-full animate-spin" />
                              登录中...
                            </span>
                          ) : '登录'}
                        </button>
                      </motion.div>
                    )}

                    {loginMethod === 'qr' && (
                      <motion.div 
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        className="w-full flex flex-col items-center"
                      >
                        {qrStatus === 'idle' && (
                          <button 
                            onClick={generateQrCode}
                            className="px-8 py-3 text-[10px] tracking-[0.3em] text-white uppercase border border-white/20 hover:bg-white hover:text-[#8E93A2] transition-all duration-500 cursor-pointer"
                          >
                            获取二维码
                          </button>
                        )}

                        {qrStatus === 'loading' && (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-t-[1.5px] border-l-[1.5px] border-white/60 rounded-full animate-spin" />
                            <span className="text-[9px] tracking-[0.2em] text-white/50 uppercase">生成中...</span>
                          </div>
                        )}

                        {(qrStatus === 'waiting' || qrStatus === 'scanned') && qrDataUrl && (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-44 h-44 bg-white p-2 rounded-sm">
                              <img src={qrDataUrl} alt="QR Code" className="w-full h-full" />
                            </div>
                            <p className="text-[9px] tracking-[0.2em] text-white/50 uppercase">
                              {qrStatus === 'waiting' ? '请使用网易云音乐 APP 扫码' : '✓ 扫码成功，请在手机上确认登录'}
                            </p>
                            {qrStatus === 'scanned' && (
                              <div className="w-32 h-[2px] bg-white/10 relative overflow-hidden">
                                <div className="absolute top-0 left-0 h-full w-1/3 bg-white animate-[shimmer_1s_infinite]"></div>
                              </div>
                            )}
                          </div>
                        )}

                        {qrStatus === 'expired' && (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-44 h-44 bg-white/10 flex items-center justify-center rounded-sm">
                              <span className="text-[9px] tracking-[0.2em] text-white/40 uppercase">二维码已过期</span>
                            </div>
                            <button 
                              onClick={generateQrCode}
                              className="flex items-center gap-2 px-6 py-2 text-[9px] tracking-[0.2em] text-white uppercase border border-white/20 hover:bg-white hover:text-[#8E93A2] transition-all duration-500 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" /> 刷新二维码
                            </button>
                          </div>
                        )}

                        {qrStatus === 'error' && (
                          <div className="flex flex-col items-center gap-4">
                            <span className="text-[9px] tracking-[0.2em] text-red-300/60 uppercase">生成失败，请重试</span>
                            <button 
                              onClick={generateQrCode}
                              className="flex items-center gap-2 px-6 py-2 text-[9px] tracking-[0.2em] text-white uppercase border border-white/20 hover:bg-white hover:text-[#8E93A2] transition-all duration-500 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" /> 重试
                            </button>
                          </div>
                        )}

                        {qrStatus === 'success' && (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 rounded-full border border-green-400/50 flex items-center justify-center">
                              <Check className="w-6 h-6 text-green-400" />
                            </div>
                            <span className="text-[9px] tracking-[0.2em] text-green-300/60 uppercase">登录成功</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {selectedPlaylistId === null ? (
                    <>
                      <div className="flex items-center justify-between mb-4 px-2 border-b border-white/10 pb-2 shrink-0">
                        <div className="flex items-center gap-3">
                          {userInfo?.avatarUrl ? (
                            <img src={userInfo.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-white/20" />
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-white/20 bg-white/10 flex items-center justify-center">
                              <Smartphone className="w-3 h-3 text-white/40" />
                            </div>
                          )}
                          <span className="text-[9px] tracking-[0.2em] text-white uppercase">{userInfo?.nickname || '我的歌单'}</span>
                        </div>
                        <button 
                          onClick={handleLogout}
                          className="flex items-center gap-1 text-[8px] tracking-[0.15em] text-white/30 hover:text-white/60 uppercase transition-colors"
                        >
                          <LogOut className="w-3 h-3" /> 退出
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 gap-4 pb-4 px-2">
                        {playlists.map(playlist => (
                          <div 
                            key={playlist.id} 
                            onClick={() => handleSelectPlaylist(playlist.id)}
                            className="flex flex-col gap-2 group cursor-pointer"
                          >
                            <div className="w-full aspect-square relative rounded-sm overflow-hidden mb-1 border border-white/10 group-hover:border-white/30 transition-colors bg-white/5">
                              {playlist.coverImgUrl ? (
                                <img src={playlist.coverImgUrl} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music className="w-8 h-8 text-white/20" />
                                </div>
                              )}
                              <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded-sm text-[8px] text-white tracking-widest flex items-center gap-1">
                                <Play className="w-2 h-2" /> {playlist.trackCount}
                              </div>
                            </div>
                            <span className="text-xs font-medium text-white/90 group-hover:text-white line-clamp-2 leading-tight">{playlist.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-4 px-2 border-b border-white/10 pb-2 shrink-0">
                        <button 
                          onClick={() => { setSelectedPlaylistId(null); bgm.setTracks([]); }}
                          className="text-[9px] tracking-[0.2em] hover:text-[#ff3a3a] text-white/40 uppercase transition-colors"
                        >
                          ← Back
                        </button>
                        <span className="text-[9px] tracking-[0.2em] text-white/70 uppercase truncate">
                          {playlists.find(p => p.id === selectedPlaylistId)?.name}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-4">
                        {bgm.tracks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-white/30 text-[10px] uppercase tracking-widest gap-4">
                            <div className="w-8 h-8 border-t-[1.5px] border-l-[1.5px] border-white/40 rounded-full animate-spin" />
                            加载中...
                          </div>
                        ) : (
                          bgm.tracks.map((track, idx) => (
                            <div 
                              key={track.id} 
                              onClick={() => handleSelectTrack(track.id)}
                              className={`flex items-center justify-between p-3 border transition-colors group cursor-pointer ${isLoadingSong && bgm.selectedTrackId !== track.id ? 'pointer-events-none opacity-50' : ''} ${bgm.selectedTrackId === track.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                            >
                              <div className="flex gap-4 items-center min-w-0 flex-1">
                                <div className="text-[10px] text-white/30 font-mono w-4 shrink-0">{idx + 1}</div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className={`text-sm font-serif tracking-wider truncate ${bgm.selectedTrackId === track.id ? 'text-[#ff3a3a]' : 'text-white'}`}>{track.name}</span>
                                  <span className="text-[10px] text-white/40 font-sans tracking-widest truncate">{track.ar.map(a => a.name).join(' / ')}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-2">
                                <span className="text-[9px] text-white/30 font-mono">{formatDuration(track.dt)}</span>
                                <div className={`w-6 h-6 rounded-full border border-white/30 flex items-center justify-center transition-opacity ${bgm.selectedTrackId === track.id && bgm.isPlaying ? 'opacity-100 bg-white text-[#8E93A2]' : 'opacity-0 group-hover:opacity-100'}`}>
                                  {bgm.selectedTrackId === track.id && bgm.isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 translate-x-[1px]" />}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  <div className="w-full bg-white/10 backdrop-blur-2xl border border-white/20 px-3 md:px-4 py-2 shrink-0 flex flex-wrap items-center gap-2 md:gap-3 shadow-2xl z-20 rounded-sm relative">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h3 className="font-serif text-xs md:text-sm tracking-wider text-white truncate">
                        {bgm.currentTrack?.name || 'No Track'}
                      </h3>
                      <span className="text-[9px] md:text-[10px] tracking-wider text-white/40 shrink-0 truncate">
                        {bgm.currentTrack?.artist}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
                      <div className="flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-white/40" />
                        <input 
                          type="range" 
                          min="0" max="1" step="0.01"
                          value={bgm.volume}
                          onChange={(e) => bgm.setVolume(parseFloat(e.target.value))}
                          className="w-10 md:w-14 h-1 accent-white/60"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          if (bgm.playMode === 'list') bgm.setPlayMode('single');
                          else if (bgm.playMode === 'single') bgm.setPlayMode('shuffle');
                          else bgm.setPlayMode('list');
                        }}
                        className={`p-1.5 transition-colors ${bgm.playMode !== 'list' ? 'text-[#ff3a3a]' : 'text-white/40 hover:text-white'}`}
                        title={bgm.playMode === 'list' ? '列表循环' : bgm.playMode === 'single' ? '单曲循环' : '随机播放'}
                      >
                        {bgm.playMode === 'single' ? <Repeat1 className="w-3.5 h-3.5" /> : bgm.playMode === 'shuffle' ? <Shuffle className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        disabled={!bgm.songUrl || bgm.tracks.length === 0}
                        className="text-white/50 hover:text-white transition-colors disabled:opacity-30 p-1"
                        onClick={bgm.playPrev}
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        disabled={!bgm.songUrl}
                        className="w-8 h-8 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-[#8E93A2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={bgm.togglePlay}
                      >
                        {bgm.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                      </button>
                      <button 
                        disabled={!bgm.songUrl || bgm.tracks.length === 0}
                        className="text-white/50 hover:text-white transition-colors disabled:opacity-30 p-1"
                        onClick={bgm.playNext}
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                      <div className="relative">
                        <button 
                          onClick={() => setShowTimer(!showTimer)}
                          className={`p-1.5 transition-colors ${timer ? 'text-[#ff3a3a]' : 'text-white/40 hover:text-white'}`}
                        >
                          <Timer className="w-3.5 h-3.5" />
                        </button>
                        <AnimatePresence>
                          {showTimer && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                              className="absolute right-0 bottom-full mb-2 w-32 bg-[#8E93A2]/95 backdrop-blur-xl border border-white/20 p-2 shadow-2xl z-50 text-left"
                            >
                              <div className="space-y-1">
                                {[15, 30, 45, 60].map(t => (
                                  <button key={t} onClick={() => { setTimer(t); setShowTimer(false); }} className="w-full flex justify-between items-center px-3 py-2 text-[10px] text-white hover:bg-white/10 transition-colors uppercase">
                                    {t} MIN {timer === t && <Check className="w-3 h-3" />}
                                  </button>
                                ))}
                                <button onClick={() => { setTimer(null); setShowTimer(false); }} className="w-full text-left px-3 py-2 text-[10px] text-white/50 hover:bg-white/10 transition-colors mt-1 border-t border-white/10 uppercase">
                                  O F F
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
