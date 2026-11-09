'use strict';
// ===== パーティクル・描画ヘルパ =====
const glowCache = {};
function glowSprite(color) {
  let c = glowCache[color];
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color + 'ff'); gr.addColorStop(0.25, color + '99'); gr.addColorStop(0.6, color + '33'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowCache[color] = c;
  }
  return c;
}
function glow(ctx, x, y, r, color, a = 1) {
  const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pa * a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
}
function starPath(ctx, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof r === 'number') r = [r, r, r, r];
  const [a, b, c, d] = r;
  ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b);
  ctx.lineTo(x + w, y + h - c); ctx.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  ctx.lineTo(x + d, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d);
  ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function otext(ctx, str, x, y, fill, stroke = '#1a1030', lw = 5) {
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); ctx.fillStyle = fill; ctx.fillText(str, x, y);
}
const FONT = (px, w = 900) => `${w} ${px}px "Arial Rounded MT Bold","Segoe UI","Yu Gothic UI","Meiryo",sans-serif`;

const FX = {
  ps: [], texts: [],
  clear() { this.ps.length = 0; this.texts.length = 0; },
  add(o) {
    if (this.ps.length > 900) this.ps.splice(0, 50);
    o.max = o.life; o.vx = o.vx || 0; o.vy = o.vy || 0; o.g = o.g || 0; o.rot = o.rot || 0; o.vr = o.vr || 0; o.drag = o.drag || 0;
    this.ps.push(o); return o;
  },
  dustColor() { return { grass: '#f7efd9', cave: '#c3ccff', sky: '#ffffff', castle: '#e2c0ae' }[World.theme] || '#ffffff'; },
  dust(x, y, n = 4, dir = 0, sp = 1) {
    const col = this.dustColor();
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + rand(-6, 6), y: y + rand(-3, 2), vx: (dir * rand(20, 90) + rand(-40, 40)) * sp, vy: rand(-50, -10) * sp, life: rand(0.25, 0.5), size: rand(4, 8), grow: 1.2, color: col, alpha: 0.75, drag: 2 });
  },
  sparkle(x, y, n = 6, color = '#fff6a8', sp = 1) {
    for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(40, 190) * sp; this.add({ type: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.65), size: rand(3, 7), color, add: true, vr: rand(-8, 8), drag: 2.5 }); }
  },
  sparks(x, y, n = 8, color = '#ffd27a', sp = 1) {
    for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(120, 380) * sp; this.add({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.15, 0.4), size: rand(1.5, 3), color, add: true, drag: 3, g: 300 }); }
  },
  debris(x, y, c1, c2, n = 8) {
    for (let i = 0; i < n; i++) this.add({ type: 'sq', x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(-220, 220), vy: rand(-480, -120), g: 1500, life: rand(0.6, 1.0), size: rand(6, 13), color: i % 2 ? c1 : c2, vr: rand(-12, 12), shrink: false });
  },
  poof(x, y, n = 8, color = '#ffffff') {
    for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(0.3); this.add({ type: 'smoke', x, y, vx: Math.cos(a) * rand(50, 130), vy: Math.sin(a) * rand(50, 130), life: rand(0.3, 0.5), size: rand(6, 11), grow: 0.8, color, alpha: 0.85, drag: 4 }); }
  },
  ring(x, y, color = '#ffffff', r0 = 6, r1 = 60, life = 0.35, lw = 5, add = true) { this.add({ type: 'ring', x, y, life, color, r0, r1, lw, add }); },
  fire(x, y, n = 3, sp = 1) {
    for (let i = 0; i < n; i++) this.add({ type: 'circle', x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-40, 40) * sp, vy: rand(-120, -30) * sp, life: rand(0.25, 0.55), size: rand(4, 9), color: pick(['#ffb347', '#ff7a1a', '#ffe27a', '#ff4d2a']), add: true });
  },
  boom(x, y, s = 1) {
    this.ring(x, y, '#fff2c0', 10, 110 * s, 0.4, 10); this.ring(x, y, '#ff9a3c', 4, 70 * s, 0.3, 6);
    for (let i = 0; i < 14; i++) { const a = rand(TAU), v = rand(60, 320) * s; this.add({ type: 'circle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), size: rand(8, 20) * s, color: pick(['#ffb347', '#ff7a1a', '#ffe27a', '#ff4d2a', '#ffffff']), add: true, drag: 3 }); }
    for (let i = 0; i < 8; i++) { const a = rand(TAU), v = rand(40, 160) * s; this.add({ type: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.6, 1.1), size: rand(10, 18) * s, grow: 1, color: '#3a3040', alpha: 0.6, drag: 2 }); }
  },
  coinPop(x, y) { this.add({ type: 'coin', x, y, vy: -520, g: 1500, life: 0.55, size: 12, fade: false }); },
  text(x, y, str, color = '#ffffff', size = 18) { this.texts.push({ x, y, str: String(str), color, size, life: 0.9, max: 0.9 }); },
  update(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life -= dt; if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy += p.g * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.type === 'leaf') { p.vx += Math.sin(p.life * 3 + p.size) * 40 * dt; }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y -= 46 * dt * (t.life / t.max + 0.3); if (t.life <= 0) this.texts.splice(i, 1); }
  },
  draw(ctx) {
    for (const p of this.ps) {
      const k = p.life / p.max; let a = (p.fade === false ? 1 : Math.min(1, k * 2.2)) * (p.alpha || 1);
      ctx.globalAlpha = a; const s = p.size * (p.grow ? 1 + (1 - k) * p.grow : (p.shrink === false ? 1 : 0.35 + 0.65 * k));
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      switch (p.type) {
        case 'ring': ctx.strokeStyle = p.color; ctx.lineWidth = p.lw * k + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * easeOut(1 - k), 0, TAU); ctx.stroke(); break;
        case 'sq': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-s / 2, -s / 2, s, s * 0.3); ctx.restore(); break;
        case 'star': ctx.fillStyle = p.color; starPath(ctx, p.x, p.y, s, s * 0.42, 4, p.rot); ctx.fill(); break;
        case 'spark': ctx.strokeStyle = p.color; ctx.lineWidth = s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke(); break;
        case 'coin': { const w = Math.abs(Math.cos(p.life * 22)) * s; ctx.fillStyle = '#ffd23c'; ell(ctx, p.x, p.y, Math.max(1.5, w), s); ctx.fill(); ctx.fillStyle = '#fff3a8'; ell(ctx, p.x - w * 0.2, p.y - 2, Math.max(1, w * 0.45), s * 0.6); ctx.fill(); break; }
        case 'leaf': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ell(ctx, 0, 0, s, s * 0.45); ctx.fill(); ctx.restore(); break;
        default: ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, s), 0, TAU); ctx.fill();
      }
      if (p.add) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.life / t.max; ctx.globalAlpha = Math.min(1, k * 3); ctx.font = FONT(t.size * (1 + Math.max(0, k - 0.8) * 2));
      otext(ctx, t.str, t.x, t.y, t.color, '#1a1030', 4);
    }
    ctx.globalAlpha = 1;
  }
};
