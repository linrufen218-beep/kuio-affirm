import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, User, LogOut, X, Music, ArrowLeft, Headphones, Send, RefreshCw } from 'lucide-react';
import {
  sendCaptcha, loginWithCaptcha, getUserProfile, getUserPlaylists,
  getPlaylistTracksCached, clearPlaylistCache, clearPlaylistTracksCache, formatDuration,
  type PlaylistItem, type TrackItem, type UserProfile,
} from '../../services/musicApi';
import { AudioPlayer, type PlayMode } from './AudioPlayer';

export function MusicPlayerContainer() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [showLogin, setShowLogin] = useState(false);
  const [phone, setPhone] = useState('');
  const [ctcode, setCtcode] = useState('86');
  const [captcha, setCaptcha] = useState('');
  const [captchaSent, setCaptchaSent] = useState(false);
  const [sendingCaptcha, setSendingCaptcha] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  const [view, setView] = useState<'playlists' | 'detail'>('playlists');
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistItem | null>(null);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);

  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const shuffleOrderRef = useRef<number[]>([]);

  const [binauralActive, setBinauralActive] = useState(false);
  const binauralCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    getUserProfile().then(p => {
      setProfile(p);
      setProfileLoading(false);
      if (p) loadPlaylists(p.uid);
    }).catch(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const loadPlaylists = useCallback(async (uid: number) => {
    setPlaylistsLoading(true);
    try {
      const list = await getUserPlaylists(uid);
      setPlaylists(list);
    } catch {}
    setPlaylistsLoading(false);
  }, []);

  const refreshPlaylists = useCallback(async () => {
    if (!profile) return;
    clearPlaylistCache();
    await loadPlaylists(profile.uid);
  }, [profile, loadPlaylists]);

  const refreshTracks = useCallback(async () => {
    if (!selectedPlaylist) return;
    clearPlaylistTracksCache(selectedPlaylist.id);
    setTracksLoading(true);
    try {
      const { tracks: freshTracks } = await getPlaylistTracksCached(selectedPlaylist.id);
      setTracks(freshTracks);
    } catch {}
    setTracksLoading(false);
  }, [selectedPlaylist]);

  const handleSendCaptcha = useCallback(async () => {
    if (!phone.trim()) { setLoginError('请输入手机号'); return; }
    setSendingCaptcha(true);
    setLoginError('');
    try {
      const result = await sendCaptcha(phone.trim(), ctcode);
      if (result.success) {
        setCaptchaSent(true);
        setCountdown(60);
        countdownRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setLoginError(result.message);
      }
    } catch {
      setLoginError('发送失败，请重试');
    }
    setSendingCaptcha(false);
  }, [phone, ctcode]);

  const handleLogin = useCallback(async () => {
    if (!phone.trim() || !captcha.trim()) { setLoginError('请输入手机号和验证码'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await loginWithCaptcha(phone.trim(), captcha.trim(), ctcode);
      if (result.success && result.profile) {
        setProfile(result.profile);
        loadPlaylists(result.profile.uid);
        setTimeout(() => setShowLogin(false), 600);
      } else {
        setLoginError(result.message || '登录失败');
      }
    } catch {
      setLoginError('登录失败，请重试');
    }
    setLoginLoading(false);
  }, [phone, captcha, ctcode, loadPlaylists]);

  const handlePlaylistClick = useCallback(async (playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist);
    setView('detail');

    const { tracks: cachedTracks, cached } = await getPlaylistTracksCached(playlist.id);
    if (cached) {
      setTracks(cachedTracks);
      setTracksLoading(false);
      return;
    }

    setTracksLoading(true);
    try {
      const { tracks: freshTracks } = await getPlaylistTracksCached(playlist.id);
      setTracks(freshTracks);
    } catch {}
    setTracksLoading(false);
  }, []);

  const playTracks = useCallback((trackList: TrackItem[], startIndex: number) => {
    setQueue(trackList);
    setCurrentIndex(startIndex);
    shuffleOrderRef.current = [];
  }, []);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTracks(tracks, 0);
  }, [tracks, playTracks]);

  const handlePlayTrack = useCallback((index: number) => {
    playTracks(tracks, index);
  }, [tracks, playTracks]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => {
      const len = queue.length;
      if (len === 0) return 0;

      switch (playMode) {
        case 'repeatOne':
          return prev;
        case 'shuffle': {
          if (shuffleOrderRef.current.length === 0 || shuffleOrderRef.current.length !== len) {
            const order = Array.from({ length: len }, (_, i) => i);
            for (let i = order.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [order[i], order[j]] = [order[j], order[i]];
            }
            shuffleOrderRef.current = order;
          }
          const currentShuffleIdx = shuffleOrderRef.current.indexOf(prev);
          const nextShuffleIdx = (currentShuffleIdx + 1) % len;
          return shuffleOrderRef.current[nextShuffleIdx];
        }
        case 'repeatAll':
          return (prev + 1) % len;
        case 'sequential':
        default:
          return prev + 1 < len ? prev + 1 : prev;
      }
    });
  }, [queue.length, playMode]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => {
      if (queue.length === 0) return 0;
      const len = queue.length;
      switch (playMode) {
        case 'repeatOne':
          return prev;
        case 'shuffle': {
          if (shuffleOrderRef.current.length === 0) return prev;
          const currentShuffleIdx = shuffleOrderRef.current.indexOf(prev);
          const prevShuffleIdx = (currentShuffleIdx - 1 + len) % len;
          return shuffleOrderRef.current[prevShuffleIdx];
        }
        case 'repeatAll':
          return (prev - 1 + len) % len;
        case 'sequential':
        default:
          return prev - 1 >= 0 ? prev - 1 : 0;
      }
    });
  }, [queue.length, playMode]);

  const toggleBinaural = useCallback(() => {
    if (binauralActive) {
      if (binauralCtxRef.current) {
        binauralCtxRef.current.close().catch(() => {});
        binauralCtxRef.current = null;
      }
      setBinauralActive(false);
    } else {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const merger = ctx.createChannelMerger(2);
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      merger.connect(gain);
      gain.connect(ctx.destination);

      const oscL = ctx.createOscillator();
      oscL.type = 'sine';
      oscL.frequency.value = 200;
      const panL = ctx.createStereoPanner();
      panL.pan.value = -1;
      oscL.connect(panL);
      panL.connect(merger, 0, 0);
      oscL.start();

      const oscR = ctx.createOscillator();
      oscR.type = 'sine';
      oscR.frequency.value = 208;
      const panR = ctx.createStereoPanner();
      panR.pan.value = 1;
      oscR.connect(panR);
      panR.connect(merger, 0, 1);
      oscR.start();

      binauralCtxRef.current = ctx;
      setBinauralActive(true);
    }
  }, [binauralActive]);

  const handleLogout = useCallback(() => {
    setProfile(null);
    setPlaylists([]);
    setSelectedPlaylist(null);
    setTracks([]);
    setQueue([]);
    setCurrentIndex(0);
    setView('playlists');
    setPhone('');
    setCaptcha('');
    setCaptchaSent(false);
    setLoginError('');
  }, []);

  const closeLogin = useCallback(() => {
    setShowLogin(false);
    setLoginError('');
  }, []);

  const isInQueue = (trackId: number) => queue.some(t => t.id === trackId);
  const isCurrentTrack = (trackId: number) => queue[currentIndex]?.id === trackId;

  return (
    <div className="flex flex-col h-full relative">
      <div className={`flex-1 flex flex-col min-h-0 ${view === 'playlists' ? '' : 'hidden'}`}>
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
          <h3 className="text-[9px] tracking-[0.2em] text-white/60 uppercase">Playlists</h3>
          <div className="flex items-center gap-2">
            {profile && (
              <button
                onClick={refreshPlaylists}
                disabled={playlistsLoading}
                className="p-1.5 text-white/30 hover:text-white/60 transition disabled:opacity-30"
                title="刷新歌单列表"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${playlistsLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={toggleBinaural}
              className={`p-1.5 rounded-full transition ${binauralActive ? 'text-white bg-white/10' : 'text-white/30 hover:text-white/60'}`}
              title="Binaural Beats (200Hz L / 208Hz R)"
            >
              <Headphones className="w-3.5 h-3.5" />
            </button>
            {profile ? (
              <button
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition"
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span className="text-[9px] tracking-wider">{profile.nickname}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition"
              >
                <User className="w-4 h-4" />
                <span className="text-[9px] tracking-wider uppercase">Login</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
          {profileLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : !profile ? (
            <div className="flex flex-col items-center justify-center text-center text-white/30 gap-4 py-12">
              <User className="w-10 h-10 text-white/20" />
              <p className="text-[9px] tracking-[0.2em] uppercase">Login to view playlists</p>
              <button
                onClick={() => setShowLogin(true)}
                className="px-4 py-2 text-[9px] tracking-[0.2em] uppercase border border-white/20 text-white/60 hover:bg-white hover:text-[#8E93A2] transition"
              >
                Login Netease
              </button>
            </div>
          ) : playlistsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-white/30 gap-3 py-12">
              <Music className="w-10 h-10 text-white/20" />
              <p className="text-[9px] tracking-[0.2em] uppercase">No playlists</p>
            </div>
          ) : (
            <div className="space-y-1">
              {playlists.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePlaylistClick(p)}
                  className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 transition text-left group border border-transparent hover:border-white/10"
                >
                  <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center shrink-0 border border-white/10 overflow-hidden">
                    {p.coverImgUrl ? (
                      <img src={p.coverImgUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                    ) : (
                      <Music className="w-4 h-4 text-white/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] tracking-wider text-white/70 truncate">{p.name}</div>
                    <div className="text-[9px] text-white/30">{p.trackCount} tracks</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPlaylist && (
      <div className={`flex-1 flex flex-col min-h-0 ${view === 'detail' ? '' : 'hidden'}`}>
        <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-white/10">
          <button onClick={() => setView('playlists')} className="p-1 text-white/40 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-wider text-white/70 truncate">{selectedPlaylist.name}</div>
            <div className="text-[9px] text-white/30">{selectedPlaylist.trackCount} tracks</div>
          </div>
          <button
            onClick={handlePlayAll}
            className="px-3 py-1.5 text-[9px] tracking-wider uppercase bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition"
          >
            Play All
          </button>
          <button
            onClick={refreshTracks}
            disabled={tracksLoading}
            className="p-1.5 text-white/30 hover:text-white/60 transition disabled:opacity-30"
            title="刷新歌曲列表"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tracksLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {tracksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-white/30 gap-3 py-12">
              <Music className="w-8 h-8 text-white/20" />
              <p className="text-[9px] tracking-[0.2em] uppercase">No tracks</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tracks.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => handlePlayTrack(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition text-left ${
                    isCurrentTrack(track.id) ? 'bg-white/10' : ''
                  }`}
                >
                  <span className="w-5 text-[9px] text-white/20 shrink-0 text-right">{i + 1}</span>
                  {track.albumCover && (
                    <img src={track.albumCover} className="w-8 h-8 rounded object-cover shrink-0" alt="" loading="lazy" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[10px] tracking-wider truncate ${
                      isCurrentTrack(track.id) ? 'text-white' : 'text-white/70'
                    }`}>
                      {track.name}
                    </div>
                    <div className="text-[9px] text-white/30 truncate">{track.artist} · {track.album}</div>
                  </div>
                  <span className="text-[9px] text-white/20 shrink-0">{formatDuration(track.duration)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {queue.length > 0 && (
        <AudioPlayer
          queue={queue}
          currentIndex={currentIndex}
          onNext={handleNext}
          onPrev={handlePrev}
          playMode={playMode}
          onPlayModeChange={setPlayMode}
        />
      )}

      {showLogin && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/10 border border-white/20 backdrop-blur-xl shadow-2xl w-[280px] p-5 relative">
            <button
              onClick={closeLogin}
              className="absolute top-3 right-3 p-1 text-white/40 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-[9px] tracking-[0.3em] text-white/60 mb-4 uppercase text-center">
              Netease Login
            </h3>

            {profile ? (
              <div className="text-center">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} className="w-12 h-12 rounded-full mx-auto mb-2 object-cover border border-white/20" alt="" />
                ) : (
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2 border border-white/20">
                    <User className="w-6 h-6 text-white/60" />
                  </div>
                )}
                <p className="text-[10px] tracking-wider text-white/70 mb-1">{profile.nickname}</p>
                <p className="text-[9px] text-white/30 mb-4">Logged in</p>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 mx-auto text-red-400/60 hover:text-red-400 transition text-[9px] tracking-wider uppercase"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ctcode}
                    onChange={e => setCtcode(e.target.value.replace(/\D/g, ''))}
                    placeholder="+86"
                    className="w-14 px-2 py-2 text-[10px] bg-white/5 border border-white/10 text-white/70 placeholder-white/20 focus:outline-none focus:border-white/30 text-center"
                  />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="手机号"
                    className="flex-1 px-3 py-2 text-[10px] bg-white/5 border border-white/10 text-white/70 placeholder-white/20 focus:outline-none focus:border-white/30"
                    onKeyDown={e => { if (e.key === 'Enter' && !captchaSent) handleSendCaptcha(); }}
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={captcha}
                    onChange={e => setCaptcha(e.target.value.replace(/\D/g, ''))}
                    placeholder="验证码"
                    maxLength={6}
                    className="flex-1 px-3 py-2 text-[10px] bg-white/5 border border-white/10 text-white/70 placeholder-white/20 focus:outline-none focus:border-white/30 tracking-[0.3em]"
                    onKeyDown={e => { if (e.key === 'Enter' && captchaSent) handleLogin(); }}
                  />
                  <button
                    onClick={handleSendCaptcha}
                    disabled={sendingCaptcha || countdown > 0 || !phone.trim()}
                    className="px-3 py-2 text-[9px] tracking-wider uppercase border border-white/20 text-white/60 hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    {sendingCaptcha ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {loginError && (
                  <p className="text-[9px] text-red-400/70 text-center tracking-wider">{loginError}</p>
                )}

                <button
                  onClick={handleLogin}
                  disabled={loginLoading || !captchaSent || !captcha.trim()}
                  className="w-full py-2.5 text-[9px] tracking-[0.2em] uppercase border border-white/20 text-white/60 hover:bg-white hover:text-[#8E93A2] transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Login'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}