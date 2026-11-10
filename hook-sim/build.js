// src/game.html に src/physics.js を埋め込んで、公開用の index.html を1つ書き出す
//   node build.js
const fs = require('fs');
const path = require('path');
const here = __dirname;
const page = fs.readFileSync(path.join(here, 'src/game.html'), 'utf8');
const phys = fs.readFileSync(path.join(here, 'src/physics.js'), 'utf8');
// game.html の先頭（<title>・フォント・<style>）は <head> へ、<div id="app"> から後ろは <body> へ
const cut = page.indexOf('<div id="app">');
const head = page.slice(0, cut).trim();
const body = page.slice(cut).replace('<!--PHYSICS-->', () => `<script>\n${phys}\n</script>`);
const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#16111b"/><circle cx="32" cy="24" r="12" fill="none" stroke="#f4f6fa" stroke-width="5"/><path d="M20 50h24l-5-12H25z" fill="#ffe06a"/></svg>');
const full = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#17121c">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="format-detection" content="telephone=no">
<meta name="description" content="クレーンゲームのフック台を、鎖・リング・フック・板の物理計算で再現した3Dシミュレーター。スマホでもPCでも遊べます。">
<link rel="icon" href="${icon}">
<style>body{margin:0}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(here, 'index.html'), full);
console.log('built index.html', (full.length / 1024).toFixed(0) + 'KB');
