// 音：すべて Web Audio でその場合成する（録音素材なし）
// 炎のごうごうという低い唸り、薪のはぜる音、濡れた薪のシューという音、風、虫、遠くのフクロウ。
export class Sound {
  constructor() { this.ctx = null; this.ready = false; this.t = 0; this.fl = 0; this.fl2 = 0; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const sr = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);

    // 残響（森の中のやわらかい響き）
    const ir = ctx.createBuffer(2, sr*1.8, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < d.length; i++) { const t = i/sr; lp += ((Math.random()*2 - 1) - lp)*0.25; d[i] = lp*Math.exp(-t*3.6)*(t < 0.012 ? t/0.012 : 1); }
    }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.22; this.rev.connect(wet); wet.connect(this.master);
    this.bus = ctx.createGain(); this.bus.connect(this.master);
    this.send = ctx.createGain(); this.send.gain.value = 0.5; this.bus.connect(this.send); this.send.connect(this.rev);
    this.far = ctx.createGain(); this.far.connect(this.rev);          // 遠くの音は残響だけ多め
    const farDry = ctx.createGain(); farDry.gain.value = 0.5; this.far.connect(farDry); farDry.connect(this.master);

    // ノイズ素材
    const mk = (sec, fn) => { const b = ctx.createBuffer(1, sr*sec, sr); fn(b.getChannelData(0)); return b; };
    this.white = mk(3, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1; });
    this.pink = mk(5, d => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random()*2 - 1;
        b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759; b2 = 0.969*b2 + w*0.153852; b3 = 0.8665*b3 + w*0.3104856; b4 = 0.55*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w*0.5362)*0.11; b6 = w*0.115926; } });
    this.brown = mk(5, d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02*(Math.random()*2 - 1))/1.02; d[i] = l*3.5; } });
    const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random()*buf.duration); return s; };
    const chain = (src, ...nodes) => { let n = src; for (const m of nodes) { n.connect(m); n = m; } return n; };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // 炎の唸り（低域）と、はためき（中域）
    this.roarLP = bq('lowpass', 220, 0.6); this.gRoar = gain();
    chain(loop(this.brown), this.roarLP, this.gRoar, this.bus);
    this.flutBP = bq('bandpass', 520, 0.55); this.gFlut = gain();
    chain(loop(this.pink, 0.9), this.flutBP, this.gFlut, this.bus);
    this.gAir = gain(); chain(loop(this.white, 0.7), bq('highpass', 3200, 0.5), bq('lowpass', 9000, 0.5), this.gAir, this.bus);
    // 濡れた薪のシュー
    this.gHiss = gain(); this.hissBP = bq('bandpass', 6200, 1.4);
    chain(loop(this.white), this.hissBP, this.gHiss, this.bus);
    this.gWhistle = gain(); this.whBP = bq('bandpass', 3400, 28);
    chain(loop(this.white, 1.1), this.whBP, this.gWhistle, this.bus);
    // 息
    this.gBlow = gain(); this.blowBP = bq('bandpass', 1100, 0.9);
    chain(loop(this.pink, 1.2), this.blowBP, this.gBlow, this.bus);
    // 風と、木の葉のざわめき
    this.windBP = bq('bandpass', 420, 0.5); this.gWind = gain();
    chain(loop(this.pink, 0.6), this.windBP, this.gWind, this.far);
    this.gLeaves = gain(); chain(loop(this.white, 0.8), bq('highpass', 2400, 0.4), bq('lowpass', 7000, 0.4), this.gLeaves, this.far);

    // はぜる音の素材をあらかじめ作る
    this.crk = { tick: [], snap: [], pop: [] };
    const R = Math.random;
    for (let k = 0; k < 14; k++) this.crk.tick.push(mk(0.03, d => {
      const tau = 0.0006 + R()*0.0025; let prev = 0;
      for (let i = 0; i < d.length; i++) { const t = i/sr, w = R()*2 - 1; d[i] = (w - prev*0.7)*Math.exp(-t/tau); prev = w; }
    }));
    for (let k = 0; k < 12; k++) this.crk.snap.push(mk(0.09, d => {
      const f1 = 1400 + R()*3600, f2 = f1*(1.5 + R()), tau = 0.004 + R()*0.012, tn = 0.001 + R()*0.004;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        d[i] = (Math.sin(6.283*f1*t)*0.5 + Math.sin(6.283*f2*t)*0.3)*Math.exp(-t/tau) + (R()*2 - 1)*Math.exp(-t/tn)*0.9; }
    }));
    for (let k = 0; k < 8; k++) this.crk.pop.push(mk(0.22, d => {
      const f = 130 + R()*260, tau = 0.018 + R()*0.03, f2 = 900 + R()*1500;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        d[i] = Math.sin(6.283*f*t*(1 + 0.6*Math.exp(-t/0.01)))*Math.exp(-t/tau)*0.9 + Math.sin(6.283*f2*t)*Math.exp(-t/0.006)*0.35 + (R()*2 - 1)*Math.exp(-t/0.003)*0.8; }
    }));
    // 木が当たる音
    this.knockBuf = [];
    for (let k = 0; k < 6; k++) this.knockBuf.push(mk(0.3, d => {
      const f = 190 + R()*240, tau = 0.03 + R()*0.03;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        d[i] = (Math.sin(6.283*f*t) + 0.5*Math.sin(6.283*f*2.76*t)*Math.exp(-t/0.012) + 0.3*Math.sin(6.283*f*5.4*t)*Math.exp(-t/0.006))*Math.exp(-t/tau)*0.6 + (R()*2 - 1)*Math.exp(-t/0.002)*0.5; }
    }));
    // 虫の声（コオロギふう／スズムシふう）
    this.bug = [];
    this.bug.push(mk(0.5, d => { for (let i = 0; i < d.length; i++) { const t = i/sr, ph = (t % 0.042)/0.042; const env = t < 0.3 ? Math.pow(Math.sin(Math.min(1, ph/0.55)*Math.PI), 2) : 0; d[i] = Math.sin(6.283*4150*t + Math.sin(t*90)*0.4)*env*0.5; } }));
    this.bug.push(mk(1.6, d => { for (let i = 0; i < d.length; i++) { const t = i/sr; const env = Math.sin(Math.min(1, t/1.5)*Math.PI)*(0.55 + 0.45*Math.sin(6.283*31*t)); d[i] = (Math.sin(6.283*4480*t)*0.7 + Math.sin(6.283*8960*t)*0.12)*env*0.4; } }));
    this.bug.push(mk(0.25, d => { for (let i = 0; i < d.length; i++) { const t = i/sr, ph = (t % 0.06)/0.06; const env = t < 0.19 ? Math.pow(Math.sin(Math.min(1, ph/0.4)*Math.PI), 2) : 0; d[i] = Math.sin(6.283*5600*t)*env*0.4; } }));
    // フクロウ
    this.owl = mk(2.6, d => {
      const hoot = (t0, len, f) => { for (let i = Math.floor(t0*sr); i < Math.floor((t0 + len)*sr) && i < d.length; i++) { const t = i/sr - t0, e = Math.pow(Math.sin(Math.PI*t/len), 1.5), ff = f*(1 - 0.05*t/len);
        d[i] += (Math.sin(6.283*ff*t) + 0.22*Math.sin(6.283*ff*2*t) + 0.06*Math.sin(6.283*ff*3*t))*e*0.5; } };
      hoot(0, 0.45, 345); hoot(0.95, 0.22, 330); hoot(1.22, 0.75, 338);
    });
    this.nextBug = [1.5, 3.2, 6]; this.nextOwl = 35 + Math.random()*40;
    this.ready = true;
  }

  _play(buf, gainV, pan = 0, rate = 1, dest = null, when = 0) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gainV;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(g);
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(dest || this.bus); } else g.connect(dest || this.bus);
    s.start(ctx.currentTime + when);
  }

  // power: 0..1 の強さ。小さいほど「チッ」、大きいほど「パチッ」「ボンッ」
  crackle(power, pan = 0) {
    if (!this.ready) return;
    const R = Math.random;
    if (power > 0.82) this._play(this.crk.pop[(R()*this.crk.pop.length) | 0], 0.35 + 0.5*power, pan, 0.8 + R()*0.5);
    else if (power > 0.3) this._play(this.crk.snap[(R()*this.crk.snap.length) | 0], 0.10 + 0.5*power, pan, 0.75 + R()*0.6);
    else this._play(this.crk.tick[(R()*this.crk.tick.length) | 0], 0.05 + 0.5*power, pan, 0.7 + R()*0.7);
  }
  knock(power, kind, pan = 0) {
    if (!this.ready) return;
    const R = Math.random;
    if (kind === 'tinder') { this._play(this.crk.tick[0], 0.08*power, pan, 0.4); return; }
    const rate = kind === 'kindling' ? 2.6 + R()*1.2 : 0.85 + R()*0.4;
    this._play(this.knockBuf[(R()*this.knockBuf.length) | 0], (kind === 'kindling' ? 0.12 : 0.5)*power, pan, rate);
  }
  crumble(power, pan = 0) {
    if (!this.ready) return;
    this._play(this.knockBuf[(Math.random()*this.knockBuf.length) | 0], 0.3*power, pan, 0.55 + Math.random()*0.2);
    for (let i = 0; i < 6; i++) this._play(this.crk.tick[(Math.random()*this.crk.tick.length) | 0], 0.15*Math.random(), pan + (Math.random() - 0.5)*0.3, 0.6 + Math.random(), null, Math.random()*0.35);
    this._play(this.crk.snap[(Math.random()*this.crk.snap.length) | 0], 0.25*power, pan, 0.6);
  }
  matchStrike() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.16); bp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.03); g.gain.linearRampToValueAtTime(0.22, t + 0.17);
    g.gain.linearRampToValueAtTime(0.4, t + 0.24); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    s.connect(bp); bp.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + 1.1);
  }
  matchOut() { if (this.ready) this._play(this.crk.tick[2], 0.1, 0, 0.3); }

  // 毎フレームの連続音の更新
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.t += dt;
    // 炎のはためき：不規則にうねる包絡
    this.fl += (Math.random() - 0.5)*dt*22; this.fl *= Math.exp(-dt*6);
    this.fl2 += (Math.random() - 0.5)*dt*60; this.fl2 *= Math.exp(-dt*16);
    const I = Math.min(2.2, s.intensity), sI = Math.sqrt(I);
    const env = Math.max(0.2, 1 + this.fl*1.3 + this.fl2*0.9);
    const set = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc);
    set(this.gRoar.gain, (0.02*Math.min(1, s.glow*2) + 0.55*sI*I/(0.4 + I))*env);
    set(this.roarLP.frequency, 130 + 260*sI + 400*s.blow);
    set(this.gFlut.gain, 0.16*sI*Math.max(0, env - 0.35) + 0.3*s.blow*Math.min(1, I + s.glow));
    set(this.flutBP.frequency, 380 + 380*sI*env);
    set(this.gAir.gain, 0.012*sI + 0.004*Math.min(1, s.glow));
    const hw = 0.7 + 0.3*Math.sin(this.t*7.3) + 0.3*Math.sin(this.t*2.1);
    set(this.gHiss.gain, 0.09*s.hiss*hw);
    set(this.gWhistle.gain, 0.5*s.hiss*s.hiss*Math.max(0, Math.sin(this.t*0.9))); set(this.whBP.frequency, 3000 + 700*Math.sin(this.t*0.37));
    set(this.gBlow.gain, 0.42*s.blow, 0.04);
    const w = Math.abs(s.wind);
    set(this.gWind.gain, 0.035 + 0.30*w*w, 0.5); set(this.windBP.frequency, 300 + 380*w, 0.5);
    set(this.gLeaves.gain, 0.004 + 0.07*w*w*w, 0.6);
    // 虫
    for (let k = 0; k < this.nextBug.length; k++) {
      this.nextBug[k] -= dt;
      if (this.nextBug[k] <= 0) {
        const quiet = 1 - 0.5*w;
        this._play(this.bug[k], (0.018 + 0.02*Math.random())*quiet, [-0.7, 0.55, 0.1][k] + (Math.random() - 0.5)*0.1, 0.97 + Math.random()*0.06, this.far);
        this.nextBug[k] = [0.62, 2.6, 0.9][k]*(0.9 + Math.random()*0.5) + (Math.random() < 0.12 ? 3 + Math.random()*9 : 0);
      }
    }
    this.nextOwl -= dt;
    if (this.nextOwl <= 0) { this._play(this.owl, 0.05, Math.random() < 0.5 ? -0.8 : 0.7, 0.96 + Math.random()*0.08, this.far); this.nextOwl = 70 + Math.random()*130; }
  }

  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
}
