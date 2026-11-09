'use strict';
// ===== 描画（背景・タイル・装飾・ライティング・HUD） =====
const TILE_PAL = {
  grass: { dirt: '#cf8f4e', dirtD: '#9d6435', dirtDD: '#7d4d27', cap: '#62d444', capL: '#b0f56e', capD: '#3a9e2e', brick: '#e8873e', brickD: '#a8501e', stone: '#d0d5e4', stoneD: '#7a819c', hard: '#c4ad8c', hardD: '#7d6a52' },
  cave: { dirt: '#5d63ad', dirtD: '#3d427f', dirtDD: '#2b2f63', cap: '#5fd8c8', capL: '#b6fff2', capD: '#2f9f96', brick: '#8a6fd8', brickD: '#5a3fa8', stone: '#9aa3d8', stoneD: '#555b9c', hard: '#7a80b8', hardD: '#454a80' },
  sky: { dirt: '#f5e8d4', dirtD: '#dcc7ab', dirtDD: '#bfa688', cap: '#7de0b0', capL: '#c8ffe2', capD: '#3fae82', brick: '#ffb0c8', brickD: '#d8708f', stone: '#ffffff', stoneD: '#c9b8d8', hard: '#e6d6f4', hardD: '#a890c8' },
  castle: { dirt: '#6d3f4f', dirtD: '#4a2836', dirtDD: '#351a26', cap: '#9a9fb8', capL: '#d0d4e6', capD: '#5f647d', brick: '#b8503a', brickD: '#7a2a1f', stone: '#8a90ac', stoneD: '#4a4f6a', hard: '#6a708c', hardD: '#3a3d55' }
};
const DARK = { cave: 'rgba(5,7,28,0.74)', castle: 'rgba(18,3,8,0.6)' };
const BG_W = 1440;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ridgeFn(seed, amps) { const ts = amps.map((a, i) => ({ a: a[0], k: a[1], p: hash(seed, i) * TAU })); return x => { let s = 0; for (const t of ts) s += t.a * Math.sin(TAU * t.k * x / BG_W + t.p); return s; }; }
function ridgePath(g, f, base, bottom = VH) { g.beginPath(); g.moveTo(0, bottom); for (let x = 0; x <= BG_W; x += 6) g.lineTo(x, base - f(x)); g.lineTo(BG_W, bottom); g.closePath(); }
function vgrad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => gr.addColorStop(s[0], s[1])); return gr; }

// ---------------------------------------------------------------- タイルスプライト
function drawGround(g, th, m, v) {
  const P = TILE_PAL[th], U = m & 1, Rr = m & 2, D = m & 4, L = m & 8, oy = 16, T = 48;
  const r = [(!U && !L) ? 13 : 0, (!U && !Rr) ? 13 : 0, (!D && !Rr) ? 13 : 0, (!D && !L) ? 13 : 0];
  g.save(); rrect(g, 0, oy, T, T, r); g.clip();
  g.fillStyle = vgrad(g, oy, oy + T, [[0, U ? P.dirtD : P.dirt], [1, P.dirtD]]); g.fillRect(0, oy, T, T);
  if (th === 'castle') {
    g.strokeStyle = P.dirtDD; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < 3; i++) { const y = oy + i * 16 + (U ? 0 : 10); g.moveTo(0, y); g.lineTo(T, y); const o = (i + v) % 2 ? 12 : 36; g.moveTo(o, y); g.lineTo(o, y + 16); }
    g.stroke(); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(2, oy + 20, 20, 5);
  } else if (th === 'sky') {
    g.strokeStyle = P.dirtDD; g.lineWidth = 1.5; g.globalAlpha = 0.55; g.beginPath();
    const y = oy + (U ? 24 : 30); g.moveTo(0, y); g.lineTo(T, y); const o = v % 2 ? 16 : 30; g.moveTo(o, y); g.lineTo(o, oy + T); if (U) { g.moveTo(T - o, oy); g.lineTo(T - o, y); }
    g.stroke(); g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(4, y + 3, 14, 2.5);
  } else {
    for (let i = 0; i < 5; i++) {
      const px = 5 + hash(v * 7 + i, 1 + m) * 38, py = oy + (U ? 4 : 18) + hash(v * 7 + i, 2) * (U ? 38 : 24), pr = 2 + hash(v + i, 3) * 4.5;
      g.fillStyle = i % 2 ? P.dirtDD : (th === 'cave' ? '#7d84d0' : '#e2a968'); g.globalAlpha = 0.55; ell(g, px, py, pr, pr * 0.72); g.fill();
    }
    g.globalAlpha = 1;
  }
  if (!L) { g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, oy, 4, T); }
  if (!Rr) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(T - 5, oy, 5, T); }
  if (!D) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, oy + T - 7, T, 7); }
  if (!U) {
    if (th === 'castle') {
      g.fillStyle = P.capD; g.fillRect(0, oy, T, 13); g.fillStyle = P.cap; g.fillRect(0, oy, T, 10); g.fillStyle = P.capL; g.fillRect(0, oy, T, 3);
      g.fillStyle = P.capD; ell(g, 12, oy + 6.5, 2, 2); g.fill(); ell(g, 36, oy + 6.5, 2, 2); g.fill();
    } else {
      const scal = (yb, dp) => { g.beginPath(); g.moveTo(0, oy); g.lineTo(T, oy); g.lineTo(T, oy + yb); for (let x = T; x > 0; x -= 16) g.quadraticCurveTo(x - 8, oy + yb + dp, x - 16, oy + yb); g.closePath(); g.fill(); };
      g.fillStyle = P.capD; scal(13, 9); g.fillStyle = P.cap; scal(9, 7); g.fillStyle = P.capL; g.fillRect(0, oy, T, 3.5);
    }
  }
  g.restore();
  if (!U && th !== 'castle') {  // 草のはみ出し
    for (let i = 0; i < 5; i++) {
      const bx = 5 + i * 9.5 + hash(v + i, 9) * 4, bh = 4 + hash(v * 3 + i, 4) * 6, lean = (hash(i, v + 5) - 0.5) * 6;
      if ((!L && bx < 9) || (!Rr && bx > 39)) continue;
      g.fillStyle = i % 2 ? P.cap : P.capL; g.beginPath(); g.moveTo(bx - 3, oy + 1); g.quadraticCurveTo(bx + lean * 0.3, oy - bh * 0.6, bx + lean, oy - bh); g.quadraticCurveTo(bx + 1 + lean * 0.3, oy - bh * 0.4, bx + 3, oy + 1); g.fill();
    }
  }
}
function drawBrick(g, th) {
  const P = TILE_PAL[th]; g.fillStyle = P.brickD; rrect(g, 0, 0, 48, 48, 5); g.fill(); g.fillStyle = P.brick;
  for (let r = 0; r < 3; r++) for (let c = -1; c < 2; c++) { const x = c * 24 + (r % 2 ? 12 : 0) + 1.5, y = r * 16 + 1.5; const x0 = Math.max(1.5, x), x1 = Math.min(46.5, x + 21); if (x1 > x0) { rrect(g, x0, y, x1 - x0, 13, 2.5); g.fill(); } }
  g.fillStyle = 'rgba(255,255,255,.28)'; for (let r = 0; r < 3; r++) g.fillRect(3, r * 16 + 2.5, 42, 2.5);
  g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 43, 48, 5);
}
function drawHard(g, th) {
  const P = TILE_PAL[th]; g.fillStyle = P.hardD; rrect(g, 0, 0, 48, 48, 6); g.fill();
  g.fillStyle = vgrad(g, 0, 48, [[0, P.hard], [1, P.hardD]]); rrect(g, 3, 3, 42, 42, 4); g.fill();
  g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.moveTo(3, 3); g.lineTo(45, 3); g.lineTo(38, 10); g.lineTo(10, 10); g.lineTo(10, 38); g.lineTo(3, 45); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.moveTo(45, 45); g.lineTo(3, 45); g.lineTo(10, 38); g.lineTo(38, 38); g.lineTo(38, 10); g.lineTo(45, 3); g.closePath(); g.fill();
  g.fillStyle = P.hardD; for (const [x, y] of [[8, 8], [40, 8], [8, 40], [40, 40]]) { ell(g, x, y, 1.8, 1.8); g.fill(); }
}
function drawUsed(g) {
  g.fillStyle = '#5a3d28'; rrect(g, 0, 0, 48, 48, 6); g.fill(); g.fillStyle = vgrad(g, 0, 48, [[0, '#a8805a'], [1, '#7d5a3c']]); rrect(g, 3, 3, 42, 42, 4); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(5, 5, 38, 4); g.fillStyle = '#5a3d28'; for (const [x, y] of [[9, 9], [39, 9], [9, 39], [39, 39]]) { ell(g, x, y, 2.2, 2.2); g.fill(); }
}
function drawQ(g) {
  g.fillStyle = '#a85a10'; rrect(g, 0, 0, 48, 48, 7); g.fill(); g.fillStyle = vgrad(g, 0, 48, [[0, '#ffe45a'], [0.55, '#ffc21a'], [1, '#f0921a']]); rrect(g, 3, 3, 42, 42, 5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)'; rrect(g, 6, 5, 36, 5, 2.5); g.fill(); g.fillStyle = 'rgba(160,80,10,.35)'; rrect(g, 6, 39, 36, 4, 2); g.fill();
  g.fillStyle = '#a85a10'; for (const [x, y] of [[9, 14], [39, 14], [9, 36], [39, 36]]) { ell(g, x, y, 1.8, 1.8); g.fill(); }
}
function drawOneWay(g, th, m) {
  const c = { grass: ['#f0b46a', '#b8743a', '#7a4418'], cave: ['#a8aef0', '#6a70b8', '#343878'], sky: ['#ffffff', '#e6d6f4', '#b8a0d8'], castle: ['#9a9fb8', '#5a5f78', '#2c2f45'] }[th], L = m & 8, Rr = m & 2;
  g.fillStyle = c[2]; if (!L) { g.fillRect(5, 10, 5, 16); } if (!Rr) { g.fillRect(38, 10, 5, 16); }
  g.fillStyle = c[2]; rrect(g, 0, 3, 48, 13, [L ? 0 : 6, Rr ? 0 : 6, Rr ? 0 : 6, L ? 0 : 6]); g.fill();
  g.fillStyle = vgrad(g, 0, 13, [[0, c[0]], [1, c[1]]]); rrect(g, 0, 0, 48, 12, [L ? 0 : 6, Rr ? 0 : 6, Rr ? 0 : 6, L ? 0 : 6]); g.fill();
  g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(L ? 0 : 4, 1.5, 48 - (L ? 0 : 4) - (Rr ? 0 : 4), 2.5);
  g.fillStyle = c[2]; g.globalAlpha = 0.6; g.fillRect(23, 2, 2, 9); g.globalAlpha = 1;
}
function drawSpikes(g) {
  g.fillStyle = '#4a4f6a'; g.fillRect(0, 42, 48, 6);
  for (let i = 0; i < 3; i++) {
    const x = i * 16; g.fillStyle = vgrad(g, 14, 44, [[0, '#ffffff'], [1, '#8a90ac']]); g.beginPath(); g.moveTo(x + 1, 44); g.lineTo(x + 8, 14); g.lineTo(x + 15, 44); g.fill();
    g.fillStyle = 'rgba(40,45,80,.35)'; g.beginPath(); g.moveTo(x + 8, 14); g.lineTo(x + 15, 44); g.lineTo(x + 9, 44); g.fill();
  }
}
function drawSwitchBlock(g, red, solid) {
  const c = red ? ['#ff8a9a', '#ff4d6e', '#b01a3a'] : ['#8fd0ff', '#3f9be8', '#1a4fa8'];
  if (!solid) { g.strokeStyle = c[1]; g.globalAlpha = 0.65; g.lineWidth = 2.5; g.setLineDash([6, 5]); rrect(g, 4, 4, 40, 40, 6); g.stroke(); g.setLineDash([]); g.globalAlpha = 0.12; g.fillStyle = c[1]; g.fill(); g.globalAlpha = 1; return; }
  g.fillStyle = c[2]; rrect(g, 0, 0, 48, 48, 7); g.fill(); g.fillStyle = vgrad(g, 0, 48, [[0, c[0]], [1, c[1]]]); rrect(g, 3, 3, 42, 42, 5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)'; rrect(g, 6, 5, 36, 5, 2.5); g.fill();
  g.fillStyle = c[2]; g.globalAlpha = 0.5; if (red) { ell(g, 24, 26, 8, 8); g.fill(); } else { g.beginPath(); g.moveTo(24, 16); g.lineTo(34, 26); g.lineTo(24, 36); g.lineTo(14, 26); g.fill(); } g.globalAlpha = 1;
}
function drawMetalBlock(g, core) {
  g.fillStyle = '#14151f'; rrect(g, 0, 0, 48, 48, 7); g.fill(); g.fillStyle = vgrad(g, 0, 48, [[0, '#5a5f78'], [1, '#2c2f45']]); rrect(g, 3, 3, 42, 42, 5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(6, 5, 36, 4); g.fillStyle = '#8a90ac'; for (const [x, y] of [[9, 9], [39, 9], [9, 39], [39, 39]]) { ell(g, x, y, 2.2, 2.2); g.fill(); }
  if (core) { g.fillStyle = '#14151f'; ell(g, 24, 24, 11, 11); g.fill(); g.fillStyle = '#ff7a1a'; ell(g, 24, 24, 7.5, 7.5); g.fill(); g.fillStyle = '#ffe27a'; ell(g, 24, 24, 4, 4); g.fill(); }
}

// ---------------------------------------------------------------- 背景レイヤ生成
function cloudSprite(seed, c1, c2) {
  const c = mkCanvas(260, 120), g = c.getContext('2d'); const n = 6;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { const x = 45 + i * 34, r = 26 + hash(seed, i) * 20, y = 74 - hash(seed + 5, i) * 18 + (pass ? -6 : 4); g.fillStyle = pass ? c1 : c2; ell(g, x, y, r, r * 0.8); g.fill(); }
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = vgrad(g, 86, 120, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(0, 86, 260, 34);
  return c;
}
function buildBG(th) {
  const sky = mkCanvas(VW, VH), s = sky.getContext('2d'), layers = [], add = par => { const c = mkCanvas(BG_W, VH); layers.push({ c, par }); return c.getContext('2d'); };
  const bg = { sky, layers, clouds: [], cloudSpr: [] };
  if (th === 'grass') {
    s.fillStyle = vgrad(s, 0, VH, [[0, '#2f8ff5'], [0.45, '#7ccbff'], [0.8, '#d2f1ff'], [1, '#fff4d2']]); s.fillRect(0, 0, VW, VH);
    let g = add(0.07), f = ridgeFn(1, [[70, 2], [42, 5], [18, 11], [7, 23]]);
    ridgePath(g, f, 330); g.fillStyle = vgrad(g, 180, 540, [[0, '#86b0ec'], [1, '#cbe4f8']]); g.fill(); g.save(); g.clip(); g.fillStyle = vgrad(g, 200, 290, [[0, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, BG_W, VH);
    g.fillStyle = 'rgba(60,90,170,.12)'; for (let x = 0; x < BG_W; x += 90) { g.beginPath(); g.moveTo(x + 20, 540); g.lineTo(x + 70, 250); g.lineTo(x + 110, 540); g.fill(); } g.restore();
    g = add(0.18); f = ridgeFn(2, [[45, 3], [25, 7], [10, 15]]); ridgePath(g, f, 405); g.fillStyle = vgrad(g, 330, 540, [[0, '#63c3a2'], [1, '#9ae3bd']]); g.fill();
    for (let x = 0; x < BG_W; x += 22) { const h = hash(x, 7); if (h > 0.62) continue; const px = x + h * 14, py = 405 - f(px) + 4, sz = 16 + h * 26; g.fillStyle = h > 0.3 ? '#3f9f86' : '#4fb090'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(px - sz * (0.5 - k * 0.1), py - k * sz * 0.38); g.lineTo(px, py - sz * (0.75 + k * 0.38)); g.lineTo(px + sz * (0.5 - k * 0.1), py - k * sz * 0.38); g.fill(); } }
    g = add(0.4); f = ridgeFn(3, [[36, 2], [18, 5], [6, 13]]); ridgePath(g, f, 478); g.fillStyle = vgrad(g, 420, 540, [[0, '#86e060'], [1, '#52b446']]); g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 10; for (let k = 1; k < 4; k++) { g.beginPath(); for (let x = 0; x <= BG_W; x += 12) g.lineTo(x, 478 - f(x) + k * 26); g.stroke(); } g.restore();
    for (let x = 30; x < BG_W; x += 115) { const h = hash(x, 11), px = x + h * 50, py = 478 - f(px) + 6, sz = 26 + h * 20; g.fillStyle = '#8a5a2c'; g.fillRect(px - 5, py - sz * 1.3, 10, sz * 1.3); for (const [dx, dy, rr, col] of [[-sz * 0.55, -sz * 1.5, sz * 0.75, '#3fa040'], [sz * 0.55, -sz * 1.55, sz * 0.8, '#3fa040'], [0, -sz * 2.0, sz * 0.95, '#4fb548'], [-sz * 0.25, -sz * 2.25, sz * 0.5, '#7ad860']]) { g.fillStyle = col; ell(g, px + dx, py + dy, rr, rr * 0.92); g.fill(); } }
    for (let x = 0; x < BG_W; x += 31) { const h = hash(x, 21); g.fillStyle = ['#ffffff', '#ffd76a', '#ff9ab8'][Math.floor(h * 3)]; ell(g, x + h * 20, 478 - f(x + h * 20) + 14 + h * 30, 2.5, 2.5); g.fill(); }
    bg.cloudSpr = [cloudSprite(1, '#ffffff', '#d4ecff'), cloudSprite(2, '#ffffff', '#d4ecff'), cloudSprite(3, '#ffffff', '#cfe6fb')];
    for (let i = 0; i < 9; i++) bg.clouds.push({ x: hash(i, 1) * 1500, y: 30 + hash(i, 2) * 190, s: 0.55 + hash(i, 3) * 0.9, v: 6 + hash(i, 4) * 12, k: i % 3, par: 0.04 + hash(i, 5) * 0.1 });
  } else if (th === 'cave') {
    s.fillStyle = vgrad(s, 0, VH, [[0, '#060819'], [0.5, '#131238'], [1, '#2a1b60']]); s.fillRect(0, 0, VW, VH);
    for (const [x, y, r, c] of [[200, 200, 260, '#2a4fd8'], [700, 330, 320, '#7a2ad8'], [880, 120, 200, '#1ab8c8']]) { s.globalAlpha = 0.22; s.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2); } s.globalAlpha = 1;
    let g = add(0.07), f = ridgeFn(4, [[50, 2], [30, 5], [14, 12]]), f2 = ridgeFn(5, [[40, 3], [22, 7], [10, 16]]);
    g.fillStyle = '#191a4c'; ridgePath(g, f, 400); g.fill(); g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= BG_W; x += 6) g.lineTo(x, 110 + f2(x)); g.lineTo(BG_W, 0); g.fill();
    for (let i = 0; i < 46; i++) { const x = hash(i, 31) * BG_W, top = hash(i, 32) > 0.5, y = top ? 110 + f2(x) - hash(i, 33) * 30 : 400 - f(x) + hash(i, 33) * 40, c = ['#5ae0ff', '#ff7ad8', '#9a8aff'][i % 3]; g.globalAlpha = 0.8; g.drawImage(glowSprite(c), x - 14, y - 14, 28, 28); g.globalAlpha = 1; g.fillStyle = '#ffffff'; ell(g, x, y, 1.6, 1.6); g.fill(); }
    g = add(0.2);
    for (let x = 0; x < BG_W; x += 34) { const h = hash(x, 41), h2 = hash(x, 42); g.fillStyle = '#12133a'; if (h < 0.75) { const len = 40 + h * 190, w = 14 + h2 * 22; g.beginPath(); g.moveTo(x - w, 0); g.quadraticCurveTo(x - w * 0.3, len * 0.5, x, len); g.quadraticCurveTo(x + w * 0.3, len * 0.5, x + w, 0); g.fill(); } if (h2 < 0.7) { const len = 30 + h2 * 150, w = 16 + h * 26, xx = x + 17; g.beginPath(); g.moveTo(xx - w, VH); g.quadraticCurveTo(xx - w * 0.3, VH - len * 0.5, xx, VH - len); g.quadraticCurveTo(xx + w * 0.3, VH - len * 0.5, xx + w, VH); g.fill(); } }
    for (let i = 0; i < 16; i++) { const x = hash(i, 51) * BG_W, y = VH - 20 - hash(i, 52) * 60, r = 6 + hash(i, 53) * 8; g.globalAlpha = 0.7; g.drawImage(glowSprite('#3affd0'), x - r * 3, y - r * 3, r * 6, r * 6); g.globalAlpha = 1; g.fillStyle = '#7dffe0'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, Math.PI, TAU); g.fill(); g.fillStyle = '#c8fff2'; g.fillRect(x - 1.5, y, 3, r); }
    g = add(0.42);
    for (const x of [90, 480, 830, 1230]) { const w = 60 + hash(x, 61) * 40; g.fillStyle = '#0a0a26'; g.beginPath(); g.moveTo(x - w * 1.6, 0); g.bezierCurveTo(x - w * 0.5, 120, x - w * 0.5, 420, x - w * 1.8, VH); g.lineTo(x + w * 1.8, VH); g.bezierCurveTo(x + w * 0.5, 420, x + w * 0.5, 120, x + w * 1.6, 0); g.fill(); g.strokeStyle = 'rgba(110,130,255,.12)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - w * 0.42, 150); g.lineTo(x - w * 0.45, 380); g.stroke(); }
  } else if (th === 'sky') {
    s.fillStyle = vgrad(s, 0, VH, [[0, '#1a1560'], [0.32, '#5a2a92'], [0.58, '#c9468f'], [0.8, '#ff8a5a'], [1, '#ffd98a']]); s.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 130; i++) { const y = hash(i, 72) * 260; s.globalAlpha = (1 - y / 280) * (0.4 + hash(i, 73) * 0.6); s.fillStyle = '#ffffff'; const r = 0.6 + hash(i, 74) * 1.3; ell(s, hash(i, 71) * VW, y, r, r); s.fill(); } s.globalAlpha = 1;
    s.globalAlpha = 0.9; s.drawImage(glowSprite('#fff2c0'), 690 - 330, 410 - 330, 660, 660); s.globalAlpha = 1; s.fillStyle = '#fffbe6'; ell(s, 690, 410, 78, 78); s.fill();
    let g = add(0.05);
    for (let r = 0; r < 3; r++) { g.fillStyle = ['#7a3a9c', '#a04a9e', '#c8609a'][r]; for (let x = -40; x < BG_W + 40; x += 52) { const h = hash(x, 80 + r), rr = 44 + h * 40; ell(g, x + h * 30, 400 + r * 46 + h * 14, rr, rr * 0.62); g.fill(); } g.fillRect(0, 420 + r * 46, BG_W, VH); }
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.35; g.fillStyle = vgrad(g, 340, 540, [[0, 'rgba(255,200,140,0)'], [1, '#ffb070']]); g.fillRect(0, 0, BG_W, VH); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g = add(0.14);
    for (const [x, y, w] of [[170, 250, 120], [590, 170, 90], [1000, 300, 150], [1310, 215, 80]]) {
      g.fillStyle = vgrad(g, y, y + w, [[0, '#4a2478'], [1, '#8c3c8c']]); g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.quadraticCurveTo(x + w * 0.5, y + w * 0.35, x + w * 0.15, y + w * 0.95); g.quadraticCurveTo(x - w * 0.3, y + w * 0.4, x - w, y); g.fill();
      g.fillStyle = '#3c1c68'; ell(g, x, y, w, 9); g.fill(); g.fillRect(x - w * 0.5, y - 46, 12, 46); g.fillRect(x - w * 0.5 - 4, y - 50, 20, 6); g.fillRect(x + w * 0.2, y - 28, 10, 28); ell(g, x + w * 0.55, y - 18, 16, 20); g.fill(); ell(g, x - w * 0.1, y - 12, 12, 14); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - w * 0.2, y + 6, 3, w * 0.55);
    }
    g = add(0.36);
    for (let pass = 0; pass < 2; pass++) for (let x = -60; x < BG_W + 60; x += 70) { const h = hash(x, 91), rr = 60 + h * 50; g.fillStyle = pass ? '#fff1e6' : '#f08aa6'; ell(g, x + h * 40, 520 - h * 26 + (pass ? -12 : 6), rr, rr * 0.6); g.fill(); }
    g.fillStyle = '#fff1e6'; g.fillRect(0, 524, BG_W, 20);
  } else {
    s.fillStyle = vgrad(s, 0, VH, [[0, '#0b0206'], [0.45, '#2c0811'], [0.8, '#6a1810'], [1, '#c8431a']]); s.fillRect(0, 0, VW, VH);
    s.globalAlpha = 0.55; s.drawImage(glowSprite('#ff3a1a'), 640 - 190, 130 - 190, 380, 380); s.globalAlpha = 1; s.fillStyle = '#5a1418'; ell(s, 640, 130, 62, 62); s.fill(); s.fillStyle = '#3d0c12'; ell(s, 622, 118, 13, 11); s.fill(); ell(s, 662, 150, 9, 8); s.fill();
    let g = add(0.06), f = ridgeFn(6, [[90, 2], [44, 5], [16, 11], [6, 24]]);
    ridgePath(g, x => Math.abs(f(x)) * 1.2, 430); g.fillStyle = '#260811'; g.fill(); g.save(); g.clip();
    g.strokeStyle = '#ff6a1a'; g.lineWidth = 3; g.globalAlpha = 0.7; for (let i = 0; i < 9; i++) { let x = hash(i, 101) * BG_W, y = 430 - Math.abs(f(x)) * 1.2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (hash(i, k + 110) - 0.5) * 40; y += 26; g.lineTo(x, y); } g.stroke(); } g.restore();
    g = add(0.17); g.fillStyle = '#180509';
    g.fillRect(0, 350, BG_W, VH); for (let x = 0; x < BG_W; x += 36) g.fillRect(x, 334, 20, 20);
    for (const [x, w, top] of [[120, 86, 170], [470, 70, 210], [830, 100, 140], [1180, 78, 195]]) {
      g.fillStyle = '#180509'; g.fillRect(x - w / 2, top, w, VH); for (let k = 0; k < 4; k++) g.fillRect(x - w / 2 - 6 + k * (w + 12 - 16) / 3, top - 14, 16, 16);
      g.beginPath(); g.moveTo(x - w / 2 - 8, top - 12); g.lineTo(x, top - 90); g.lineTo(x + w / 2 + 8, top - 12); g.fill();
      for (let k = 0; k < 3; k++) { const wy = top + 40 + k * 60; g.globalAlpha = 0.8; g.drawImage(glowSprite('#ff9a3c'), x - 26, wy - 20, 52, 52); g.globalAlpha = 1; g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(x - 7, wy + 16); g.lineTo(x - 7, wy); g.quadraticCurveTo(x, wy - 12, x + 7, wy); g.lineTo(x + 7, wy + 16); g.fill(); g.fillStyle = '#180509'; }
    }
    g = add(0.42);
    for (const x of [140, 620, 1100]) {
      g.fillStyle = '#0c0204'; g.fillRect(x - 34, 0, 68, VH); g.fillRect(x - 50, 0, 100, 34); g.fillRect(x - 46, VH - 40, 92, 40);
      g.fillStyle = 'rgba(255,120,60,.1)'; g.fillRect(x - 34, 34, 8, VH); g.strokeStyle = '#0c0204'; g.lineWidth = 5; g.setLineDash([9, 6]);
      g.beginPath(); g.moveTo(x + 120, 0); g.lineTo(x + 120, 120 + hash(x, 1) * 120); g.moveTo(x + 260, 0); g.lineTo(x + 260, 70 + hash(x, 2) * 140); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#0c0204'; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= BG_W; x += 240) { g.lineTo(x, 26); g.quadraticCurveTo(x + 120, 80, x + 240, 26); } g.lineTo(BG_W, 0); g.fill();
  }
  return bg;
}

// ---------------------------------------------------------------- 装飾
function drawDecor(ctx, d, t) {
  const x = d.x, y = d.y, v = d.v, sway = Math.sin(t * 2 + x * 0.05) * 2;
  switch (d.k) {
    case 'flower': {
      const col = World.theme === 'sky' ? ['#ffffff', '#ffb8dc', '#fff3a8'] : ['#ff7a9a', '#ffe45a', '#ffffff', '#c89aff']; const h = 12 + v * 8, fx = x - 12 + v * 24 + sway;
      ctx.strokeStyle = '#3a9e2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 12 + v * 24, y); ctx.quadraticCurveTo(x - 12 + v * 24, y - h * 0.6, fx, y - h); ctx.stroke();
      ctx.fillStyle = col[Math.floor(v * 97) % col.length]; for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + t * 0.3; ell(ctx, fx + Math.cos(a) * 3.6, y - h + Math.sin(a) * 3.6, 2.8, 2.8); ctx.fill(); } ctx.fillStyle = '#ffb21a'; ell(ctx, fx, y - h, 2.2, 2.2); ctx.fill(); break;
    }
    case 'grass': ctx.fillStyle = TILE_PAL[World.theme].cap; for (let i = 0; i < 4; i++) { const bx = x - 14 + i * 9, h = 12 + hash(i, x) * 10; ctx.beginPath(); ctx.moveTo(bx - 3, y + 1); ctx.quadraticCurveTo(bx + sway * 0.5, y - h * 0.5, bx + sway + (i - 1.5) * 2, y - h); ctx.quadraticCurveTo(bx + 2, y - h * 0.4, bx + 3, y + 1); ctx.fill(); } break;
    case 'bush': { const c = World.theme === 'sky' ? ['#e87aa8', '#ffa8cc', '#ffd0e4'] : ['#3a9e2e', '#55c23e', '#8ae860']; ctx.fillStyle = c[0]; ell(ctx, x - 13, y - 9, 13, 12); ctx.fill(); ell(ctx, x + 13, y - 8, 12, 11); ctx.fill(); ctx.fillStyle = c[1]; ell(ctx, x, y - 14, 15, 15); ctx.fill(); ctx.fillStyle = c[2]; ell(ctx, x - 4, y - 20, 6, 4.5); ctx.fill(); break; }
    case 'tree': {
      const h = 80 + v * 50; ctx.fillStyle = '#7a4a22'; rrect(ctx, x - 7, y - h, 14, h + 4, 4); ctx.fill(); ctx.fillStyle = '#a8703a'; ctx.fillRect(x - 7, y - h, 5, h);
      const cx = x + sway * 0.8, cy = y - h - 8; for (const [dx, dy, r, c] of [[-26, 8, 26, '#2f8f34'], [26, 6, 27, '#2f8f34'], [0, -12, 36, '#3fa840'], [-10, -26, 22, '#5fc850'], [-14, -32, 10, '#8ae860']]) { ctx.fillStyle = c; ell(ctx, cx + dx, cy + dy, r, r * 0.92); ctx.fill(); }
      ctx.fillStyle = '#ff5a6e'; for (let i = 0; i < 3; i++) { ell(ctx, cx - 20 + i * 22, cy + 4 + (i % 2) * 10, 3.5, 3.5); ctx.fill(); } break;
    }
    case 'shroom': ctx.fillStyle = '#fff4dc'; rrect(ctx, x - 4, y - 10, 8, 11, 3); ctx.fill(); ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.ellipse(x, y - 9, 11, 9, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ell(ctx, x - 4, y - 13, 2.2, 2); ctx.fill(); ell(ctx, x + 4, y - 12, 1.8, 1.6); ctx.fill(); break;
    case 'crystal': {
      const c = v > 0.5 ? ['#e8fcff', '#5ad8ff', '#5ae0ff'] : ['#ffe8fb', '#ff7ad8', '#ff7ad8']; glow(ctx, x, y - 14, 34, c[2], 0.45 + Math.sin(t * 2 + x) * 0.12); R.light(x, y - 12, 110, 0.9);
      for (const [dx, h, w, a] of [[-9, 18, 5, -0.3], [8, 15, 4.5, 0.35], [0, 28, 6.5, 0]]) { ctx.save(); ctx.translate(x + dx, y); ctx.rotate(a); ctx.fillStyle = c[1]; ctx.beginPath(); ctx.moveTo(-w, 2); ctx.lineTo(-w, -h * 0.7); ctx.lineTo(0, -h); ctx.lineTo(w, -h * 0.7); ctx.lineTo(w, 2); ctx.fill(); ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(-w, 2); ctx.lineTo(-w, -h * 0.7); ctx.lineTo(0, -h); ctx.lineTo(-w * 0.2, 2); ctx.fill(); ctx.restore(); } break;
    }
    case 'gshroom': glow(ctx, x, y - 12, 28, '#3affd0', 0.5 + Math.sin(t * 3 + x) * 0.15); R.light(x, y - 10, 90, 0.85); ctx.fillStyle = '#c8fff2'; rrect(ctx, x - 3, y - 12, 6, 13, 2.5); ctx.fill(); ctx.fillStyle = '#3ad8b8'; ctx.beginPath(); ctx.ellipse(x, y - 11, 12, 9, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = '#b6fff2'; ell(ctx, x - 4, y - 15, 2.2, 1.8); ctx.fill(); ell(ctx, x + 5, y - 14, 1.6, 1.4); ctx.fill(); break;
    case 'rock': ctx.fillStyle = '#3d427f'; ctx.beginPath(); ctx.moveTo(x - 16, y + 1); ctx.lineTo(x - 11, y - 12); ctx.lineTo(x + 2, y - 17); ctx.lineTo(x + 14, y - 9); ctx.lineTo(x + 17, y + 1); ctx.fill(); ctx.fillStyle = '#6a70b8'; ctx.beginPath(); ctx.moveTo(x - 11, y - 12); ctx.lineTo(x + 2, y - 17); ctx.lineTo(x - 2, y - 7); ctx.fill(); break;
    case 'column': {
      const h = 70 + v * 60; ctx.fillStyle = '#d9c9ee'; ctx.fillRect(x - 12, y - h, 24, h + 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 12, y - h, 7, h); ctx.fillStyle = '#b8a0d8'; ctx.fillRect(x + 6, y - h, 6, h); ctx.fillRect(x - 3, y - h, 2, h);
      ctx.fillStyle = '#f1e6ff'; rrect(ctx, x - 17, y - 8, 34, 9, 3); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 16, y - h); ctx.lineTo(x - 13, y - h - 10 - v * 8); ctx.lineTo(x - 2, y - h - 4); ctx.lineTo(x + 6, y - h - 14); ctx.lineTo(x + 16, y - h); ctx.fill(); break;
    }
    case 'candle': { const f = Math.sin(t * 12 + x) * 1.5; glow(ctx, x, y - 20, 36, '#ff9a3c', 0.55); R.light(x, y - 18, 140, 0.9); ctx.fillStyle = '#e9e0d0'; rrect(ctx, x - 4, y - 15, 8, 16, 2); ctx.fill(); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x - 3.5, y - 15); ctx.quadraticCurveTo(x - 4, y - 22, x + f, y - 28); ctx.quadraticCurveTo(x + 4, y - 22, x + 3.5, y - 15); ctx.fill(); ctx.fillStyle = '#ffe27a'; ell(ctx, x, y - 17.5, 1.8, 3); ctx.fill(); break; }
    case 'bones': ctx.fillStyle = '#e9e0d0'; ell(ctx, x, y - 8, 9, 8); ctx.fill(); rrect(ctx, x - 5, y - 4, 10, 6, 2); ctx.fill(); ctx.fillStyle = '#351a26'; ell(ctx, x - 3.5, y - 9, 2.4, 2.8); ctx.fill(); ell(ctx, x + 3.5, y - 9, 2.4, 2.8); ctx.fill(); ctx.fillRect(x - 3, y - 2, 1.5, 3); ctx.fillRect(x, y - 2, 1.5, 3); break;
  }
}

// ---------------------------------------------------------------- レンダラ本体
const R = {
  canvas: null, ctx: null, S: 1, lights: [], sprites: {}, bgCache: {}, dark: null, amb: [],
  init() {
    this.canvas = document.getElementById('game'); this.ctx = this.canvas.getContext('2d');
    this.lc = mkCanvas(VW / 2, VH / 2); this.lg = this.lc.getContext('2d');
    this.lightSpr = mkCanvas(128, 128); { const g = this.lightSpr.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    this.vig = mkCanvas(VW / 2, VH / 2); { const g = this.vig.getContext('2d'), gr = g.createRadialGradient(VW / 4, VH / 4, VH * 0.22, VW / 4, VH / 4, VW * 0.36); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(8,4,30,.5)'); g.fillStyle = gr; g.fillRect(0, 0, VW / 2, VH / 2); }
    for (let i = 0; i < 46; i++) this.amb.push({ x: rand(1200), y: rand(700), z: rand(0.7, 1.5), s: rand(), ph: rand(TAU) });
    this.resize(); addEventListener('resize', () => this.resize());
  },
  resize() {
    const touch = TouchUI.on, port = touch && innerHeight > innerWidth; document.body.classList.toggle('portrait', port);
    const s = Math.min(innerWidth / VW, innerHeight / VH), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = Math.floor(VW * s) + 'px'; this.canvas.style.height = Math.floor(VH * s) + 'px';
    const S = Math.round(clamp(s * dpr, 1, touch ? 2 : 2.5) * 48) / 48;
    if (S !== this.S || !this.canvas.width) { this.S = S; this.canvas.width = Math.round(VW * S); this.canvas.height = Math.round(VH * S); this.sprites = {}; }
    TouchUI.layout();
  },
  light(x, y, r, a = 1) { if (this.dark) this.lights.push(x, y, r, a); },
  spr(key, w, h, fn) {
    let c = this.sprites[key];
    if (!c) { const k = this.S; c = mkCanvas(Math.ceil(w * k), Math.ceil(h * k)); const g = c.getContext('2d'); g.scale(k, k); fn(g); this.sprites[key] = c; }
    return c;
  },
  frame() {
    const ctx = this.ctx, cam = Game.cam, S = this.S, t = Game.t, th = World.theme;
    ctx.setTransform(S, 0, 0, S, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.lights.length = 0; this.dark = DARK[th] || null;
    const cx = Math.round((cam.x + Game.shakeX) * S) / S, cy = Math.round((cam.y + Game.shakeY) * S) / S;
    this.cx = cx; this.cy = cy;
    this.drawBG(ctx, cx, cy, th, t);
    ctx.save(); ctx.translate(-cx, -cy);
    const vx0 = cx - 120, vx1 = cx + VW + 120, vy0 = cy - 160, vy1 = cy + VH + 160;
    for (const d of World.decor) if (d.x > vx0 && d.x < vx1 && d.y > vy0 && d.y < vy1) drawDecor(ctx, d, t);
    this.drawHints(ctx, t);
    const ents = World.ents, vis = e => e.x < vx1 && e.x + e.w > vx0 && e.y < vy1 && e.y + e.h > vy0;
    for (const e of ents) if (!e.dead && e.back && vis(e)) e.draw(ctx);
    this.drawTiles(ctx, cx, cy, th, t);
    for (const e of ents) if (!e.dead && !e.back && vis(e)) e.draw(ctx);
    if (Game.player) Game.player.draw(ctx);
    FX.draw(ctx);
    ctx.restore();
    if (this.dark) this.lighting(ctx, cx, cy);
    this.ambient(ctx, cx, cy, th, t);
    ctx.drawImage(this.vig, 0, 0, VW, VH);
  },
  drawBG(ctx, cx, cy, th, t) {
    const bg = this.bgCache[th] || (this.bgCache[th] = buildBG(th));
    ctx.drawImage(bg.sky, 0, 0, VW, VH);
    const maxY = World.h * TILE - VH, up = Math.max(0, maxY - cy);
    if (th === 'grass') { // 太陽
      const sx = 760 - cx * 0.02, sy = 96 + up * 0.03; glow(ctx, sx, sy, 190, '#fff6c8', 0.75);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.08); ctx.fillStyle = 'rgba(255,250,210,.22)'; for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-7, 44); ctx.lineTo(0, 120 + (i % 2) * 40); ctx.lineTo(7, 44); ctx.fill(); } ctx.restore();
      ctx.fillStyle = '#fffbe0'; ell(ctx, sx, sy, 40, 40); ctx.fill();
    }
    for (const c of bg.clouds) { const w = 260 * c.s, x = ((c.x - cx * c.par + t * c.v) % (VW + w * 2) + (VW + w * 2)) % (VW + w * 2) - w; ctx.globalAlpha = 0.92; ctx.drawImage(bg.cloudSpr[c.k], x, c.y + up * c.par * 0.4, w, 120 * c.s); }
    ctx.globalAlpha = 1;
    bg.layers.forEach((L, li) => {
      const x = -(((cx * L.par) % BG_W) + BG_W) % BG_W, y = up * L.par * 0.35;
      ctx.drawImage(L.c, x, y, BG_W, VH); if (x + BG_W < VW) ctx.drawImage(L.c, x + BG_W - 1, y, BG_W, VH);
      if (th === 'cave' && li === 1) { // 光のすじ
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) { const bx = ((i * 330 + 120 - cx * 0.3) % 1300 + 1300) % 1300 - 160, a = 0.05 + (Math.sin(t * 0.7 + i * 2) + 1) * 0.03; ctx.fillStyle = `rgba(120,200,255,${a})`; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 70, 0); ctx.lineTo(bx - 110, VH); ctx.lineTo(bx - 240, VH); ctx.fill(); }
        ctx.restore();
      }
      if (th === 'sky' && li === 1) { // 鳥
        ctx.strokeStyle = 'rgba(40,20,80,.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) { const bx = ((t * 26 + i * 37 + (i > 2 ? 520 : 0) - cx * 0.1) % 1200 + 1200) % 1200 - 100, by = 120 + (i % 3) * 16 + (i > 2 ? 90 : 0) + Math.sin(t * 2 + i) * 5, f = Math.sin(t * 9 + i) * 5; ctx.beginPath(); ctx.moveTo(bx - 8, by - f); ctx.quadraticCurveTo(bx - 3, by - 2, bx, by + 1); ctx.quadraticCurveTo(bx + 3, by - 2, bx + 8, by - f); ctx.stroke(); }
      }
    });
    if (th === 'castle') { ctx.fillStyle = vgrad(ctx, VH - 160, VH, [[0, 'rgba(255,90,20,0)'], [1, `rgba(255,90,20,${0.28 + Math.sin(t * 2) * 0.05})`]]); ctx.fillRect(0, VH - 160, VW, 160); }
  },
  drawHints(ctx, t) {
    const hs = World.def.hints; if (!hs || Game.state === 'title') return; const p = Game.player;
    for (const h of hs) {
      if (h.gy === undefined) { h.gy = -1; for (let y = (World.def.ceil || 0) + 2; y < World.h; y++) if (World.get(h.x, y) === '#' && World.get(h.x, y - 1) === '.') { h.gy = y; break; } }
      if (h.gy < 0) continue; const x = h.x * TILE + 24, y = h.gy * TILE;
      if (Math.abs(x - this.cx - VW / 2) > VW) continue;
      ctx.fillStyle = '#7a4418'; ctx.fillRect(x - 3, y - 34, 6, 36); ctx.fillStyle = '#e0a05a'; rrect(ctx, x - 19, y - 52, 38, 26, 5); ctx.fill(); ctx.fillStyle = '#a8662e'; rrect(ctx, x - 19, y - 31, 38, 5, 2); ctx.fill();
      ctx.font = FONT(20); ctx.textAlign = 'center'; ctx.fillStyle = '#5a2a10'; ctx.fillText('!', x, y - 32);
      const d = p ? Math.abs(p.cx - x) : 999, a = clamp(1 - (d - 130) / 90, 0, 1); if (a <= 0) continue;
      const text = TouchUI.on && h.touch ? h.touch : h.text;
      ctx.globalAlpha = a; ctx.font = FONT(15, 700); const w = ctx.measureText(text).width + 28, by = y - 104 + Math.sin(t * 2.5) * 3;
      const bx = clamp(x - w / 2, this.cx + 8, this.cx + VW - w - 8);
      ctx.fillStyle = 'rgba(26,16,48,.82)'; rrect(ctx, bx, by, w, 34, 12); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 8, by + 33); ctx.lineTo(x, by + 44); ctx.lineTo(x + 8, by + 33); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; rrect(ctx, bx, by, w, 34, 12); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, bx + w / 2, by + 22.5); ctx.globalAlpha = 1;
    }
  },
  drawTiles(ctx, cx, cy, th, t) {
    const T = TILE, W = World, x0 = Math.max(0, Math.floor(cx / T) - 1), x1 = Math.min(W.w - 1, Math.floor((cx + VW) / T) + 1), y0 = Math.max(0, Math.floor(cy / T) - 1), y1 = Math.min(W.h - 1, Math.floor((cy + VH) / T) + 1);
    const isG = (x, y) => x < 0 || x >= W.w || y >= W.h || (y >= 0 && W.tiles[y * W.w + x] === '#');
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = W.tiles[ty * W.w + tx]; if (c === '.') continue;
      const x = tx * T, y = ty * T + (W.bumps.length ? W.bumpOff(tx, ty) : 0);
      switch (c) {
        case '#': { const m = (isG(tx, ty - 1) ? 1 : 0) | (isG(tx + 1, ty) ? 2 : 0) | (isG(tx, ty + 1) ? 4 : 0) | (isG(tx - 1, ty) ? 8 : 0), v = Math.floor(hash(tx, ty) * 4); ctx.drawImage(this.spr(th + '#' + m + '_' + v, 48, 64, g => drawGround(g, th, m, v)), x, y - 16, 48, 64); break; }
        case 'B': ctx.drawImage(this.spr(th + 'B', 48, 48, g => drawBrick(g, th)), x, y, 48, 48); break;
        case 'X': ctx.drawImage(this.spr(th + 'X', 48, 48, g => drawHard(g, th)), x, y, 48, 48); break;
        case 'U': ctx.drawImage(this.spr('U', 48, 48, drawUsed), x, y, 48, 48); break;
        case '?': case 'M': this.qblock(ctx, x, y, c, t); break;
        case '=': { const m = (W.get(tx + 1, ty) === '=' ? 2 : 0) | (W.get(tx - 1, ty) === '=' ? 8 : 0); ctx.drawImage(this.spr(th + '=' + m, 48, 28, g => drawOneWay(g, th, m)), x, y, 48, 28); break; }
        case '^': ctx.drawImage(this.spr('^', 48, 48, drawSpikes), x, y, 48, 48); break;
        case 'L': this.lava(ctx, tx, ty, t); break;
        case '<': case '>': this.conveyor(ctx, x, y, c === '>' ? 1 : -1, t); break;
        case '1': case '2': { const red = c === '1', solid = red === W.switchRed; ctx.drawImage(this.spr('sw' + c + solid, 48, 48, g => drawSwitchBlock(g, red, solid)), x, y, 48, 48); break; }
        case '!': {
          const red = W.switchRed; ctx.drawImage(this.spr('sw!' + red, 48, 48, g => drawSwitchBlock(g, red, true)), x, y, 48, 48);
          ctx.fillStyle = '#14151f'; ell(ctx, x + 24, y + 25, 12, 12); ctx.fill(); ctx.font = FONT(22); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText('!', x + 24, y + 33);
          glow(ctx, x + 24, y + 24, 34, red ? '#ff5a6e' : '#4aa8ff', 0.35 + Math.sin(t * 5) * 0.15); this.light(x + 24, y + 24, 100, 0.8); break;
        }
        case 'T': ctx.drawImage(this.spr('T', 48, 48, g => drawMetalBlock(g, false)), x, y, 48, 48); break;
        case 'R': ctx.drawImage(this.spr('Rb', 48, 48, g => drawMetalBlock(g, true)), x, y, 48, 48); break;
      }
    }
  },
  qblock(ctx, x, y, c, t) {
    ctx.drawImage(this.spr('Q', 48, 48, drawQ), x, y, 48, 48); const b = Math.sin(t * 5 + x * 0.01) * 1.5;
    if (c === '?') { ctx.font = FONT(30); ctx.textAlign = 'center'; ctx.fillStyle = '#a85a10'; ctx.fillText('?', x + 25.5, y + 36.5 + b); ctx.fillStyle = '#ffffff'; ctx.fillText('?', x + 24, y + 35 + b); }
    else { ctx.fillStyle = '#a85a10'; starPath(ctx, x + 25.5, y + 26.5 + b, 13, 6); ctx.fill(); ctx.fillStyle = '#ffffff'; starPath(ctx, x + 24, y + 25 + b, 13, 6); ctx.fill(); }
    const k = (t * 0.7 + x * 0.0021) % 2.4;
    if (k < 1) { ctx.save(); ctx.beginPath(); ctx.rect(x + 3, y + 3, 42, 42); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.5)'; const sx = x - 14 + k * 90; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 12, y); ctx.lineTo(sx - 8, y + 48); ctx.lineTo(sx - 20, y + 48); ctx.fill(); ctx.restore(); }
    this.light(x + 24, y + 24, 70, 0.6);
  },
  lava(ctx, tx, ty, t) {
    const x = tx * TILE, y = ty * TILE, top = World.get(tx, ty - 1) !== 'L', sy = xx => y + 10 + Math.sin(t * 2.6 + xx * 0.045) * 3 + Math.sin(t * 4.1 + xx * 0.09) * 1.5;
    if (top) {
      ctx.fillStyle = vgrad(ctx, y, y + 48, [[0, '#ffd23c'], [0.3, '#ff8a1a'], [1, '#e0401a']]);
      ctx.beginPath(); ctx.moveTo(x, y + 48.5); for (let i = 0; i <= 6; i++) ctx.lineTo(x + i * 8, sy(x + i * 8)); ctx.lineTo(x + 48, y + 48.5); ctx.fill();
      ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(x + i * 8, sy(x + i * 8) + 1); ctx.stroke();
      const pc = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = vgrad(ctx, y - 70, y + 10, [[0, 'rgba(255,110,20,0)'], [1, 'rgba(255,110,20,.34)']]); ctx.fillRect(x, y - 70, 48, 80); ctx.globalCompositeOperation = pc;
      this.light(x + 24, y + 6, 170, 0.9);
      if (Math.random() < 0.012) FX.add({ type: 'circle', x: x + rand(48), y: y + 10, vy: -rand(40, 110), life: rand(0.5, 1.1), size: rand(2, 4), color: '#ffb347', add: true });
    } else { ctx.fillStyle = vgrad(ctx, y, y + 48, [[0, '#e0401a'], [1, '#a81a10']]); ctx.fillRect(x, y - 0.5, 48, 49); }
    const bx = x + 24 + Math.sin(t * 0.8 + tx * 2.1) * 14, by = y + 30 + Math.cos(t * 0.6 + tx * 1.3) * 8; ctx.fillStyle = 'rgba(255,210,90,.35)'; ell(ctx, bx, by, 9, 5); ctx.fill();
  },
  conveyor(ctx, x, y, dir, t) {
    ctx.fillStyle = '#23263a'; rrect(ctx, x, y, 48, 48, 0); ctx.fill(); ctx.fillStyle = '#3a3d55'; ctx.fillRect(x, y + 12, 48, 30);
    const a = t * 2.6 * dir; for (const gx of [12, 36]) { ctx.fillStyle = '#6a708c'; ell(ctx, x + gx, y + 27, 9.5, 9.5); ctx.fill(); ctx.strokeStyle = '#23263a'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = a + i * TAU / 3; ctx.moveTo(x + gx, y + 27); ctx.lineTo(x + gx + Math.cos(an) * 8, y + 27 + Math.sin(an) * 8); } ctx.stroke(); }
    ctx.fillStyle = '#5a5f78'; ctx.fillRect(x, y, 48, 12); ctx.fillStyle = '#8a90ac'; ctx.fillRect(x, y, 48, 2.5);
    const off = ((t * 120 * dir) % 16 + 16) % 16; ctx.save(); ctx.beginPath(); ctx.rect(x, y, 48, 12); ctx.clip(); ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    for (let i = -1; i < 4; i++) { const px = x + i * 16 + off; ctx.beginPath(); ctx.moveTo(px - 3 * dir, y + 3); ctx.lineTo(px + 3 * dir, y + 6.5); ctx.lineTo(px - 3 * dir, y + 10); ctx.stroke(); }
    ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + 42, 48, 6);
  },
  lighting(ctx, cx, cy) {
    const g = this.lg, L = this.lights, k = 0.5;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, VW / 2, VH / 2); g.fillStyle = this.dark; g.fillRect(0, 0, VW / 2, VH / 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < L.length; i += 4) { const r = L[i + 2] * k; g.globalAlpha = L[i + 3]; g.drawImage(this.lightSpr, (L[i] - cx) * k - r, (L[i + 1] - cy) * k - r, r * 2, r * 2); }
    ctx.drawImage(this.lc, 0, 0, VW, VH);
  },
  ambient(ctx, cx, cy, th, t) {
    for (const a of this.amb) {
      const WX = 1200, WY = 700;
      if (th === 'grass') { const x = ((a.x - cx * a.z - t * 40 * a.z) % WX + WX) % WX - 120, y = ((a.y - cy * a.z + t * 26 + Math.sin(t * 1.5 + a.ph) * 20) % WY + WY) % WY - 80; if (a.s > 0.7) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 * (a.s + 0.5) + a.ph); ctx.fillStyle = a.s < 0.35 ? 'rgba(255,190,215,.85)' : 'rgba(255,255,255,.8)'; ell(ctx, 0, 0, 4.5 * a.z, 2.2 * a.z); ctx.fill(); ctx.restore(); }
      else if (th === 'cave') { const x = ((a.x - cx * a.z * 0.8 + Math.sin(t * 0.6 + a.ph) * 30) % WX + WX) % WX - 120, y = ((a.y - cy * a.z * 0.8 + Math.cos(t * 0.5 + a.ph * 2) * 24) % WY + WY) % WY - 80, f = 0.5 + Math.sin(t * 2.2 + a.ph * 3) * 0.5; glow(ctx, x, y, 9 * a.z, a.s > 0.5 ? '#7ff0ff' : '#b8ffb0', f * 0.9); }
      else if (th === 'sky') { const x = ((a.x - cx * a.z - t * 18) % WX + WX) % WX - 120, y = ((a.y - cy * a.z * 0.6) % WY + WY) % WY - 80, f = 0.5 + Math.sin(t * 3 + a.ph * 4) * 0.5; if (a.s > 0.6) continue; ctx.globalAlpha = f * 0.9; ctx.fillStyle = '#fff6d8'; starPath(ctx, x, y, 3.5 * a.z, 1.3 * a.z, 4, t + a.ph); ctx.fill(); ctx.globalAlpha = 1; }
      else { const x = ((a.x - cx * a.z + Math.sin(t * 1.2 + a.ph) * 16) % WX + WX) % WX - 120, y = ((a.y - cy * a.z - t * (40 + a.s * 50)) % WY + WY) % WY - 80; glow(ctx, x, y, 5 * a.z, a.s > 0.5 ? '#ff9a3c' : '#ffd23c', 0.9); }
    }
  },
  foxIcon(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-10, -17); ctx.lineTo(-2, -9); ctx.fill(); ctx.beginPath(); ctx.moveTo(11, -4); ctx.lineTo(10, -17); ctx.lineTo(2, -9); ctx.fill();
    ell(ctx, 0, 0, 12, 10.5); ctx.fill(); ctx.fillStyle = '#fff4dc'; ell(ctx, 0, 4, 8, 5.5); ctx.fill(); ctx.fillStyle = '#2a1608'; ell(ctx, -4.5, -1, 1.7, 2.4); ctx.fill(); ell(ctx, 4.5, -1, 1.7, 2.4); ctx.fill(); ell(ctx, 0, 3, 1.6, 1.2); ctx.fill(); ctx.restore();
  },
  hud(ctx) {
    const p = Game.player, t = Game.t; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(20,10,48,.35)'; rrect(ctx, 12, 10, 236, 76, 16); ctx.fill(); rrect(ctx, VW - 196, 10, 184, 62, 16); ctx.fill();
    for (let i = 0; i < p.maxHp; i++) {
      const x = 36 + i * 32, y = 33, full = i < p.hp, s = 11 * (full && i === p.hp - 1 ? 1 + Math.max(0, Math.sin(t * 6)) * 0.12 : 1);
      ctx.fillStyle = '#1a1030'; heartPath(ctx, x, y + 1, s + 3); ctx.fill(); ctx.fillStyle = full ? '#ff4d6e' : '#4a4466'; heartPath(ctx, x, y, s); ctx.fill();
      if (full) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ell(ctx, x - s * 0.45, y - s * 0.35, s * 0.25, s * 0.16, -0.6); ctx.fill(); }
    }
    if (p.fire) { glow(ctx, 148, 32, 20, '#ffb347', 0.8); ctx.fillStyle = '#ffb21a'; starPath(ctx, 148, 32, 11, 5, 5, t * 3); ctx.fill(); ctx.fillStyle = '#fffbe0'; starPath(ctx, 148, 32, 6, 2.8, 5, t * 3); ctx.fill(); }
    // ダッシュゲージ
    ctx.fillStyle = '#1a1030'; rrect(ctx, 172, 24, 62, 14, 7); ctx.fill(); const dk = p.canDash ? 1 : clamp(1 - p.dashCD / 0.3, 0, 0.6);
    ctx.fillStyle = p.canDash ? '#5ae0ff' : '#4a6a88'; rrect(ctx, 175, 27, 56 * dk, 8, 4); ctx.fill(); ctx.font = FONT(9); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText('DASH', 203, 21);
    this.foxIcon(ctx, 36, 66, 0.85); ctx.font = FONT(18); ctx.textAlign = 'left'; otext(ctx, '×' + Math.max(0, Game.lives), 52, 73, '#ffffff', '#1a1030', 4);
    const cw = Math.abs(Math.cos(t * 3)) * 8 + 2; ctx.fillStyle = '#c98a10'; ell(ctx, 122, 67, cw, 10); ctx.fill(); ctx.fillStyle = '#ffd23c'; ell(ctx, 122, 66, cw, 10); ctx.fill(); ctx.fillStyle = '#fff3a8'; ell(ctx, 121, 65, cw * 0.55, 6.5); ctx.fill();
    otext(ctx, '×' + String(Game.coins).padStart(2, '0'), 137, 73, '#ffe9a8', '#1a1030', 4);
    // スターコイン
    const n = World.starTotal; if (n > 0) { ctx.fillStyle = 'rgba(20,10,48,.35)'; rrect(ctx, VW / 2 - n * 22 - 10, 10, n * 44 + 20, 46, 16); ctx.fill(); }
    for (let i = 0; i < n; i++) {
      const got = Game.stars[World.idx][i], x = VW / 2 + (i - (n - 1) / 2) * 44, y = 33, pop = got ? 1 + Game.starPop * 0.5 : 1;
      ctx.fillStyle = '#1a1030'; starPath(ctx, x, y + 1, 19 * pop, 9.5 * pop); ctx.fill();
      if (got) { glow(ctx, x, y, 26, '#ffe27a', 0.5); const g = ctx.createLinearGradient(0, y - 15, 0, y + 15); g.addColorStop(0, '#fff6a8'); g.addColorStop(1, '#ffb21a'); ctx.fillStyle = g; } else ctx.fillStyle = '#4a4466';
      starPath(ctx, x, y, 15 * pop, 7.5 * pop); ctx.fill();
    }
    ctx.textAlign = 'right'; ctx.font = FONT(24); otext(ctx, String(Game.score).padStart(7, '0'), VW - 24, 39, '#ffffff', '#1a1030', 5);
    const tm = Math.floor(Game.time); ctx.font = FONT(15); otext(ctx, 'TIME ' + Math.floor(tm / 60) + ':' + String(tm % 60).padStart(2, '0'), VW - 24, 62, '#ffe9a8', '#1a1030', 4);
    ctx.textAlign = 'left'; ctx.font = FONT(13); otext(ctx, World.def.sub, VW - 186, 62, '#9fe8ff', '#1a1030', 4);
    // ボスHP
    const b = World.boss;
    if (b && b.state !== 'sleep') {
      const w = 420, x = VW / 2 - w / 2, y = VH - 38; ctx.fillStyle = 'rgba(20,6,12,.75)'; rrect(ctx, x - 6, y - 6, w + 12, 26, 13); ctx.fill();
      ctx.fillStyle = '#3a1418'; rrect(ctx, x, y, w, 14, 7); ctx.fill(); const k = b.hp / b.maxHp;
      if (k > 0) { ctx.fillStyle = vgrad(ctx, y, y + 14, [[0, b.phase2 ? '#ffd23c' : '#ff8a5a'], [1, b.phase2 ? '#ff5a1a' : '#e0301a']]); rrect(ctx, x, y, Math.max(14, w * k), 14, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rrect(ctx, x + 4, y + 2, Math.max(6, w * k - 8), 4, 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; for (let i = 1; i < b.maxHp; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / b.maxHp, y); ctx.lineTo(x + w * i / b.maxHp, y + 14); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.font = FONT(15); otext(ctx, b.name, VW / 2, y - 12, '#ffd9c8', '#1a0508', 4);
    }
  }
};
