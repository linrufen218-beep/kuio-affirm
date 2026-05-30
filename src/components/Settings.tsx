import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon, X } from 'lucide-react';

interface SettingsProps {
  settings: any;
  setSettings: (s: any) => void;
  onClose: () => void;
}

export default function Settings({ settings, setSettings, onClose }: SettingsProps) {
  const handleChange = (key: string, value: string) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <motion.div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-xl bg-[#8E93A2]/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="w-full max-w-lg bg-white/10 border border-white/20 p-5 md:p-12 shadow-2xl relative"
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 20, scale: 0.95 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-serif text-sm tracking-[0.4em] text-white uppercase mb-6 md:mb-10 text-center">
          S Y S T E M
        </h2>

        <div className="space-y-5 md:space-y-8 font-sans">
          
          <div className="space-y-3">
            <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">AI Provider</label>
            <div className="flex gap-4">
              {['deepseek', 'openai', 'custom'].map((p) => (
                <button 
                  key={p}
                  onClick={() => handleChange('provider', p)}
                  className={`text-[10px] tracking-[0.1em] uppercase pb-1 border-b ${settings.provider === p ? 'border-white text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">API URL (Optional)</label>
            <input 
              type="text" 
              value={settings.apiUrl}
              onChange={(e) => handleChange('apiUrl', e.target.value)}
              className="w-full bg-transparent border-b border-white/20 pb-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white transition-colors"
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="flex gap-4">
            <div className="space-y-3 w-1/3">
              <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">Model</label>
              <input 
                type="text" 
                value={settings.model}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full bg-transparent border-b border-white/20 pb-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white transition-colors"
                placeholder="chat-model"
              />
            </div>
            <div className="space-y-3 flex-1">
              <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">API Key</label>
              <input 
                type="password" 
                value={settings.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                className="w-full bg-transparent border-b border-white/20 pb-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white transition-colors"
                placeholder="sk-..."
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">小米 MiMo TTS API Key</label>
            <input 
              type="password" 
              value={settings.ttsApiKey}
              onChange={(e) => handleChange('ttsApiKey', e.target.value)}
              className="w-full bg-transparent border-b border-white/20 pb-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white transition-colors"
              placeholder="Enter TTS Key for Voice Generation"
            />
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <label className="block text-[9px] tracking-[0.2em] text-white/60 uppercase">MiMo TTS Group ID (不再需要)</label>
            <input 
              type="text" 
              value={settings.ttsGroupId || ''}
              onChange={(e) => handleChange('ttsGroupId', e.target.value)}
              className="w-full bg-transparent border-b border-white/20 pb-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white transition-colors"
              placeholder="Enter Group ID if your key requires it"
            />
          </div>

          <div className="pt-6 text-center">
            <p className="text-[9px] tracking-[0.1em] text-white/40 uppercase">
              Configuration persists locally. <br/> PWA offline capabilities active.
            </p>
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}
