import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Mic, Music, Volume2, Trash2, Pencil } from 'lucide-react';
import { SubliminalConfig } from '../lib/audioEngine';
import { getSavedAudioList, loadAudioBlobUrl, deleteAudioBuffer, removeSavedAudio, renameSavedAudio, type SavedAudio } from '../lib/audioStorage';
import { MusicPlayerContainer } from './player/MusicPlayerContainer';

interface PlayViewProps {
  affirmations: string;
  subliminalMix: { buffer: AudioBuffer | null; logs: any[] };
  subConfig: SubliminalConfig;
  setSubConfig: (val: SubliminalConfig) => void;
  key?: string;
}

export default function PlayView({ subConfig, setSubConfig }: PlayViewProps) {
  const [activeTab, setActiveTab] = useState<'voice' | 'bgm'>('voice');
  const [timer, setTimer] = useState<number | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const customTimerRef = useRef<HTMLInputElement | null>(null);

  const [savedAudios, setSavedAudios] = useState<SavedAudio[]>([]);
  const [selectedAudioIds, setSelectedAudioIds] = useState<Set<string>>(new Set());
  const [playingAudioIds, setPlayingAudioIds] = useState<Set<string>>(new Set());
  const [subVolume, setSubVolume] = useState(1);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const subAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const subAudioUrlsRef = useRef<Map<string, string>>(new Map());

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
    if (timer === null) return;
    const timeout = setTimeout(() => {
      stopAllSubAudios();
      setTimer(null);
    }, timer * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [timer, stopAllSubAudios]);

  return (
    <motion.div
      className="flex flex-col relative w-full h-full max-w-lg mx-auto p-3 md:p-4 z-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex justify-center gap-8 md:gap-16 mb-4 shrink-0 pt-4">
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
          <Music className="w-3.5 h-3.5" /> Music
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 overflow-y-auto no-scrollbar ${activeTab === 'voice' ? '' : 'hidden'}`}>
          <div className="space-y-2 pb-4">
              {savedAudios.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/30">
                  <Mic className="w-8 h-8 mb-3 opacity-50" />
                  <p className="text-[9px] tracking-[0.2em] uppercase">No subliminal recordings yet</p>
                  <p className="text-[8px] text-white/20 tracking-wider mt-1">Generate audio in Studio tab first</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] tracking-[0.2em] text-white/40 uppercase">Saved Recordings</span>
                    <span className="text-[8px] text-white/20">{selectedAudioIds.size} selected</span>
                  </div>

                  {savedAudios.map((audio) => (
                    <div
                      key={audio.id}
                      className={`flex items-center gap-3 p-3 border transition cursor-pointer ${
                        selectedAudioIds.has(audio.id)
                          ? 'border-white/30 bg-white/5'
                          : 'border-white/5 hover:border-white/15'
                      }`}
                      onClick={() => toggleAudioSelection(audio.id)}
                    >
                      <div className={`w-4 h-4 border flex items-center justify-center shrink-0 ${
                        selectedAudioIds.has(audio.id) ? 'border-white bg-white/20' : 'border-white/20'
                      }`}>
                        {selectedAudioIds.has(audio.id) && (
                          <span className="text-[8px] text-white">✓</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {renamingId === audio.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameAudio(audio.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameAudio(audio.id)}
                            className="w-full bg-transparent border-b border-white/30 text-[10px] text-white focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] tracking-wider truncate ${playingAudioIds.has(audio.id) ? 'text-white' : 'text-white/60'}`}>
                              {audio.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(audio.id);
                                setRenameValue(audio.name);
                              }}
                              className="text-white/20 hover:text-white/50 transition shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="text-[8px] text-white/30 mt-0.5">
                          {Math.floor(audio.duration / 60)}:{(Math.floor(audio.duration % 60)).toString().padStart(2, '0')}
                          {audio.logsCount > 0 && ` · ${audio.logsCount} tracks`}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAudio(audio.id);
                        }}
                        className="text-white/20 hover:text-red-400/60 transition shrink-0 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 pt-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-white/30" />
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={subVolume}
                          onChange={(e) => setSubVolume(parseFloat(e.target.value))}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={playingAudioIds.size > 0 ? stopAllSubAudios : playSelectedAudios}
                      disabled={selectedAudioIds.size === 0 && playingAudioIds.size === 0}
                      className="flex-1 py-3 text-[10px] tracking-[0.2em] uppercase border border-white/20 text-white/60 hover:bg-white hover:text-[#8E93A2] transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      {playingAudioIds.size > 0 ? 'Stop' : 'Play Selected'}
                    </button>
                  </div>

                  <div className="relative pt-3">
                    <button
                      onClick={() => setShowTimer(!showTimer)}
                      className="text-[9px] tracking-[0.2em] text-white/30 hover:text-white/50 uppercase transition"
                    >
                      Timer {timer !== null ? `· ${timer}min` : ''}
                    </button>
                    {showTimer && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white/10 border border-white/20 backdrop-blur-xl p-2 flex flex-col gap-1.5 z-10 min-w-[180px]">
                        <div className="flex gap-2">
                          {[5, 10, 15, 30, 60].map((m) => (
                            <button
                              key={m}
                              onClick={() => { setTimer(m); setShowTimer(false); }}
                              className={`px-3 py-1.5 text-[9px] tracking-wider transition ${
                                timer === m ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/60'
                              }`}
                            >
                              {m}m
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 border-t border-white/10 pt-1.5">
                          <input
                            ref={customTimerRef}
                            type="number"
                            min="1"
                            max="999"
                            placeholder="自定义"
                            className="w-14 px-2 py-1 text-[9px] bg-white/5 border border-white/10 text-white/70 placeholder-white/20 focus:outline-none focus:border-white/30 text-center rounded"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = parseInt((e.target as HTMLInputElement).value);
                                if (val > 0) { setTimer(val); setShowTimer(false); }
                              }
                            }}
                          />
                          <span className="text-[9px] text-white/30">分钟</span>
                          <button
                            onClick={() => {
                              const val = customTimerRef.current ? parseInt(customTimerRef.current.value) : NaN;
                              if (val > 0) { setTimer(val); setShowTimer(false); }
                            }}
                            className="px-2 py-1 text-[9px] tracking-wider rounded text-white/40 hover:text-white/60 hover:bg-white/5 transition border border-white/10"
                          >
                            OK
                          </button>
                          {timer !== null && (
                            <button
                              onClick={() => { setTimer(null); setShowTimer(false); }}
                              className="px-2 py-1 text-[9px] tracking-wider rounded text-red-400/60 hover:text-red-400 transition"
                            >
                              Off
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        <div className={`absolute inset-0 ${activeTab === 'bgm' ? '' : 'hidden'}`}>
          <MusicPlayerContainer />
        </div>
      </div>
    </motion.div>
  );
}
