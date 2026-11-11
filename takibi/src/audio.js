// 音：すべて Web Audio でその場合成する（録音素材なし）
// 炎：低い唸り＋はためき＋燃焼の「さー」という地の音。明かりの明滅と同じ信号で揺らす。
// 薪：はぜる音は「カチッ」1発ではなく、数発が続けて鳴る小さな群れとして出す。
// 道具：火ばさみの金属音、薪を取る・置く、マッチ、息、衣擦れ。
export class Sound {
  constructor() { this.ctx = null; this.ready = false; this.t = 0; this.fl = 0; this.fl2 = 0; this.prox = 1; this.lastI = 0; this.whoompCd = 0; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const sr = this.sr = ctx.sampleRate;
    const R = Math.random;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.006; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.master.gain.setTargetAtTime(0.95, ctx.currentTime, 1.2);

    const mk = (sec, fn, ch = 1) => { const b = ctx.createBuffer(ch, Math.ceil(sr*sec), sr); for (let c = 0; c < ch; c++) fn(b.getChannelData(c), c); return b; };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const chain = (src, ...nodes) => { let n = src; for (const m of nodes) { n.connect(m); n = m; } return n; };
    const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, R()*buf.duration); return s; };
    this._bq = bq;

    // 残響：森のやわらかい響き（遠い音ほど多く送る）
    const ir = mk(2.0, (d) => { let lp = 0; for (let i = 0; i < d.length; i++) { const t = i/sr; lp += ((R()*2 - 1) - lp)*0.22; d[i] = lp*Math.exp(-t*3.2)*(t < 0.015 ? t/0.015 : 1); } }, 2);
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const wet = gain(0.2); this.rev.connect(wet); wet.connect(this.master);
    // 焚火：近くで鳴る乾いた音。地面からの早い反射をひとつだけ足す
    this.fire = gain(1); this.fire.connect(this.master);
    const refl = ctx.createDelay(0.05); refl.delayTime.value = 0.0042; const reflG = gain(0.28); const reflLP = bq('lowpass', 3800, 0.5);
    chain(this.fire, refl, reflLP, reflG, this.master);
    const fsend = gain(0.16); this.fire.connect(fsend); fsend.connect(this.rev);
    // 手元：自分の出す音（息・衣擦れ・道具）。ほぼ乾いたまま
    this.near = gain(1); this.near.connect(this.master);
    const nsend = gain(0.07); this.near.connect(nsend); nsend.connect(this.rev);
    // 遠景
    this.far = gain(1); this.far.connect(this.rev);
    const farDry = gain(0.5); this.far.connect(farDry); farDry.connect(this.master);

    // ノイズ素材
    this.white = mk(3, d => { for (let i = 0; i < d.length; i++) d[i] = R()*2 - 1; });
    this.pink = mk(6, d => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) { const w = R()*2 - 1;
        b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759; b2 = 0.969*b2 + w*0.153852; b3 = 0.8665*b3 + w*0.3104856; b4 = 0.55*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w*0.5362)*0.11; b6 = w*0.115926; } });
    this.brown = mk(6, d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02*(R()*2 - 1))/1.02; d[i] = l*3.5; } });
    // 「ばたばた」：数十Hzで不規則に脈打つ雑音（炎のはためき・息の乱れ・擦れる音の粒立ちに使う）
    this.grain = mk(4, d => { let env = 0, tgt = 0, n = 0; for (let i = 0; i < d.length; i++) { if (--n <= 0) { tgt = R() < 0.55 ? R() : 0; n = sr*(0.006 + R()*0.03); } env += (tgt - env)*0.004; d[i] = (R()*2 - 1)*env; } });

    // ── 炎 ──
    this.roarLP = bq('lowpass', 200, 0.5); this.roarHP = bq('highpass', 38, 0.7); this.gRoar = gain();
    chain(loop(this.brown), this.roarHP, this.roarLP, this.gRoar, this.fire);
    this.flutBP = bq('bandpass', 480, 0.5); this.gFlut = gain();
    chain(loop(this.grain, 0.55), this.flutBP, this.gFlut, this.fire);
    this.gBody = gain(); chain(loop(this.pink, 0.8), bq('bandpass', 900, 0.4), this.gBody, this.fire);
    this.gAir = gain(); chain(loop(this.white, 0.7), bq('highpass', 3500, 0.5), bq('lowpass', 9500, 0.5), this.gAir, this.fire);
    // 濡れた薪
    this.gHiss = gain(); this.hissBP = bq('bandpass', 6200, 1.4);
    chain(loop(this.white), this.hissBP, this.gHiss, this.fire);
    this.gWhistle = gain(); this.whBP = bq('bandpass', 3400, 28);
    chain(loop(this.white, 1.1), this.whBP, this.gWhistle, this.fire);
    // ── 息 ──（すぼめた唇の「ふーっ」：2つの山＋乱れ）
    this.gBlow = gain();
    const bl1 = bq('bandpass', 950, 1.1), bl2 = bq('bandpass', 2700, 1.6), bl2g = gain(0.34), blIn = gain(1);
    const blSrc = loop(this.pink, 1.15), blGr = loop(this.grain, 1.4), blGrG = gain(0.5);
    blSrc.connect(blIn); blGr.connect(blGrG); blGrG.connect(blIn);
    blIn.connect(bl1); bl1.connect(this.gBlow); blIn.connect(bl2); bl2.connect(bl2g); bl2g.connect(this.gBlow);
    this.gBlow.connect(this.near); this.blowBP = bl1;
    this.gInhale = gain(); this.inBP = bq('bandpass', 1500, 1.3);
    chain(loop(this.white, 0.9), this.inBP, bq('lowpass', 4200, 0.5), this.gInhale, this.near);
    // ── 衣擦れ・擦れる音 ──
    this.gRustle = gain(); chain(loop(this.grain, 1.9), bq('bandpass', 2600, 0.6), this.gRustle, this.near);
    this.gScrape = gain(); this.scrBP = bq('bandpass', 1300, 0.9); chain(loop(this.grain, 1.0), this.scrBP, this.gScrape, this.fire);
    // ── 風と葉 ──
    this.windBP = bq('bandpass', 420, 0.5); this.gWind = gain();
    chain(loop(this.pink, 0.6), this.windBP, this.gWind, this.far);
    this.gLeaves = gain(); chain(loop(this.white, 0.8), bq('highpass', 2400, 0.4), bq('lowpass', 7000, 0.4), this.gLeaves, this.far);

    // ── はぜる音の素材 ──
    this.crk = { tick: [], snap: [], pop: [], tink: [] };
    for (let k = 0; k < 16; k++) this.crk.tick.push(mk(0.03, d => {
      const tau = 0.0005 + R()*0.0022; let prev = 0;
      for (let i = 0; i < d.length; i++) { const t = i/sr, w = R()*2 - 1; d[i] = (w - prev*0.72)*Math.exp(-t/tau); prev = w; }
    }));
    for (let k = 0; k < 14; k++) this.crk.snap.push(mk(0.1, d => {
      // 木の繊維が弾ける：鋭い立ち上がり＋材の中で響く2つの山
      const f1 = 1100 + R()*3200, f2 = f1*(1.6 + R()*1.2), tau = 0.003 + R()*0.011, tn = 0.0008 + R()*0.003, ph = R()*6.28;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        d[i] = (Math.sin(6.283*f1*t + ph)*0.5 + Math.sin(6.283*f2*t)*0.28)*Math.exp(-t/tau) + (R()*2 - 1)*Math.exp(-t/tn)*1.0; }
    }));
    for (let k = 0; k < 9; k++) this.crk.pop.push(mk(0.3, d => {
      // 樹液や空気が爆ぜる：低い「ボッ」＋鋭い破裂＋細かな飛び散り
      const f = 95 + R()*210, tau = 0.02 + R()*0.035, f2 = 800 + R()*1400;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        const body = Math.sin(6.283*f*t*(1 + 0.7*Math.exp(-t/0.012)))*Math.exp(-t/tau)*0.95;
        const crack = Math.sin(6.283*f2*t)*Math.exp(-t/0.005)*0.35 + (R()*2 - 1)*Math.exp(-t/0.0028)*0.9;
        const tail = (R()*2 - 1)*(R() < 0.02 ? 1 : 0.05)*Math.exp(-t/0.07)*0.35*(t > 0.01 ? 1 : 0);
        d[i] = body + crack + tail; }
    }));
    for (let k = 0; k < 8; k++) this.crk.tink.push(mk(0.12, d => {
      // 冷えていく熾の「ちりっ」「きん」
      const f = 3800 + R()*4200, tau = 0.006 + R()*0.02;
      for (let i = 0; i < d.length; i++) { const t = i/sr; d[i] = (Math.sin(6.283*f*t)*0.6 + Math.sin(6.283*f*1.48*t)*0.25)*Math.exp(-t/tau) + (R()*2 - 1)*Math.exp(-t/0.0007)*0.5; }
    }));
    // 木が当たる音（大きさの違う薪）
    this.knockBuf = [];
    for (let k = 0; k < 8; k++) this.knockBuf.push(mk(0.32, d => {
      const f = 170 + R()*230, tau = 0.028 + R()*0.03, r2 = 2.4 + R()*0.7, r3 = 4.8 + R()*1.2;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        d[i] = (Math.sin(6.283*f*t) + 0.5*Math.sin(6.283*f*r2*t)*Math.exp(-t/0.012) + 0.28*Math.sin(6.283*f*r3*t)*Math.exp(-t/0.006))*Math.exp(-t/tau)*0.6 + (R()*2 - 1)*Math.exp(-t/0.0022)*0.5; }
    }));
    // やわらかく落ちる音（灰・土）
    this.thud = mk(0.35, d => { let lp = 0; for (let i = 0; i < d.length; i++) { const t = i/sr; lp += ((R()*2 - 1) - lp)*0.06; d[i] = lp*Math.exp(-t/0.06)*2.2 + Math.sin(6.283*70*t)*Math.exp(-t/0.05)*0.5; } });
    // 火ばさみ：薄い鋼板どうしが当たる「カチ」。非整数倍の倍音が短く鳴る
    this.tink = [];
    for (let k = 0; k < 5; k++) this.tink.push(mk(0.3, d => {
      const f0 = 1500 + R()*700; const pr = [1, 1.71 + R()*0.1, 2.83 + R()*0.15, 4.2 + R()*0.3, 5.9 + R()*0.4], pa = [0.5, 0.42, 0.3, 0.2, 0.12];
      const taus = pr.map((r, i) => (0.05 + R()*0.04)/(1 + i*0.7));
      for (let i = 0; i < d.length; i++) { const t = i/sr; let s = 0;
        for (let j = 0; j < pr.length; j++) s += pa[j]*Math.sin(6.283*f0*pr[j]*t)*Math.exp(-t/taus[j]);
        d[i] = s*0.7 + (R()*2 - 1)*Math.exp(-t/0.0009)*0.6; }
    }));
    // 火ばさみが熾や薪に食い込む「ジャリ」
    this.crunch = [];
    for (let k = 0; k < 4; k++) this.crunch.push(mk(0.4, d => {
      let lp = 0, env = 0, n = 0;
      for (let i = 0; i < d.length; i++) { const t = i/sr;
        if (--n <= 0) { env = R() < 0.6 ? R()*Math.exp(-t/0.11) : 0; n = sr*(0.002 + R()*0.012); }
        const w = R()*2 - 1; lp += (w - lp)*0.35;
        d[i] = (w - lp)*env*0.9 + lp*Math.exp(-t/0.05)*0.5; }
    }));
    // マッチ箱のかたかた
    this.rattle = mk(0.35, d => {
      const hits = []; for (let h = 0; h < 7; h++) hits.push(R()*0.26);
      for (let i = 0; i < d.length; i++) { const t = i/sr; let s = 0;
        for (const h of hits) if (t > h) { const u = t - h; s += (Math.sin(6.283*2900*u) + 0.6*Math.sin(6.283*4700*u))*Math.exp(-u/0.004)*0.4 + (R()*2 - 1)*Math.exp(-u/0.0015)*0.35; }
        d[i] = s*0.5; }
    });
    // 乾いた削り屑のかさかさ
    this.dryRustle = mk(0.4, d => { let prev = 0, env = 0, n = 0; for (let i = 0; i < d.length; i++) { const t = i/sr; if (--n <= 0) { env = R() < 0.5 ? R() : 0; n = sr*(0.001 + R()*0.007); } const w = R()*2 - 1; d[i] = (w - prev*0.85)*env*Math.sin(Math.min(1, t/0.35)*Math.PI)*0.8; prev = w; } });
    // 虫の声・フクロウ
    this.bug = [];
    this.bug.push(mk(0.5, d => { for (let i = 0; i < d.length; i++) { const t = i/sr, ph = (t % 0.042)/0.042; const env = t < 0.3 ? Math.pow(Math.sin(Math.min(1, ph/0.55)*Math.PI), 2) : 0; d[i] = Math.sin(6.283*4150*t + Math.sin(t*90)*0.4)*env*0.5; } }));
    this.bug.push(mk(1.6, d => { for (let i = 0; i < d.length; i++) { const t = i/sr; const env = Math.sin(Math.min(1, t/1.5)*Math.PI)*(0.55 + 0.45*Math.sin(6.283*31*t)); d[i] = (Math.sin(6.283*4480*t)*0.7 + Math.sin(6.283*8960*t)*0.12)*env*0.4; } }));
    this.bug.push(mk(0.25, d => { for (let i = 0; i < d.length; i++) { const t = i/sr, ph = (t % 0.06)/0.06; const env = t < 0.19 ? Math.pow(Math.sin(Math.min(1, ph/0.4)*Math.PI), 2) : 0; d[i] = Math.sin(6.283*5600*t)*env*0.4; } }));
    this.owl = mk(2.6, d => {
      const hoot = (t0, len, f) => { for (let i = Math.floor(t0*sr); i < Math.floor((t0 + len)*sr) && i < d.length; i++) { const t = i/sr - t0, e = Math.pow(Math.sin(Math.PI*t/len), 1.5), ff = f*(1 - 0.05*t/len);
        d[i] += (Math.sin(6.283*ff*t) + 0.22*Math.sin(6.283*ff*2*t) + 0.06*Math.sin(6.283*ff*3*t))*e*0.5; } };
      hoot(0, 0.45, 345); hoot(0.95, 0.22, 330); hoot(1.22, 0.75, 338);
    });
    this.nextBug = [1.5, 3.2, 6]; this.nextOwl = 35 + R()*40; this.nextTink = 2;
    this.ready = true;
  }

  _play(buf, gainV, pan = 0, rate = 1, dest = null, when = 0, lp = 0) {
    const ctx = this.ctx;
    if (!(gainV > 0.0005)) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gainV;
    let n = s;
    if (lp > 0) { const f = this._bq('lowpass', lp, 0.5); n.connect(f); n = f; }
    n.connect(g);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(dest || this.fire); } else g.connect(dest || this.fire);
    s.start(ctx.currentTime + when);
  }
  _pick(a) { return a[(Math.random()*a.length) | 0]; }

  // 薪がはぜる。power: 0..1。小さいものほど数が多く、ときどき大きく爆ぜる。
  crackle(power, pan = 0) {
    if (!this.ready) return;
    const R = Math.random, px = this.prox;
    const g = px*px;
    if (power > 0.84) {
      this._play(this._pick(this.crk.pop), (0.3 + 0.5*power)*g, pan, 0.75 + R()*0.55);
      const n = 2 + (R()*4 | 0);   // 爆ぜたあとにぱらぱらと続く
      for (let i = 0; i < n; i++) this._play(this._pick(this.crk.tick), 0.12*R()*g, pan + (R() - 0.5)*0.3, 0.6 + R()*0.9, null, 0.03 + R()*0.22);
    } else if (power > 0.32) {
      this._play(this._pick(this.crk.snap), (0.08 + 0.5*power)*g, pan, 0.7 + R()*0.7);
      if (R() < 0.55) this._play(this._pick(this.crk.snap), (0.05 + 0.3*power)*g*R(), pan + (R() - 0.5)*0.15, 0.8 + R()*0.7, null, 0.015 + R()*0.07);
      if (R() < 0.3) this._play(this._pick(this.crk.tick), 0.1*g*R(), pan, 0.7 + R(), null, 0.05 + R()*0.12);
    } else {
      const n = 1 + (R() < 0.45 ? 1 : 0) + (R() < 0.15 ? 2 : 0);
      for (let i = 0; i < n; i++) this._play(this._pick(this.crk.tick), (0.04 + 0.5*power)*g*(i ? R() : 1), pan + (R() - 0.5)*0.1, 0.6 + R()*0.9, null, i*(0.012 + R()*0.04));
    }
  }
  knock(power, kind, pan = 0) {
    if (!this.ready) return;
    const R = Math.random, g = this.prox;
    if (kind === 'tinder') { this._play(this.dryRustle, 0.12*power*g, pan, 1.2 + R()*0.4); return; }
    if (kind === 'kindling') { this._play(this._pick(this.knockBuf), 0.13*power*g, pan, 2.5 + R()*1.4); if (R() < 0.5) this._play(this._pick(this.knockBuf), 0.07*power*g, pan, 2.8 + R()*1.4, null, 0.03 + R()*0.05); return; }
    this._play(this._pick(this.knockBuf), 0.55*power*g, pan, 0.8 + R()*0.4);
    this._play(this.thud, 0.25*power*g, pan, 0.9 + R()*0.3);
    if (power > 0.4 && R() < 0.6) this._play(this._pick(this.knockBuf), 0.22*power*g, pan, 0.9 + R()*0.5, null, 0.05 + R()*0.08);   // 弾んでもう一度当たる
  }
  crumble(power, pan = 0) {
    if (!this.ready) return;
    const R = Math.random, g = this.prox;
    this._play(this.thud, 0.5*power*g, pan, 0.7 + R()*0.3);
    this._play(this._pick(this.crunch), 0.3*power*g, pan, 0.6 + R()*0.3);
    this._play(this._pick(this.knockBuf), 0.2*power*g, pan, 0.5 + R()*0.2, null, 0.02);
    for (let i = 0; i < 8; i++) this._play(this._pick(this.crk.tick), 0.16*R()*g, pan + (R() - 0.5)*0.3, 0.6 + R(), null, R()*0.45);
  }
  // 火が急に大きくなるときの「ぼうっ」
  whoomp(power) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const lp = this._bq('lowpass', 160, 0.7); lp.frequency.setValueAtTime(90, t); lp.frequency.linearRampToValueAtTime(420, t + 0.18); lp.frequency.exponentialRampToValueAtTime(110, t + 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5*power*this.prox, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    s.connect(lp); lp.connect(g); g.connect(this.fire); s.start(t, Math.random()*4); s.stop(t + 1);
  }

  // ── 手元の音 ──
  pickup(kind) {
    if (!this.ready) return;
    const R = Math.random, N = this.near;
    if (kind === 'log') {
      this._play(this._pick(this.knockBuf), 0.2, 0.55, 0.95 + R()*0.3, N);
      this._play(this._pick(this.knockBuf), 0.13, 0.5, 1.2 + R()*0.4, N, 0.07 + R()*0.06);
      this._play(this._pick(this.crunch), 0.07, 0.5, 1.3, N, 0.02, 2500);
    } else if (kind === 'kindling') {
      for (let i = 0; i < 4; i++) this._play(this._pick(this.knockBuf), 0.06 + 0.05*R(), -0.5, 2.6 + R()*1.6, N, i*0.035 + R()*0.03);
    } else if (kind === 'tinder') {
      this._play(this.dryRustle, 0.2, -0.5, 1.0 + R()*0.3, N);
    } else if (kind === 'match') {
      this._play(this.rattle, 0.22, -0.3, 0.95 + R()*0.15, N);
    } else if (kind === 'tongs') {
      this._play(this._pick(this.tink), 0.07, 0.45, 0.8 + R()*0.2, N);
      this._play(this._pick(this.tink), 0.05, 0.45, 0.95 + R()*0.2, N, 0.06);
    }
  }
  letGo(kind) { if (this.ready && kind !== 'tinder') this._play(this._pick(this.crunch), 0.035, 0.1, 1.6, this.near, 0, 3000); }
  tongsGrab(power = 1, pan = 0) {
    if (!this.ready) return;
    const R = Math.random;
    this._play(this._pick(this.tink), 0.16*power, pan, 0.9 + R()*0.25, this.near);
    this._play(this._pick(this.knockBuf), 0.1*power*this.prox, pan, 1.6 + R()*0.5, null, 0.004);
    this._play(this._pick(this.crunch), 0.09*power*this.prox, pan, 1.1 + R()*0.3, null, 0.006);
  }
  tongsRelease(pan = 0) { if (this.ready) { this._play(this._pick(this.tink), 0.08, pan, 1.15 + Math.random()*0.3, this.near); this._play(this._pick(this.tink), 0.035, pan, 1.3, this.near, 0.045); } }
  poke(hot, pan = 0) {
    if (!this.ready) return;
    const R = Math.random, g = this.prox;
    this._play(this._pick(this.crunch), 0.4*g, pan, 0.75 + R()*0.3);
    this._play(this.thud, 0.22*g, pan, 1.1 + R()*0.3);
    this._play(this._pick(this.tink), 0.06, pan, 0.7 + R()*0.2, this.near, 0.01);
    if (hot) for (let i = 0; i < 7; i++) this._play(this._pick(i % 2 ? this.crk.tick : this.crk.tink), 0.12*R()*g, pan + (R() - 0.5)*0.2, 0.7 + R(), null, 0.02 + R()*0.3);
  }
  matchStrike() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    // 擦る「ジャッ」：ざらついた雑音を、頭薬が走る速さで明るくしていく
    const s = ctx.createBufferSource(); s.buffer = this.grain; s.playbackRate.value = 2.4;
    const s2 = ctx.createBufferSource(); s2.buffer = this.white;
    const bp = this._bq('bandpass', 2600, 1.0);
    bp.frequency.setValueAtTime(2200, t); bp.frequency.exponentialRampToValueAtTime(5600, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.75, t + 0.025); g.gain.linearRampToValueAtTime(0.5, t + 0.14); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    s.connect(bp); s2.connect(g2); g2.connect(bp); bp.connect(g); g.connect(this.near);
    s.start(t, Math.random()*2); s.stop(t + 0.25); s2.start(t, Math.random()); s2.stop(t + 0.25);
    // 着火「シュボッ」：明るい噴き出しが、すぐに丸い炎の音へ落ち着く
    const f = ctx.createBufferSource(); f.buffer = this.white;
    const lp = this._bq('lowpass', 7000, 0.6); const t2 = t + 0.17;
    lp.frequency.setValueAtTime(7500, t2); lp.frequency.exponentialRampToValueAtTime(900, t2 + 0.4);
    const fg = ctx.createGain(); fg.gain.setValueAtTime(0, t2); fg.gain.linearRampToValueAtTime(0.42, t2 + 0.03); fg.gain.exponentialRampToValueAtTime(0.04, t2 + 0.35); fg.gain.exponentialRampToValueAtTime(0.001, t2 + 0.9);
    f.connect(lp); lp.connect(fg); fg.connect(this.near); f.start(t2, Math.random()); f.stop(t2 + 1);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t2); o.frequency.exponentialRampToValueAtTime(70, t2 + 0.12);
    const og = ctx.createGain(); og.gain.setValueAtTime(0, t2); og.gain.linearRampToValueAtTime(0.18, t2 + 0.02); og.gain.exponentialRampToValueAtTime(0.001, t2 + 0.16);
    o.connect(og); og.connect(this.near); o.start(t2); o.stop(t2 + 0.2);
  }
  matchOut() {
    if (!this.ready) return;
    // 振って消す：短い風切りを2回
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i*0.11; const s = ctx.createBufferSource(); s.buffer = this.pink;
      const bp = this._bq('bandpass', 700, 0.8); bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1400, t + 0.05); bp.frequency.linearRampToValueAtTime(600, t + 0.1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.linearRampToValueAtTime(0, t + 0.1);
      s.connect(bp); bp.connect(g); g.connect(this.near); s.start(t, Math.random()*4); s.stop(t + 0.12);
    }
  }

  // 毎フレームの連続音の更新
  // s: { intensity, glow, hiss, wind, blow, inhale, flick, prox, move, scrape, pan }
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime, R = Math.random;
    this.t += dt;
    this.prox += ((s.prox || 1) - this.prox)*Math.min(1, dt*5);
    const px = this.prox;
    const set = (p, v, tc = 0.05) => p.setTargetAtTime(v, now, tc);
    // 明かりの明滅(flick)に、耳に聞こえる細かな揺れを足す
    this.fl2 += (R() - 0.5)*dt*60; this.fl2 *= Math.exp(-dt*16);
    const I = Math.min(2.2, s.intensity), sI = Math.sqrt(I);
    const env = Math.max(0.15, (s.flick !== undefined ? s.flick : 1) + this.fl2*0.8);
    const lvl = sI*I/(0.4 + I);
    set(this.gRoar.gain, (0.02*Math.min(1, s.glow*2) + 0.62*lvl*env*env)*px*px);
    set(this.roarLP.frequency, 120 + 240*sI*env + 420*s.blow);
    set(this.gFlut.gain, (0.55*sI*Math.max(0, env - 0.55) + 0.25*Math.abs(s.wind)*sI + 0.9*s.blow*Math.min(1, I + s.glow))*px*px);
    set(this.flutBP.frequency, 330 + 420*sI*env);
    set(this.gBody.gain, 0.035*lvl*env*px);
    set(this.gAir.gain, (0.012*sI + 0.005*Math.min(1, s.glow))*px);
    const hw = 0.7 + 0.3*Math.sin(this.t*7.3) + 0.3*Math.sin(this.t*2.1);
    set(this.gHiss.gain, 0.09*s.hiss*hw*px);
    set(this.gWhistle.gain, 0.5*s.hiss*s.hiss*Math.max(0, Math.sin(this.t*0.9))*px); set(this.whBP.frequency, 3000 + 700*Math.sin(this.t*0.37));
    // 息
    set(this.gBlow.gain, 0.5*s.blow*(0.85 + 0.3*R()), 0.03); set(this.blowBP.frequency, 800 + 380*s.blow);
    set(this.gInhale.gain, 0.16*(s.inhale || 0), 0.04); set(this.inBP.frequency, 1100 + 1500*(s.inhale || 0));
    // 体を動かしたときの衣擦れ、薪を引きずる音
    set(this.gRustle.gain, Math.min(0.11, 0.2*(s.move || 0)), 0.06);
    set(this.gScrape.gain, Math.min(0.2, 0.5*(s.scrape || 0))*px, 0.04);
    // 風
    const w = Math.abs(s.wind);
    set(this.gWind.gain, 0.035 + 0.30*w*w, 0.5); set(this.windBP.frequency, 300 + 380*w, 0.5);
    set(this.gLeaves.gain, 0.004 + 0.07*w*w*w, 0.6);
    // 火が急に大きくなったら「ぼうっ」
    this.whoompCd -= dt;
    const dI = (s.intensity - this.lastI)/Math.max(dt, 1e-3); this.lastI += (s.intensity - this.lastI)*Math.min(1, dt*4);
    if (dI > 0.55 && this.whoompCd <= 0 && s.intensity > 0.15) { this.whoomp(Math.min(1, dI*0.6)); this.whoompCd = 2.5; }
    // 熾の「ちりちり」：炎が落ちて熾だけになると聞こえてくる
    this.nextTink -= dt;
    if (this.nextTink <= 0) {
      const amt = Math.min(1, s.glow*1.6)*(1 - Math.min(1, I*1.5));
      if (amt > 0.05) this._play(this._pick(R() < 0.6 ? this.crk.tink : this.crk.tick), 0.07*amt*(0.3 + R())*px*px, (R() - 0.5)*0.5, 0.8 + R()*0.8);
      this.nextTink = (0.25 + R()*1.6)/(0.3 + amt);
    }
    // 虫・フクロウ
    for (let k = 0; k < this.nextBug.length; k++) {
      this.nextBug[k] -= dt;
      if (this.nextBug[k] <= 0) {
        this._play(this.bug[k], (0.018 + 0.02*R())*(1 - 0.5*w), [-0.7, 0.55, 0.1][k] + (R() - 0.5)*0.1, 0.97 + R()*0.06, this.far);
        this.nextBug[k] = [0.62, 2.6, 0.9][k]*(0.9 + R()*0.5) + (R() < 0.12 ? 3 + R()*9 : 0);
      }
    }
    this.nextOwl -= dt;
    if (this.nextOwl <= 0) { this._play(this.owl, 0.05, R() < 0.5 ? -0.8 : 0.7, 0.96 + R()*0.08, this.far); this.nextOwl = 70 + R()*130; }
  }

  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
}
