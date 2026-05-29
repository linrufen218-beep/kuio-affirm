import https from 'https';

https.get('https://mimo.xiaomi.com/mimo-v2-5-tts/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // let's print all text inside tags
    console.log(data);
  });
}).on('error', e => console.error(e));
