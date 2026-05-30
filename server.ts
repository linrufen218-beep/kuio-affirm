import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const tmpPath = os.tmpdir();
const anonymousTokenPath = path.resolve(tmpPath, "anonymous_token");
if (!fs.existsSync(anonymousTokenPath)) {
  fs.writeFileSync(anonymousTokenPath, "", "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const isProduction = process.env.NODE_ENV === "production";

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  const NETEASE_API_PORT = PORT + 1;
  let neteaseReady = false;

  const { serveNcmApi } = require("NeteaseCloudMusicApi/server");
  serveNcmApi({ port: NETEASE_API_PORT, checkVersion: false })
    .then(() => {
      neteaseReady = true;
      console.log(`NeteaseCloudMusicApi running on http://localhost:${NETEASE_API_PORT}`);
    })
    .catch((err: any) => {
      console.error("Failed to start NeteaseCloudMusicApi:", err);
    });

  app.get("/api/netease/music", async (req, res) => {
    const musicUrl = req.query.url as string;
    if (!musicUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(musicUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://music.163.com/",
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[Music Proxy] Upstream error: ${response.status}`);
        return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600");

      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Length", arrayBuffer.byteLength);
      res.end(Buffer.from(arrayBuffer));
    } catch (e: any) {
      console.error("[Music Proxy] Error:", e.message);
      if (!res.headersSent) res.status(504).json({ error: "Music proxy fetch failed", detail: e.message });
    }
  });

  const neteaseCookies: Record<string, string> = {};

  app.post("/api/netease/cookie", (req, res) => {
    const { cookie } = req.body;
    if (!cookie) return res.status(400).json({ error: "Missing cookie" });
    neteaseCookies["default"] = cookie;
    console.log("[Netease] Cookie saved, length:", cookie.length);
    res.json({ success: true });
  });

  app.all("/api/netease/:endpoint(*)", async (req, res) => {
    const neteasePath = req.params.endpoint.replace(/^\/+/, "");
    const queryParams = new URLSearchParams(req.query as Record<string, string>).toString();
    const targetUrl = `http://localhost:${NETEASE_API_PORT}/${neteasePath}${queryParams ? "?" + queryParams : ""}`;

    if (!neteaseReady) {
      const waitMs = 5000;
      const waited = await new Promise<boolean>((resolve) => {
        const start = Date.now();
        const check = () => {
          if (neteaseReady) return resolve(true);
          if (Date.now() - start > waitMs) return resolve(false);
          setTimeout(check, 200);
        };
        check();
      });
      if (!waited) {
        return res.status(503).json({ code: 503, message: "网易云音乐 API 正在启动，请稍后重试" });
      }
    }

    console.log(`[Netease Proxy] ${req.method} /api/netease/${neteasePath} → ${targetUrl}`);

    const maxRetries = 2;
    let lastError: any = null;

    const cookieToForward = neteaseCookies["default"] || req.headers.cookie as string || "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const fetchOptions: RequestInit = {
          method: req.method,
          headers: {
            ...(cookieToForward ? { Cookie: cookieToForward } : {}),
          },
        };

        if (req.method === "POST" && req.body && Object.keys(req.body).length > 0) {
          fetchOptions.headers = { ...fetchOptions.headers, "Content-Type": "application/json" };
          fetchOptions.body = JSON.stringify(req.body);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(targetUrl, { ...fetchOptions, signal: controller.signal });
        clearTimeout(timeout);

        const setCookies = response.headers.getSetCookie();
        if (setCookies) {
          res.setHeader("Set-Cookie", setCookies);
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          console.log(`[Netease Proxy] Response: code=${data.code}, status=${response.status}`);
          return res.status(response.status).json(data);
        } else {
          const text = await response.text();
          console.error(`[Netease Proxy] Non-JSON response (${response.status}):`, text.substring(0, 200));
          return res.status(response.status).json({
            code: response.status,
            message: "Non-JSON response from Netease API",
            data: text.substring(0, 500),
          });
        }
      } catch (e: any) {
        lastError = e;
        console.error(`[Netease Proxy] Attempt ${attempt + 1} error:`, e.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    console.error("[Netease Proxy] All retries failed:", lastError?.message);
    res.status(500).json({ code: 500, message: lastError?.message || "Netease API proxy error" });
  });

  app.post("/api/tts", async (req, res) => {
    const { apiKey, text, voiceId, settings } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: "Missing API Key" });
    }

    try {
      const url = `https://api.xiaomimimo.com/v1/chat/completions`;
      console.log(`[TTS Proxy] Request: voice=${voiceId}, text length=${text?.length || 0}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          model: "mimo-v2.5-tts",
          messages: [
            {
              role: "user",
              content: "Read the following text in a calm, soothing, and confident tone. Speak slowly and clearly.",
            },
            {
              role: "assistant",
              content: text,
            },
          ],
          audio: {
            format: "wav",
            voice: voiceId,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = await response.text();
      console.log(`[TTS Proxy] Status: ${response.status}, Body length: ${responseText.length}`);

      if (!responseText) {
        console.error(`[TTS Proxy] Empty response, status: ${response.status}`);
        return res
          .status(response.status)
          .json({ error: `MiMo API 返回空响应 (HTTP ${response.status})，请检查 API Key 是否正确` });
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        console.error(`[TTS Proxy] Non-JSON response:`, responseText.substring(0, 500));
        return res.status(response.status).json({
          error: `MiMo API 返回非 JSON 响应 (HTTP ${response.status})`,
          data: responseText.substring(0, 500),
        });
      }

      if (!response.ok) {
        console.error(`[TTS Proxy] API error:`, JSON.stringify(result).substring(0, 500));
        return res.status(response.status).json(result);
      }

      res.json(result);
    } catch (e: any) {
      console.error("[TTS Proxy] Error:", e.message);
      if (e.name === 'AbortError') {
        return res.status(504).json({ error: "TTS API 请求超时，请稍后重试", code: "TIMEOUT" });
      }
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  app.get("/api/debug", (req, res) => {
    res.json({
      headers: {
        host: req.headers.host,
        "x-forwarded-host": req.headers["x-forwarded-host"],
        "x-forwarded-proto": req.headers["x-forwarded-proto"],
        "x-real-ip": req.headers["x-real-ip"],
        "cf-connecting-ip": req.headers["cf-connecting-ip"],
        "cf-ray": req.headers["cf-ray"],
      },
      url: req.url,
      originalUrl: req.originalUrl,
      path: req.path,
      neteaseReady,
      neteasePort: NETEASE_API_PORT,
    });
  });

  if (isProduction) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProduction ? "production" : "development"})`);
  });
}

startServer();
