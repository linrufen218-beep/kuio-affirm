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

export async function generateTTS(text: string, settings: any, voiceId: string): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  
  if (settings.ttsApiKey) {
    const apiKey = settings.ttsApiKey.trim();

    try {
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
        })
      });

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
        return await ctx.decodeAudioData(bytes.buffer);
      } else {
        console.warn("TTS API Error Details:", data);
        const errMsg = data?.error?.message || data?.message || "TTS API returned non-OK status";
        throw new Error(`TTS API failed: ${errMsg}`);
      }
    } catch (e: any) {
      console.error("TTS API failed:", e);
      throw e;
    }
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
  
  let finalNode: AudioNode = compressor;

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
    lowpass.connect(finalNode);
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
      gain.connect(finalNode as AudioNode | AudioParam);
      
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
