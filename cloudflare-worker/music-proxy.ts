export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, X-Cache-Status',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const musicUrl = url.searchParams.get('url');
    if (!musicUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, X-Cache-Status',
      'Access-Control-Max-Age': '86400',
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
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://music.163.com/',
      };
      if (request.headers.get('Range')) {
        reqHeaders['Range'] = request.headers.get('Range')!;
      }

      const response = await fetch(musicUrl, { headers: reqHeaders });

      if (!response.ok && response.status !== 206) {
        return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
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
      return new Response(JSON.stringify({ error: 'Proxy fetch failed', detail: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
