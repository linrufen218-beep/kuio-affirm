export interface SubliminalConfig {
  babble: boolean;
  muffled: boolean;
  silent: boolean;
  binaural: boolean;
}

export const MIMO_VOICES = [
  { id: '冰糖', label: '冰糖 (Bingtang) — 中文女声' },
  { id: '茉莉', label: '茉莉 (Moli) — 中文女声' },
  { id: '苏打', label: '苏打 (Suda) — 中文男声' },
  { id: '白桦', label: '白桦 (Baihua) — 中文男声' },
  { id: 'Mia', label: 'Mia — English Female' },
  { id: 'Chloe', label: 'Chloe — English Female' },
  { id: 'Milo', label: 'Milo — English Male' },
  { id: 'Dean', label: 'Dean — English Male' },
  { id: 'mimo_default', label: 'MiMo Default (默认)' }
];

const TTS_CACHE_DB = 'kuio_tts_cache';
const TTS_CACHE_STORE = 'tts_results';

function openTtsCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TTS_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TTS_CACHE_STORE)) {
        db.createObjectStore(TTS_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function ttsCacheKey(text: string, voiceId: string): string {
  let hash = 0;
  const str = `${voiceId}:${text}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `tts_${Math.abs(hash).toString(36)}`;
}

async function getTtsFromCache(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openTtsCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TTS_CACHE_STORE, 'readonly');
      const store = tx.objectStore(TTS_CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.audioData || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveTtsToCache(key: string, audioData: ArrayBuffer): Promise<void> {
  try {
    const db = await openTtsCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TTS_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(TTS_CACHE_STORE);
      store.put({ audioData, timestamp: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
  }
}

export async function generateTTS(text: string, settings: any, voiceId: string): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  
  if (settings.ttsApiKey) {
    const apiKey = settings.ttsApiKey.trim();
    const cacheKey = ttsCacheKey(text, voiceId);

    const cached = await getTtsFromCache(cacheKey);
    if (cached) {
      console.log('[TTS] Cache hit for key:', cacheKey);
      try {
        return await ctx.decodeAudioData(cached.slice(0));
      } catch {
        console.warn('[TTS] Cache decode failed, re-fetching');
      }
    }

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(`/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            apiKey: apiKey,
            text: text,
            voiceId: voiceId,
            settings: settings
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const responseText = await res.text();
        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`TTS 代理返回非 JSON 响应 (HTTP ${res.status})`);
        }
        
        if (res.ok && data && data.choices && data.choices[0]?.message?.audio?.data) {
          const audioBase64 = data.choices[0].message.audio.data;
          const binaryString = window.atob(audioBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          saveTtsToCache(cacheKey, bytes.buffer.slice(0)).catch(() => {});

          return await ctx.decodeAudioData(bytes.buffer);
        } else {
          console.warn("TTS API Error Details:", JSON.stringify(data).substring(0, 500));
          let errMsg = "TTS API returned non-OK status";
          if (data?.error?.message) {
            errMsg = data.error.message;
          } else if (data?.message) {
            errMsg = data.message;
          } else if (data?.error?.code) {
            errMsg = `错误码: ${data.error.code}`;
          } else if (data?.error && typeof data.error === 'string') {
            errMsg = data.error;
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error("API Key 无效或已过期，请在设置中检查");
          } else if (res.status === 429) {
            throw new Error("API 请求频率超限，请稍后再试");
          } else if (res.status === 402) {
            throw new Error("API 额度已用完，请充值后重试");
          } else if (res.status === 504 || data?.code === 'TIMEOUT') {
            lastError = new Error(`TTS API 请求超时${attempt < maxRetries ? '，正在重试...' : ''}`);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
              continue;
            }
            throw lastError;
          }
          throw new Error(`TTS API failed: ${errMsg}`);
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          lastError = new Error(`TTS 请求超时${attempt < maxRetries ? '，正在重试...' : '，请检查网络后重试'}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw lastError;
        }
        if (attempt < maxRetries && !(e.message?.includes('API Key') || e.message?.includes('额度'))) {
          lastError = e;
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        console.error("TTS API failed:", e);
        throw e;
      }
    }
    throw lastError || new Error("TTS 请求失败");
  }

  throw new Error("No TTS API Key configured. Please add one in Settings.");
}

export async function generateSubliminalMix(
  baseBuffer: AudioBuffer,
  config: SubliminalConfig
): Promise<{ buffer: AudioBuffer, trackLogs: any[] }> {
  
  const longestRate = config.babble ? 0.8 : 1.0;
  const totalDuration = baseBuffer.duration / longestRate;
  
  const offlineCtx = new OfflineAudioContext(
    1, 
    baseBuffer.sampleRate * totalDuration, 
    baseBuffer.sampleRate
  );

  const trackLogs: any[] = [];
  
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.connect(offlineCtx.destination);
  
  let finalNode: AudioNode | AudioParam = compressor;

  // 3. Silent Subliminal (High Freq AM Modulation)
  if (config.silent) {
    const carrier = offlineCtx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 14500;
    
    const amNode = offlineCtx.createGain();
    amNode.gain.value = 0; 
    
    carrier.connect(amNode);
    amNode.connect(compressor);
    
    carrier.start(0);
    finalNode = amNode.gain; 
  } 

  // 2. Muffled (Lowpass masking)
  if (config.muffled && !config.silent) {
    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 600; // < 800Hz
    lowpass.connect(finalNode as AudioNode);
    finalNode = lowpass;
  }

  const addTrack = (playbackRate: number, reverse: boolean, volume: number, trackName: string) => {
    const trackDuration = baseBuffer.duration / playbackRate;
    let startTime = 0;
    let plays = 0;
    const clips = [];

    while (startTime < totalDuration) {
      const source = offlineCtx.createBufferSource();
      
      if (reverse) {
        const revBuffer = offlineCtx.createBuffer(1, baseBuffer.length, baseBuffer.sampleRate);
        const dest = revBuffer.getChannelData(0);
        const src = baseBuffer.getChannelData(0);
        for(let i = 0; i < src.length; i++){
          dest[i] = src[src.length - 1 - i];
        }
        source.buffer = revBuffer;
      } else {
        source.buffer = baseBuffer;
      }

      source.playbackRate.value = playbackRate;
      
      const gain = offlineCtx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(finalNode as AudioNode);
      
      source.start(startTime);
      clips.push({ start: startTime, end: Math.min(startTime + trackDuration, totalDuration) });
      
      startTime += trackDuration;
      plays++;
    }
    
    trackLogs.push({
      name: trackName,
      playbackRate,
      reverse,
      plays,
      clips,
      color: reverse ? 'bg-purple-500/50' : playbackRate === 1 ? 'bg-blue-500/50' : playbackRate < 1 ? 'bg-green-500/50' : 'bg-orange-500/50'
    });
  };

  // 1. Babble Effect (Multi-track async speed)
  if (config.babble) {
    addTrack(1.0, false, 0.4, 'Original (1.0x)');
    addTrack(0.8, false, 0.3, 'Slow (0.8x)');
    addTrack(1.5, false, 0.3, 'Fast (1.5x)');
    addTrack(1.0, true, 0.2, 'Reverse (1.0x)');
  } else {
    addTrack(1.0, false, 1.0, 'Original (1.0x)');
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return { buffer: renderedBuffer, trackLogs };
}
