import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const isProduction = process.env.NODE_ENV === "production";

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  const NETEASE_API_PORT = PORT + 1;

  const { serveNcmApi } = require("NeteaseCloudMusicApi/server");
  serveNcmApi({ port: NETEASE_API_PORT, checkVersion: false })
    .then(() => {
      console.log(`NeteaseCloudMusicApi running on http://localhost:${NETEASE_API_PORT}`);
    })
    .catch((err: any) => {
      console.error("Failed to start NeteaseCloudMusicApi:", err);
    });

  app.get("/api/netease/music", async (req, res) => {
    const musicUrl = req.query.url as string;
    if (!musicUrl) {
      return res.status(400).send("Missing url parameter");
    }
    try {
      const response = await fetch(musicUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://music.163.com/",
        },
      });
      if (!response.ok) {
        console.error(`[Music Proxy] Upstream error: ${response.status}`);
        return res.status(response.status).send("Upstream error");
      }
      const contentType = response.headers.get("content-type") || "audio/mpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      const contentLength = response.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      const reader = response.body!.getReader();
      let aborted = false;
      req.on("close", () => {
        aborted = true;
        reader.cancel().catch(() => {});
      });

      const pump = async () => {
        try {
          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.destroyed) {
              res.write(value);
            }
          }
        } catch {}
        if (!res.destroyed) res.end();
      };
      pump();
    } catch (e: any) {
      console.error("[Music Proxy] Error:", e.message);
      if (!res.headersSent) res.status(500).send("Failed to fetch music");
    }
  });

  app.all("/api/netease/:endpoint(*)", async (req, res) => {
    const neteasePath = req.params.endpoint.replace(/^\/+/, "");
    const queryParams = new URLSearchParams(req.query as Record<string, string>).toString();
    const targetUrl = `http://localhost:${NETEASE_API_PORT}/${neteasePath}${queryParams ? "?" + queryParams : ""}`;

    console.log(`[Netease Proxy] ${req.method} /api/netease/${neteasePath} → ${targetUrl}`);

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          ...(req.headers.cookie ? { Cookie: req.headers.cookie as string } : {}),
        },
      };

      if (req.method === "POST" && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.headers = { ...fetchOptions.headers, "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);

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
      console.error("[Netease Proxy] Error:", e.message);
      res.status(500).json({ code: 500, message: e.message || "Netease API proxy error" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    const { apiKey, text, voiceId, settings } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: "Missing API Key" });
    }

    try {
      const url = `https://api.xiaomimimo.com/v1/chat/completions`;
      console.log(`Proxying TTS request to: ${url}`);

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
      });

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
      console.error("/api/tts error:", e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
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
