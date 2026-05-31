interface Env {
  NETEASE_API_BASE: string;
  COOKIE_STORE: KVNamespace;
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
      'Access-Control-Expose-Headers': 'Set-Cookie',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function successResponse(data: any): Response {
  return jsonResponse({ code: 0, message: 'success', data });
}

function errorResponse(message: string, code = 500): Response {
  return jsonResponse({ code, message }, code >= 400 ? code : 200);
}

async function neteaseRequest(
  endpoint: string,
  params: Record<string, string> = {},
  cookie: string = '',
  apiBase: string
): Promise<any> {
  const path = endpoint.replace(/^\/+/, '');
  const query = new URLSearchParams(params).toString();
  const url = `${apiBase}/${path}${query ? '?' + query : ''}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Referer': 'https://music.163.com/',
  };
  if (cookie) headers['Cookie'] = cookie;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    const setCookie = res.headers.getSetCookie?.() || [];
    const data = await res.json();

    if (setCookie.length > 0 || data.cookie) {
      const rawCookie = data.cookie || '';
      const parsed = typeof rawCookie === 'string'
        ? rawCookie.split(';').map((c: string) => c.trim()).filter(Boolean).join('; ')
        : '';
      const combined = [cookie, parsed, ...setCookie].filter(Boolean).join('; ');
      data._mergedCookie = combined;
    }

    return data;
  } catch (e: any) {
    return { code: -1, message: e.name === 'AbortError' ? 'Timeout' : e.message };
  }
}

async function getSessionCookie(request: Request, env: Env): Promise<string> {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/netease_session=([^;]+)/);
  if (match) {
    try {
      const stored = await env.COOKIE_STORE.get(`session:${match[1]}`);
      if (stored) return stored;
    } catch {}
  }
  return '';
}

async function saveSessionCookie(cookie: string, env: Env): Promise<string> {
  const sessionId = crypto.randomUUID();
  await env.COOKIE_STORE.put(`session:${sessionId}`, cookie, { expirationTtl: 86400 * 30 });
  return sessionId;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Cookie',
          'Access-Control-Expose-Headers': 'Set-Cookie',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const apiBase = env.NETEASE_API_BASE || 'https://netease-cloud-music-api-five-roan-58.vercel.app';

    if (url.pathname === '/health') {
      return successResponse({ status: 'ok', timestamp: Date.now() });
    }

    if (url.pathname === '/api/login/captcha/sent') {
      const phone = url.searchParams.get('phone');
      const ctcode = url.searchParams.get('ctcode') || '86';
      if (!phone) return errorResponse('Missing phone parameter', 400);
      const res = await neteaseRequest('/captcha/sent', { phone, ctcode }, '', apiBase);
      if (res.code === 200) {
        return successResponse({ sent: true });
      }
      return errorResponse(res.message || res.msg || 'Failed to send captcha', res.code || 500);
    }

    if (url.pathname === '/api/login/cellphone') {
      const phone = url.searchParams.get('phone');
      const captcha = url.searchParams.get('captcha');
      const ctcode = url.searchParams.get('ctcode') || '86';
      if (!phone || !captcha) return errorResponse('Missing phone or captcha', 400);
      const res = await neteaseRequest('/login/cellphone', { phone, captcha, countrycode: ctcode }, '', apiBase);
      if (res.code === 200) {
        const mergedCookie = res._mergedCookie || res.cookie || '';
        if (mergedCookie && env.COOKIE_STORE) {
          const sessionId = await saveSessionCookie(mergedCookie, env);
          const response = successResponse({
            nickname: res.profile?.nickname,
            avatarUrl: res.profile?.avatarUrl,
            uid: res.profile?.userId,
          });
          response.headers.append('Set-Cookie', `netease_session=${sessionId}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
          return response;
        }
      }
      return errorResponse(res.message || res.msg || 'Login failed', res.code || 401);
    }

    if (url.pathname === '/api/user/profile') {
      const cookie = await getSessionCookie(request, env);
      if (!cookie) return errorResponse('Not logged in', 401);
      const res = await neteaseRequest('/user/account', { timestamp: Date.now().toString() }, cookie, apiBase);
      if (res.code === 200 && res.profile) {
        return successResponse({
          nickname: res.profile.nickname,
          avatarUrl: res.profile.avatarUrl,
          uid: res.profile.userId,
        });
      }
      return errorResponse(res.message || 'Failed to get profile', res.code || 401);
    }

    if (url.pathname === '/api/user/playlists') {
      const cookie = await getSessionCookie(request, env);
      if (!cookie) return errorResponse('Not logged in', 401);
      const uid = url.searchParams.get('uid');
      if (!uid) return errorResponse('Missing uid parameter', 400);
      const res = await neteaseRequest('/user/playlist', {
        uid,
        limit: '50',
        timestamp: Date.now().toString(),
      }, cookie, apiBase);
      if (res.code === 200 && res.playlist) {
        const playlists = res.playlist.map((p: any) => ({
          id: p.id,
          name: p.name,
          coverImgUrl: p.coverImgUrl,
          trackCount: p.trackCount,
          playCount: p.playCount || 0,
          description: p.description || '',
          creator: { nickname: p.creator?.nickname || '', userId: p.creator?.userId },
        }));
        return successResponse({ playlists });
      }
      return errorResponse(res.message || 'Failed to get playlists', res.code || 500);
    }

    const playlistMatch = url.pathname.match(/^\/api\/playlist\/(\d+)$/);
    if (playlistMatch) {
      const cookie = await getSessionCookie(request, env);
      const playlistId = playlistMatch[1];
      const res = await neteaseRequest('/playlist/track/all', {
        id: playlistId,
        limit: '200',
        timestamp: Date.now().toString(),
      }, cookie, apiBase);
      if (res.code === 200 && res.songs) {
        const tracks = res.songs.map((s: any) => ({
          id: s.id,
          name: s.name || '',
          artist: (s.ar || []).map((a: any) => a.name).join(' / '),
          album: s.al?.name || '',
          albumCover: s.al?.picUrl || '',
          duration: s.dt || 0,
        }));
        return successResponse({ tracks });
      }
      return errorResponse(res.message || 'Failed to get playlist', res.code || 500);
    }

    if (url.pathname === '/api/song/url') {
      const songId = url.searchParams.get('id');
      if (!songId) return errorResponse('Missing id parameter', 400);
      const cookie = await getSessionCookie(request, env);
      const res = await neteaseRequest('/song/url/v1', {
        id: songId,
        level: 'standard',
        timestamp: Date.now().toString(),
      }, cookie, apiBase);
      if (res.code === 200 && res.data && res.data.length > 0) {
        const song = res.data[0];
        if (song.url) {
          return successResponse({ url: song.url, br: song.br, type: song.type, id: song.id });
        }
        const freeTrial = song.freeTrialInfo || null;
        return errorResponse('No playable URL', freeTrial ? 403 : 404);
      }
      return errorResponse(res.message || 'Failed to get song URL', res.code || 500);
    }

    if (url.pathname === '/api/music/proxy') {
      const musicUrl = url.searchParams.get('url');
      if (!musicUrl) return errorResponse('Missing url parameter', 400);

      const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      };

      try {
        const cache = caches.default;
        const cacheKey = new Request(musicUrl, { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
          headers.set('X-Cache-Status', 'HIT');
          return new Response(cached.body, { status: cached.status, headers });
        }

        const reqHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://music.163.com/',
        };
        if (request.headers.get('Range')) reqHeaders['Range'] = request.headers.get('Range')!;

        const response = await fetch(musicUrl, { headers: reqHeaders });
        if (!response.ok && response.status !== 206) {
          return errorResponse(`Upstream error: ${response.status}`, response.status);
        }

        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
        headers.set('X-Cache-Status', 'MISS');
        headers.delete('Set-Cookie');

        if (response.status === 200) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }

        return new Response(response.body, { status: response.status, headers });
      } catch (e: any) {
        return errorResponse(`Proxy fetch failed: ${e.message}`, 502);
      }
    }

    return errorResponse('Not found', 404);
  },
};
