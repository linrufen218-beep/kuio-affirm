import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, ArrowLeft } from 'lucide-react';

interface HomeProps {
  affirmations: string;
  setAffirmations: (val: string) => void;
  theme: string;
  setTheme: (val: string) => void;
  length: 'S' | 'M' | 'L';
  setLength: (val: 'S' | 'M' | 'L') => void;
  onGenerate: () => void;
  onProceedAudio: () => void;
  key?: string;
}

export default function Home({ affirmations, setAffirmations, theme, setTheme, length, setLength, onGenerate, onProceedAudio }: HomeProps) {
  const [isLocked, setIsLocked] = useState(false);
  
  const hasAffirmations = typeof affirmations === 'string' && affirmations.length > 0;

  return (
    <motion.div 
      className="flex flex-col relative w-full h-full justify-center items-center max-w-4xl px-4 md:px-8 py-8 z-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full flex justify-center items-center h-full flex-col max-h-[70vh] overflow-y-auto no-scrollbar pb-10">
        
        <AnimatePresence mode="wait">
          {!hasAffirmations ? (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full flex flex-col items-center max-w-2xl mx-auto"
            >
              <div className="relative mb-6 text-center w-full shrink-0 mt-4">
                  <div className="absolute top-1/2 left-0 w-[20%] md:w-[30%] h-[1px] bg-gradient-to-l from-white/30 to-transparent"></div>
                  <p className="text-white/80 font-sans tracking-[0.25em] text-[10px] uppercase relative z-10 inline-block px-4">
                    AI Manifestation
                  </p>
                  <div className="absolute top-1/2 right-0 w-[20%] md:w-[30%] h-[1px] bg-gradient-to-r from-white/30 to-transparent"></div>
              </div>

              <div className="w-full relative group max-w-2xl mx-auto mb-6 text-center border-y border-white/10 py-6 md:py-8 shrink-0">
                <textarea 
                  className="w-full bg-transparent p-2 text-lg md:text-xl font-serif text-white placeholder-white/30 focus:outline-none resize-none h-20 transition-all leading-relaxed tracking-wide text-center"
                  placeholder="What is your theme today? (e.g. Confidence, Energy)"
                  spellCheck={false}
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                ></textarea>
              </div>

              {/* Length Selector */}
              <div className="flex flex-col items-center gap-4 mb-8 w-full max-w-lg shrink-0">
                <span className="text-[8px] tracking-[0.3em] text-white/50 uppercase">Sequence Length</span>
                <div className="flex justify-center gap-6 md:gap-12 w-full">
                  {[
                    { id: 'S', label: '3 - 5  L I N E S' },
                    { id: 'M', label: '10 - 15  L I N E S' },
                    { id: 'L', label: '15 - 30  L I N E S' }
                  ].map((opt) => (
                    <button 
                      key={opt.id}
                      onClick={() => setLength(opt.id as any)}
                      className={`text-[9px] md:text-[10px] tracking-widest pb-1 border-b transition-all ${
                        length === opt.id ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full flex justify-center pb-8 shrink-0">
                <button 
                   onClick={onGenerate} 
                   className="px-12 py-3 text-xs tracking-[0.3em] font-light text-white uppercase border border-white/20 transition-all duration-700 ease-in-out cursor-pointer hover:tracking-[0.4em] hover:bg-white hover:text-slate-800"
                >
                  Generate
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-2xl mx-auto flex flex-col items-center pb-8 pt-4 w-full"
            >
              <div className="w-full text-center mb-6 border-b border-white/10 pb-4">
                 <span className="text-[9px] tracking-[0.3em] text-white/50 uppercase">Affirmation Script</span>
              </div>
              <textarea 
                disabled={isLocked}
                rows={Math.max(3, (typeof affirmations === 'string' ? affirmations : '').split('\n').length)}
                className={`w-full bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl p-6 md:p-8 text-sm md:text-base font-serif text-white placeholder-white/20 focus:outline-none focus:border-white/40 resize-none transition-all leading-relaxed tracking-wider overflow-hidden ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                placeholder="Your generated sequence will appear here. Edit freely."
                spellCheck={false}
                value={typeof affirmations === 'string' ? affirmations : ''}
                onChange={(e) => setAffirmations(e.target.value)}
              ></textarea>
              
              <div className="flex justify-between items-center mt-6 w-full px-2">
                <button 
                  onClick={() => setAffirmations('')}
                  className="flex items-center gap-2 text-[9px] tracking-[0.2em] text-white/50 hover:text-white uppercase transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button 
                  onClick={() => setIsLocked(!isLocked)}
                  className={`flex items-center gap-2 text-[9px] tracking-[0.2em] uppercase transition-colors px-4 py-2 border ${isLocked ? 'border-white text-white bg-white/10' : 'border-white/20 text-white/50 hover:text-white/80 hover:border-white/50'}`}
                >
                  {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {isLocked ? 'Locked' : 'Lock Text'}
                </button>
              </div>
              <div className="w-full flex justify-center mt-8 pb-4 shrink-0">
                <button 
                   onClick={onProceedAudio}
                   className="px-12 py-3 text-xs tracking-[0.3em] font-light text-white uppercase border border-white/20 transition-all duration-700 ease-in-out cursor-pointer hover:tracking-[0.4em] hover:bg-white hover:text-slate-800 bg-white/5 backdrop-blur-sm shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                  Process Audio
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
