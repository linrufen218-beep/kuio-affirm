import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PlaybackProps {
  onBack: () => void;
  key?: string;
}

export default function Playback({ onBack }: PlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const affirmation = "Everything will tend towards good. Better, and eventually the best.";

  return (
    <motion.div 
      className="flex flex-col relative w-full h-full justify-center items-center max-w-3xl px-4 md:px-8 z-10 py-6"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full flex flex-col items-center justify-center relative">
        <h2 className="font-serif text-[10px] tracking-[0.5em] text-white/50 text-center uppercase mb-8 drop-shadow-sm">
          A u d i o
        </h2>
        
        {/* Quote Display Area */}
        <div className="w-full z-10 mb-12 mt-2 text-center max-w-xl">
          <p className="font-serif text-xl md:text-2xl text-white leading-[1.8] tracking-widest drop-shadow-md">
            "{affirmation}"
          </p>
        </div>

        {/* Audio Player Controls */}
        <div className="w-full max-w-sm mb-12 z-10">
          <div className="flex items-center justify-between gap-6 w-full">
             <span className="text-[10px] font-sans tracking-widest text-white/60">0:00</span>
             
             {/* Track line progress */}
             <div className="flex-1 h-[1px] bg-white/20 relative cursor-pointer group">
               <div className="absolute -inset-y-2 inset-x-0"></div>
               <motion.div 
                 className="absolute top-0 left-0 bottom-0 bg-white"
                 initial={{ width: "0%" }}
                 animate={{ width: isPlaying ? "100%" : "20%" }}
                 transition={{ duration: 10, ease: "linear" }}
               >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-md scale-100 group-hover:scale-150 transition-transform"></div>
               </motion.div>
             </div>
             
             <span className="text-[10px] font-sans tracking-widest text-white/60">1:24</span>
          </div>

          <div className="mt-8 flex justify-center">
             <button 
               className="w-12 h-12 flex items-center justify-center border border-white/40 rounded-full text-white text-[9px] tracking-[0.2em] hover:bg-white hover:text-[#8E93A2] transition-colors duration-500 cursor-pointer"
               onClick={() => setIsPlaying(!isPlaying)}
             >
               <AnimatePresence mode="wait">
                 <motion.span 
                   key={isPlaying ? "pause" : "play"}
                   initial={{ opacity: 0 }} 
                   animate={{ opacity: 1 }} 
                   exit={{ opacity: 0 }}
                 >
                   {isPlaying ? "PAUSE" : "PLAY"}
                 </motion.span>
               </AnimatePresence>
             </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between w-full max-w-[16rem] z-10 text-white/50 font-sans tracking-widest text-[9px] uppercase px-4 pt-6 border-t border-white/10">
          <button onClick={onBack} className="hover:text-white transition-colors py-2 px-4 cursor-pointer">
            R e t u r n
          </button>
          <button className="hover:text-white transition-colors py-2 px-4 cursor-pointer">
            S a v e
          </button>
        </div>

      </div>
    </motion.div>
  );
}
