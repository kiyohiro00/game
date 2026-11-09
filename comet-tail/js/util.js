'use strict';
// ===== 定数・ユーティリティ・入力・サウンド =====
const TILE = 48, VW = 960, VH = 540, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ----- 入力 -----
const Input = {
  keys: {}, pressedQ: {}, sim: {}, pad: {}, padPrev: {}, touch: {},
  map: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW', 'KeyK'], dash: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyL'], fire: ['KeyC', 'KeyJ'],
    start: ['Enter', 'Space', 'KeyZ'], pause: ['Escape', 'KeyP'], mute: ['KeyM']
  },
  init() {
    const codes = new Set(); for (const a in this.map) for (const c of this.map[a]) codes.add(c);
    addEventListener('keydown', e => {
      if (codes.has(e.code)) e.preventDefault();
      Snd.init();
      if (e.repeat) return;
      this.keys[e.code] = true;
      for (const a in this.map) if (this.map[a].includes(e.code)) this.pressedQ[a] = true;
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    addEventListener('pointerdown', () => Snd.init());
  },
  held(a) { if (this.sim[a] || this.pad[a] || this.touch[a]) return true; for (const c of this.map[a]) if (this.keys[c]) return true; return false; },
  pressed(a) { return !!this.pressedQ[a]; },
  press(a) { this.pressedQ[a] = true; },
  endTick() { this.pressedQ = {}; },
  pollPad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : []; const g = gps && gps[0];
    const st = {};
    if (g) {
      const b = i => !!(g.buttons[i] && g.buttons[i].pressed), ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      st.left = ax < -0.4 || b(14); st.right = ax > 0.4 || b(15); st.up = ay < -0.6 || b(12); st.down = ay > 0.6 || b(13);
      st.jump = b(0); st.dash = b(2) || b(5) || b(7); st.fire = b(1) || b(3); st.start = b(9) || b(0); st.pause = b(9);
    }
    for (const a in st) { if (st[a] && !this.padPrev[a]) { this.pressedQ[a] = true; Snd.init(); } }
    this.pad = st; this.padPrev = st;
  }
};

// ----- サウンド（WebAudio 合成） -----
const Snd = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.5; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = 0.2; this.mus.connect(this.master);
      const len = c.sampleRate; this.nbuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  tone(type, f, f2, dur, vol = 0.2, delay = 0, out) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx); o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol, f1, f2, delay = 0, q = 0.8, out, ftype = 'bandpass') {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; fl.type = ftype; fl.Q.value = q;
    fl.frequency.setValueAtTime(f1, t); if (f2 && f2 !== f1) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  },
  play(name) { if (!this.ctx || this.muted) return; const f = SFX[name]; if (f) f(this); },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.9; }
};
const SFX = {
  jump: s => s.tone('square', 330, 660, 0.14, 0.12),
  djump: s => { s.tone('square', 520, 1040, 0.12, 0.1); s.tone('triangle', 780, 1560, 0.16, 0.1, 0.03); },
  superjump: s => { s.tone('square', 330, 1320, 0.25, 0.12); s.tone('triangle', 660, 1980, 0.3, 0.1, 0.04); },
  walljump: s => { s.tone('square', 280, 700, 0.13, 0.11); s.noise(0.06, 0.1, 1500, 600); },
  dash: s => { s.noise(0.22, 0.28, 3200, 500, 0, 1.2); s.tone('sawtooth', 500, 140, 0.16, 0.06); },
  land: s => s.noise(0.06, 0.08, 500, 150),
  stomp: s => { s.tone('square', 480, 120, 0.13, 0.16); s.noise(0.08, 0.14, 900, 300); },
  coin: s => { s.tone('square', 988, 988, 0.07, 0.1); s.tone('square', 1319, 1319, 0.22, 0.1, 0.07); },
  bump: s => s.tone('square', 180, 90, 0.1, 0.15),
  brk: s => { s.noise(0.18, 0.3, 1800, 300); s.tone('square', 200, 60, 0.12, 0.12); },
  hurt: s => { s.tone('sawtooth', 440, 110, 0.3, 0.18); s.tone('square', 220, 70, 0.3, 0.1, 0.05); },
  power: s => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => s.tone('square', f, f, 0.09, 0.11, i * 0.06)),
  heart: s => [784, 988, 1175].forEach((f, i) => s.tone('triangle', f, f, 0.12, 0.16, i * 0.07)),
  spring: s => { s.tone('sine', 220, 880, 0.25, 0.22); s.tone('square', 330, 990, 0.2, 0.05); },
  pound: s => { s.tone('sine', 160, 40, 0.3, 0.4); s.noise(0.25, 0.3, 700, 100); },
  poundstart: s => s.tone('square', 700, 300, 0.12, 0.09),
  fire: s => { s.tone('square', 900, 300, 0.1, 0.09); s.tone('triangle', 1400, 700, 0.08, 0.07); },
  check: s => [659, 784, 1047, 1319].forEach((f, i) => s.tone('triangle', f, f, 0.16, 0.16, i * 0.08)),
  star: s => [784, 1047, 1319, 1568, 2093].forEach((f, i) => { s.tone('square', f, f, 0.12, 0.09, i * 0.07); s.tone('triangle', f * 2, f * 2, 0.12, 0.05, i * 0.07); }),
  crystal: s => { s.tone('sine', 1200, 2400, 0.18, 0.14); s.tone('triangle', 1800, 3000, 0.12, 0.08, 0.04); },
  sw: s => { s.tone('square', 400, 400, 0.05, 0.14); s.tone('square', 600, 600, 0.08, 0.14, 0.05); },
  cannon: s => { s.noise(0.3, 0.4, 1200, 100); s.tone('sine', 200, 50, 0.3, 0.35); },
  cannonin: s => s.tone('square', 200, 400, 0.12, 0.12),
  shot: s => { s.noise(0.2, 0.22, 800, 150); s.tone('square', 160, 60, 0.15, 0.1); },
  crush: s => { s.noise(0.3, 0.35, 500, 80); s.tone('sine', 110, 35, 0.3, 0.4); },
  kick: s => { s.tone('square', 600, 200, 0.08, 0.14); s.noise(0.06, 0.12, 1200, 400); },
  die: s => [523, 494, 466, 440, 392, 330, 262].forEach((f, i) => s.tone('square', f, f * 0.97, 0.13, 0.14, i * 0.11)),
  oneup: s => [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => s.tone('square', f, f, 0.1, 0.12, i * 0.09)),
  clear: s => { const m = [523, 659, 784, 1047, 784, 1047, 1319, 1568]; m.forEach((f, i) => { s.tone('square', f, f, i === 7 ? 0.7 : 0.13, 0.12, i * 0.12); s.tone('triangle', f / 2, f / 2, i === 7 ? 0.7 : 0.13, 0.14, i * 0.12); }); },
  bosshit: s => { s.tone('sawtooth', 300, 60, 0.35, 0.25); s.noise(0.3, 0.3, 1500, 200); },
  roar: s => { s.tone('sawtooth', 110, 55, 0.9, 0.3); s.tone('sawtooth', 117, 50, 0.9, 0.25); s.noise(0.9, 0.25, 400, 100); },
  boom: s => { s.noise(0.5, 0.45, 900, 60); s.tone('sine', 120, 30, 0.5, 0.4); },
  select: s => s.tone('square', 660, 880, 0.07, 0.1),
  tick: s => s.tone('square', 1200, 1200, 0.03, 0.05),
  crumble: s => s.noise(0.25, 0.15, 600, 200),
  clink: s => s.tone('triangle', 2000, 1500, 0.06, 0.1),
  burn: s => { s.noise(0.3, 0.3, 2500, 600); s.tone('sawtooth', 500, 900, 0.2, 0.1); },
};

// ----- BGM シーケンサ -----
const NOTE_IX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = n => { const m = /^([A-G]#?)(\d)$/.exec(n); return m ? 12 * (+m[2] + 1) + NOTE_IX[m[1]] : 0; };
const mfreq = m => 440 * Math.pow(2, (m - 69) / 12);
const SONGS = {
  grass: {
    bpm: 138, chords: ['C', 'C', 'F', 'G', 'Am', 'F', 'G', 'C'], lead: 'square', drums: 'khshkksh',
    mel: 'E5 G5 C6 - G5 E5 G5 - | E5 G5 C6 - D6 C6 G5 - | A5 C6 F5 - A5 C6 A5 - | B5 D6 G5 - B5 A5 G5 - | C6 - E6 C6 A5 - C6 - | A5 - C6 A5 F5 - A5 - | G5 A5 B5 D6 G6 - D6 B5 | C6 - G5 - C6 . . .'
  },
  cave: {
    bpm: 108, chords: ['Am', 'Am', 'F', 'E', 'Am', 'Dm', 'E', 'Am'], lead: 'triangle', drums: 'k..hk.h.',
    mel: 'A4 - C5 - E5 - C5 - | B4 - C5 - A4 - - - | F4 - A4 - C5 - A4 - | G#4 - B4 - E5 - - - | A4 - C5 - E5 - A5 - | F5 - D5 - A4 - D5 - | E5 - G#4 - B4 - E5 - | A4 - - - . . . .'
  },
  sky: {
    bpm: 148, chords: ['F', 'C', 'Dm', 'A#', 'F', 'C', 'A#', 'C'], lead: 'square', drums: 'khshkhsh',
    mel: 'A5 - C6 A5 F5 - A5 - | G5 - C6 G5 E5 - G5 - | F5 - A5 D6 - C6 A5 - | D6 - F6 D6 A#5 - D6 - | C6 - F6 - A6 G6 F6 - | E6 - G6 E6 C6 - E6 - | D6 - F6 D6 A#5 - D6 F6 | E6 - C6 - G5 - C6 -'
  },
  castle: {
    bpm: 124, chords: ['Dm', 'Dm', 'A#', 'A', 'Dm', 'Gm', 'A', 'A'], lead: 'sawtooth', drums: 'k.hsk.hs',
    mel: 'D5 . D5 F5 . E5 D5 . | A4 . D5 . F5 E5 D5 - | A#4 . D5 F5 . A#5 A5 . | A5 - G5 E5 C#5 - A4 - | D5 . F5 A5 . G5 F5 . | G5 . A#5 D6 . A#5 G5 - | A5 . C#6 E6 . C#6 A5 . | E5 - C#5 - A4 - - -'
  },
  boss: {
    bpm: 164, chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'], lead: 'sawtooth', drums: 'kkshkksh',
    mel: 'E5 E5 G5 E5 B5 E5 G5 E5 | E5 E5 G5 E5 A5 G5 F#5 D5 | C5 C5 E5 C5 G5 C5 E5 G5 | D5 D5 F#5 D5 A5 F#5 D5 A5 | E5 G5 B5 E6 - B5 G5 E5 | E5 G5 B5 E6 - D6 B5 G5 | C5 E5 G5 C6 - G5 E5 C5 | B4 D#5 F#5 B5 - F#5 D#5 B4'
  }
};
const Music = {
  name: null, timer: null, step: 0, nextT: 0, song: null,
  parse(song) {
    if (song.ev) return;
    const toks = song.mel.replace(/\|/g, ' ').trim().split(/\s+/); song.ev = []; let cur = null;
    toks.forEach((tk, i) => { if (tk === '-') { if (cur) cur.len++; } else if (tk === '.') cur = null; else { cur = { step: i, m: midiOf(tk), len: 1 }; song.ev.push(cur); } });
    song.len = toks.length; song.byStep = {}; song.ev.forEach(e => song.byStep[e.step] = e);
    song.ch = song.chords.map(c => { const minor = c.endsWith('m'); const root = NOTE_IX[minor ? c.slice(0, -1) : c]; return { root, third: root + (minor ? 3 : 4), fifth: root + 7 }; });
  },
  play(name) {
    if (this.name === name) return; this.stop(); this.name = name; if (!name || !Snd.ctx) { this.pending = name; this.name = null; return; }
    this.song = SONGS[name]; this.parse(this.song); this.step = 0; this.nextT = Snd.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.tick(), 40);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.name = null; this.pending = null; },
  tick() {
    const c = Snd.ctx, s = this.song; if (!c || !s) return; const sd = 60 / s.bpm / 2;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.15) {
      const st = this.step % s.len, d = this.nextT - c.currentTime, bar = Math.floor(st / 8) % s.ch.length, b = st % 8, ch = s.ch[bar];
      const ev = s.byStep[st];
      if (ev) Snd.tone(s.lead, mfreq(ev.m), 0, sd * ev.len * 0.92, s.lead === 'triangle' ? 0.5 : 0.22, d, Snd.mus);
      if (b % 2 === 0) { const bn = 36 + ch.root + [0, 12, 7, 12][b / 2]; Snd.tone('triangle', mfreq(bn), 0, sd * 1.6, 0.55, d, Snd.mus); }
      const arp = 60 + [ch.root, ch.third, ch.fifth, ch.third][b % 4]; Snd.tone('square', mfreq(arp), 0, sd * 0.5, 0.07, d, Snd.mus);
      const dr = s.drums[b];
      if (dr === 'k') Snd.tone('sine', 150, 40, 0.12, 0.9, d, Snd.mus);
      else if (dr === 's') Snd.noise(0.1, 0.4, 1800, 1200, d, 0.7, Snd.mus);
      else if (dr === 'h') Snd.noise(0.03, 0.18, 7000, 7000, d, 0.5, Snd.mus, 'highpass');
      this.nextT += sd; this.step++;
    }
  }
};
