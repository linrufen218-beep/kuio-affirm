const https = require('https');

https.get('https://mimo.xiaomi.com/mimo-v2-5-tts/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Length:", data.length);
    const matches = data.match(/voice_id["']?\s*:\s*["']([^"']+)["']/g);
    if (matches) console.log("Found voice_id:", matches);
    const selectMatches = data.match(/<option[^>]*value=["']([^"']+)["'][^>]*>(.*?)<\/option>/gi);
    if (selectMatches) console.log("Select options:", selectMatches);
    const names = data.match(/.{0,30}name.{0,30}/g) || [];
    console.log("Names:", names.slice(0, 10));
    const list = data.match(/\[[^\]]*\{[^}]*voice[^}]*\}[^\]]*\]/g);
    if (list) console.log("List:", list[0].slice(0, 500));
  });
});
