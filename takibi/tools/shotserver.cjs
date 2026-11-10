// 描画確認用：ページから POST された画像をファイルに落とす  node tools/shotserver.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') { res.end('ok'); return; }
  const name = (req.url.replace(/[^a-zA-Z0-9_.-]/g, '') || 'shot') + '.jpg';
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    res.end('saved ' + name);
  });
}).listen(8611, () => console.log('shotserver on 8611'));
