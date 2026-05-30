import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon } from 'lucide-react';
import Home from './components/Home';
import Generating from './components/Generating';
import AudioView from './components/AudioView';
import PlayView from './components/PlayView';
import Settings from './components/Settings';
import { SubliminalConfig } from './lib/audioEngine';
import { BgmPlayerProvider } from './lib/bgmPlayer';

export type Page = 'home' | 'generating' | 'audio' | 'play';
export type AppSettings = { provider: string; apiUrl: string; model: string; apiKey: string; ttsApiKey: string; ttsGroupId: string };

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'deepseek',
  apiUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: '',
  ttsApiKey: '',
  ttsGroupId: ''
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [affirmations, setAffirmations] = useState('');
  
  const [theme, setTheme] = useState('');
  const [length, setLength] = useState<'S' | 'M' | 'L'>('S');

  // Subliminal Audio States
  const [subliminalMix, setSubliminalMix] = useState<{buffer: AudioBuffer | null, logs: any[]}>({buffer: null, logs: []});
  const [subConfig, setSubConfig] = useState<SubliminalConfig>({
    babble: true,
    muffled: false,
    silent: false,
    binaural: false
  });
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('kuio_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem('kuio_settings', JSON.stringify(settings));
  }, [settings]);

  return (
    <BgmPlayerProvider>
    <div className="h-[100dvh] w-full relative font-sans text-white flex flex-col justify-between overflow-hidden selection:bg-white/30 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      
      <div className="statue-bg"></div>
      <div className="glass-overlay"></div>

      <header className="bg-panel w-full shrink-0 h-[10vh] md:h-[14vh] mt-[5vh] md:mt-[7vh] mb-[0.5vh] flex items-center justify-between px-5 md:px-24">
        <div 
          className="font-serif text-2xl md:text-5xl tracking-[0.1em] cursor-pointer text-white drop-shadow-md flex flex-col items-start"
          onClick={() => setCurrentPage('home')}
        >
          KUIO
          <div className="flex items-center mt-1">
            <span className="font-sans text-[0.4rem] md:text-[0.45rem] tracking-[0.2em] md:tracking-[0.3em] opacity-80 uppercase leading-tight">
              Free Pictures and Photos
              <br/>
              Recommended
            </span>
          </div>
        </div>
        
        <button 
          onClick={() => setShowSettings(true)}
          className="text-white/60 hover:text-white transition-colors p-2 hover:rotate-90 duration-500 ease-in-out"
        >
          <SettingsIcon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={1.5} />
        </button>
      </header>
      
      {/* Main Content Area */}
      <main className="bg-panel w-full flex-1 my-[0.5vh] relative overflow-hidden flex flex-col">
          <div className={`absolute inset-0 ${currentPage === 'home' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'} transition-opacity duration-500`}>
            <Home 
              affirmations={affirmations} 
              setAffirmations={setAffirmations} 
              theme={theme}
              setTheme={setTheme}
              length={length}
              setLength={setLength}
              onGenerate={() => setCurrentPage('generating')} 
              onProceedAudio={() => setCurrentPage('audio')}
            />
          </div>
          <div className={`absolute inset-0 ${currentPage === 'generating' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'} transition-opacity duration-500`}>
            <Generating 
              theme={theme}
              length={length}
              settings={settings}
              onComplete={(text) => {
                setAffirmations(text);
                setCurrentPage('home');
              }} 
            />
          </div>
          <div className={`absolute inset-0 ${currentPage === 'audio' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'} transition-opacity duration-500`}>
            <AudioView 
              affirmations={affirmations} 
              settings={settings}
              subConfig={subConfig}
              setSubConfig={setSubConfig}
              setSubliminalMix={setSubliminalMix}
              subliminalMix={subliminalMix}
              onProceedPlay={() => setCurrentPage('play')}
            />
          </div>
          <div className={`absolute inset-0 ${currentPage === 'play' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'} transition-opacity duration-500`}>
             <PlayView 
                affirmations={affirmations} 
                subliminalMix={subliminalMix}
                subConfig={subConfig}
                setSubConfig={setSubConfig}
             />
          </div>
      </main>

      {/* Bottom Navigation Panel */}
      <footer className="bg-panel w-full shrink-0 h-[8vh] md:h-[10vh] mt-[0.5vh] mb-[1vh] flex items-center justify-center">
         <div className="flex gap-8 md:gap-24 font-sans text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.25em]">
            <button 
               onClick={() => setCurrentPage('home')} 
               className={`transition-all cursor-pointer pb-2 hover:text-white ${currentPage === 'home' || currentPage === 'generating' ? 'text-white border-b border-white' : 'text-white/40 border-b border-transparent'}`}
            >
               C r e a t e
            </button>
            <button 
               onClick={() => setCurrentPage('audio')} 
               className={`transition-all cursor-pointer pb-2 hover:text-white ${currentPage === 'audio' ? 'text-white border-b border-white' : 'text-white/40 border-b border-transparent'}`}
            >
               S t u d i o
            </button>
            <button 
               onClick={() => setCurrentPage('play')} 
               className={`transition-all cursor-pointer pb-2 hover:text-white ${currentPage === 'play' ? 'text-white border-b border-white' : 'text-white/40 border-b border-transparent'}`}
            >
               P l a y
            </button>
         </div>
      </footer>

      {/* Modals & Overlays */}
      <AnimatePresence>
        {showSettings && <Settings settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

    </div>
    </BgmPlayerProvider>
  );
}
