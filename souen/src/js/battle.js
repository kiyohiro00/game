'use strict';
const Battle = (() => {
  let S = null;
  const MELEE = { sword: 1, lance: 1, axe: 1 };
  const sfx = (n) => { if (typeof Snd !== 'undefined') Snd.play(n); };
  const BP = (u, over) => Object.assign(Spr.pose(u), { heroic: true }, over || {});

  // ---------------- pose helpers ----------------
  function kf(unit, name) {
    const p = BP(unit);
    const wt = (WEAPONS[unit.weapon] || {}).type;
    switch (name) {
      case 'ready':
        if (MELEE[wt]) Object.assign(p, { lean: 0.14, crouch: 2.5, fF: [7, 0], fB: [-7, 0] });
        break;
      case 'wind':
        if (wt === 'sword') Object.assign(p, { armF: [2.75, 3.15], wa: 3.8, lean: -0.14, crouch: 3, fF: [7, 0], fB: [-7, 0] });
        else if (wt === 'axe') Object.assign(p, { armF: [3.0, 3.35], wa: 4.0, lean: -0.22, crouch: 3, fF: [7, 0], fB: [-7, 0] });
        else Object.assign(p, { armF: [0.45, 1.45], wa: Math.PI / 2 + 0.06, lean: 0.0, crouch: 3.5, fF: [8, 0], fB: [-8, 0] });
        break;
      case 'strike':
        if (wt === 'sword') Object.assign(p, { armF: [1.35, 0.95], wa: 0.55, lean: 0.42, crouch: 6, fF: [12, 0], fB: [-10, 0] });
        else if (wt === 'axe') Object.assign(p, { armF: [1.15, 0.55], wa: 0.25, lean: 0.5, crouch: 7, fF: [12, 0], fB: [-10, 0] });
        else Object.assign(p, { armF: [1.52, 1.57], wa: Math.PI / 2, lean: 0.34, crouch: 4.5, fF: [13, 0], fB: [-11, 0] });
        break;
      case 'aim': Object.assign(p, { armF: [1.5, 1.56], wa: Math.PI / 2, armB: [1.35, 2.75], draw: 1, arrow: true, lean: 0.0, fF: [7, 0], fB: [-7, 0], crouch: 1.5 }); break;
      case 'release': Object.assign(p, { armF: [1.5, 1.56], wa: Math.PI / 2, armB: [1.0, 0.7], draw: 0, arrow: false, lean: -0.06, fF: [7, 0], fB: [-7, 0], crouch: 1.5 }); break;
      case 'cast': Object.assign(p, { armF: [2.15, 2.75], armB: [1.25, 1.75], cast: 1, lean: -0.08, fF: [6, 0], fB: [-6, 0] }); break;
      case 'raise': Object.assign(p, { armF: [2.55, 3.0], wa: Math.PI, cast: 1, lean: -0.06 }); break;
      case 'hurt': Object.assign(p, { lean: -0.32, crouch: 3, fF: [6, 0], fB: [-4, 0] }); p.armF[0] -= 0.3; p.armB[0] -= 0.45; break;
      case 'dodge': Object.assign(p, { lean: -0.45, crouch: 7, fF: [1, 0], fB: [-13, 0] }); p.armF[0] -= 0.35; break;
    }
    return p;
  }
  const NUMK = ['lean', 'crouch', 'wa', 'cast', 'draw', 'rear'];
  function blend(f, a, b, k) {
    const p = f.pose;
    for (const n of NUMK) p[n] = lerp(a[n] || 0, b[n] || 0, k);
    for (const n of ['armF', 'armB', 'fF', 'fB']) { p[n][0] = lerp(a[n][0], b[n][0], k); p[n][1] = lerp(a[n][1], b[n][1], k); }
    p.arrow = k < 0.5 ? a.arrow : b.arrow;
  }
  function snap(f, b) { blend(f, b, b, 1); f.pose.arrow = b.arrow; }

  // ---------------- background painting ----------------
  function groundMat(tid) {
    return ({ plain: 'grass', village: 'grass', forest: 'forest', road: 'dirt', fort: 'dirt', rubble: 'dirt', hill: 'rock', peak: 'rock', bridge: 'wood', floor: 'stone', carpet: 'carpet', throne: 'carpet', gate: 'stone', pillar: 'stone' })[tid] || 'grass';
  }
  function paintSky(c, W, H, hz, dusk) {
    const g = c.createLinearGradient(0, 0, 0, hz);
    if (dusk) { g.addColorStop(0, '#1d1638'); g.addColorStop(0.45, '#6a335e'); g.addColorStop(0.8, '#d9705a'); g.addColorStop(1, '#f6b36a'); }
    else { g.addColorStop(0, '#2a5a9e'); g.addColorStop(0.5, '#6f9fd2'); g.addColorStop(0.85, '#c4d8ea'); g.addColorStop(1, '#efe8d6'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sx = dusk ? W * 0.74 : W * 0.2, sy = dusk ? hz * 0.84 : hz * 0.16;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, W * 0.5);
    sg.addColorStop(0, dusk ? 'rgba(255,220,150,0.95)' : 'rgba(255,252,235,0.95)'); sg.addColorStop(0.07, dusk ? 'rgba(255,170,90,0.55)' : 'rgba(255,248,220,0.4)'); sg.addColorStop(1, 'rgba(255,200,150,0)');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    if (dusk) { c.fillStyle = '#ffe2a8'; c.beginPath(); c.arc(sx, sy, W * 0.03, 0, TAU); c.fill(); }
    // high cirrus streaks
    c.save(); c.globalAlpha = dusk ? 0.35 : 0.5;
    const r = mulberry32(31);
    for (let i = 0; i < 18; i++) {
      const y = hz * (0.08 + r() * 0.45), x = r() * W, w = W * (0.12 + r() * 0.25);
      const lg = c.createLinearGradient(x, 0, x + w, 0);
      const col = dusk ? '255,190,170' : '255,255,255';
      lg.addColorStop(0, `rgba(${col},0)`); lg.addColorStop(0.5, `rgba(${col},0.55)`); lg.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = lg; c.fillRect(x, y, w, 1.5 + r() * 3);
    }
    c.restore();
  }
  function ridgeLayer(c, W, hz, base, amp, freq, col, nz, seed, snow, lit) {
    const pts = [];
    c.beginPath(); c.moveTo(0, hz + 80);
    for (let x = 0; x <= W; x += 3) {
      const y = base - amp * (nz.ridge(x * freq + seed, seed * 0.37, 4) * 0.8 + nz.fbm(x * freq * 3 + seed, 7, 3) * 0.3);
      pts.push(x, y); c.lineTo(x, y);
    }
    c.lineTo(W, hz + 80); c.closePath();
    const g = c.createLinearGradient(0, base - amp, 0, hz + 40);
    g.addColorStop(0, shade(col, 0.08)); g.addColorStop(1, shade(col, -0.18));
    c.fillStyle = g; c.fill();
    if (lit) { // sunlit slopes
      c.save(); c.clip();
      c.strokeStyle = lit; c.lineWidth = 2;
      for (let i = 2; i < pts.length; i += 2) if (pts[i + 1] < pts[i - 1]) { c.beginPath(); c.moveTo(pts[i - 2], pts[i - 1]); c.lineTo(pts[i], pts[i + 1]); c.lineTo(pts[i] + 6, pts[i + 1] + 18); c.stroke(); }
      c.restore();
    }
    if (snow) {
      c.beginPath();
      for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      for (let i = pts.length - 2; i >= 0; i -= 2) c.lineTo(pts[i], Math.max(pts[i + 1], Math.min(pts[i + 1] + amp * 0.22, base - amp * 0.62)));
      c.closePath(); c.fillStyle = snow; c.fill();
    }
  }
  function treeLine(c, W, y, h, col, seed, dense, hi) {
    const r = mulberry32(seed);
    for (let x = -20; x < W + 20; x += (dense ? 9 : 22) * (0.6 + r())) {
      const th = h * (0.6 + r() * 0.6);
      c.fillStyle = col;
      if (r() < 0.5) { c.beginPath(); c.moveTo(x - th * 0.28, y); c.lineTo(x, y - th); c.lineTo(x + th * 0.28, y); c.fill(); if (hi) { c.fillStyle = hi; c.beginPath(); c.moveTo(x - th * 0.26, y - 2); c.lineTo(x, y - th); c.lineTo(x - th * 0.04, y - 2); c.fill(); } }
      else { c.beginPath(); c.arc(x, y - th * 0.55, th * 0.38, 0, TAU); c.arc(x + th * 0.2, y - th * 0.4, th * 0.3, 0, TAU); c.fill(); if (hi) { c.fillStyle = hi; c.beginPath(); c.arc(x - th * 0.12, y - th * 0.68, th * 0.18, 0, TAU); c.fill(); } }
    }
    c.fillStyle = col; c.fillRect(0, y - 2, W, h);
  }
  function paintGround(c, W, H, hz, mat, dusk) {
    const near = H;
    const cols = {
      grass: ['#6f9446', '#44702a', '#22401a'], forest: ['#4c6e36', '#2c4a22', '#162a12'], dirt: ['#b08c5c', '#8a6a44', '#4c3a28'],
      rock: ['#938a7e', '#6c665c', '#3a3732'], wood: ['#946a3e', '#6a4626', '#2e1e10'], stone: ['#8e897f', '#66625a', '#2e2c28'], carpet: ['#8e897f', '#66625a', '#2e2c28'],
    }[mat];
    const g = c.createLinearGradient(0, hz, 0, near);
    g.addColorStop(0, cols[0]); g.addColorStop(0.35, cols[1]); g.addColorStop(1, cols[2]);
    c.fillStyle = g; c.fillRect(0, hz, W, near - hz);
    const vx = W / 2, r = mulberry32(99 + mat.length);
    if (mat === 'grass' || mat === 'forest') {
      // light patches
      for (let i = 0; i < 40; i++) {
        const t = r(), y = hz + t * t * (near - hz), x = r() * W, s = 20 + t * 200;
        const pg = c.createRadialGradient(x, y, 0, x, y, s);
        pg.addColorStop(0, r() < 0.5 ? 'rgba(200,230,120,0.18)' : 'rgba(10,30,10,0.2)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = pg; c.beginPath(); c.ellipse(x, y, s, s * 0.25, 0, 0, TAU); c.fill();
      }
      for (let i = 0; i < 4200; i++) {
        const t = Math.pow(r(), 1.6), y = hz + t * (near - hz), x = r() * W, s = 1.2 + t * 12;
        c.strokeStyle = r() < 0.5 ? (mat === 'forest' ? 'rgba(120,160,80,0.5)' : 'rgba(180,215,110,0.55)') : 'rgba(16,36,12,0.5)';
        c.lineWidth = 0.6 + t * 1.8; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - .5) * s * 0.3, y - s * 0.6, x + (r() - .5) * s * 0.7, y - s); c.stroke();
      }
      if (mat === 'grass') for (let i = 0; i < 160; i++) { const t = r(), y = hz + t * (near - hz), x = r() * W; c.fillStyle = ['#f4f1e6', '#f2d04b', '#c98ad8', '#e8765a'][i % 4]; c.beginPath(); c.arc(x, y, 0.8 + t * 2.4, 0, TAU); c.fill(); }
    } else if (mat === 'dirt' || mat === 'rock') {
      for (let i = 0; i < 2200; i++) {
        const t = Math.pow(r(), 1.4), y = hz + t * (near - hz), x = r() * W, s = 0.5 + t * (mat === 'rock' ? 10 : 4);
        c.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.22)' : 'rgba(30,20,10,0.3)';
        c.beginPath(); c.ellipse(x, y, s, s * 0.45, 0, 0, TAU); c.fill();
      }
      // wheel ruts / cracks converge to vanishing point
      c.strokeStyle = 'rgba(40,26,14,0.12)'; c.lineWidth = 5;
      for (const k of [-0.25, 0.25]) { c.beginPath(); c.moveTo(vx + k * 40, hz); c.lineTo(vx + k * W * 0.9, near); c.stroke(); }
      if (mat === 'rock') for (let i = 0; i < 50; i++) { const t = r(), y = hz + t * (near - hz), x = r() * W, s = 6 + t * 34; const rg = c.createLinearGradient(x, y - s * 0.4, x, y); rg.addColorStop(0, '#a8a094'); rg.addColorStop(1, '#4a4640'); c.fillStyle = rg; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s * 0.3, y - s * 0.45); c.lineTo(x + s * 0.5, y - s * 0.35); c.lineTo(x + s, y); c.fill(); }
    } else if (mat === 'wood') {
      c.strokeStyle = 'rgba(30,18,8,0.6)';
      for (let i = -60; i <= 60; i++) { c.lineWidth = 1.2; c.beginPath(); c.moveTo(vx + i * 4, hz); c.lineTo(vx + i * 60, near); c.stroke(); }
      for (let i = 0; i < 500; i++) { const t = r(), y = hz + t * (near - hz), x = r() * W; c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(x, y, 2 + t * 30, 1 + t); }
    } else {
      // flagstones in perspective
      c.lineWidth = 1.3;
      for (let i = -50; i <= 50; i++) { c.strokeStyle = 'rgba(20,18,14,0.6)'; c.beginPath(); c.moveTo(vx + i * 14, hz); c.lineTo(vx + i * 150, near); c.stroke(); }
      let y = hz, step = 5;
      while (y < near) { c.strokeStyle = 'rgba(20,18,14,0.6)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.strokeStyle = 'rgba(255,245,225,0.12)'; c.beginPath(); c.moveTo(0, y + 1.5); c.lineTo(W, y + 1.5); c.stroke(); y += step; step *= 1.33; }
      // polished reflection
      const rg = c.createLinearGradient(0, hz, 0, hz + (near - hz) * 0.5);
      rg.addColorStop(0, dusk ? 'rgba(255,170,110,0.25)' : 'rgba(230,240,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg; c.fillRect(0, hz, W, near - hz);
      if (mat === 'carpet') {
        c.beginPath(); c.moveTo(vx - 30, hz); c.lineTo(vx + 30, hz); c.lineTo(vx + W * 0.16, near); c.lineTo(vx - W * 0.16, near); c.closePath();
        const cg = c.createLinearGradient(0, hz, 0, near); cg.addColorStop(0, '#5a1018'); cg.addColorStop(1, '#a3202c');
        c.fillStyle = cg; c.fill();
        c.strokeStyle = '#d4ad55'; c.lineWidth = 3; c.beginPath(); c.moveTo(vx - 26, hz); c.lineTo(vx - W * 0.15, near); c.moveTo(vx + 26, hz); c.lineTo(vx + W * 0.15, near); c.stroke();
      }
    }
    const hg = c.createLinearGradient(0, hz, 0, hz + (near - hz) * 0.35);
    hg.addColorStop(0, dusk ? 'rgba(220,130,100,0.5)' : 'rgba(210,225,235,0.5)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = hg; c.fillRect(0, hz, W, near - hz);
  }
  function paintHall(c, W, H, hz, dusk) {
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#141110'); g.addColorStop(1, '#5a5248');
    c.fillStyle = g; c.fillRect(0, 0, W, hz + 2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    const bh = Math.max(14, H * 0.035);
    for (let y = hz, r = 0; y > 0; y -= bh, r++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (r % 2) * bh * 1.2; x < W; x += bh * 2.4) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - bh); c.stroke(); } }
    const n = Math.max(4, Math.round(W / 300));
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * W / n, ww = Math.min(W / n * 0.34, 120), top = hz * 0.12, bot = hz * 0.72;
      c.save(); c.beginPath(); c.moveTo(cx - ww / 2, bot); c.lineTo(cx - ww / 2, top + ww / 2); c.arc(cx, top + ww / 2, ww / 2, Math.PI, 0); c.lineTo(cx + ww / 2, bot); c.closePath();
      const wg = c.createLinearGradient(0, top, 0, bot);
      if (dusk) { wg.addColorStop(0, '#5a2d5a'); wg.addColorStop(1, '#f2a060'); } else { wg.addColorStop(0, '#9cc4ec'); wg.addColorStop(1, '#eaf2f8'); }
      c.fillStyle = wg; c.fill(); c.lineWidth = 6; c.strokeStyle = '#2e2a26'; c.stroke();
      c.clip(); c.strokeStyle = '#2e2a26'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, top); c.lineTo(cx, bot); for (let k = 1; k < 4; k++) { c.moveTo(cx - ww, top + k * (bot - top) / 4); c.lineTo(cx + ww, top + k * (bot - top) / 4); } c.stroke();
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter';
      const sg = c.createLinearGradient(cx, bot, cx + ww * 1.5, H);
      sg.addColorStop(0, dusk ? 'rgba(255,160,90,0.24)' : 'rgba(255,250,230,0.2)'); sg.addColorStop(1, 'rgba(255,200,150,0)');
      c.fillStyle = sg; c.beginPath(); c.moveTo(cx - ww / 2, top + ww / 2); c.lineTo(cx + ww / 2, top + ww / 2); c.lineTo(cx + ww * 2.6, H); c.lineTo(cx + ww * 0.2, H); c.closePath(); c.fill();
      c.restore();
      if (i > 0) {
        const bx = i * W / n, bw = Math.min(46, W / n * 0.14);
        const bgc = c.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0); bgc.addColorStop(0, '#4a0c14'); bgc.addColorStop(0.5, '#9a1e2a'); bgc.addColorStop(1, '#4a0c14');
        c.fillStyle = bgc; c.beginPath(); c.moveTo(bx - bw / 2, hz * 0.05); c.lineTo(bx + bw / 2, hz * 0.05); c.lineTo(bx + bw / 2, hz * 0.6); c.lineTo(bx, hz * 0.52); c.lineTo(bx - bw / 2, hz * 0.6); c.closePath(); c.fill();
        c.strokeStyle = '#d4ad55'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#d4ad55'; c.beginPath(); c.arc(bx, hz * 0.25, bw * 0.25, 0, TAU); c.fill();
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, hz - 4, W, 6);
  }
  function blurCv(cv, f) {
    if (f <= 1) return cv;
    const s = makeCanvas(cv.width / f, cv.height / f), sx = s.getContext('2d');
    sx.imageSmoothingQuality = 'high'; sx.drawImage(cv, 0, 0, s.width, s.height);
    const o = makeCanvas(cv.width, cv.height), ox = o.getContext('2d');
    ox.imageSmoothingQuality = 'high'; ox.drawImage(s, 0, 0, o.width, o.height);
    return o;
  }
  function layer(w, h, dpr, fn) { const cv = makeCanvas(w * dpr, h * dpr), c = cv.getContext('2d'); c.scale(dpr, dpr); fn(c); return { cv, w, h }; }
  function buildLayers(W, H, dpr) {
    const LW = W * 1.8, OX = -W * 0.4, hz = S.hz, dusk = S.dusk, nz = makeNoise(77), ld = Math.min(dpr, 1.5);
    const L = { LW, OX };
    L.sky = layer(W, H, Math.min(dpr, 1), c => { if (!S.indoor) paintSky(c, W, H, hz, dusk); else { c.fillStyle = '#0c0a09'; c.fillRect(0, 0, W, H); } });
    L.far = layer(LW, hz + 60, ld, c => {
      if (S.indoor) paintHall(c, LW, H, hz, dusk);
      else {
        const haze = dusk ? ['#7a5a8a', '#5a3e6a'] : ['#9fb6d0', '#7895b2'];
        ridgeLayer(c, LW, hz, hz * 0.78, hz * 0.45, 0.0035, haze[0], nz, 11, dusk ? 'rgba(255,200,190,0.6)' : 'rgba(250,252,255,0.9)', dusk ? 'rgba(255,170,120,0.25)' : 'rgba(255,255,240,0.25)');
        ridgeLayer(c, LW, hz, hz * 0.92, hz * 0.3, 0.005, haze[1], nz, 23, null, null);
      }
    });
    L.far.cv = blurCv(L.far.cv, S.indoor ? 2 : 2.5);
    L.mid = layer(LW, hz + 60, ld, c => {
      if (S.indoor) return;
      const theme = S.theme, mid = dusk ? '#4a3a40' : '#5a7650';
      if (theme === 'rock') ridgeLayer(c, LW, hz, hz * 0.98, hz * 0.4, 0.01, dusk ? '#4e3a3a' : '#7a7064', nz, 41, null, dusk ? 'rgba(255,160,110,0.35)' : 'rgba(255,250,230,0.35)');
      else ridgeLayer(c, LW, hz, hz * 1.0, hz * 0.13, 0.005, mid, nz, 31, null, null);
      if (theme === 'forest') { treeLine(c, LW, hz + 6, hz * 0.45, dusk ? '#2a2026' : '#2e4a2a', 5, true, dusk ? 'rgba(255,150,100,0.2)' : 'rgba(170,210,120,0.3)'); treeLine(c, LW, hz + 16, hz * 0.62, dusk ? '#1a1418' : '#1c321e', 9, true, null); }
      else if (theme === 'grass' || theme === 'village' || theme === 'bridge') treeLine(c, LW, hz + 3, hz * 0.2, dusk ? '#3a2a30' : '#40603a', 3, false, dusk ? 'rgba(255,150,100,0.25)' : 'rgba(170,210,120,0.35)');
      if (theme === 'village') {
        const r = mulberry32(4);
        for (let i = 0; i < 9; i++) {
          const x = LW * (0.05 + i * 0.11 + r() * 0.03), s = hz * (0.07 + r() * 0.04), y = hz + 4;
          c.fillStyle = dusk ? '#3a2a2a' : '#c9b89a'; c.fillRect(x - s, y - s, s * 2, s);
          c.fillStyle = dusk ? '#2a1a1e' : '#8a3a2a'; c.beginPath(); c.moveTo(x - s * 1.25, y - s); c.lineTo(x, y - s * 1.9); c.lineTo(x + s * 1.25, y - s); c.fill();
          c.fillStyle = '#ffd27a'; c.fillRect(x - s * 0.4, y - s * 0.7, s * 0.3, s * 0.3);
        }
      } else if (theme === 'fort') {
        const y = hz + 4, h = hz * 0.24, x0 = LW * 0.36, x1 = LW * 0.64;
        c.fillStyle = dusk ? '#3a3036' : '#9a9486'; c.fillRect(x0, y - h, x1 - x0, h);
        for (let x = x0; x < x1; x += 10) c.fillRect(x, y - h - 5, 6, 5);
        for (const tx of [x0, x1]) { c.fillStyle = dusk ? '#3a3036' : '#9a9486'; c.fillRect(tx - 14, y - h * 1.6, 28, h * 1.6); c.fillStyle = dusk ? '#2a1e2a' : '#3e5f8c'; c.beginPath(); c.moveTo(tx - 18, y - h * 1.6); c.lineTo(tx, y - h * 2.3); c.lineTo(tx + 18, y - h * 1.6); c.fill(); }
      } else if (theme === 'bridge') {
        const rg = c.createLinearGradient(0, hz, 0, hz + 30); rg.addColorStop(0, dusk ? '#c87a6a' : '#a8cce0'); rg.addColorStop(1, dusk ? '#4a2a3a' : '#2e5a78');
        c.fillStyle = rg; c.fillRect(0, hz - 2, LW, 30);
      }
    });
    L.mid.cv = blurCv(L.mid.cv, 1.6);
    L.ground = layer(LW, H + 80, ld, c => {
      paintGround(c, LW, H + 80, hz, S.matL, dusk);
      if (S.matR !== S.matL) {
        const b = layer(LW, H + 80, ld, bc => {
          paintGround(bc, LW, H + 80, hz, S.matR, dusk);
          bc.globalCompositeOperation = 'destination-in';
          const mg = bc.createLinearGradient(LW * 0.44, 0, LW * 0.56, 0); mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(0,0,0,1)');
          bc.fillStyle = mg; bc.fillRect(0, 0, LW, H + 80);
        });
        c.drawImage(b.cv, 0, 0, LW, H + 80);
      }
    });
    // foreground (depth-of-field)
    L.fg = layer(LW, H + 80, Math.min(dpr, 1), c => {
      const r = mulberry32(5);
      if (S.indoor) {
        for (const px of [LW * 0.16, LW * 0.84]) {
          const pw = W * 0.11;
          const pg = c.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
          pg.addColorStop(0, '#1a1714'); pg.addColorStop(0.3, '#6a645a'); pg.addColorStop(0.6, '#3a3630'); pg.addColorStop(1, '#0e0c0a');
          c.fillStyle = pg; c.fillRect(px - pw / 2, 0, pw, H + 80);
        }
      } else {
        for (let i = 0; i < 26; i++) {
          const x = r() < 0.5 ? r() * LW * 0.3 : LW * 0.7 + r() * LW * 0.3, y = H * (0.95 + r() * 0.1), h = H * (0.08 + r() * 0.16);
          c.strokeStyle = S.theme === 'rock' ? '#2a2622' : (dusk ? '#1a1214' : '#1c2e14'); c.lineWidth = 6 + r() * 8; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - .5) * h * 0.6, y - h * 0.6, x + (r() - .5) * h, y - h); c.stroke();
        }
      }
    });
    L.fg.cv = blurCv(L.fg.cv, 6);
    // drifting clouds
    if (!S.indoor) L.clouds = layer(W * 2, H * 0.45, 1, c => {
      const r = mulberry32(12);
      for (let i = 0; i < 14; i++) {
        const cx = r() * W * 2, cy = H * (0.06 + r() * 0.22), s = H * (0.04 + r() * 0.06);
        for (let k = 0; k < 10; k++) {
          const x = cx + (r() - .5) * s * 4, y = cy + (r() - .5) * s * 0.8, rr = s * (0.6 + r() * 0.8);
          const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.4, 0, x, y, rr);
          if (dusk) { g.addColorStop(0, 'rgba(255,190,150,0.5)'); g.addColorStop(0.6, 'rgba(160,90,130,0.28)'); g.addColorStop(1, 'rgba(120,60,110,0)'); }
          else { g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.55, 'rgba(225,235,248,0.42)'); g.addColorStop(1, 'rgba(200,215,235,0)'); }
          c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
        }
      }
    });
    return L;
  }

  // ---------------- setup ----------------
  function start(o) {
    return new Promise(resolve => {
      const W = o.W, H = o.H;
      const sc = Math.min(H * 0.0056, W * 0.0047);
      const leftU = o.att.team === 'player' ? o.def : o.att, rightU = leftU === o.att ? o.def : o.att;
      const gap = o.dist >= 2 ? 0.27 : 0.15;
      S = {
        W, H, sc, dpr: o.dpr, t: 0, resolve, done: false, dusk: o.time === 'dusk',
        groundY: H * 0.665, intro: 0, outro: 0, shake: 0, flash: 0, flashCol: '255,255,255', hitstop: 0, dim: 0,
        particles: [], fx: [], texts: [], projs: [], ghosts: [], speed: 1, slow: 0, rounds: o.rounds, heal: o.heal,
        fc: o.forecast, cam: { x: 0, z: 1, tx: 0, tz: 1, k: 3 }, cutin: null, track: null,
      };
      S.hz = S.groundY - 44 * sc;
      S.fy = S.groundY - 34 * sc;
      const tL = TERRAIN[o.terrain[leftU.uid]] || TERRAIN['.'], tR = TERRAIN[o.terrain[rightU.uid]] || TERRAIN['.'];
      S.matL = groundMat(tL.id); S.matR = groundMat(tR.id);
      const defT = TERRAIN[o.terrain[o.def.uid]] || TERRAIN['.'];
      const inside = id => ['floor', 'carpet', 'throne', 'gate', 'pillar'].includes(id);
      S.indoor = inside(defT.id) || (inside(tL.id) && inside(tR.id));
      if (S.indoor) { if (!inside(tL.id)) S.matL = 'stone'; if (!inside(tR.id)) S.matR = 'stone'; }
      S.theme = ({ forest: 'forest', hill: 'rock', peak: 'rock', village: 'village', fort: 'fort', bridge: 'bridge', rubble: 'fort' })[defT.id] || 'grass';
      const mk = (u, side) => {
        const homeX = side < 0 ? W * (0.5 - gap) : W * (0.5 + gap);
        return { unit: u, side, facing: side < 0 ? 1 : -1, homeX, x: homeX, kx: 0, vx: 0, lastX: homeX, hp: o.hp[u.uid], maxhp: u.maxhp, hpShown: o.hp[u.uid], hpTrail: o.hp[u.uid], flash: 0, alpha: 1, aura: 0, pose: kf(u, 'ready'), idle: true, t: Math.random() * 3, trail: [], trailOn: false };
      };
      S.L = mk(leftU, -1); S.R = mk(rightU, 1);
      S.byUid = { [leftU.uid]: S.L, [rightU.uid]: S.R };
      S.layers = buildLayers(W, H, o.dpr);
      S.scratch = makeCanvas(150 * sc * o.dpr, 140 * sc * o.dpr);
      S.rim = makeCanvas(S.scratch.width, S.scratch.height);
      const dd = Math.max(2, 1.4 * sc * o.dpr * 0.6);
      S.rimOff = S.indoor ? [0, dd] : S.dusk ? [-dd, dd * 0.6] : [dd, dd * 0.6];
      S.rimCol = S.indoor ? (S.dusk ? 'rgba(255,170,110,0.8)' : 'rgba(255,240,215,0.65)') : S.dusk ? 'rgba(255,165,95,0.95)' : 'rgba(255,248,225,0.85)';
      S.portraits = {};
      for (const f of [S.L, S.R]) S.portraits[f.unit.uid] = typeof portraitImage === 'function' ? portraitImage(f.unit) : null;
      // opening camera: start close on the attacker
      const a = S.byUid[o.att.uid];
      S.cam.x = (a.x - W / 2) * 0.7; S.cam.z = 1.32; S.cam.tx = 0; S.cam.tz = 1; S.cam.k = 2.2;
      S.co = main();
    });
  }

  // ---------------- timeline ----------------
  function* tw(dur, fn) { let t = 0; fn(0); while (t < dur) { const dt = yield; t += dt; fn(Math.min(1, t / dur)); } }
  function camTo(x, z, k = 4) { S.cam.tx = x; S.cam.tz = z; S.cam.k = k; }
  function camOn(f, z, k, bias = 0.65) { camTo((f.x + f.kx - S.W / 2) * bias, z, k); }
  function camMid(a, b, z, k) { camTo(((a.x + a.kx + b.x + b.kx) / 2 - S.W / 2) * 0.9, z, k); }
  function* main() {
    yield* tw(0.55, k => S.intro = Ease.outCubic(k));
    yield 0.15;
    for (const r of S.rounds) {
      const a = S.byUid[r.att], d = S.byUid[r.def];
      yield* strike(a, d, r);
      if (d.hp <= 0) { yield* die(d); break; }
      camTo(0, 1, 3);
      yield 0.2;
    }
    camTo(0, 1, 2.5);
    yield 0.55;
    yield* tw(0.4, k => S.outro = k);
    S.done = true;
  }
  function wtype(f) { return (WEAPONS[f.unit.weapon] || {}).type; }
  function mh(f) { return CLASSES[f.unit.cls].mount ? 18 : 0; }
  function chest(f) { return [f.x + f.kx, S.groundY - (39 + mh(f)) * S.sc]; }
  function handPos(f) { return [f.x + f.kx + f.facing * 18 * S.sc, S.groundY - (46 + mh(f)) * S.sc]; }

  function* strike(a, d, r) {
    const wt = wtype(a);
    if (r.heal) { yield* healAnim(a, d, r); return; }
    if (r.crit) yield* cutin(a);
    if (MELEE[wt]) yield* melee(a, d, r);
    else if (wt === 'bow') yield* bow(a, d, r);
    else yield* magic(a, d, r);
    a.aura = 0; S.dim = 0;
  }
  function* cutin(a) {
    sfx('charge');
    a.idle = false;
    camOn(a, 1.25, 3);
    const base = BP(a.unit), crouch = kf(a.unit, 'wind');
    S.cutin = { f: a, t: 0, dur: 1.15 };
    yield* tw(1.15, k => {
      S.cutin.t = k * S.cutin.dur;
      a.aura = Math.min(1, k * 2); S.dim = Math.min(0.6, k * 1.2);
      blend(a, base, crouch, Ease.outCubic(Math.min(1, k * 1.5)) * 0.45);
      a.pose.glint = Math.sin(k * Math.PI);
      if (Math.random() < 0.9) {
        const [cx, cy] = chest(a), ang = Math.random() * TAU, rr = 80 * S.sc;
        S.particles.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, tx: cx, ty: cy, life: 0, max: 0.35, size: 2 + Math.random() * 2, col: '255,230,150', home: true, glow: true });
      }
    });
    S.cutin = null;
    S.flash = 0.7; S.flashCol = '255,248,230';
    a.pose.glint = 0;
  }
  function* melee(a, d, r) {
    a.idle = false;
    const sc = S.sc, dir = a.facing, wt = wtype(a);
    const mounted = !!CLASSES[a.unit.cls].mount;
    const reach = (wt === 'lance' ? 52 : 40) * sc + (mounted ? 16 * sc : 0);
    const k0 = kf(a.unit, 'ready'), k1 = kf(a.unit, 'wind'), k2 = kf(a.unit, 'strike');
    const fast = r.crit ? 0.65 : 1;
    camOn(a, 1.14, 4);
    yield* tw(0.22 * fast, k => blend(a, k0, k1, Ease.outCubic(k)));
    const sx = a.x, tx = d.homeX - dir * reach;
    sfx('dash');
    camMid(a, d, r.crit ? 1.34 : 1.24, 5);
    yield* tw(0.2 * fast, k => {
      a.x = lerp(sx, tx, Ease.inOutCubic(k));
      a.pose.gait += 0.55; a.pose.gaitAmp = 1;
      const ph = k * 9; a.pose.fF[0] = k1.fF[0] + Math.sin(ph) * 5; a.pose.fB[0] = k1.fB[0] - Math.sin(ph) * 5;
      if (Math.random() < 0.6) dust(a.x - dir * 8 * sc, S.groundY, -dir);
      if (k > 0.4) S.ghosts.push({ f: a, x: a.x, life: 0.12, pose: JSON.parse(JSON.stringify(a.pose)), tint: r.crit ? 'rgba(255,220,140,0.7)' : 'rgba(150,200,255,0.55)' });
    });
    a.pose.gaitAmp = 0;
    const [cx, cy] = chest(d);
    a.trailOn = true;
    S.fx.push({ type: 'arc', x: a.x + dir * 12 * sc, y: S.groundY - (44 + (mounted ? 18 : 0)) * sc, r: (wt === 'lance' ? 30 : 34) * sc, dir, lance: wt === 'lance', t: 0, dur: 0.24, crit: r.crit });
    sfx(wt === 'lance' ? 'thrust' : 'swing');
    yield* tw(0.08, k => blend(a, k1, k2, Ease.outCubic(k)));
    yield* impact(a, d, r, [cx - dir * 6 * sc, cy]);
    a.trailOn = false;
    yield 0.22;
    camTo(0, 1, 3);
    yield* tw(0.32, k => { a.x = lerp(tx, a.homeX, Ease.inOutCubic(k)); blend(a, k2, k0, Ease.inOutCubic(k)); });
    a.idle = true;
  }
  function* bow(a, d, r) {
    a.idle = false;
    const k0 = kf(a.unit, 'ready'), k1 = kf(a.unit, 'aim'), k2 = kf(a.unit, 'release');
    sfx('draw');
    camOn(a, 1.2, 3.5);
    yield* tw(0.4, k => blend(a, k0, k1, Ease.outCubic(k)));
    yield r.crit ? 0.05 : 0.16;
    snap(a, k2); a.kx = -a.facing * 3 * S.sc;
    const [hx, hy] = handPos(a), [cx, cy] = chest(d);
    const ex = r.hit ? cx : cx + a.facing * 0.6 * S.W, ey = r.hit ? cy : cy - 30 * S.sc;
    const pr = { type: 'arrow', x0: hx, y0: hy, x1: ex, y1: ey, t: 0, dur: r.hit ? 0.24 : 0.38, crit: r.crit };
    S.projs.push(pr); S.track = pr;
    sfx('arrow');
    if (!r.hit) { yield 0.12; S.track = null; camOn(d, 1.2, 5); yield* dodgeAnim(a, d); }
    else { while (pr.t < pr.dur) yield; S.track = null; camOn(d, 1.22, 6); yield* impact(a, d, r, [cx, cy]); }
    yield 0.25;
    camTo(0, 1, 3);
    yield* tw(0.3, k => { blend(a, k2, k0, k); a.kx = lerp(a.kx, 0, k); });
    a.idle = true;
  }
  function* magic(a, d, r) {
    a.idle = false;
    const w = WEAPONS[a.unit.weapon];
    const k0 = kf(a.unit, 'ready'), k1 = kf(a.unit, 'cast');
    const [ax] = chest(a);
    const ec = w.elem === 'fire' ? '255,140,60' : w.elem === 'thunder' ? '255,236,140' : '190,90,255';
    S.fx.push({ type: 'circle', x: ax, y: S.groundY, r: 38 * S.sc, t: 0, dur: 1.6, col: ec });
    sfx('cast');
    camOn(a, 1.18, 3);
    yield* tw(0.5, k => {
      blend(a, k0, k1, Ease.outCubic(k));
      const [hx, hy] = handPos(a);
      if (Math.random() < 0.8) S.particles.push({ x: hx + (Math.random() - .5) * 50 * S.sc, y: hy + (Math.random() - .5) * 50 * S.sc, tx: hx, ty: hy - 8 * S.sc, home: true, life: 0, max: 0.3, size: 1.5 + Math.random() * 2, col: ec, glow: true });
      if (Math.random() < 0.5) S.particles.push({ x: ax + (Math.random() - .5) * 60 * S.sc, y: S.groundY, vx: 0, vy: -(40 + Math.random() * 80) * S.sc, life: 0, max: 0.7, size: 1.2 + Math.random() * 1.5, col: ec, glow: true, drag: 0.97 });
    });
    const [cx, cy] = chest(d);
    if (w.elem === 'fire') {
      const [hx, hy] = handPos(a);
      const ex = r.hit ? cx : cx + a.facing * 0.5 * S.W, ey = r.hit ? cy : cy - 50 * S.sc;
      const pr = { type: 'fireball', x0: hx, y0: hy, x1: ex, y1: ey, t: 0, dur: r.hit ? 0.36 : 0.5 };
      S.projs.push(pr); S.track = pr; sfx('fire');
      if (!r.hit) { yield 0.16; S.track = null; camOn(d, 1.2, 5); yield* dodgeAnim(a, d); }
      else { while (pr.t < pr.dur) yield; S.track = null; camOn(d, 1.24, 6); explode(cx, cy, '255,150,60', 1); yield* impact(a, d, r, [cx, cy]); }
    } else if (w.elem === 'thunder') {
      camOn(d, 1.16, 4);
      yield 0.18;
      const bx = r.hit ? cx : cx + a.facing * 34 * S.sc;
      for (let i = 0; i < 3; i++) { S.fx.push({ type: 'bolt', x: bx + (Math.random() - .5) * 10 * S.sc, y1: r.hit ? cy : S.groundY, t: 0, dur: 0.18, seed: Math.random() * 1e6 | 0 }); S.flash = 0.6; S.flashCol = '230,240,255'; S.shake = 6; sfx('thunder'); yield 0.07; }
      if (!r.hit) yield* dodgeAnim(a, d); else { explode(bx, cy, '255,245,180', 0.8); yield* impact(a, d, r, [cx, cy]); }
    } else {
      sfx('dark');
      camOn(d, 1.2, 3.5);
      for (let i = 0; i < 9; i++) S.projs.push({ type: 'orb', cx, cy, a: i / 9 * TAU, r: 70 * S.sc, t: 0, dur: 0.6 });
      S.fx.push({ type: 'vortex', x: cx, y: cy, t: 0, dur: 0.75 });
      if (!r.hit) { yield 0.2; yield* dodgeAnim(a, d); yield 0.2; }
      else { yield 0.6; explode(cx, cy, '180,80,255', 1); yield* impact(a, d, r, [cx, cy]); }
    }
    yield 0.3;
    camTo(0, 1, 3);
    yield* tw(0.3, k => blend(a, k1, k0, k));
    a.idle = true;
  }
  function* healAnim(a, d, r) {
    a.idle = false;
    const k0 = kf(a.unit, 'ready'), k1 = kf(a.unit, 'raise');
    sfx('cast');
    camOn(a, 1.15, 3);
    yield* tw(0.55, k => blend(a, k0, k1, Ease.outCubic(k)));
    const [cx, cy] = chest(d);
    sfx('heal');
    camOn(d, 1.2, 3);
    S.fx.push({ type: 'pillar', x: cx, t: 0, dur: 1.3 });
    for (let i = 0; i < 3; i++) S.fx.push({ type: 'ring', x: cx, y: S.groundY, t: -i * 0.18, dur: 0.9, col: '140,255,200', r: 44 * S.sc, flat: true });
    const st = d.hp, end = Math.min(d.maxhp, d.hp + r.amount);
    yield* tw(1.0, k => {
      if (Math.random() < 0.95) S.particles.push({ x: cx + (Math.random() - .5) * 46 * S.sc, y: S.groundY - Math.random() * 10 * S.sc, vx: 0, vy: -(40 + Math.random() * 70) * S.sc, life: 0, max: 0.9, size: 1.5 + Math.random() * 2.5, col: Math.random() < 0.5 ? '170,255,210' : '255,250,200', glow: true, drag: 0.98 });
      d.hp = Math.round(lerp(st, end, Ease.outCubic(k)));
    });
    S.texts.push({ text: '+' + (end - st), x: cx, y: cy - 34 * S.sc, t: 0, dur: 1.1, kind: 'heal' });
    yield 0.4;
    camTo(0, 1, 3);
    yield* tw(0.3, k => blend(a, k1, k0, k));
    a.idle = true;
  }
  function* dodgeAnim(a, d) {
    const k0 = kf(d.unit, 'ready'), k1 = kf(d.unit, 'dodge');
    d.idle = false;
    const dir = a.facing;
    sfx('miss');
    const [cx, cy] = chest(d);
    S.texts.push({ text: 'MISS', x: cx, y: cy - 44 * S.sc, t: 0, dur: 0.9, kind: 'miss' });
    S.slow = 0.18;
    yield* tw(0.14, k => { d.kx = dir * 30 * S.sc * Ease.outCubic(k); blend(d, k0, k1, Ease.outCubic(k)); if (Math.random() < 0.9) S.ghosts.push({ f: d, x: d.x + d.kx, life: 0.28, pose: JSON.parse(JSON.stringify(d.pose)), tint: 'rgba(140,190,255,0.7)' }); });
    yield 0.22;
    yield* tw(0.25, k => { d.kx = dir * 30 * S.sc * (1 - Ease.inOutCubic(k)); blend(d, k1, k0, k); });
    d.kx = 0; d.idle = true;
  }
  function* impact(a, d, r, [ix, iy]) {
    if (!r.hit) { yield* dodgeAnim(a, d); return; }
    const sc = S.sc, dir = a.facing;
    d.hp = Math.max(0, d.hp - r.dmg);
    d.flash = 1; d.idle = false;
    S.shake = r.crit ? 22 : 9; S.hitstop = r.crit ? 0.2 : 0.075;
    S.cam.z += r.crit ? 0.12 : 0.05;
    if (r.crit) { S.flash = 0.9; S.flashCol = '255,250,235'; S.slow = 0.35; }
    sfx(r.crit ? 'crit' : 'hit');
    const wt = wtype(a), metal = MELEE[wt] || wt === 'bow';
    const n = r.crit ? 56 : 26;
    for (let i = 0; i < n; i++) {
      const ang = (dir > 0 ? 0 : Math.PI) + (Math.random() - .5) * 2.4, sp = (120 + Math.random() * 380) * sc * (r.crit ? 1.6 : 1);
      S.particles.push({ x: ix, y: iy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60 * sc, grav: 500 * sc, drag: 0.92, life: 0, max: 0.3 + Math.random() * 0.4, size: (metal ? 1.2 : 2) + Math.random() * 2, col: metal ? (Math.random() < 0.6 ? '255,240,190' : '255,170,90') : '255,255,255', glow: true, spark: metal });
    }
    S.fx.push({ type: 'star', x: ix, y: iy, t: 0, dur: r.crit ? 0.3 : 0.18, r: (r.crit ? 90 : 55) * sc, rot: Math.random() });
    S.fx.push({ type: 'burst', x: ix, y: iy, t: 0, dur: r.crit ? 0.45 : 0.22, seed: Math.random() * 1e6 | 0 });
    S.fx.push({ type: 'ring', x: ix, y: iy, t: 0, dur: 0.3, col: r.crit ? '255,220,140' : '255,255,255', r: (r.crit ? 56 : 30) * sc });
    S.texts.push({ text: String(r.dmg), x: ix, y: iy - 38 * sc, t: 0, dur: 1.0, kind: r.crit ? 'crit' : 'dmg' });
    if (r.crit) S.texts.push({ text: 'CRITICAL', x: S.W / 2, y: S.H * 0.2, t: 0, dur: 1.1, kind: 'banner' });
    const k0 = kf(d.unit, 'ready'), kh = kf(d.unit, 'hurt');
    d.kx = dir * (r.crit ? 26 : 12) * sc;
    snap(d, kh);
    yield 0.2;
    yield* tw(0.3, k => { blend(d, kh, k0, Ease.inOutCubic(k)); d.kx = lerp(dir * (r.crit ? 26 : 12) * sc, 0, Ease.outCubic(k)); });
    d.idle = true;
  }
  function* die(d) {
    sfx('death');
    d.idle = false;
    camOn(d, 1.22, 2);
    S.slow = 0.6;
    yield 0.3;
    yield* tw(1.2, k => {
      d.flash = 0.5 + 0.5 * Math.sin(k * 30);
      d.alpha = 1 - Ease.inQuad(k);
      for (let i = 0; i < 4; i++) {
        const [cx] = chest(d);
        S.particles.push({ x: cx + (Math.random() - .5) * 34 * S.sc, y: S.groundY - Math.random() * 70 * S.sc, vx: (Math.random() - .5) * 20 * S.sc, vy: -(30 + Math.random() * 70) * S.sc, life: 0, max: 0.8 + Math.random() * 0.5, size: 1 + Math.random() * 2.5, col: d.unit.team === 'enemy' ? '255,180,160' : '200,220,255', glow: true, drag: 0.97 });
      }
    });
    d.alpha = 0;
  }
  function dust(x, y, dir) {
    S.particles.push({ x, y: y - 2, vx: dir * (20 + Math.random() * 40) * S.sc, vy: -(10 + Math.random() * 25) * S.sc, life: 0, max: 0.5, size: 3 + Math.random() * 5, col: S.indoor ? '160,150,140' : '190,170,130', dust: true, drag: 0.94 });
  }
  function explode(x, y, col, s) {
    S.fx.push({ type: 'ring', x, y, t: 0, dur: 0.4, col, r: 70 * S.sc * s });
    S.fx.push({ type: 'glow', x, y, t: 0, dur: 0.5, col, r: 110 * S.sc * s });
    for (let i = 0; i < 46 * s; i++) {
      const a = Math.random() * TAU, sp = (60 + Math.random() * 280) * S.sc;
      S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * S.sc, drag: 0.9, grav: 80 * S.sc, life: 0, max: 0.4 + Math.random() * 0.5, size: 2 + Math.random() * 4, col, glow: true });
    }
  }

  // ---------------- update ----------------
  function update(rdt) {
    if (!S) return;
    let dt = rdt * S.speed;
    if (S.slow > 0) { S.slow -= rdt; dt *= 0.32; }
    S.t += dt;
    if (S.hitstop > 0) { S.hitstop -= rdt; } else {
      if (S.wait > 0) S.wait -= dt;
      else {
        const r = S.co.next(dt);
        if (r.done || S.done) { finish(); return; }
        if (typeof r.value === 'number') S.wait = r.value;
      }
    }
    const ndt = S.hitstop > 0 ? dt * 0.06 : dt;
    // camera
    if (S.track) { const p = S.track, k = Math.min(1, p.t / p.dur); S.cam.tx = (lerp(p.x0, p.x1, k) - S.W / 2) * 0.75; S.cam.tz = 1.18; S.cam.k = 8; }
    const ck = Math.min(1, ndt * S.cam.k);
    S.cam.x += (S.cam.tx - S.cam.x) * ck; S.cam.z += (S.cam.tz - S.cam.z) * ck;
    for (const f of [S.L, S.R]) {
      f.t += ndt;
      if (f.idle) { const ip = Spr.idlePose(f.unit, f.t); f.pose.bob = ip.bob; f.pose.armF[0] = lerp(f.pose.armF[0], kf(f.unit, 'ready').armF[0] + (ip.armF[0] - Spr.pose(f.unit).armF[0]), 0.1); }
      f.pose.t = f.t;
      const px = f.x + f.kx; f.vx = ndt > 0 ? (px - f.lastX) / ndt : 0; f.lastX = px;
      f.pose.capeWind = clamp(Math.abs(f.vx) / (S.sc * 30), 0, 8);
      f.flash = Math.max(0, f.flash - ndt * 5);
      f.hpShown = lerp(f.hpShown, f.hp, Math.min(1, ndt * 10));
      if (Math.abs(f.hpShown - f.hp) < 0.05) f.hpShown = f.hp;
      f.hpTrail = f.hpTrail > f.hpShown ? Math.max(f.hpShown, f.hpTrail - ndt * 18) : f.hpShown;
      if (f.aura) f.auraT = (f.auraT || 0) + ndt;
      f.trail = f.trail.filter(s => S.t - s.t < 0.16);
    }
    S.shake = Math.max(0, S.shake - ndt * 60);
    S.flash = Math.max(0, S.flash - ndt * 3);
    for (const p of S.particles) {
      p.life += ndt;
      if (p.home) { const k = Math.min(1, p.life / p.max); p.x = lerp(p.x, p.tx, k * 0.25); p.y = lerp(p.y, p.ty, k * 0.25); continue; }
      p.vx *= Math.pow(p.drag || 1, ndt * 60); p.vy *= Math.pow(p.drag || 1, ndt * 60);
      p.vy += (p.grav || 0) * ndt; p.x += p.vx * ndt; p.y += p.vy * ndt;
    }
    S.particles = S.particles.filter(p => p.life < p.max);
    for (const e of S.fx) e.t += ndt;
    S.fx = S.fx.filter(e => e.t < e.dur);
    for (const pr of S.projs) {
      pr.t += ndt;
      if (pr.type === 'fireball') {
        const k = Math.min(1, pr.t / pr.dur), x = lerp(pr.x0, pr.x1, k), y = lerp(pr.y0, pr.y1, k) - Math.sin(k * Math.PI) * 30 * S.sc;
        for (let i = 0; i < 4; i++) S.particles.push({ x, y, vx: (Math.random() - .5) * 60 * S.sc, vy: -(20 + Math.random() * 60) * S.sc, life: 0, max: 0.38, size: 3 + Math.random() * 5, col: Math.random() < 0.5 ? '255,200,90' : '255,110,40', glow: true, drag: 0.92 });
      }
    }
    S.projs = S.projs.filter(p => p.t < p.dur);
    for (const g of S.ghosts) g.life -= ndt;
    S.ghosts = S.ghosts.filter(g => g.life > 0);
    for (const tx of S.texts) tx.t += ndt;
    S.texts = S.texts.filter(t => t.t < t.dur);
    if (S.cutin) S.cutin.lines = (S.cutin.lines || 0) + ndt;
    if (Math.random() < ndt * (S.indoor || S.dusk ? 14 : 3)) {
      if (S.indoor) S.particles.push({ x: Math.random() * S.W, y: Math.random() * S.groundY, vx: 4 * S.sc, vy: -2 * S.sc, life: 0, max: 4, size: 1 + Math.random() * 1.5, col: S.dusk ? '255,190,130' : '255,250,220', glow: true, ambient: true });
      else if (S.dusk) S.particles.push({ x: Math.random() * S.W, y: S.H * 0.8, vx: (Math.random() - .3) * 20 * S.sc, vy: -(15 + Math.random() * 25) * S.sc, life: 0, max: 3.5, size: 1 + Math.random() * 2, col: '255,150,70', glow: true, ambient: true });
      else S.particles.push({ x: -10, y: Math.random() * S.H * 0.6, vx: (40 + Math.random() * 60) * S.sc, vy: (10 + Math.random() * 20) * S.sc, life: 0, max: 6, size: 1.2 + Math.random() * 1.2, col: Math.random() < 0.5 ? '120,160,70' : '200,180,90', leaf: true, rot: Math.random() * TAU, ambient: true });
    }
  }
  function finish() {
    const r = S.resolve, res = { hp: { [S.L.unit.uid]: S.L.hp, [S.R.unit.uid]: S.R.hp } };
    S = null; r(res);
  }

  // ---------------- draw ----------------
  function applyCam(ctx, p) {
    const z = 1 + (S.cam.z - 1) * p;
    ctx.translate(S.W / 2, S.fy); ctx.scale(z, z); ctx.translate(-S.W / 2 - S.cam.x * p, -S.fy);
  }
  function drawLayer(ctx, L, p, y = 0) {
    if (!L) return;
    ctx.save(); applyCam(ctx, p);
    ctx.drawImage(L.cv, S.layers.OX, y, L.w, L.h);
    ctx.restore();
  }
  function drawFighter(ctx, f, ghost) {
    const sc = S.sc, dpr = S.dpr;
    const sw = S.scratch.width, sh = S.scratch.height;
    const x = ghost ? ghost.x : f.x + f.kx;
    if (!ghost) {
      const sg = ctx.createRadialGradient(x, S.groundY + 2, 0, x, S.groundY + 2, (CLASSES[f.unit.cls].mount ? 34 : 22) * sc);
      sg.addColorStop(0, `rgba(0,0,0,${0.5 * f.alpha})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, S.groundY + 2, (CLASSES[f.unit.cls].mount ? 34 : 22) * sc, 6 * sc, 0, 0, TAU); ctx.fill();
    }
    const c = S.scratch.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, sw, sh);
    c.setTransform(dpr * sc * f.facing, 0, 0, dpr * sc, sw / 2, sh - 10 * sc * dpr);
    const pose = ghost ? ghost.pose : f.pose;
    Spr.drawFigure(c, f.unit, pose);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!ghost) {
      // weapon trail sample
      if (f.trailOn && pose._tip) {
        const tw2 = (pt) => [x + pt[0] * sc * f.facing, S.groundY + pt[1] * sc];
        f.trail.push({ t: S.t, h: tw2(pose._hand), p: tw2(pose._tip) });
      }
      // rim light
      const rc = S.rim.getContext('2d');
      rc.globalCompositeOperation = 'copy'; rc.drawImage(S.scratch, 0, 0);
      rc.globalCompositeOperation = 'source-in'; rc.fillStyle = S.rimCol; rc.fillRect(0, 0, sw, sh);
      rc.globalCompositeOperation = 'destination-out'; rc.drawImage(S.scratch, S.rimOff[0], S.rimOff[1]);
      rc.globalCompositeOperation = 'source-over';
      if (S.dusk) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(120,60,90,0.16)'; c.fillRect(0, 0, sw, sh); }
      c.globalCompositeOperation = 'lighter'; c.drawImage(S.rim, 0, 0);
      if (f.flash > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${Math.min(1, f.flash)})`; c.fillRect(0, 0, sw, sh); }
    } else { c.globalCompositeOperation = 'source-atop'; c.fillStyle = ghost.tint || 'rgba(140,190,255,0.7)'; c.fillRect(0, 0, sw, sh); }
    c.globalCompositeOperation = 'source-over';
    const m = ctx.getTransform();
    ctx.save();
    ctx.globalAlpha = ghost ? Math.min(1, ghost.life * 3) * 0.5 : f.alpha;
    if (f.aura > 0 && !ghost) { ctx.shadowColor = `rgba(255,215,120,${f.aura})`; ctx.shadowBlur = 26 * f.aura * dpr; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tx = m.e + x * m.a - (sw / 2) * (m.a / dpr), ty = m.f + S.groundY * m.d - (sh - 10 * sc * dpr) * (m.d / dpr);
    ctx.drawImage(S.scratch, tx, ty, sw * m.a / dpr, sh * m.d / dpr);
    ctx.restore();
    if (f.aura > 0 && !ghost) {
      const [cx, cy] = chest(f);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80 * sc);
      g.addColorStop(0, `rgba(255,220,140,${0.35 * f.aura})`); g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 80 * sc, 0, TAU); ctx.fill();
      for (let i = 0; i < 10; i++) {
        const a = (f.auraT || 0) * 2.4 + i / 10 * TAU, rr = 34 * sc, hgt = (50 + 30 * Math.sin(a * 3)) * sc;
        const lg2 = ctx.createLinearGradient(0, S.groundY, 0, S.groundY - hgt);
        lg2.addColorStop(0, `rgba(255,230,160,${0.6 * f.aura})`); lg2.addColorStop(1, 'rgba(255,230,160,0)');
        ctx.strokeStyle = lg2; ctx.lineWidth = 3 * sc * 0.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rr, S.groundY); ctx.lineTo(cx + Math.cos(a) * rr, S.groundY - hgt); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawTrail(ctx, f) {
    if (f.trail.length < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const crit = f.aura > 0;
    for (let i = 1; i < f.trail.length; i++) {
      const a = f.trail[i - 1], b = f.trail[i];
      const age = (S.t - b.t) / 0.16, al = Math.max(0, 1 - age) * 0.8;
      ctx.fillStyle = crit ? `rgba(255,215,130,${al})` : `rgba(190,225,255,${al})`;
      ctx.beginPath(); ctx.moveTo(a.h[0], a.h[1]); ctx.lineTo(a.p[0], a.p[1]); ctx.lineTo(b.p[0], b.p[1]); ctx.lineTo(b.h[0], b.h[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.p[0], a.p[1]); ctx.lineTo(b.p[0], b.p[1]); ctx.stroke();
    }
    ctx.restore();
  }
  function drawFx(ctx) {
    const sc = S.sc;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of S.fx) {
      const k = clamp(e.t / e.dur, 0, 1);
      if (e.t < 0) continue;
      if (e.type === 'arc') {
        ctx.save(); ctx.translate(e.x, e.y); ctx.scale(e.dir, 1);
        const a = 1 - k;
        if (e.lance) {
          const len = e.r * 2.8;
          const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,240,${a})`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -4 * sc); ctx.lineTo(len, 0); ctx.lineTo(0, 4 * sc); ctx.fill();
        } else {
          const a0 = -1.9, a1 = lerp(-1.9, 1.25, Ease.outCubic(Math.min(1, k * 2.5)));
          const g = ctx.createRadialGradient(0, 0, e.r * 0.5, 0, 0, e.r * 1.3);
          const col = e.crit ? '255,230,160' : '220,236,255';
          g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.78, `rgba(${col},${0.95 * a})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.3, a0, a1); ctx.arc(0, 0, e.r * 0.62, a1, a0, true); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.4 * sc * a; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.12, Math.max(a0, a1 - 1.4), a1); ctx.stroke();
        }
        ctx.restore();
      } else if (e.type === 'ring') {
        const r = e.r * Ease.outCubic(k);
        ctx.strokeStyle = `rgba(${e.col},${(1 - k) * 0.9})`; ctx.lineWidth = 3 * sc * (1 - k) + 1;
        ctx.beginPath(); if (e.flat) ctx.ellipse(e.x, e.y, r * 1.5, r * 0.45, 0, 0, TAU); else ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      } else if (e.type === 'glow') {
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
        g.addColorStop(0, `rgba(${e.col},${(1 - k) * 0.9})`); g.addColorStop(1, `rgba(${e.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      } else if (e.type === 'star') {
        const r = e.r * (0.4 + Ease.outCubic(k) * 0.8), a = 1 - k;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.3, `rgba(255,240,200,${a * 0.8})`); g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g; ctx.beginPath();
        for (let i = 0; i < 16; i++) { const ang = i / 16 * TAU, rr = i % 2 ? r * 0.16 : r * (i % 4 ? 0.6 : 1); ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (e.type === 'burst') {
        const r = mulberry32(e.seed), a = 1 - k;
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
        for (let i = 0; i < 26; i++) {
          const ang = r() * TAU, r0 = (70 + r() * 60) * sc * (1 + k * 0.6), r1 = r0 + (40 + r() * 80) * sc;
          ctx.lineWidth = (1 + r() * 2.5) * sc * 0.5;
          ctx.beginPath(); ctx.moveTo(e.x + Math.cos(ang) * r0, e.y + Math.sin(ang) * r0); ctx.lineTo(e.x + Math.cos(ang) * r1, e.y + Math.sin(ang) * r1); ctx.stroke();
        }
      } else if (e.type === 'circle') {
        const a = Math.min(1, e.t * 4) * (1 - Math.max(0, (k - 0.7) / 0.3));
        ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1, 0.3); ctx.rotate(e.t * 1.6);
        ctx.strokeStyle = `rgba(${e.col},${0.9 * a})`; ctx.lineWidth = 2.4 * sc;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.2 * sc; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.78, 0, TAU); ctx.stroke();
        ctx.beginPath(); for (let i = 0; i <= 6; i++) { const ang = i / 6 * TAU * 2; ctx.lineTo(Math.cos(ang) * e.r * 0.78, Math.sin(ang) * e.r * 0.78); } ctx.stroke();
        for (let i = 0; i < 12; i++) { const ang = i / 12 * TAU; ctx.fillStyle = `rgba(${e.col},${a})`; ctx.fillRect(Math.cos(ang) * e.r * 0.89 - 2 * sc, Math.sin(ang) * e.r * 0.89 - 2 * sc, 4 * sc, 4 * sc); }
        ctx.restore();
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 1.4);
        g.addColorStop(0, `rgba(${e.col},${0.3 * a})`); g.addColorStop(1, `rgba(${e.col},0)`);
        ctx.fillStyle = g; ctx.fillRect(e.x - e.r * 1.5, e.y - e.r * 1.5, e.r * 3, e.r * 1.8);
        const lg2 = ctx.createLinearGradient(0, e.y, 0, e.y - 120 * sc);
        lg2.addColorStop(0, `rgba(${e.col},${0.25 * a})`); lg2.addColorStop(1, `rgba(${e.col},0)`);
        ctx.fillStyle = lg2; ctx.fillRect(e.x - e.r, e.y - 120 * sc, e.r * 2, 120 * sc);
      } else if (e.type === 'pillar') {
        const a = Math.sin(k * Math.PI);
        const lg2 = ctx.createLinearGradient(e.x - 30 * sc, 0, e.x + 30 * sc, 0);
        lg2.addColorStop(0, 'rgba(120,255,190,0)'); lg2.addColorStop(0.5, `rgba(190,255,220,${0.55 * a})`); lg2.addColorStop(1, 'rgba(120,255,190,0)');
        ctx.fillStyle = lg2; ctx.fillRect(e.x - 30 * sc, -S.H, 60 * sc, S.groundY + S.H);
      } else if (e.type === 'vortex') {
        const a = Math.sin(k * Math.PI);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(190,100,255,${0.6 * a})`; ctx.lineWidth = 3 * sc * 0.5;
          ctx.beginPath(); for (let s = 0; s < 40; s++) { const ang = s * 0.35 + e.t * 9 + i * 2.1, rr = (60 - s * 1.4) * sc * (1 - k * 0.5); ctx.lineTo(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr * 0.55); } ctx.stroke();
        }
      } else if (e.type === 'bolt') {
        const r = mulberry32(e.seed + (e.t * 30 | 0));
        const a = 1 - k;
        const pts = []; let x = e.x + (r() - .5) * 80 * sc; const steps = 16;
        for (let i = 0; i <= steps; i++) { const y = lerp(-S.H * 0.3, e.y1, i / steps); x = lerp(x, e.x, 0.25) + (r() - .5) * 26 * sc; pts.push(x, y); }
        for (const [w, al] of [[16, 0.18], [7, 0.5], [2.4, 1]]) {
          ctx.strokeStyle = `rgba(220,235,255,${al * a})`; ctx.lineWidth = w * sc * 0.6; ctx.lineJoin = 'round';
          ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke();
        }
        const g = ctx.createRadialGradient(e.x, e.y1, 0, e.x, e.y1, 90 * sc);
        g.addColorStop(0, `rgba(255,250,210,${0.8 * a})`); g.addColorStop(1, 'rgba(255,250,210,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y1, 90 * sc, 0, TAU); ctx.fill();
      }
    }
    for (const pr of S.projs) {
      const k = Math.min(1, pr.t / pr.dur);
      if (pr.type === 'arrow') {
        const x = lerp(pr.x0, pr.x1, k), y = lerp(pr.y0, pr.y1, k) - Math.sin(k * Math.PI) * 8 * sc;
        const ang = Math.atan2(pr.y1 - pr.y0, pr.x1 - pr.x0);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        const g = ctx.createLinearGradient(-110 * sc, 0, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, pr.crit ? 'rgba(255,220,140,0.85)' : 'rgba(220,235,255,0.7)');
        ctx.fillStyle = g; ctx.fillRect(-110 * sc, -1.4 * sc, 110 * sc, 2.8 * sc);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-24 * sc, -0.6 * sc, 24 * sc, 1.2 * sc);
        ctx.fillStyle = '#dfe4ea'; ctx.beginPath(); ctx.moveTo(0, -2 * sc); ctx.lineTo(5 * sc, 0); ctx.lineTo(0, 2 * sc); ctx.fill();
        ctx.fillStyle = '#efe8d8'; ctx.fillRect(-24 * sc, -2 * sc, 5 * sc, 1.2 * sc); ctx.fillRect(-24 * sc, 0.8 * sc, 5 * sc, 1.2 * sc);
        ctx.restore();
      } else if (pr.type === 'fireball') {
        const x = lerp(pr.x0, pr.x1, k), y = lerp(pr.y0, pr.y1, k) - Math.sin(k * Math.PI) * 30 * sc;
        const r = 17 * sc;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.25, 'rgba(255,190,80,0.95)'); g.addColorStop(0.6, 'rgba(255,90,30,0.45)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
      } else if (pr.type === 'orb') {
        const ang = pr.a + k * 5, rr = pr.r * (1 - Ease.inCubic(k));
        const x = pr.cx + Math.cos(ang) * rr, y = pr.cy + Math.sin(ang) * rr * 0.6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 13 * sc);
        g.addColorStop(0, 'rgba(255,220,255,0.95)'); g.addColorStop(0.35, 'rgba(170,60,255,0.8)'); g.addColorStop(1, 'rgba(80,0,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13 * sc, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawParticles(ctx, ambient) {
    const sc = S.sc;
    for (const p of S.particles) {
      if (!!p.ambient !== ambient) continue;
      const k = p.life / p.max, a = p.ambient ? Math.min(1, p.life * 2) * (1 - k) : 1 - k;
      if (p.leaf) {
        p.rot += 0.05;
        ctx.save(); ctx.translate(p.x, p.y + Math.sin(p.life * 3) * 8 * sc); ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${p.col},${a})`; ctx.beginPath(); ctx.ellipse(0, 0, p.size * sc * 0.9, p.size * sc * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore();
        continue;
      }
      if (p.dust) { ctx.fillStyle = `rgba(${p.col},${a * 0.35})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * sc * (1 + k * 2), 0, TAU); ctx.fill(); continue; }
      ctx.save();
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      if (p.spark) {
        ctx.strokeStyle = `rgba(${p.col},${a})`; ctx.lineWidth = p.size * sc * 0.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else {
        const r = p.size * sc * (p.glow ? 2 : 1);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawTexts(ctx) {
    const sc = S.sc;
    for (const t of S.texts) {
      const k = t.t / t.dur;
      if (t.kind === 'banner') continue;
      const pop = t.kind === 'crit' ? 1.7 : 1.1;
      const s = (k < 0.12 ? Ease.outBack(k / 0.12) : 1) * pop;
      const a = k > 0.7 ? (1 - k) / 0.3 : 1;
      const y = t.y - Ease.outCubic(Math.min(1, k * 2)) * 24 * sc;
      const fs = Math.max(20, 15 * sc) * s;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `italic 700 ${fs}px "Cinzel", "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = 'rgba(10,6,4,0.92)'; ctx.lineJoin = 'round'; ctx.strokeText(t.text, t.x, y);
      const g = ctx.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
      if (t.kind === 'miss') { g.addColorStop(0, '#e8f0ff'); g.addColorStop(1, '#8aa0c8'); }
      else if (t.kind === 'heal') { g.addColorStop(0, '#eafff0'); g.addColorStop(1, '#4ad08a'); }
      else if (t.kind === 'crit') { g.addColorStop(0, '#fff6d0'); g.addColorStop(0.5, '#ffc04a'); g.addColorStop(1, '#ff6a20'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd2a0'); }
      ctx.fillStyle = g; ctx.fillText(t.text, t.x, y);
      ctx.restore();
    }
  }
  function drawBanners(ctx) {
    for (const t of S.texts) {
      if (t.kind !== 'banner') continue;
      const k = t.t / t.dur;
      const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      const sx = 1 + (1 - Math.min(1, k * 6)) * 0.6;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(t.x, t.y); ctx.scale(sx, 1); ctx.transform(1, 0, -0.18, 1, 0, 0);
      const fs = Math.max(30, Math.min(S.W * 0.07, 64));
      ctx.font = `700 ${fs}px "Cinzel", "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2); g.addColorStop(0, '#fff6d8'); g.addColorStop(0.5, '#f2c25a'); g.addColorStop(1, '#a8661e');
      ctx.lineWidth = fs * 0.12; ctx.strokeStyle = 'rgba(30,10,0,0.9)'; ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = g; ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }
  function drawCutin(ctx) {
    const c = S.cutin; if (!c) return;
    const W = S.W, H = S.H, k = c.t / c.dur, f = c.f;
    const enemy = f.unit.team === 'enemy';
    const inK = Ease.outCubic(clamp(k / 0.18, 0, 1)), outK = Ease.inCubic(clamp((k - 0.8) / 0.2, 0, 1));
    const bandH = Math.min(H * 0.36, W * 0.42), cy = H * 0.42, slant = bandH * 0.35;
    const fromRight = f.side > 0;
    const off = (1 - inK) * W * 1.2 * (fromRight ? 1 : -1) + outK * W * 1.2 * (fromRight ? -1 : 1);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - outK) * inK})`; ctx.fillRect(0, 0, W, H);
    ctx.translate(off, 0);
    const band = () => { ctx.beginPath(); ctx.moveTo(-40, cy - bandH / 2 + slant); ctx.lineTo(W + 40, cy - bandH / 2 - slant); ctx.lineTo(W + 40, cy + bandH / 2 - slant); ctx.lineTo(-40, cy + bandH / 2 + slant); ctx.closePath(); };
    band();
    const bg = ctx.createLinearGradient(0, cy - bandH, 0, cy + bandH);
    if (enemy) { bg.addColorStop(0, '#2a0508'); bg.addColorStop(0.5, '#8a1620'); bg.addColorStop(1, '#2a0508'); }
    else { bg.addColorStop(0, '#04112e'); bg.addColorStop(0.5, '#1f4ea8'); bg.addColorStop(1, '#04112e'); }
    ctx.fillStyle = bg; ctx.fill();
    ctx.save(); band(); ctx.clip();
    // speed lines
    const r = mulberry32(7), sp = (c.lines || 0) * W * 2.6 * (fromRight ? -1 : 1);
    for (let i = 0; i < 60; i++) {
      const y = cy - bandH / 2 - slant + r() * (bandH + slant * 2), len = W * (0.1 + r() * 0.35), x = ((r() * W * 2 + sp) % (W * 2) + W * 2) % (W * 2) - W * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.25})`; ctx.fillRect(x, y, len, 1 + r() * 2.5);
    }
    // portrait
    const img = S.portraits[f.unit.uid];
    if (img) {
      const ph = bandH * 2.1, pw = ph, drift = (k - 0.5) * W * 0.04 * (fromRight ? -1 : 1);
      const px = fromRight ? W * 0.62 + drift : W * 0.05 + drift, py = cy - ph * 0.42;
      ctx.save();
      if (!fromRight === (f.unit.team === 'player')) { }
      ctx.drawImage(img, px, py, pw, ph);
      const fade = ctx.createLinearGradient(px, 0, px + pw, 0);
      if (fromRight) { fade.addColorStop(0, enemy ? 'rgba(138,22,32,1)' : 'rgba(31,78,168,1)'); fade.addColorStop(0.35, 'rgba(0,0,0,0)'); }
      else { fade.addColorStop(0.65, 'rgba(0,0,0,0)'); fade.addColorStop(1, enemy ? 'rgba(138,22,32,1)' : 'rgba(31,78,168,1)'); }
      ctx.fillStyle = fade; ctx.fillRect(px, py, pw, ph);
      ctx.restore();
    }
    // name
    const fs = Math.min(bandH * 0.26, W * 0.07);
    ctx.font = `800 ${fs}px "Shippori Mincho B1", serif`; ctx.textBaseline = 'middle';
    ctx.textAlign = fromRight ? 'left' : 'right';
    const tx = fromRight ? W * 0.08 : W * 0.92;
    ctx.lineWidth = fs * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.unit.name, tx, cy);
    const tg = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#f2d99c');
    ctx.fillStyle = tg; ctx.fillText(f.unit.name, tx, cy);
    ctx.font = `700 ${fs * 0.36}px "Cinzel", serif`; ctx.fillStyle = 'rgba(242,217,156,0.95)';
    ctx.fillText('— CRITICAL STRIKE —', tx, cy + fs * 0.8);
    ctx.restore();
    // gold edges
    ctx.strokeStyle = '#f2d99c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-40, cy - bandH / 2 + slant); ctx.lineTo(W + 40, cy - bandH / 2 - slant); ctx.moveTo(-40, cy + bandH / 2 + slant); ctx.lineTo(W + 40, cy + bandH / 2 - slant); ctx.stroke();
    ctx.restore();
    if (k > 0.78 && k < 0.86) { ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(k - 0.82) / 0.04) * 0.8})`; ctx.fillRect(0, 0, W, H); }
  }
  function drawHUD(ctx) {
    const W = S.W, H = S.H;
    const hh = Math.max(100, Math.min(H * 0.25, 176));
    const y0 = H - hh * Ease.outCubic(S.intro);
    const fs = clamp(W * 0.02, 11, 18);
    for (const f of [S.L, S.R]) {
      const left = f === S.L, x = left ? 0 : W / 2, w = W / 2;
      const enemy = f.unit.team === 'enemy';
      ctx.save();
      ctx.beginPath();
      if (left) { ctx.moveTo(0, y0); ctx.lineTo(w - 10, y0); ctx.lineTo(w + 6, H); ctx.lineTo(0, H); }
      else { ctx.moveTo(x + 10, y0); ctx.lineTo(W, y0); ctx.lineTo(W, H); ctx.lineTo(x + 26, H); }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y0, 0, H);
      g.addColorStop(0, enemy ? 'rgba(96,20,30,0.95)' : 'rgba(22,46,100,0.95)'); g.addColorStop(1, enemy ? 'rgba(24,4,8,0.98)' : 'rgba(4,10,30,0.98)');
      ctx.fillStyle = g; ctx.fill();
      ctx.clip();
      // portrait thumb
      const img = S.portraits[f.unit.uid];
      const pz = hh * 0.92, pxp = left ? x + 6 : W - pz - 6;
      if (img) {
        ctx.save(); ctx.globalAlpha = 0.95;
        ctx.drawImage(img, pxp, y0 + hh - pz, pz, pz);
        const fg = ctx.createLinearGradient(pxp, 0, pxp + pz, 0);
        const bc = enemy ? 'rgba(60,12,18,' : 'rgba(14,30,66,';
        if (left) { fg.addColorStop(0.55, bc + '0)'); fg.addColorStop(1, bc + '1)'); } else { fg.addColorStop(0, bc + '1)'); fg.addColorStop(0.45, bc + '0)'); }
        ctx.fillStyle = fg; ctx.fillRect(pxp, y0, pz, hh);
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(242,217,156,0.95)'; ctx.fillRect(x, y0, w, 1.5);
      const pad = Math.max(12, w * 0.04);
      const cx0 = left ? x + (img ? pz * 0.78 : pad) : x + pad + 16;
      const cx1 = left ? x + w - pad - 10 : W - (img ? pz * 0.78 : pad);
      const fc = S.fc[f.unit.uid] || {};
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = '#f6edd4'; ctx.font = `800 ${fs * 1.35}px "Shippori Mincho B1", serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(f.unit.name, cx0, y0 + fs * 2.05); ctx.fillText(f.unit.name, cx0, y0 + fs * 2.05);
      ctx.fillStyle = 'rgba(243,233,207,0.72)'; ctx.font = `500 ${fs * 0.82}px "Zen Kaku Gothic New", sans-serif`;
      ctx.fillText(`${(WEAPONS[f.unit.weapon] || {}).name || ''}`, cx0, y0 + fs * 3.35);
      const labels = S.heal ? [] : [['HIT', fc.hit], ['DMG', fc.dmg], ['CRT', fc.crit]];
      const colW = Math.min(62, (cx1 - cx0) * 0.2);
      labels.forEach(([lab, v], i) => {
        const sx = cx1 - (labels.length - i) * colW;
        ctx.fillStyle = 'rgba(242,217,156,0.9)'; ctx.font = `700 ${fs * 0.66}px "Cinzel", serif`; ctx.fillText(lab, sx, y0 + fs * 1.6);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${fs * 1.22}px "Cinzel", serif`; ctx.fillText(v == null ? '--' : String(v), sx, y0 + fs * 3.0);
      });
      const by = y0 + hh - fs * 2.1, bx = cx0 + fs * 3.4, bw = Math.max(40, cx1 - bx);
      ctx.fillStyle = 'rgba(242,217,156,0.9)'; ctx.font = `700 ${fs * 0.66}px "Cinzel", serif`; ctx.fillText('HP', cx0, by - fs * 0.4);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${fs * 1.6}px "Cinzel", serif`; ctx.fillText(String(Math.round(f.hpShown)), cx0, by + fs * 1.0);
      const bh = fs * 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; rr(ctx, bx - 2, by - 2, bw + 4, bh + 4, 3); ctx.fill();
      const fr = f.hpShown / f.maxhp, tr = f.hpTrail / f.maxhp;
      ctx.fillStyle = '#ff5a3a'; ctx.fillRect(bx, by, bw * tr, bh);
      const hg = ctx.createLinearGradient(0, by, 0, by + bh);
      hg.addColorStop(0, '#e6ffb0'); hg.addColorStop(0.45, '#7ad84e'); hg.addColorStop(0.5, '#4fae30'); hg.addColorStop(1, '#2a7a22');
      ctx.fillStyle = hg; ctx.fillRect(bx, by, bw * fr, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const seg = bw / f.maxhp;
      if (seg > 3) for (let i = 1; i < f.maxhp; i++) ctx.fillRect(bx + i * seg, by, 1, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx, by, bw * fr, 1.5);
    }
    const lb = H * 0.07 * Ease.outCubic(S.intro);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, lb);
    ctx.fillStyle = 'rgba(214,178,90,0.5)'; ctx.fillRect(0, lb, W, 1);
  }
  function draw(ctx) {
    if (!S) return;
    const W = S.W, H = S.H, dpr = S.dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    const shx = (Math.random() - .5) * S.shake, shy = (Math.random() - .5) * S.shake * 0.6;
    ctx.translate(shx, shy);
    const L = S.layers;
    ctx.drawImage(L.sky.cv, -20, -20, W + 40, H + 40);
    if (L.clouds) {
      ctx.save(); applyCam(ctx, 0.08);
      const off = (S.t * 10) % (W * 2);
      ctx.drawImage(L.clouds.cv, -off - W * 0.2, -10, W * 2, H * 0.45); ctx.drawImage(L.clouds.cv, W * 2 - off - W * 0.2, -10, W * 2, H * 0.45);
      ctx.restore();
    }
    drawLayer(ctx, L.far, 0.2);
    drawLayer(ctx, L.mid, 0.5);
    drawLayer(ctx, L.ground, 1);
    ctx.save(); applyCam(ctx, 1);
    if (S.dim > 0) { ctx.fillStyle = `rgba(5,5,15,${S.dim})`; ctx.fillRect(-W, -H, W * 3, H * 3); }
    for (const g of S.ghosts) drawFighter(ctx, g.f, g);
    const front = S.L.idle && !S.R.idle ? [S.L, S.R] : [S.R, S.L];
    drawFighter(ctx, front[0]); drawTrail(ctx, front[0]);
    drawFighter(ctx, front[1]); drawTrail(ctx, front[1]);
    drawParticles(ctx, true);
    drawFx(ctx);
    drawParticles(ctx, false);
    drawTexts(ctx);
    ctx.restore();
    drawLayer(ctx, L.fg, 1.35);
    ctx.restore();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // grade + vignette
    const gr = ctx.createLinearGradient(0, 0, W, H);
    if (S.dusk) { gr.addColorStop(0, 'rgba(90,40,120,0.18)'); gr.addColorStop(1, 'rgba(255,120,40,0.14)'); }
    else { gr.addColorStop(0, 'rgba(255,240,200,0.10)'); gr.addColorStop(1, 'rgba(20,40,90,0.14)'); }
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    drawCutin(ctx);
    drawBanners(ctx);
    if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashCol},${S.flash})`; ctx.fillRect(0, 0, W, H); }
    drawHUD(ctx);
    const fade = 1 - S.intro + S.outro;
    if (fade > 0.001) { ctx.fillStyle = `rgba(0,0,0,${clamp(fade, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  return {
    start, update, draw, active: () => !!S,
    skip() { if (S) S.speed = S.speed > 1 ? 1 : 3.5; },
  };
})();
