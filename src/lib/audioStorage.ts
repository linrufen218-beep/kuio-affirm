export interface SavedAudio {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  logsCount: number;
  theme: string;
}

const DB_NAME = 'kuio_audio_db';
const STORE_NAME = 'audio_buffers';
const META_KEY = 'kuio_saved_audios';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioBuffer(audio: SavedAudio, buffer: AudioBuffer): Promise<void> {
  const db = await openDB();
  const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ audio, channelData, sampleRate: buffer.sampleRate }, audio.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAudioBuffer(id: string): Promise<AudioBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return resolve(null);
      const { channelData, sampleRate } = req.result;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const buffer = ctx.createBuffer(1, channelData.length, sampleRate);
      buffer.getChannelData(0).set(channelData);
      resolve(buffer);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadAudioBlobUrl(id: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = async () => {
      if (!req.result) return resolve(null);
      const { channelData, sampleRate } = req.result;
      try {
        const blob = await encodeWav(channelData, sampleRate);
        const url = URL.createObjectURL(blob);
        resolve(url);
      } catch (e) {
        console.error('Failed to encode WAV:', e);
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function encodeWav(channelData: Float32Array, sampleRate: number): Promise<Blob> {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = channelData.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function deleteAudioBuffer(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getSavedAudioList(): SavedAudio[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setSavedAudioList(list: SavedAudio[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

export function addSavedAudio(audio: SavedAudio): SavedAudio[] {
  const list = getSavedAudioList();
  list.unshift(audio);
  setSavedAudioList(list);
  return list;
}

export function removeSavedAudio(id: string): SavedAudio[] {
  const list = getSavedAudioList().filter(a => a.id !== id);
  setSavedAudioList(list);
  return list;
}

export function renameSavedAudio(id: string, newName: string): SavedAudio[] {
  const list = getSavedAudioList();
  const item = list.find(a => a.id === id);
  if (item) item.name = newName;
  setSavedAudioList(list);
  return list;
}
