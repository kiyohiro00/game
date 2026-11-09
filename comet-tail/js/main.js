'use strict';
// ===== ゲーム進行 =====
Updraft.prototype.back = true; Torch.prototype.back = true; Checkpoint.prototype.back = true; Goal.prototype.back = true;
const STEP = 1 / 60;

const Game = {
  state: 'boot', t: 0, level: 0, score: 0, coins: 0, lives: 3, time: 0, stars: LEVELS.map(() => [false, false, false]), unlocked: 0, best: 0,
  cam: { x: 0, y: 0, look: 0 }, shakeT: 0, shakeDur: 1, shakeMag: 0, shakeX: 0, shakeY: 0, hitstopT: 0, flashT: 0, flashDur: 1, flashCol: '#fff', flashA: 0.5, slowmo: 0, slowN: 0,
  iris: 1, irisDir: 0, irisCb: null, introT: 0, clearT: 0, deadT: 0, bossBanner: 0, bossBanner2: 0, starPop: 0, checkpoint: null, sel: 0, acc: 0, last: 0, cleanN: 0, player: null, clearInfo: null,

  init() {
    R.init(); Input.init(); TouchUI.init(); this.loadSave();
    const m = /[?&]stage=(\d)/.exec(location.search);
    if (m) { this.newGame(clamp(+m[1] - 1, 0, LEVELS.length - 1)); this.introT = 0.2; }
    else this.toTitle();
    requestAnimationFrame(ts => this.loop(ts));
  },
  save() { try { localStorage.setItem('cometTailSave', JSON.stringify({ stars: this.stars, unlocked: this.unlocked, best: this.best })); } catch (e) { } },
  loadSave() {
    try { const d = JSON.parse(localStorage.getItem('cometTailSave') || 'null'); if (d) { if (Array.isArray(d.stars) && d.stars.length === LEVELS.length) this.stars = d.stars; this.unlocked = clamp(d.unlocked | 0, 0, LEVELS.length - 1); this.best = d.best | 0; } } catch (e) { }
  },
  toTitle() {
    this.state = 'title'; World.load(0); FX.clear(); this.player = new Player(World.start.x, World.start.y); this.player.onGround = true;
    this.checkpoint = null; this.snapCam(); this.iris = 1; this.irisDir = 0; this.sel = this.unlocked; Music.play('grass');
  },
  newGame(level) { this.score = 0; this.coins = 0; this.lives = 3; this.startLevel(level, false); },
  startLevel(i, fromCp) {
    this.level = i; if (!fromCp) { this.checkpoint = null; this.time = 0; }
    World.load(i); FX.clear();
    const s = fromCp && this.checkpoint ? this.checkpoint : World.start;
    this.player = new Player(s.x, s.y); this.snapCam();
    this.state = 'intro'; this.introT = fromCp ? 1.4 : 2.6; this.iris = 0; this.irisDir = 0; this.hitstopT = 0; this.slowmo = 0; this.bossBanner = 0; this.bossBanner2 = 0; this.flashT = 0; this.shakeT = 0;
    Music.stop();
  },
  fadeTo(cb) { if (this.irisCb) return; this.irisDir = -1; this.irisCb = cb; },
  shake(mag, dur) { const cur = this.shakeT > 0 ? this.shakeMag * this.shakeT / this.shakeDur : 0; if (mag >= cur) { this.shakeMag = mag; this.shakeT = dur; this.shakeDur = dur; } },
  flash(col, dur, a = 0.5) { this.flashCol = col; this.flashT = dur; this.flashDur = dur; this.flashA = a; },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },
  addScore(n) { this.score += n; },
  addCoin() { this.coins++; this.score += 10; Snd.play('coin'); if (this.coins % 100 === 0) this.oneUp(this.player.cx, this.player.y - 20); },
  oneUp(x, y) { this.lives++; Snd.play('oneup'); FX.text(x, y, '1UP!', '#7fff8a', 24); },
  onPlayerDead() { this.state = 'dead'; this.deadT = 2.3; },
  stageClear(goal) {
    if (this.state !== 'play') return;
    const p = this.player; this.state = 'clear'; this.clearT = 0; p.state = 'clear'; p.vx = 0; p.dashT = 0; p.pound = 0; p.rot = 0; p.inv = 0;
    Music.stop(); Snd.play('clear'); this.flash('#ffffff', 0.4, 0.6); this.shake(6, 0.3);
    FX.ring(goal.cx, goal.y + 62, '#fff6a8', 20, 260, 0.8, 12); FX.sparkle(goal.cx, goal.y + 62, 40, '#fff6a8', 2.4);
    const timeBonus = Math.max(0, 240 - Math.floor(this.time)) * 20, st = this.stars[this.level].filter(Boolean).length;
    this.clearInfo = { time: this.time, timeBonus, stars: st, starBonus: st * 1000, last: this.level === LEVELS.length - 1 };
    this.score += timeBonus + st * 1000; this.unlocked = Math.max(this.unlocked, Math.min(LEVELS.length - 1, this.level + 1)); this.best = Math.max(this.best, this.score); this.save();
  },
  snapCam() { this.cam.look = 0; this.updateCam(0, true); },
  updateCam(dt, snap) {
    const p = this.player, cam = this.cam, W = World; if (!p || p.state === 'dead') return;
    cam.look = lerp(cam.look, p.face * 80, snap ? 1 : 1 - Math.pow(0.08, dt));
    let minX = 0, maxX = W.w * TILE - VW; if (W.camLock) { minX = W.camLock.l; maxX = W.camLock.r - VW; }
    const tx = clamp(p.cx - VW / 2 + cam.look, minX, Math.max(minX, maxX)), ty = clamp(p.cy - VH * 0.56, 0, W.h * TILE - VH);
    if (snap) { cam.x = tx; cam.y = ty; } else { cam.x += (tx - cam.x) * (1 - Math.pow(0.0008, dt)); cam.y += (ty - cam.y) * (1 - Math.pow(0.003, dt)); }
  },

  loop(ts) {
    requestAnimationFrame(t => this.loop(t));
    const now = ts / 1000; const dt = Math.min(0.05, now - (this.last || now)); this.last = now;
    Input.pollPad(); if (Music.pending && Snd.ctx) Music.play(Music.pending);
    TouchUI.update();
    if (this.manual) return;
    this.acc += dt; let n = 0;
    while (this.acc >= STEP && n < 4) { this.tick(STEP); Input.endTick(); this.acc -= STEP; n++; }
    if (n === 4) this.acc = 0;
    this.draw();
  },
  // デバッグ・自動テスト用：n ティック進めて描画
  debugStep(n = 1) { for (let i = 0; i < n; i++) { this.tick(STEP); Input.endTick(); } this.draw(); },

  tick(dt) {
    this.t += dt;
    if (Input.pressed('mute')) Snd.toggleMute();
    this.flashT -= dt; this.bossBanner -= dt; this.bossBanner2 -= dt; this.starPop = Math.max(0, this.starPop - dt * 2.5);
    if (this.shakeT > 0) { this.shakeT -= dt; const m = this.shakeMag * Math.max(0, this.shakeT / this.shakeDur); this.shakeX = rand(-m, m); this.shakeY = rand(-m, m); } else this.shakeX = this.shakeY = 0;
    if (this.irisDir) {
      this.iris = clamp(this.iris + this.irisDir * dt * 1.7, 0, 1);
      if (this.iris <= 0 && this.irisDir < 0) { this.irisDir = 0; const cb = this.irisCb; this.irisCb = null; if (cb) cb(); }
      else if (this.iris >= 1) this.irisDir = 0;
    }
    switch (this.state) {
      case 'title': this.tickTitle(dt); break;
      case 'intro': this.introT -= dt; if (this.introT <= 0) { this.state = 'play'; this.irisDir = 1; Music.play(World.def.bgm); } break;
      case 'play': if (Input.pressed('pause')) { this.state = 'pause'; Snd.play('select'); break; } this.tickPlay(dt); break;
      case 'pause':
        if (Input.pressed('pause') || Input.pressed('start')) { this.state = 'play'; Snd.play('select'); }
        else if (Input.pressed('fire')) { Snd.play('select'); this.fadeTo(() => this.toTitle()); }
        break;
      case 'dead':
        this.tickPlay(dt); this.deadT -= dt;
        if (this.deadT <= 0 && !this.irisCb) this.fadeTo(() => { this.lives--; if (this.lives < 0) { this.state = 'gameover'; this.iris = 1; Music.stop(); } else this.startLevel(this.level, true); });
        break;
      case 'clear': {
        this.tickPlay(dt); this.clearT += dt; const p = this.player;
        if (Math.random() < 0.08) { const x = p.cx + rand(-360, 360), y = this.cam.y + rand(60, 260), c = pick(['#ff7a9a', '#ffe27a', '#7ff0c0', '#7fc8ff', '#c89aff']); FX.ring(x, y, c, 6, 70, 0.6, 5); FX.sparkle(x, y, 14, c, 1.6); if (Math.random() < 0.5) Snd.play('tick'); }
        if (this.clearT > 2.6 && Input.pressed('start') && !this.irisCb) {
          Snd.play('select');
          this.fadeTo(() => { if (this.clearInfo.last) { this.state = 'ending'; this.iris = 1; this.clearT = 0; Music.play('sky'); } else this.startLevel(this.level + 1, false); });
        }
        break;
      }
      case 'gameover': if (Input.pressed('start')) { Snd.play('select'); this.newGame(this.level); } else if (Input.pressed('pause')) this.toTitle(); break;
      case 'ending': this.clearT += dt; if (this.clearT > 2 && Input.pressed('start')) { Snd.play('select'); this.toTitle(); } break;
    }
  },
  tickTitle(dt) {
    this.player.t += dt; this.player.animate(dt); FX.update(dt);
    for (const e of World.ents) e.t += dt;
    if (this.irisCb) return;
    if (Input.pressed('left') && this.sel > 0) { this.sel--; Snd.play('tick'); }
    if (Input.pressed('right') && this.sel < this.unlocked) { this.sel++; Snd.play('tick'); }
    if (Input.pressed('start')) { Snd.init(); Snd.play('select'); const lv = this.sel; this.fadeTo(() => this.newGame(lv)); }
  },
  tickPlay(dt) {
    if (this.hitstopT > 0) { this.hitstopT -= dt; return; }
    if (this.slowmo > 0) { this.slowmo -= dt; if (++this.slowN % 3 !== 0) return; }
    if (this.state === 'play') this.time += dt;
    World.update(dt);
    const p = this.player, cam = this.cam;
    for (const e of World.plats) if (!e.dead) e.update(dt);
    p.update(dt);
    const ax0 = cam.x - 520, ax1 = cam.x + VW + 520, ay0 = cam.y - 520, ay1 = cam.y + VH + 520, ents = World.ents;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]; if (e.dead) continue;
      if (!e.always && !(e.x < ax1 && e.x + e.w > ax0 && e.y < ay1 && e.y + e.h > ay0)) continue;
      if (e.solid === undefined) e.update(dt);
      if (!e.dead && p.state !== 'dead' && p.state !== 'clear' && overlap(p, e)) e.touch(p);
    }
    if (++this.cleanN % 30 === 0) { World.ents = ents.filter(e => !e.dead); World.plats = World.plats.filter(e => !e.dead); }
    FX.update(dt); this.updateCam(dt, false);
  },

  // ---------------------------------------------------------------- 描画
  draw() {
    R.frame(); const ctx = R.ctx, st = this.state;
    if (st === 'play' || st === 'pause' || st === 'dead' || st === 'clear') R.hud(ctx);
    if (this.flashT > 0) { ctx.globalAlpha = this.flashA * this.flashT / this.flashDur; ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (this.bossBanner > 0) this.banner(ctx, this.bossBanner, 2.6, 'WARNING', 'マグマキング　あらわる！', '#ff5a3a');
    if (this.bossBanner2 > 0) this.banner(ctx, this.bossBanner2, 1.6, 'DANGER', 'マグマキングが 本気を出した！', '#ffb01a');
    if (st === 'title') this.drawTitle(ctx);
    if (st === 'clear') this.drawClear(ctx);
    if (st === 'pause') this.drawPause(ctx);
    if (this.iris < 1) {
      const p = this.player, px = p ? p.cx - R.cx : VW / 2, py = p ? p.cy - R.cy : VH / 2, r = Math.pow(this.iris, 1.6) * 1150;
      ctx.fillStyle = '#0a0618'; ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.arc(clamp(px, 0, VW), clamp(py, 0, VH), r, 0, TAU, true); ctx.fill('evenodd');
      if (r > 4) { ctx.strokeStyle = 'rgba(255,246,168,.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(clamp(px, 0, VW), clamp(py, 0, VH), r, 0, TAU); ctx.stroke(); }
    }
    if (st === 'intro') this.drawIntro(ctx);
    if (st === 'gameover') this.drawGameOver(ctx);
    if (st === 'ending') this.drawEnding(ctx);
    if (Snd.muted) { ctx.font = FONT(12); ctx.textAlign = 'right'; otext(ctx, 'MUTE (M)', VW - 14, VH - 12, '#ffffff', '#1a1030', 3); }
  },
  banner(ctx, t, dur, top, text, col) {
    const k = clamp(Math.min(t, dur - t) * 4, 0, 1), y = 170;
    ctx.globalAlpha = k * 0.82; ctx.fillStyle = '#12040a'; ctx.fillRect(0, y - 52 * k, VW, 104 * k); ctx.globalAlpha = k;
    ctx.fillStyle = col; ctx.fillRect(0, y - 52 * k, VW, 4); ctx.fillRect(0, y + 52 * k - 4, VW, 4);
    ctx.textAlign = 'center'; ctx.font = FONT(18); const off = (this.t * 160) % 220;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - 48, VW, 96); ctx.clip(); ctx.globalAlpha = k * 0.5; ctx.fillStyle = col; for (let x = -220 + off; x < VW + 220; x += 220) { ctx.fillText(top, x, y - 28); ctx.fillText(top, x + 110, y + 42); } ctx.restore();
    ctx.globalAlpha = k; ctx.font = FONT(34); otext(ctx, text, VW / 2 + (1 - k) * 200, y + 12, '#ffffff', '#3a0810', 7); ctx.globalAlpha = 1;
  },
  logo(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.textAlign = 'center';
    const t = this.t, str = 'COMET TAIL'; ctx.font = FONT(84); let tw = 0; const ws = [...str].map(ch => { const w = ctx.measureText(ch).width; tw += w; return w; }); let cx = -tw / 2;
    // 彗星のしっぽ
    const g = ctx.createLinearGradient(-tw / 2 - 80, 0, tw / 2, 0); g.addColorStop(0, 'rgba(120,220,255,0)'); g.addColorStop(1, 'rgba(255,246,168,.75)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(tw / 2 + 30, -92); ctx.quadraticCurveTo(0, -62, -tw / 2 - 90, -30); ctx.quadraticCurveTo(0, -86, tw / 2 + 30, -108); ctx.fill();
    glow(ctx, tw / 2 + 34, -100, 46, '#fff6a8', 0.9); ctx.fillStyle = '#fffbe0'; starPath(ctx, tw / 2 + 34, -100, 20, 9, 5, t * 1.5); ctx.fill();
    [...str].forEach((ch, i) => {
      const w = ws[i], b = Math.sin(t * 3 + i * 0.6) * 5; ctx.save(); ctx.translate(cx + w / 2, b); ctx.rotate(Math.sin(t * 2 + i) * 0.04);
      ctx.lineJoin = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = '#1a1050'; ctx.strokeText(ch, 0, 6); ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff'; ctx.strokeText(ch, 0, 0);
      const lg = ctx.createLinearGradient(0, -66, 0, 6); lg.addColorStop(0, i < 5 ? '#fff6a8' : '#c8f6ff'); lg.addColorStop(0.5, i < 5 ? '#ffb21a' : '#4ac0ff'); lg.addColorStop(1, i < 5 ? '#ff6a2a' : '#3a6ae8'); ctx.fillStyle = lg; ctx.fillText(ch, 0, 0);
      ctx.restore(); cx += w;
    });
    ctx.font = FONT(26); otext(ctx, '— ルミと星の王冠 —', 0, 50, '#ffffff', '#1a1050', 7);
    ctx.restore();
  },
  drawTitle(ctx) {
    const t = this.t; ctx.fillStyle = 'rgba(10,6,40,.18)'; ctx.fillRect(0, 0, VW, VH);
    this.logo(ctx, VW / 2, 170, 1);
    ctx.textAlign = 'center';
    // ステージ選択
    const lv = LEVELS[this.sel], y = 300; ctx.fillStyle = 'rgba(20,10,48,.6)'; rrect(ctx, VW / 2 - 210, y - 34, 420, 62, 20); ctx.fill();
    ctx.font = FONT(14); otext(ctx, lv.sub, VW / 2, y - 12, '#9fe8ff', '#1a1030', 4); ctx.font = FONT(24); otext(ctx, lv.name, VW / 2, y + 16, '#ffffff', '#1a1030', 5);
    if (this.unlocked > 0) { ctx.font = FONT(26); ctx.globalAlpha = this.sel > 0 ? 1 : 0.25; otext(ctx, '◀', VW / 2 - 180 - Math.sin(t * 6) * 3, y + 8, '#ffe45a', '#1a1030', 5); ctx.globalAlpha = this.sel < this.unlocked ? 1 : 0.25; otext(ctx, '▶', VW / 2 + 180 + Math.sin(t * 6) * 3, y + 8, '#ffe45a', '#1a1030', 5); ctx.globalAlpha = 1; }
    const st = this.stars[this.sel]; for (let i = 0; i < 3; i++) { ctx.fillStyle = '#1a1030'; starPath(ctx, VW / 2 - 28 + i * 28, y + 46, 13, 6.5); ctx.fill(); ctx.fillStyle = st[i] ? '#ffd23c' : '#4a4466'; starPath(ctx, VW / 2 - 28 + i * 28, y + 45, 10, 5); ctx.fill(); }
    const tch = TouchUI.on;
    if (Math.sin(t * 5) > -0.3) { ctx.font = FONT(tch ? 30 : 26); otext(ctx, tch ? 'タップして スタート' : 'PRESS  ENTER / SPACE', VW / 2, 400, '#fff6a8', '#1a1030', 6); }
    ctx.fillStyle = 'rgba(20,10,48,.62)'; rrect(ctx, VW / 2 - 400, 440, 800, 78, 18); ctx.fill();
    ctx.font = FONT(tch ? 15 : 14, 700); ctx.fillStyle = '#ffffff';
    if (tch) {
      ctx.fillText('左のスティックで いどう　　ジャンプ（2だん・カベキック）　　ダッシュ（空中OK）', VW / 2, 466);
      ctx.fillText('空中で ▼ ヒップドロップ（着地直後にジャンプで大ジャンプ）　　★ スターショット', VW / 2, 488);
      ctx.fillStyle = '#9fe8ff'; ctx.fillText('ステージえらびは ◀ ▶ をタップ', VW / 2, 509);
    } else {
      ctx.fillText('←→ いどう　　Z / Space ジャンプ（2だん・カベキック）　　X / Shift ダッシュ', VW / 2, 466);
      ctx.fillText('空中で ↓ ヒップドロップ（着地直後にジャンプで大ジャンプ）　　C スターショット', VW / 2, 488);
      ctx.fillStyle = '#9fe8ff'; ctx.fillText('P / Esc ポーズ　　M ミュート　　ゲームパッド・スマホ対応', VW / 2, 509);
    }
    if (this.best > 0) { ctx.textAlign = 'right'; ctx.font = FONT(15); otext(ctx, 'BEST ' + String(this.best).padStart(7, '0'), VW - 20, 30, '#ffe9a8', '#1a1030', 4); }
  },
  drawIntro(ctx) {
    const d = World.def, k = clamp(this.introT * 3, 0, 1), col = { grass: '#62d444', cave: '#5ad8ff', sky: '#ff8ab8', castle: '#ff5a3a' }[d.theme], t = this.t;
    ctx.globalAlpha = k; ctx.textAlign = 'center';
    ctx.fillStyle = col; ctx.fillRect(VW / 2 - 260, VH / 2 - 78, 520, 5); ctx.fillRect(VW / 2 - 260, VH / 2 + 34, 520, 5);
    ctx.font = FONT(22); otext(ctx, d.sub, VW / 2, VH / 2 - 44, col, '#0a0618', 5); ctx.font = FONT(46); otext(ctx, d.name, VW / 2, VH / 2 + 10, '#ffffff', '#0a0618', 8);
    R.foxIcon(ctx, VW / 2 - 34, VH / 2 + 84 + Math.sin(t * 6) * 3, 1.5); ctx.font = FONT(30); ctx.textAlign = 'left'; otext(ctx, '× ' + Math.max(0, this.lives), VW / 2 - 4, VH / 2 + 96, '#ffffff', '#0a0618', 6);
    for (let i = 0; i < 12; i++) { const a = t * 0.6 + i * TAU / 12; ctx.fillStyle = col; ctx.globalAlpha = k * (0.3 + 0.3 * Math.sin(t * 3 + i)); starPath(ctx, VW / 2 + Math.cos(a) * 340, VH / 2 + Math.sin(a) * 180, 7, 3, 4, a); ctx.fill(); }
    ctx.globalAlpha = 1;
  },
  drawPause(ctx) {
    ctx.fillStyle = 'rgba(10,6,30,.6)'; ctx.fillRect(0, 0, VW, VH); ctx.textAlign = 'center';
    ctx.font = FONT(56); otext(ctx, 'PAUSE', VW / 2, VH / 2 - 20, '#ffffff', '#1a1030', 9);
    if (TouchUI.on) this.touchBtns(ctx, VH / 2 + 46, 'さいかい', 'タイトルへ');
    else { ctx.font = FONT(18); otext(ctx, 'P / Esc / Enter でさいかい　　　C でタイトルへ', VW / 2, VH / 2 + 30, '#ffe9a8', '#1a1030', 5); }
  },
  // タッチ用の2つ並びボタン（当たり判定は TouchUI.hit）
  touchBtns(ctx, cy, a, b) {
    ctx.textAlign = 'center'; ctx.font = FONT(22);
    [a, b].forEach((label, i) => {
      const x = VW / 2 + (i ? 20 : -230); ctx.fillStyle = i ? 'rgba(40,30,80,.85)' : 'rgba(255,190,40,.9)'; rrect(ctx, x, cy - 30, 210, 60, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5; ctx.stroke(); otext(ctx, label, x + 105, cy + 8, '#ffffff', '#1a1030', 5);
    });
  },
  drawClear(ctx) {
    const t = this.clearT, info = this.clearInfo; ctx.textAlign = 'center';
    const k = easeBack(clamp(t * 1.6, 0, 1)); ctx.save(); ctx.translate(VW / 2, 120); ctx.scale(k, k); ctx.rotate(Math.sin(this.t * 3) * 0.03);
    ctx.font = FONT(62); otext(ctx, info.last ? 'BOSS CLEAR!!' : 'STAGE CLEAR!', 0, 0, '#fff6a8', '#1a1050', 12); ctx.restore();
    if (t < 1.2) return;
    const a = clamp((t - 1.2) * 3, 0, 1); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(20,10,48,.78)'; rrect(ctx, VW / 2 - 230, 150, 460, 200, 24); ctx.fill(); ctx.strokeStyle = 'rgba(255,246,168,.6)'; ctx.lineWidth = 2.5; ctx.stroke();
    const tm = Math.floor(info.time), rows = [['TIME', Math.floor(tm / 60) + ':' + String(tm % 60).padStart(2, '0')], ['タイムボーナス', '+' + info.timeBonus], ['スターコイン', '+' + info.starBonus], ['SCORE', String(this.score).padStart(7, '0')]];
    rows.forEach((r, i) => { if (t < 1.4 + i * 0.25) return; const y = 188 + i * 33; ctx.font = FONT(i === 3 ? 26 : 20); ctx.textAlign = 'left'; otext(ctx, r[0], VW / 2 - 190, y, i === 3 ? '#fff6a8' : '#ffffff', '#1a1030', 5); ctx.textAlign = 'right'; otext(ctx, r[1], VW / 2 + 190, y, i === 3 ? '#fff6a8' : '#9fe8ff', '#1a1030', 5); });
    for (let i = 0; i < World.starTotal; i++) { const got = this.stars[this.level][i], x = VW / 2 - 56 + i * 56, y = 322; ctx.fillStyle = '#1a1030'; starPath(ctx, x, y + 1, 24, 12); ctx.fill(); ctx.fillStyle = got ? '#ffd23c' : '#4a4466'; starPath(ctx, x, y, 19, 9.5, 5, -Math.PI / 2 + (got ? Math.sin(this.t * 3 + i) * 0.2 : 0)); ctx.fill(); }
    ctx.textAlign = 'center';
    if (t > 2.6 && Math.sin(this.t * 5) > -0.3) { ctx.font = FONT(22); const k = TouchUI.on ? 'タップ' : 'ENTER'; otext(ctx, info.last ? k + ' でエンディングへ' : k + ' でつぎのステージへ', VW / 2, 478, '#ffffff', '#1a1030', 6); }
    ctx.globalAlpha = 1;
  },
  drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(10,4,20,.82)'; ctx.fillRect(0, 0, VW, VH); ctx.textAlign = 'center';
    ctx.font = FONT(72); otext(ctx, 'GAME OVER', VW / 2, VH / 2 - 30 + Math.sin(this.t * 2) * 5, '#ff7a8c', '#1a0510', 12);
    ctx.font = FONT(22); otext(ctx, 'SCORE ' + String(this.score).padStart(7, '0'), VW / 2, VH / 2 + 30, '#ffffff', '#1a1030', 5);
    if (TouchUI.on) this.touchBtns(ctx, VH / 2 + 96, 'リトライ', 'タイトルへ');
    else { ctx.font = FONT(20); otext(ctx, 'ENTER でこのステージからリトライ　　Esc でタイトルへ', VW / 2, VH / 2 + 80, '#ffe9a8', '#1a1030', 5); }
  },
  drawEnding(ctx) {
    const t = this.clearT, tt = this.t; ctx.fillStyle = vgrad(ctx, 0, VH, [[0, '#120a40'], [0.6, '#5a2a92'], [1, '#ff8a5a']]); ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 90; i++) { const x = hash(i, 1) * VW, y = hash(i, 2) * VH * 0.8, f = 0.4 + Math.sin(tt * 2 + i) * 0.4; ctx.globalAlpha = f; ctx.fillStyle = '#ffffff'; starPath(ctx, x, y, 2 + hash(i, 3) * 3, 1, 4, tt * 0.5 + i); ctx.fill(); }
    ctx.globalAlpha = 1;
    // 流れ星
    for (let i = 0; i < 3; i++) { const k = ((tt * 0.35 + i * 0.37) % 1), x = VW + 100 - k * 1300, y = 40 + i * 70 + k * 240; const g = ctx.createLinearGradient(x, y, x + 150, y - 28); g.addColorStop(0, 'rgba(255,246,168,.9)'); g.addColorStop(1, 'rgba(255,246,168,0)'); ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 150, y - 28); ctx.stroke(); }
    ctx.textAlign = 'center'; const k = easeBack(clamp(t, 0, 1));
    ctx.save(); ctx.translate(VW / 2, 110); ctx.scale(k, k); ctx.font = FONT(54); otext(ctx, 'CONGRATULATIONS!', 0, 0, '#fff6a8', '#1a1050', 11); ctx.restore();
    glow(ctx, VW / 2, 215, 90, '#ffe27a', 0.7); // 王冠
    ctx.save(); ctx.translate(VW / 2, 225 + Math.sin(tt * 2) * 5); ctx.fillStyle = '#ffc21a'; ctx.beginPath(); ctx.moveTo(-44, 20); ctx.lineTo(-50, -30); ctx.lineTo(-24, -6); ctx.lineTo(0, -44); ctx.lineTo(24, -6); ctx.lineTo(50, -30); ctx.lineTo(44, 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff3a8'; ctx.fillRect(-44, 8, 88, 8); ctx.fillStyle = '#ff3050'; ell(ctx, 0, -6, 7, 8); ctx.fill(); ctx.fillStyle = '#5ae0ff'; ell(ctx, -26, 2, 4, 5); ctx.fill(); ell(ctx, 26, 2, 4, 5); ctx.fill(); ctx.fillStyle = '#ffffff'; starPath(ctx, 0, -52, 9, 4, 5, tt * 2); ctx.fill(); ctx.restore();
    ctx.font = FONT(20, 700); otext(ctx, 'ルミは 星の王冠を とりもどし、空に 星がもどった！', VW / 2, 300, '#ffffff', '#1a1030', 5);
    const total = this.stars.reduce((a, s) => a + s.filter(Boolean).length, 0), max = LEVELS.length * 3;
    ctx.font = FONT(26); otext(ctx, 'SCORE  ' + String(this.score).padStart(7, '0'), VW / 2, 352, '#fff6a8', '#1a1030', 6);
    ctx.font = FONT(22); otext(ctx, 'スターコイン  ' + total + ' / ' + max + (total === max ? '   PERFECT!!' : ''), VW / 2, 392, '#9fe8ff', '#1a1030', 5);
    R.foxIcon(ctx, VW / 2, 452 + Math.abs(Math.sin(tt * 5)) * -14, 2.2);
    if (t > 2 && Math.sin(tt * 5) > -0.3) { ctx.font = FONT(18); otext(ctx, (TouchUI.on ? 'タップ' : 'ENTER') + ' でタイトルへ', VW / 2, 518, '#ffffff', '#1a1030', 5); }
  }
};
window.GAME = Game; window.DBG = { Game, World, Input, R, FX, Snd, Music, LEVELS };
window.addEventListener('load', () => Game.init());
