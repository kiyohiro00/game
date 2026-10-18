'use strict';
const Snd = (() => {
  let ac = null, master, sfxG, musG, rev, noiseBuf;
  let muted = false, track = null, nextBar = 0, barIdx = 0, timer = null;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxG = ac.createGain(); sfxG.gain.value = 0.75; sfxG.connect(comp);
    musG = ac.createGain(); musG.gain.value = 0.2; musG.connect(comp);
    rev = ac.createConvolver();
    const len = ac.sampleRate * 2.4, ib = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rev.buffer = ib;
    const rg = ac.createGain(); rg.gain.value = 0.32; rev.connect(rg); rg.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    if (track) startTrack(track, true);
  }
  function tone(o) {
    if (!ac) return;
    const t = ac.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol || 0.2, a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxG); if (o.rev) g.connect(rev);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(o) {
    if (!ac) return;
    const t = ac.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.filt || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.freq || 1000, t); if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t + dur);
    const g = ac.createGain(), v = o.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxG); if (o.rev) g.connect(rev);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  const SFX = {
    cursor: () => tone({ f: 1320, type: 'triangle', dur: 0.035, vol: 0.05 }),
    select: () => { tone({ f: 784, dur: 0.08, vol: 0.12, type: 'triangle' }); tone({ f: 1175, dur: 0.12, vol: 0.1, type: 'triangle', delay: 0.05 }); },
    cancel: () => tone({ f: 520, f2: 330, dur: 0.12, vol: 0.1, type: 'triangle' }),
    menu: () => tone({ f: 990, dur: 0.05, vol: 0.07, type: 'triangle' }),
    step: () => noise({ dur: 0.06, vol: 0.05, filt: 'lowpass', freq: 500 }),
    swing: () => noise({ dur: 0.2, vol: 0.4, filt: 'bandpass', freq: 3200, freq2: 700, q: 1.4 }),
    thrust: () => noise({ dur: 0.14, vol: 0.35, filt: 'bandpass', freq: 1500, freq2: 3500, q: 1.2 }),
    dash: () => noise({ dur: 0.22, vol: 0.18, filt: 'lowpass', freq: 700, freq2: 200 }),
    hit: () => { noise({ dur: 0.16, vol: 0.7, filt: 'lowpass', freq: 3000, freq2: 250 }); tone({ f: 150, f2: 45, dur: 0.22, vol: 0.55 }); tone({ f: 2600, f2: 2100, dur: 0.12, vol: 0.05, type: 'square', lp: 5000 }); },
    crit: () => { noise({ dur: 0.35, vol: 0.9, filt: 'lowpass', freq: 5000, freq2: 200, rev: true }); tone({ f: 110, f2: 35, dur: 0.45, vol: 0.8 }); tone({ f: 1760, dur: 0.9, vol: 0.08, type: 'triangle', rev: true }); tone({ f: 2637, dur: 0.7, vol: 0.05, type: 'triangle', rev: true }); },
    miss: () => noise({ dur: 0.25, vol: 0.25, filt: 'highpass', freq: 800, freq2: 4000 }),
    draw: () => tone({ f: 110, f2: 160, dur: 0.35, vol: 0.06, type: 'sawtooth', lp: 600 }),
    arrow: () => { tone({ f: 330, f2: 180, dur: 0.18, vol: 0.12, type: 'triangle' }); noise({ dur: 0.22, vol: 0.18, filt: 'highpass', freq: 3000, freq2: 1200 }); },
    cast: () => { [72, 76, 79, 84].forEach((m, i) => tone({ f: mf(m), dur: 0.6, vol: 0.05, type: 'sine', delay: i * 0.06, rev: true })); noise({ dur: 0.6, vol: 0.08, filt: 'bandpass', freq: 4000, freq2: 8000, q: 3, rev: true }); },
    fire: () => { noise({ dur: 0.7, vol: 0.5, filt: 'lowpass', freq: 1800, freq2: 200, attack: 0.05, rev: true }); tone({ f: 90, f2: 40, dur: 0.6, vol: 0.4 }); },
    thunder: () => { noise({ dur: 0.12, vol: 0.6, filt: 'highpass', freq: 3000 }); noise({ dur: 0.9, vol: 0.55, filt: 'lowpass', freq: 600, freq2: 80, delay: 0.03, rev: true }); },
    dark: () => { tone({ f: 320, f2: 60, dur: 0.9, vol: 0.18, type: 'sawtooth', lp: 900, rev: true }); tone({ f: 330, f2: 70, dur: 0.9, vol: 0.12, type: 'sawtooth', lp: 900, detune: 18 }); },
    heal: () => [84, 88, 91, 96, 100].forEach((m, i) => tone({ f: mf(m), dur: 0.9, vol: 0.06, type: 'sine', delay: i * 0.08, rev: true })),
    charge: () => { tone({ f: 220, f2: 1400, dur: 0.55, vol: 0.12, type: 'sawtooth', lp: 2500, rev: true }); noise({ dur: 0.55, vol: 0.12, filt: 'bandpass', freq: 1000, freq2: 6000, q: 2 }); },
    death: () => { tone({ f: 440, f2: 110, dur: 1.0, vol: 0.12, type: 'triangle', rev: true }); noise({ dur: 1.0, vol: 0.15, filt: 'lowpass', freq: 1200, freq2: 100, rev: true }); },
    levelup: () => [67, 72, 76, 79, 84].forEach((m, i) => { tone({ f: mf(m), dur: 0.35 + (i === 4 ? 0.6 : 0), vol: 0.1, type: 'triangle', delay: i * 0.09, rev: true }); tone({ f: mf(m - 12), dur: 0.3, vol: 0.06, type: 'square', lp: 1500, delay: i * 0.09 }); }),
    stat: () => tone({ f: mf(91), dur: 0.15, vol: 0.06, type: 'triangle' }),
    phase: () => { [50, 57, 62, 66].forEach((m, i) => tone({ f: mf(m), dur: 1.6, vol: 0.09, type: 'sawtooth', lp: 1800, attack: 0.04, delay: i * 0.02, rev: true })); noise({ dur: 1.2, vol: 0.2, filt: 'lowpass', freq: 300, rev: true }); },
    ephase: () => { [48, 51, 55, 60].forEach((m, i) => tone({ f: mf(m), dur: 1.6, vol: 0.09, type: 'sawtooth', lp: 1400, attack: 0.04, delay: i * 0.02, rev: true })); noise({ dur: 1.2, vol: 0.25, filt: 'lowpass', freq: 250, rev: true }); },
    visit: () => [79, 83, 86].forEach((m, i) => tone({ f: mf(m), dur: 0.5, vol: 0.08, type: 'sine', delay: i * 0.1, rev: true })),
    victory: () => [60, 64, 67, 72, 67, 72, 76, 79].forEach((m, i) => tone({ f: mf(m), dur: 0.5, vol: 0.1, type: 'triangle', delay: i * 0.12, rev: true })),
  };
  function play(n) { if (!ac || muted) return; const f = SFX[n]; if (f) try { f(); } catch (e) { } }

  // ---------------- music ----------------
  const TRACKS = {
    title: { bpm: 66, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], mel: [[69, 0, 0, 0], [65, 0, 67, 0], [72, 0, 0, 69], [67, 0, 0, 0]], arp: 'slow' },
    player: {
      bpm: 88,
      chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55], [43, 46, 50], [46, 50, 53], [48, 52, 55], [45, 49, 52]],
      mel: [[69, 0, 74, 0], [77, 0, 76, 74], [72, 0, 69, 0], [67, 0, 0, 0], [70, 0, 74, 0], [77, 0, 79, 77], [76, 0, 74, 72], [73, 0, 0, 0]], arp: 'eighth'
    },
    enemy: {
      bpm: 104,
      chords: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]],
      mel: [[0, 0, 63, 62], [60, 0, 0, 0], [0, 0, 65, 63], [62, 0, 59, 0]], arp: 'pulse'
    },
  };
  function scheduleBar(tr, t0) {
    const beat = 60 / tr.bpm, bar = beat * 4;
    const ch = tr.chords[barIdx % tr.chords.length], mel = tr.mel[barIdx % tr.mel.length];
    // pad
    for (const m of ch) for (const det of [-7, 7]) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mf(m + 12); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = tr === TRACKS.enemy ? 700 : 1100;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.035, t0 + bar * 0.3); g.gain.linearRampToValueAtTime(0.0001, t0 + bar * 1.02);
      o.connect(f); f.connect(g); g.connect(musG); g.connect(rev); o.start(t0); o.stop(t0 + bar * 1.05);
    }
    // bass
    const bassNotes = tr.arp === 'pulse' ? 8 : 2;
    for (let i = 0; i < bassNotes; i++) {
      const tt = t0 + i * bar / bassNotes, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = mf(ch[0] - 12);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.22, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + bar / bassNotes * 0.9);
      o.connect(g); g.connect(musG); o.start(tt); o.stop(tt + bar / bassNotes);
    }
    // arpeggio
    const n = tr.arp === 'slow' ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const tt = t0 + i * bar / n, m = ch[i % 3] + 24 + (i >= n / 2 && tr.arp !== 'pulse' ? 0 : 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = tr.arp === 'slow' ? 'sine' : 'triangle'; o.frequency.value = mf(m);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(tr.arp === 'slow' ? 0.05 : 0.04, tt + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, tt + bar / n * 1.6);
      o.connect(g); g.connect(musG); g.connect(rev); o.start(tt); o.stop(tt + bar / n * 1.7);
    }
    // melody
    mel.forEach((m, i) => {
      if (!m) return;
      let len = 1; for (let k = i + 1; k < 4 && !mel[k]; k++) len++;
      const tt = t0 + i * beat, d = len * beat;
      for (const [type, vol, det] of [['triangle', 0.07, 0], ['sine', 0.05, 5]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = mf(m); o.detune.value = det;
        const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5; lg.gain.value = 6; lfo.connect(lg); lg.connect(o.detune);
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(vol, tt + 0.04); g.gain.setValueAtTime(vol, tt + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, tt + d * 0.98);
        o.connect(g); g.connect(musG); g.connect(rev); o.start(tt); o.stop(tt + d); lfo.start(tt); lfo.stop(tt + d);
      }
    });
    if (tr.arp === 'pulse') for (let i = 0; i < 4; i++) noise({ dur: 0.18, vol: i % 2 ? 0.05 : 0.11, filt: 'lowpass', freq: i % 2 ? 2500 : 160, bus: musG, delay: (t0 + i * beat) - ac.currentTime });
    return bar;
  }
  function startTrack(name, force) {
    if (track === name && !force) return;
    track = name;
    if (!ac) return;
    if (timer) clearInterval(timer);
    barIdx = 0; nextBar = ac.currentTime + 0.1;
    const tr = TRACKS[name];
    if (!tr) return;
    timer = setInterval(() => {
      if (!ac) return;
      while (nextBar < ac.currentTime + 0.6) { nextBar += scheduleBar(tr, nextBar); barIdx++; }
    }, 120);
  }
  function stopMusic() { track = null; if (timer) clearInterval(timer); timer = null; }
  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.05); }
  return { init, play, music: startTrack, stopMusic, setMuted, get muted() { return muted; } };
})();
