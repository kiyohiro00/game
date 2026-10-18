'use strict';
// ---------- math / easing ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const Ease = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inQuad: t => t * t,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- value noise ----------
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(512), v = new Float32Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; v[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = v[p[p[X] + Y]], b = v[p[p[X + 1] + Y]], c = v[p[p[X] + Y + 1]], d = v[p[p[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, amp = .5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); norm += amp; amp *= .5; f *= 2.03; }
    return s / norm;
  }
  function ridge(x, y, oct = 4) {
    let s = 0, amp = .5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(n2(x * f, y * f) * 2 - 1); s += amp * n * n; norm += amp; amp *= .5; f *= 2.03; }
    return s / norm;
  }
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // seamless fbm over a square of size s
  function seamless(x, y, s, fn) {
    const a = fn(x, y), b = fn(x - s, y), c = fn(x, y - s), d = fn(x - s, y - s);
    const u = x / s, w = y / s;
    return a * (1 - u) * (1 - w) + b * u * (1 - w) + c * (1 - u) * w + d * u * w;
  }
  return { n2, fbm, ridge, hash, seamless };
}

// ---------- colour ----------
const _rgbCache = new Map();
function hexRgb(h) {
  if (Array.isArray(h)) return h;
  let c = _rgbCache.get(h);
  if (c) return c;
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
  const n = parseInt(s, 16);
  c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  _rgbCache.set(h, c);
  return c;
}
function rgbStr(c, a) {
  return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
const _shadeCache = new Map();
// amt -1 (black) .. +1 (white)
function shade(hex, amt, a) {
  const key = hex + '|' + amt + '|' + a;
  let r = _shadeCache.get(key);
  if (r) return r;
  const c = hexRgb(hex), t = amt < 0 ? 0 : 255, f = Math.abs(amt);
  r = rgbStr([c[0] + (t - c[0]) * f, c[1] + (t - c[1]) * f, c[2] + (t - c[2]) * f], a);
  _shadeCache.set(key, r);
  return r;
}
function mixHex(h1, h2, t) {
  const a = hexRgb(h1), b = hexRgb(h2);
  return rgbStr([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
