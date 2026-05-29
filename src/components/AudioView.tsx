import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Loader, Layers, Ear, Activity, VolumeX, Cpu, ArrowRight } from 'lucide-react';
import { generateTTS, generateSubliminalMix, SubliminalConfig, MIMO_VOICES } from '../lib/audioEngine';
import { saveAudioBuffer, addSavedAudio } from '../lib/audioStorage';

interface AudioViewProps {
  affirmations: string;
  settings: any;
  subConfig: SubliminalConfig;
  setSubConfig: (val: SubliminalConfig) => void;
  subliminalMix: { buffer: AudioBuffer | null; logs: any[] };
  setSubliminalMix: (val: { buffer: AudioBuffer | null; logs: any[] }) => void;
  onProceedPlay: () => void;
  key?: string;
}

export default function AudioView({ affirmations, settings, subConfig, setSubConfig, subliminalMix, setSubliminalMix, onProceedPlay }: AudioViewProps) {
  const [isToneOpen, setIsToneOpen] = useState(false);
  const [tone, setTone] = useState(MIMO_VOICES[0].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const handleProcess = async () => {
    if (!affirmations || affirmations.trim().length === 0) {
      alert("No affirmations available.");
      return;
    }
    if (!settings.ttsApiKey) {
      setErrorMsg("Please provide your 小米 MiMo API key in Settings (System) before processing.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    setSubliminalMix({ buffer: null, logs: [] });
    
    try {
      const rawString = typeof affirmations === 'string' ? affirmations : '';
      const baseBuffer = await generateTTS(rawString, settings, tone);
      
      const { buffer, trackLogs } = await generateSubliminalMix(baseBuffer, subConfig);
      
      setSubliminalMix({ buffer, logs: trackLogs });

      const audioId = `audio_${Date.now()}`;
      const savedAudio = {
        id: audioId,
        name: `肯定语 ${new Date().toLocaleDateString('zh-CN')}`,
        createdAt: Date.now(),
        duration: buffer.duration,
        logsCount: trackLogs.length,
        theme: '',
      };
      try {
        await saveAudioBuffer(savedAudio, buffer);
        addSavedAudio(savedAudio);
      } catch (e) {
        console.warn('Failed to save audio to local storage:', e);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Error processing audio. Please verify your 小米 MiMo TTS API key.");
    } finally {
      setIsProcessing(false);
    }
  };

  const currentVoiceLabel = MIMO_VOICES.find(v => v.id === tone)?.label || tone;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col h-full w-full max-w-4xl mx-auto px-4 md:px-8 z-10"
    >
      <div className="flex-1 overflow-y-auto no-scrollbar pb-10 flex flex-col gap-6 pt-4">
        
        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
          
          {/* TTS Source Container */}
          <div className="bg-white/5 border border-white/10 p-5 space-y-5">
            <h3 className="text-[9px] tracking-[0.2em] text-white/60 mb-2 uppercase border-b border-white/10 pb-2">TTS Source Engine</h3>
            <div className="space-y-3 relative z-20">
              <span className="text-[8px] tracking-[0.2em] text-white/50 uppercase">MiMo Voice Model</span>
              <div className="relative">
                <button 
                  onClick={() => setIsToneOpen(!isToneOpen)}
                  className="w-full flex justify-between items-center px-4 py-3 text-[9px] tracking-[0.1em] border border-white/20 text-white bg-white/5 hover:border-white/40 transition-colors uppercase"
                >
                  {currentVoiceLabel}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isToneOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isToneOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                      className="absolute top-full left-0 w-full mt-1 bg-[#8E93A2]/95 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden"
                    >
                      {MIMO_VOICES.map((t) => (
                        <button 
                          key={t.id}
                          onClick={() => { setTone(t.id); setIsToneOpen(false); }}
                          className={`w-full text-left px-4 py-3 text-[9px] tracking-[0.1em] transition-colors ${tone === t.id ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            
            <div className="pt-2 flex flex-col gap-3">
              <button 
                onClick={handleProcess}
                disabled={isProcessing}
                className="w-full py-3 text-[10px] tracking-[0.2em] text-white uppercase border border-white/30 hover:bg-white hover:text-[#8E93A2] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Compiling Engine...</> : <><Cpu className="w-3.5 h-3.5" /> Synthesize & Process</>}
              </button>
              {errorMsg && (
                <div className="bg-red-500/20 text-red-100 border border-red-500/30 p-3 text-xs tracking-wider font-mono">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          {/* Subliminal Algorithm Settings */}
          <div className="bg-white/5 border border-white/10 p-5 space-y-4">
            <h3 className="text-[9px] tracking-[0.2em] text-white/60 mb-2 uppercase border-b border-white/10 pb-2">Subconscious Bypass Algorithm</h3>
            
            {/* Algorithm Toggles */}
            <div className="space-y-1">
              <label className="flex items-center justify-between p-3 border border-white/5 hover:border-white/20 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <Layers className={`w-4 h-4 ${subConfig.babble ? 'text-white' : 'text-white/30'}`} />
                  <div>
                    <div className={`text-[10px] tracking-widest uppercase ${subConfig.babble ? 'text-white' : 'text-white/50'}`}>Babble Overload</div>
                    <div className="text-[8px] text-white/40 tracking-wider">Multitrack shift (1.0x, 0.8x, 1.5x, Reverse)</div>
                  </div>
                </div>
                <input type="checkbox" className="hidden" checked={subConfig.babble} onChange={e => setSubConfig({...subConfig, babble: e.target.checked})} />
                <div className={`w-6 h-3 rounded-full flex items-center transition-colors ${subConfig.babble ? 'bg-white/40' : 'bg-white/10'} px-[2px]`}>
                  <div className={`w-2 h-2 rounded-full bg-white transition-transform ${subConfig.babble ? 'translate-x-3' : 'translate-x-0'}`}></div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 border border-white/5 hover:border-white/20 transition-colors cursor-pointer group ${subConfig.silent ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3">
                  <VolumeX className={`w-4 h-4 ${subConfig.muffled ? 'text-white' : 'text-white/30'}`} />
                  <div>
                    <div className={`text-[10px] tracking-widest uppercase ${subConfig.muffled ? 'text-white' : 'text-white/50'}`}>Muffled (Lowpass)</div>
                    <div className="text-[8px] text-white/40 tracking-wider">Strip {'>'}600Hz for background masking</div>
                  </div>
                </div>
                <input type="checkbox" className="hidden" checked={subConfig.muffled} onChange={e => setSubConfig({...subConfig, muffled: e.target.checked})} />
                <div className={`w-6 h-3 rounded-full flex items-center transition-colors ${subConfig.muffled ? 'bg-white/40' : 'bg-white/10'} px-[2px]`}>
                  <div className={`w-2 h-2 rounded-full bg-white transition-transform ${subConfig.muffled ? 'translate-x-3' : 'translate-x-0'}`}></div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 border border-white/5 hover:border-white/20 transition-colors cursor-pointer group ${subConfig.muffled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3">
                  <Activity className={`w-4 h-4 ${subConfig.silent ? 'text-white' : 'text-white/30'}`} />
                  <div>
                    <div className={`text-[10px] tracking-widest uppercase ${subConfig.silent ? 'text-white' : 'text-white/50'}`}>Silent Subliminal</div>
                    <div className="text-[8px] text-white/40 tracking-wider">AM Freq Shift (14.5kHz)</div>
                  </div>
                </div>
                <input type="checkbox" className="hidden" checked={subConfig.silent} onChange={e => setSubConfig({...subConfig, silent: e.target.checked})} />
                <div className={`w-6 h-3 rounded-full flex items-center transition-colors ${subConfig.silent ? 'bg-white/40' : 'bg-white/10'} px-[2px]`}>
                  <div className={`w-2 h-2 rounded-full bg-white transition-transform ${subConfig.silent ? 'translate-x-3' : 'translate-x-0'}`}></div>
                </div>
              </label>

              <label className="flex items-center justify-between p-3 border border-white/5 hover:border-white/20 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <Ear className={`w-4 h-4 ${subConfig.binaural ? 'text-white' : 'text-white/30'}`} />
                  <div>
                    <div className={`text-[10px] tracking-widest uppercase ${subConfig.binaural ? 'text-white' : 'text-white/50'}`}>Headphone Mode</div>
                    <div className="text-[8px] text-white/40 tracking-wider">Live Sine Waves (200Hz L / 208Hz R)</div>
                  </div>
                </div>
                <input type="checkbox" className="hidden" checked={subConfig.binaural} onChange={e => setSubConfig({...subConfig, binaural: e.target.checked})} />
                <div className={`w-6 h-3 rounded-full flex items-center transition-colors ${subConfig.binaural ? 'bg-white/40' : 'bg-white/10'} px-[2px]`}>
                  <div className={`w-2 h-2 rounded-full bg-white transition-transform ${subConfig.binaural ? 'translate-x-3' : 'translate-x-0'}`}></div>
                </div>
              </label>

            </div>
          </div>
        </div>

        {/* Visualization Area */}
        <div className="w-full bg-white/5 border border-white/10 p-5 mt-4 min-h-[250px] relative">
          <h3 className="text-[9px] tracking-[0.2em] text-white/60 mb-6 uppercase border-b border-white/10 pb-2">Synthesis Visualization</h3>
          
          <AnimatePresence mode="wait">
            {isProcessing ? (
               <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-10 opacity-50">
                  <div className="h-[2px] w-48 bg-white/10 relative overflow-hidden mb-4">
                     <div className="absolute top-0 left-0 h-full w-1/3 bg-white animate-[shimmer_1s_infinite]"></div>
                  </div>
                  <span className="text-[8px] tracking-[0.3em] uppercase">Constructing Graph...</span>
               </motion.div>
            ) : subliminalMix.buffer && subliminalMix.logs.length > 0 ? (
               <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {subliminalMix.logs.map((log, i) => (
                    <div key={i} className="flex gap-4 items-center">
                      <div className="w-24 text-[8px] tracking-widest text-right text-white/60 uppercase">{log.name}</div>
                      <div className="flex-1 h-3 bg-black/40 relative">
                        {log.clips.map((clip: any, ci: number) => {
                           const totalDur = subliminalMix.buffer?.duration || 1;
                           const left = (clip.start / totalDur) * 100;
                           const width = ((clip.end - clip.start) / totalDur) * 100;
                           return (
                             <div 
                               key={ci} 
                               className={`absolute top-0 h-full ${log.color} border-l border-r border-black/50`}
                               style={{ left: `${left}%`, width: `${width}%` }}
                             />
                           )
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {subConfig.binaural && (
                    <div className="flex gap-4 items-center">
                       <div className="w-24 text-[8px] tracking-widest text-right text-purple-300/60 uppercase">Binaural Waves</div>
                       <div className="flex-1 h-3 bg-black/40 relative overflow-hidden">
                          <div className="w-full h-full bg-purple-500/30 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.2)_50%,transparent_100%)] bg-[length:20px_100%] animate-[shimmer_2s_linear_infinite]"></div>
                       </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[8px] tracking-[0.2em] text-white/30 pt-4 px-28">
                    <span>0:00</span>
                    <span>{Math.floor(subliminalMix.buffer.duration / 60)}:{(Math.floor(subliminalMix.buffer.duration % 60)).toString().padStart(2, '0')}</span>
                  </div>
               </motion.div>
            ) : (
               <motion.div key="empty" className="flex flex-col items-center justify-center py-10 opacity-30 text-[9px] tracking-[0.3em] uppercase">
                  Awaiting generation
               </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full flex justify-center pt-6 pb-2 shrink-0 relative">
          {subliminalMix.buffer && subliminalMix.logs.length > 0 && (
            <button 
              onClick={onProceedPlay}
              className="flex items-center gap-3 px-8 py-3 text-[10px] tracking-[0.3em] text-[#8E93A2] bg-white hover:bg-white/80 uppercase border border-white transition-colors duration-500 shadow-xl"
            >
              S e s s i o n  &nbsp; <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </motion.div>
  );
}
