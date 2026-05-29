import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface GeneratingProps {
  theme: string;
  length: 'S' | 'M' | 'L';
  settings: any;
  onComplete: (text: string) => void;
  key?: string;
}

export default function Generating({ theme, length, settings, onComplete }: GeneratingProps) {
  useEffect(() => {
    let isMounted = true;
    
    const generate = async () => {
      try {
        let countText = "3 to 5";
        if (length === 'M') countText = "10 to 15";
        if (length === 'L') countText = "15 to 30";
        
        const pt = `写一个包含 ${countText} 条积极肯定语的列表。主题：${theme || "内心平静"}。每条肯定语单独占一行，直接列出句子。保持平静和充满力量的风格。禁止出现"不……"、"非……"、"不再……"以及任何负面词语，所有句子必须用正面表述。`;

        // Mock call if no API key
        if (!settings.apiKey) {
          await new Promise(r => setTimeout(r, 4000));
          if (!isMounted) return;
          onComplete(`1. Every breath fills me with profound, calm energy.\n2. I attract positivity and radiate authentic confidence.\n3. Better, and eventually the best.\n4. I trust my path implicitly.\n5. The universe supports my boldest dreams.`);
          return;
        }

        // Real API Call
        const url = settings.apiUrl || 'https://api.deepseek.com/v1';
        const res = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
          },
          body: JSON.stringify({
            model: settings.model || 'deepseek-chat',
            messages: [{ role: 'user', content: pt }]
          })
        });

        if (!res.ok) throw new Error("API request failed");
        
        const data = await res.json();
        if (isMounted && data.choices?.[0]?.message?.content) {
          onComplete(data.choices[0].message.content.trim());
        }
      } catch (err) {
        console.error("Generation failed", err);
        if (isMounted) {
          // fallback
          onComplete(`1. Every breath fills me with profound, calm energy.\n2. I attract positivity and radiate authentic confidence.\n3. Better, and eventually the best.`);
        }
      }
    };
    
    generate();
    
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, length, settings]);

  return (
    <motion.div 
      className="flex flex-col relative w-full h-full justify-center items-center px-4 md:px-8 z-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full flex flex-col items-center justify-center relative">

        <motion.div
           className="w-12 h-12 border-t-[1.5px] border-l-[1.5px] border-white/60 rounded-full mb-10 opacity-80"
           animate={{ rotate: 360 }}
           transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />

        <motion.p 
          className="font-serif text-xl md:text-2xl tracking-[0.4em] text-white uppercase drop-shadow-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          C R E A T I N G
        </motion.p>
        
        <p className="text-white/60 font-sans tracking-[0.2em] text-[10px] uppercase mt-4">
          Synthesizing Stream
        </p>

        {/* Elegant progress line */}
        <div className="w-48 h-[1px] bg-white/20 relative mt-12 overflow-hidden mx-auto">
          <motion.div 
             className="absolute top-0 bottom-0 left-0 bg-white"
             initial={{ width: "0%" }}
             animate={{ width: "100%" }}
             transition={{ duration: 4, ease: "easeInOut" }}
          />
        </div>

      </div>
    </motion.div>
  );
}
