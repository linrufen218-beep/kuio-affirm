const https = require('https');

https.get('https://mimo.xiaomi.com/mimo-v2-5-tts/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // try to extract voice ids if they are in the html
    // look for values that might be voice ids
    console.log("Length:", data.length);
    const matches = data.match(/voice_id["']?\s*:\s*["']([^"']+)["']/g);
    if (matches) {
       console.log("Found voice_id matches:", matches);
    } else {
       console.log("No voice_id matches.");
    }
    
    // Also try looking for options in <select> or similar
    const selectMatches = data.match(/<option[^>]*value=["']([^"']+)["'][^>]*>(.*?)<\/option>/gi);
    if (selectMatches) {
        console.log("Select options:", selectMatches);
    }
    
    // Maybe search for "Mimo" or chinese texts near voice
    const voiceNames = data.match(/.{0,20}男.{0,20}/g) || [];
    // console.log("Some contexts:", voiceNames.slice(0, 5));
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
