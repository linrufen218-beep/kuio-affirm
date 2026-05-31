const WORKER_BASE = import.meta.env.VITE_MUSIC_WORKER_URL || '/api';

export interface PlaylistItem {
  id: number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
  playCount: number;
  description: string;
  creator: { nickname: string; userId?: number };
}

export interface TrackItem {
  id: number;
  name: string;
  artist: string;
  album: string;
  albumCover: string;
  duration: number;
}

export interface UserProfile {
  nickname: string;
  avatarUrl: string;
  uid: number;
}

async function workerFetch<T>(path: string, params: Record<string, string> = {}): Promise<{ code: number; message: string; data: T }> {
  const query = new URLSearchParams(params).toString();
  const url = `${WORKER_BASE}${path}${query ? '?' + query : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  const json = await res.json();
  return json;
}

export async function sendCaptcha(phone: string, ctcode = '86'): Promise<{ success: boolean; message: string }> {
  const res = await workerFetch<any>('/login/captcha/sent', { phone, ctcode });
  if (res.code === 0) return { success: true, message: '验证码已发送' };
  return { success: false, message: res.message || '发送失败' };
}

export async function loginWithCaptcha(phone: string, captcha: string, ctcode = '86'): Promise<{ success: boolean; profile?: UserProfile; message?: string }> {
  const res = await workerFetch<any>('/login/cellphone', { phone, captcha, ctcode });
  if (res.code === 0 && res.data) {
    return {
      success: true,
      profile: {
        nickname: res.data.nickname || '',
        avatarUrl: res.data.avatarUrl || '',
        uid: res.data.uid || 0,
      },
    };
  }
  return { success: false, message: res.message || '登录失败' };
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const res = await workerFetch<UserProfile>('/user/profile');
    if (res.code === 0 && res.data) return res.data;
    return null;
  } catch {
    return null;
  }
}

export async function getUserPlaylists(uid: number): Promise<PlaylistItem[]> {
  const res = await workerFetch<{ playlists: PlaylistItem[] }>('/user/playlists', { uid: uid.toString() });
  if (res.code === 0 && res.data) return res.data.playlists;
  throw new Error(res.message || 'Failed to get playlists');
}

export async function getPlaylistTracks(playlistId: number): Promise<TrackItem[]> {
  const res = await workerFetch<{ tracks: TrackItem[] }>(`/playlist/${playlistId}`);
  if (res.code === 0 && res.data) return res.data.tracks;
  throw new Error(res.message || 'Failed to get playlist');
}

const songUrlCache = new Map<number, string>();
const playlistTracksCache = new Map<number, TrackItem[]>();

export async function getPlaylistTracksCached(playlistId: number): Promise<{ tracks: TrackItem[]; cached: boolean }> {
  const cached = playlistTracksCache.get(playlistId);
  if (cached) return { tracks: cached, cached: true };

  const tracks = await getPlaylistTracks(playlistId);
  playlistTracksCache.set(playlistId, tracks);
  return { tracks, cached: false };
}

export function clearPlaylistCache(): void {
  playlistTracksCache.clear();
}

export function clearPlaylistTracksCache(playlistId: number): void {
  playlistTracksCache.delete(playlistId);
}

export async function getSongUrl(songId: number): Promise<string | null> {
  const cached = songUrlCache.get(songId);
  if (cached) return cached;

  try {
    const res = await workerFetch<{ url: string }>('/song/url', { id: songId.toString() });
    if (res.code === 0 && res.data) {
      songUrlCache.set(songId, res.data.url);
      return res.data.url;
    }
    return null;
  } catch {
    return null;
  }
}

export async function prefetchSongUrls(songIds: number[]): Promise<void> {
  const missing = songIds.filter(id => !songUrlCache.has(id));
  if (missing.length === 0) return;
  const results = await Promise.allSettled(
    missing.map(id => workerFetch<{ url: string }>('/song/url', { id: id.toString() }))
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.code === 0 && r.value.data) {
      songUrlCache.set(missing[i], r.value.data.url);
    }
  });
}

export function clearUrlCache(): void {
  songUrlCache.clear();
}

export function getProxyAudioUrl(rawUrl: string): string {
  return `${WORKER_BASE}/music/proxy?url=${encodeURIComponent(rawUrl)}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
