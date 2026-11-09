'use strict';
// ===== プレイヤー「ルミ」 =====
const PH = { RUN: 330, ACC: 2600, AIRACC: 1800, FRIC: 2800, AIRFRIC: 500, G: 2300, JUMP: 880, DJUMP: 760, MAXFALL: 900, DASH: 780, DASHT: 0.17, WSLIDE: 140, WJX: 420, WJY: 830, POUND: 1250 };
const COMBO_PTS = [100, 200, 400, 800, 1000, 2000, 4000, 8000];

class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 26; this.h = 40; this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false; this.cornerFix = true;
    this.coyote = 0; this.jumpBuf = 0; this.jumps = 1; this.canDash = true; this.dashT = 0; this.dashCD = 0; this.dashDir = 1; this.dashRefill = false;
    this.wallDir = 0; this.wallLock = 0; this.sliding = false; this.pound = 0; this.poundT = 0; this.poundLandT = 0;
    this.hp = 3; this.maxHp = 3; this.fire = false; this.fireCD = 0; this.inv = 0; this.state = 'play'; this.deadT = 0;
    this.launchT = 0; this.launched = false; this.noCut = false; this.riding = null; this.combo = 0; this.safeX = x; this.safeY = y;
    this.prevBottom = y + this.h; this.t = 0; this.runPh = 0; this.sx = 1; this.sy = 1; this.rot = 0; this.flipT = 0; this.blink = 2; this.trail = []; this.trailT = 0;
    this.hurtT = 0; this.hopT = 0; this.stepT = 0; this.groundC = '.'; this.inUpdraft = 0;
    this.scarf = []; for (let i = 0; i < 6; i++) this.scarf.push({ x, y });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    const I = Input, T = TILE; this.t += dt;
    this.inv = Math.max(0, this.inv - dt); this.dashCD -= dt; this.jumpBuf -= dt; this.coyote -= dt; this.wallLock -= dt;
    this.poundLandT -= dt; this.fireCD -= dt; this.launchT -= dt; this.hurtT -= dt; this.inUpdraft -= dt; this.hopT -= dt;
    if (this.state === 'dead') { this.deadT += dt; if (this.deadT > 0.45) { this.vy += 1900 * dt; this.y += this.vy * dt; this.rot += dt * 7; } return; }
    if (this.state === 'cannon') { this.animate(dt); return; }
    if (this.state === 'clear') {
      this.vx = approach(this.vx, 0, PH.FRIC * dt); this.vy = Math.min(this.vy + PH.G * dt, PH.MAXFALL); this.prevBottom = this.y + this.h;
      moveEnt(this, this.vx * dt, this.vy * dt);
      if (this.onGround) { this.vy = 0; if (this.hopT <= 0) { this.vy = -520; this.hopT = 0.7; this.flipT = 0.38; FX.sparkle(this.cx, this.y, 6); } }
      this.animate(dt); return;
    }
    // リフトに乗っているとき
    if (this.riding) {
      const pl = this.riding;
      if (pl.dead || !pl.solid || this.x + this.w <= pl.x || this.x >= pl.x + pl.w) this.riding = null;
      else { if (pl.dx) moveEnt(this, pl.dx, 0); this.y = pl.y - this.h; this.onGround = true; }
    }
    const ax = (I.held('right') ? 1 : 0) - (I.held('left') ? 1 : 0), jumpHeld = I.held('jump');
    if (I.pressed('jump')) this.jumpBuf = 0.12;
    // 壁判定
    this.wallDir = 0;
    if (!this.onGround) {
      const ty0 = Math.floor((this.y + 8) / T), ty1 = Math.floor((this.y + this.h - 8) / T), txr = Math.floor((this.x + this.w + 2) / T), txl = Math.floor((this.x - 2) / T);
      if (World.solid(txr, ty0) || World.solid(txr, ty1)) this.wallDir = 1; else if (World.solid(txl, ty0) || World.solid(txl, ty1)) this.wallDir = -1;
    }
    if (I.pressed('dash') && this.canDash && this.dashCD <= 0 && this.dashT <= 0) this.startDash(ax);
    this.prevBottom = this.y + this.h;

    if (this.dashT > 0) this.stepDash(dt);
    else this.stepNormal(dt, ax, jumpHeld);
    if (this.state !== 'play') return;

    // トゲ・溶岩・落下
    {
      const x0 = Math.floor((this.x + 5) / T), x1 = Math.floor((this.x + this.w - 5) / T), y0 = Math.floor((this.y + 6) / T), y1 = Math.floor((this.y + this.h - 1) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const c = World.get(tx, ty);
        if (c === '^' && this.y + this.h > ty * T + 20) this.hurt(tx * T + 24);
        else if (c === 'L' && this.y + this.h > ty * T + 18) this.lavaBurn();
      }
    }
    if (this.state !== 'play') return;
    if (this.y > World.h * T + 60) { this.pitFall(); if (this.state !== 'play') return; }
    // 安全な足場を記録
    if (this.onGround && '#XBU?M'.includes(this.groundC)) {
      const ty = Math.floor((this.y + this.h + 2) / T), txl = Math.floor((this.x - 18) / T), txr = Math.floor((this.x + this.w + 18) / T);
      if (World.solid(txl, ty) && World.solid(txr, ty) && World.get(txl, ty - 1) !== '^' && World.get(txr, ty - 1) !== '^') { this.safeX = this.x; this.safeY = this.y; }
    }
    // スターショット
    if (this.fire && I.pressed('fire') && this.fireCD <= 0 && World.shots < 2) {
      this.fireCD = 0.2; World.ents.push(new Shot(this.cx + this.face * 12, this.y + 14, this.face)); Snd.play('fire'); this.sx = 0.85; this.sy = 1.1;
    }
    // 埋まり防止
    { const tx = Math.floor(this.cx / T), ty = Math.floor(this.cy / T); if (World.solid(tx, ty)) for (let i = 1; i < 6; i++) if (!World.solid(tx, ty - i)) { this.y = (ty - i + 1) * T - this.h - 0.01; this.vy = 0; break; } }
    this.animate(dt);
  }

  startDash(ax) {
    this.dashT = PH.DASHT; this.dashDir = ax !== 0 ? ax : (this.sliding ? -this.wallDir : this.face); this.face = this.dashDir; this.canDash = false; this.dashRefill = false;
    this.pound = 0; this.rot = 0; this.launched = false; this.launchT = 0; this.wallLock = 0; this.trailT = 0;
    Snd.play('dash'); FX.ring(this.cx, this.cy, this.fire ? '#ffc35a' : '#8fe0ff', 6, 46, 0.25, 5);
    for (let i = 0; i < 6; i++) FX.add({ type: 'spark', x: this.cx, y: this.cy + rand(-14, 14), vx: -this.dashDir * rand(200, 500), vy: rand(-40, 40), life: rand(0.15, 0.3), size: 2.5, color: '#d8f6ff', add: true });
    Game.shake(3, 0.08);
  }
  stepDash(dt) {
    const T = TILE;
    this.dashT -= dt; this.vx = this.dashDir * PH.DASH; this.vy = 0; this.riding = null;
    moveEnt(this, this.vx * dt, 0);
    if (this.hitL || this.hitR) {
      const tx = this.hitTX; let broke = false; const y0 = Math.floor(this.y / T), y1 = Math.floor((this.y + this.h - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) { const c = World.get(tx, ty); if (c === 'B') { World.breakTile(tx, ty); broke = true; } else if (c === '!' || c === '?' || c === 'M') World.bumpTile(tx, ty, 'dash'); }
      if (broke) { Game.hitstop(0.03); Game.shake(4, 0.1); }
      else { this.dashT = 0; this.vx = 0; FX.sparks(this.cx + this.dashDir * 13, this.cy, 6, '#ffffff'); Snd.play('bump'); Game.shake(4, 0.12); this.sx = 0.7; this.sy = 1.25; }
    }
    this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.022; this.trail.push({ x: this.cx, y: this.y + this.h, face: this.face, life: 0.3 }); }
    const gy = Math.floor((this.y + this.h + 1) / T);
    this.onGround = World.solid(Math.floor((this.x + 2) / T), gy) || World.solid(Math.floor((this.x + this.w - 2) / T), gy);
    if (this.onGround) this.coyote = 0.1;
    if (this.dashT <= 0) { if (this.vx !== 0) this.vx = this.dashDir * PH.RUN; this.dashCD = 0.16; if (this.dashRefill) { this.canDash = true; this.dashRefill = false; } }
  }
  stepNormal(dt, ax, jumpHeld) {
    const I = Input; let conv = 0;
    if (this.pound === 1) { this.poundT -= dt; this.vx = 0; this.vy = 0; this.rot += dt * 30; if (this.poundT <= 0) { this.pound = 2; this.rot = 0; } }
    if (this.pound === 2) { this.vx = 0; this.vy = PH.POUND; if (Math.random() < 0.6) FX.add({ type: 'spark', x: this.cx + rand(-10, 10), y: this.y, vy: -200, life: 0.18, size: 2.5, color: '#ffffff', add: true }); }
    if (this.pound === 0) {
      if (this.wallLock <= 0 && this.launchT <= 0) {
        if (ax !== 0) { const turn = this.vx * ax < 0 ? 1.7 : 1; this.vx = approach(this.vx, ax * PH.RUN, (this.onGround ? PH.ACC : PH.AIRACC) * turn * dt); this.face = ax; this.launched = false; }
        else if (!this.launched) this.vx = approach(this.vx, 0, (this.onGround ? PH.FRIC : PH.AIRFRIC) * dt);
      }
      let g = PH.G; if (this.vy < 0) { if (!jumpHeld && !this.noCut) g *= 2.6; } else { this.noCut = false; if (!this.launched) g *= 1.15; }
      this.vy = Math.min(this.vy + g * dt, PH.MAXFALL);
      this.sliding = false;
      if (!this.onGround && this.wallDir !== 0 && ax === this.wallDir && this.vy > 0) {
        this.vy = Math.min(this.vy, PH.WSLIDE); this.sliding = true; this.face = this.wallDir;
        if (Math.random() < 0.3) FX.dust(this.wallDir > 0 ? this.x + this.w : this.x, this.y + this.h - 6, 1, -this.wallDir, 0.5);
      }
      if (this.jumpBuf > 0) {
        if (this.coyote > 0) {
          const sj = this.poundLandT > 0;
          this.vy = -(sj ? 1100 : PH.JUMP); this.noCut = sj; this.coyote = 0; this.jumpBuf = 0; this.riding = null; this.onGround = false;
          this.sx = 0.72; this.sy = 1.3; FX.dust(this.cx, this.y + this.h, 3);
          if (sj) { Snd.play('superjump'); FX.ring(this.cx, this.y + this.h, '#fff6a8', 8, 80, 0.4, 7); FX.sparkle(this.cx, this.y + this.h, 10); this.flipT = 0.38; } else Snd.play('jump');
        } else if (this.wallDir !== 0) {
          this.vx = -this.wallDir * PH.WJX; this.vy = -PH.WJY; this.wallLock = 0.15; this.face = -this.wallDir; this.jumpBuf = 0; this.launched = false;
          this.sx = 0.75; this.sy = 1.25; Snd.play('walljump');
          FX.dust(this.wallDir > 0 ? this.x + this.w : this.x, this.cy, 5, -this.wallDir, 1.3); FX.ring(this.wallDir > 0 ? this.x + this.w : this.x, this.cy, '#ffffff', 4, 30, 0.2, 4);
        } else if (this.jumps > 0) {
          this.vy = -PH.DJUMP; this.jumps--; this.jumpBuf = 0; this.flipT = 0.38; this.noCut = false; this.launched = false;
          Snd.play('djump'); FX.ring(this.cx, this.y + this.h, this.fire ? '#ffc35a' : '#8fe0ff', 6, 40, 0.3, 5); FX.sparkle(this.cx, this.y + this.h, 6, '#c8f2ff');
        }
      }
      if (I.pressed('down') && !this.onGround && this.coyote <= 0 && this.launchT <= 0 && !this.sliding) { this.pound = 1; this.poundT = 0.16; this.vx = 0; this.vy = 0; this.rot = 0; this.flipT = 0; Snd.play('poundstart'); }
      if (this.onGround && (this.groundC === '<' || this.groundC === '>')) conv = this.groundC === '>' ? 120 : -120;
    }
    const wasG = this.onGround, pvy = this.vy, pb = this.y + this.h;
    this.riding = null;
    moveEnt(this, (this.vx + conv) * dt, this.vy * dt);
    if ((this.hitL && this.vx < 0) || (this.hitR && this.vx > 0)) { this.vx = 0; this.launched = false; }
    // リフト・くずれ床（上からのみ乗れる）
    if (!this.onGround && this.vy >= 0) {
      for (const pl of World.plats) {
        if (!pl.solid || pl.dead) continue;
        if (this.x + this.w > pl.x && this.x < pl.x + pl.w && pb <= pl.y + 8 + Math.max(0, -pl.dy || 0) && this.y + this.h >= pl.y) {
          this.y = pl.y - this.h; this.onGround = true; this.groundC = 'p'; this.riding = pl; if (pl.stood) pl.stood(this); break;
        }
      }
    }
    if (this.hitCeil) { if (this.vy < 0) this.vy = 0; World.bumpTile(this.ceilTX, this.ceilTY, 'below'); this.sy = 0.8; this.sx = 1.15; }
    if (this.onGround) {
      if (this.pound === 2 && !this.poundLand()) this.onGround = false;
      if (this.onGround) {
        if (!wasG && pvy > 250 && this.poundLandT < 0.2) { this.sx = 1.28; this.sy = 0.74; FX.dust(this.cx, this.y + this.h, pvy > 600 ? 6 : 3); Snd.play('land'); }
        this.vy = 0; this.coyote = 0.1; this.jumps = 1; if (this.dashCD <= 0) this.canDash = true; this.launched = false; this.combo = 0; this.noCut = false; this.pound = 0;
        if (Math.abs(this.vx) > 200) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.16; FX.dust(this.cx - this.face * 8, this.y + this.h, 1, -this.face, 0.6); } }
      }
    }
  }
  poundLand() {
    const T = TILE, ty = Math.floor((this.y + this.h + 2) / T), x0 = Math.floor(this.x / T), x1 = Math.floor((this.x + this.w - 0.01) / T);
    let broke = false, solidLeft = this.groundC === 'p';
    if (!solidLeft) for (let tx = x0; tx <= x1; tx++) {
      const c = World.get(tx, ty);
      if (c === 'B') { World.breakTile(tx, ty); broke = true; }
      else if (c === '?' || c === 'M' || c === '!') { World.bumpTile(tx, ty, 'pound'); solidLeft = true; }
      else if (World.isSolid(c) || c === '=') solidLeft = true;
    }
    if (broke && !solidLeft) { Game.shake(5, 0.12); Game.hitstop(0.04); return false; }
    this.pound = 0; this.poundLandT = 0.24; this.sx = 1.5; this.sy = 0.55;
    Game.shake(10, 0.25); Snd.play('pound');
    const fy = this.y + this.h;
    FX.ring(this.cx, fy, '#ffffff', 10, 125, 0.35, 8); FX.dust(this.cx - 14, fy, 6, -1, 2.2); FX.dust(this.cx + 14, fy, 6, 1, 2.2); FX.sparks(this.cx, fy, 10, '#ffe9a8');
    for (const e of World.ents) if (e.enemy && !e.dying && !e.dead && e.poundable !== false && Math.abs(e.cx - this.cx) < 135 && Math.abs(e.y + e.h - fy) < 46) { e.kill('flip', Math.sign(e.cx - this.cx) || 1); this.addCombo(e); }
    return true;
  }
  addCombo(e) {
    this.combo++;
    if (this.combo >= 9) Game.oneUp(e.cx, e.y - 10);
    else { const pts = COMBO_PTS[this.combo - 1]; Game.addScore(pts); FX.text(e.cx, e.y - 8, pts, this.combo > 2 ? '#ffe45a' : '#ffffff', 16 + this.combo * 2); }
    if (this.combo >= 2) FX.text(this.cx, this.y - 26, this.combo + ' COMBO!', '#7ff0ff', 14);
  }
  onStomp(e) {
    this.addCombo(e);
    if (this.pound !== 2) { this.vy = Input.held('jump') ? -850 : -540; this.noCut = true; this.y = Math.min(this.y, e.y - this.h + 6); }
    this.jumps = 1; this.canDash = true; this.flipT = 0; Game.hitstop(0.05); Snd.play('stomp');
    FX.ring(e.cx, e.y, '#ffffff', 6, 40, 0.25, 5); FX.sparkle(e.cx, e.y, 5);
  }
  onDashKill(e) { this.addCombo(e); this.dashRefill = true; this.jumps = 1; Game.hitstop(0.06); Game.shake(5, 0.12); Snd.play('kick'); FX.sparks(e.cx, e.cy, 10, '#ffffff'); }
  hurt(srcX) {
    if (this.inv > 0 || this.state !== 'play') return false;
    this.hp--; this.fire = false;
    Snd.play('hurt'); Game.shake(8, 0.25); Game.hitstop(0.09); Game.flash('#ff3050', 0.2, 0.35);
    FX.sparkle(this.cx, this.cy, 8, '#ff8a9a');
    if (this.hp <= 0) { this.die(); return true; }
    this.inv = 1.6; this.hurtT = 0.45; this.dashT = 0; this.pound = 0; this.rot = 0; this.vx = (this.cx < srcX ? -1 : 1) * 260; this.vy = -430; this.noCut = true;
    this.wallLock = 0.25; this.launched = false; this.riding = null;
    return true;
  }
  lavaBurn() {
    if (this.state !== 'play') return;
    if (this.inv <= 0) {
      this.hp--; this.fire = false; Game.shake(8, 0.25); Game.hitstop(0.08); Game.flash('#ff6a1a', 0.2, 0.35);
      if (this.hp <= 0) { Snd.play('burn'); this.die(); return; }
      this.inv = 1.6; this.hurtT = 0.45;
    }
    this.vy = -900; this.noCut = true; this.pound = 0; this.dashT = 0; this.rot = 0; this.jumps = 1; this.canDash = true; this.launched = false;
    Snd.play('burn'); FX.fire(this.cx, this.y + this.h, 12, 2);
  }
  pitFall() {
    if (this.state !== 'play') return;
    this.hp--; this.fire = false;
    if (this.hp <= 0) { this.y = World.h * TILE + 20; this.die(); this.vy = -980; this.deadT = 0.45; return; }
    Snd.play('hurt'); Game.flash('#ffffff', 0.3, 0.6);
    this.x = this.safeX; this.y = this.safeY; this.vx = 0; this.vy = 0; this.inv = 2; this.pound = 0; this.dashT = 0; this.rot = 0; this.launched = false; this.riding = null;
    FX.poof(this.cx, this.cy, 10); FX.ring(this.cx, this.cy, '#ffffff', 10, 70, 0.4, 6);
    for (const s of this.scarf) { s.x = this.x; s.y = this.y; }
  }
  die() {
    if (this.state === 'dead') return;
    this.state = 'dead'; this.deadT = 0; this.vy = -660; this.vx = 0; this.dashT = 0; this.pound = 0; this.rot = 0; this.trail.length = 0;
    Snd.play('die'); Music.stop(); Game.onPlayerDead();
  }
  heal(n = 1) { this.hp = Math.min(this.maxHp, this.hp + n); }

  animate(dt) {
    const k = 1 - Math.pow(0.00005, dt); this.sx = lerp(this.sx, 1, k); this.sy = lerp(this.sy, 1, k);
    if (this.onGround) this.runPh += Math.abs(this.vx) * dt * 0.052;
    this.flipT -= dt; this.blink -= dt; if (this.blink < -0.12) this.blink = rand(1.5, 4);
    const s = this.scarf; s[0].x = this.cx - this.face * 7; s[0].y = this.y + 15;
    for (let i = 1; i < s.length; i++) {
      let dx = s[i].x - s[i - 1].x - this.face * 1.4 + Math.sin(this.t * 10 + i * 1.3) * 0.7, dy = s[i].y - s[i - 1].y + 1.5 - (this.inUpdraft > 0 ? 4 : 0);
      const d = Math.hypot(dx, dy) || 1; s[i].x = s[i - 1].x + dx / d * 6.5; s[i].y = s[i - 1].y + dy / d * 6.5;
    }
    for (let i = this.trail.length - 1; i >= 0; i--) { this.trail[i].life -= dt; if (this.trail[i].life <= 0) this.trail.splice(i, 1); }
    if (this.fire && Math.random() < 0.25) FX.add({ type: 'star', x: this.cx - this.face * 18 + rand(-4, 4), y: this.y + 20 + rand(-6, 6), vy: -30, life: 0.4, size: rand(2, 4), color: '#ffd76a', add: true, vr: 5 });
  }

  draw(ctx) {
    for (const tr of this.trail) { ctx.globalAlpha = tr.life / 0.3 * 0.55; this.drawBody(ctx, tr.x, tr.y, tr.face, this.fire ? '#ffb347' : '#7fd4ff'); }
    ctx.globalAlpha = 1;
    if (this.state === 'cannon') return;
    if (this.inv > 0 && this.state === 'play' && this.hurtT <= 0 && Math.floor(this.t * 22) % 2 === 0) return;
    // マフラー
    const s = this.scarf; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = this.fire ? '#ffd23c' : '#e8344e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y); ctx.stroke();
    ctx.strokeStyle = this.fire ? '#fff3a8' : '#ff7a8c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y - 1.5); for (let i = 1; i < s.length - 1; i++) ctx.lineTo(s[i].x, s[i].y - 1.5); ctx.stroke();
    if (this.dashT > 0) glow(ctx, this.cx, this.cy, 46, this.fire ? '#ffb347' : '#6fd0ff', 0.7);
    this.drawBody(ctx, this.cx, this.y + this.h, this.face, null);
    R.light(this.cx, this.cy, this.fire ? 230 : 200);
  }
  // (x,y)=足元中央。mono 指定で単色シルエット（残像用）
  drawBody(ctx, x, y, face, mono) {
    const C = c => mono || c;
    const dash = this.dashT > 0 || !!mono, air = !this.onGround, run = this.onGround && Math.abs(this.vx) > 30;
    ctx.save(); ctx.translate(x, y);
    let rot = 0, sx = this.sx, sy = this.sy;
    if (this.state === 'dead') rot = this.rot;
    else if (dash) { rot = 0.6 * face; sx *= 1.22; sy *= 0.82; }
    else if (this.pound === 1) rot = this.rot * face;
    else if (this.pound === 2) { sx *= 0.82; sy *= 1.22; }
    else if (this.flipT > 0) rot = (1 - this.flipT / 0.38) * TAU * face;
    else if (this.sliding) rot = -0.14 * face;
    else rot = clamp(this.vx / PH.RUN, -1, 1) * (air ? 0.14 : 0.1);
    ctx.translate(0, -20); ctx.rotate(rot); ctx.translate(0, 20);
    ctx.scale(face * sx, sy);
    const ph = this.runPh, clear = this.state === 'clear';
    // しっぽ
    const wag = Math.sin(this.t * 6) * 3 + (air ? clamp(-this.vy * 0.012, -8, 8) : 0);
    ctx.fillStyle = C('#ff9a3c'); ctx.beginPath(); ctx.moveTo(-5, -10); ctx.quadraticCurveTo(-22, -4 + wag * 0.5, -29, -21 + wag); ctx.quadraticCurveTo(-26, -34 + wag, -14, -25); ctx.quadraticCurveTo(-8, -20, -5, -10); ctx.fill();
    ctx.fillStyle = C(this.fire ? '#fff3a8' : '#fff4dc'); ctx.beginPath(); ctx.moveTo(-29, -21 + wag); ctx.quadraticCurveTo(-27, -33 + wag, -18, -28 + wag * 0.6); ctx.quadraticCurveTo(-22, -22 + wag, -29, -21 + wag); ctx.fill();
    // 足
    let lx1, ly1, lx2, ly2;
    if (run) { lx1 = Math.sin(ph) * 7; ly1 = -Math.max(0, Math.cos(ph)) * 5; lx2 = Math.sin(ph + Math.PI) * 7; ly2 = -Math.max(0, Math.cos(ph + Math.PI)) * 5; }
    else if (air) { if (this.vy < 0) { lx1 = -3; ly1 = -5; lx2 = 4; ly2 = -2; } else { lx1 = -5; ly1 = -1; lx2 = 5; ly2 = -3; } }
    else { lx1 = -4; ly1 = 0; lx2 = 4; ly2 = 0; }
    ctx.fillStyle = C('#6b3312'); ell(ctx, lx2 - 1, -3.5 + ly2, 6, 4); ctx.fill();
    // 胴
    ctx.fillStyle = C(this.fire ? '#e8433a' : '#3b7dd8'); rrect(ctx, -9, -24, 18, 19, 7); ctx.fill();
    ctx.fillStyle = C(this.fire ? '#ffd23c' : '#fff4dc'); rrect(ctx, -2, -20, 9, 12, 4); ctx.fill();
    if (!mono) { ctx.fillStyle = this.fire ? '#b02a24' : '#2a5cab'; ctx.fillRect(-9, -10, 18, 3); }
    ctx.fillStyle = C('#8a4518'); ell(ctx, lx1 + 1, -3.5 + ly1, 6.5, 4.2); ctx.fill();
    // 腕
    const aa = clear ? -2.6 : run ? Math.sin(ph + Math.PI) * 0.9 : (air ? (this.vy < 0 ? -2.3 : -1.3) : 0.2);
    ctx.save(); ctx.translate(1, -20); ctx.rotate(aa); ctx.fillStyle = C('#ff9a3c'); rrect(ctx, -2.8, 0, 5.6, 11, 2.8); ctx.fill(); ctx.fillStyle = C('#fff4dc'); ell(ctx, 0, 10, 3, 3); ctx.fill(); ctx.restore();
    // マフラー（首）
    ctx.fillStyle = C(this.fire ? '#ffd23c' : '#e8344e'); rrect(ctx, -10, -27, 20, 6, 3); ctx.fill();
    // 頭
    ctx.translate(0, -(run ? Math.abs(Math.sin(ph)) * 1.5 : Math.sin(this.t * 3) * 0.6));
    ctx.fillStyle = C('#ff9a3c');
    ctx.beginPath(); ctx.moveTo(-10, -37); ctx.lineTo(-9, -53); ctx.lineTo(0, -42); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, -42); ctx.lineTo(9, -54); ctx.lineTo(12.5, -37); ctx.fill();
    ctx.fillStyle = C('#5a2a10');
    ctx.beginPath(); ctx.moveTo(-9, -53); ctx.lineTo(-9.6, -46.5); ctx.lineTo(-5.2, -47.6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, -54); ctx.lineTo(5.6, -48.4); ctx.lineTo(10.4, -47.2); ctx.fill();
    ctx.fillStyle = C('#ffc9a8'); ctx.beginPath(); ctx.moveTo(5, -42); ctx.lineTo(8.6, -48); ctx.lineTo(10.4, -40); ctx.fill();
    ctx.fillStyle = C('#ff9a3c'); ell(ctx, 1, -33, 12.5, 11.5); ctx.fill();
    ctx.fillStyle = C('#fff4dc'); ell(ctx, 5.5, -29.5, 8.2, 6.4); ctx.fill();
    if (!mono) {
      const hurt = this.hurtT > 0 || this.state === 'dead';
      ctx.strokeStyle = '#2a1608'; ctx.fillStyle = '#2a1608'; ctx.lineCap = 'round';
      if (hurt) { ctx.lineWidth = 1.9; ctx.beginPath(); ctx.moveTo(3, -37.5); ctx.lineTo(7.5, -35); ctx.lineTo(3, -32.5); ctx.stroke(); }
      else if (clear) { ctx.lineWidth = 1.9; ctx.beginPath(); ctx.arc(5.5, -34, 2.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (this.blink < 0) ctx.fillRect(3, -35.4, 5.2, 1.7);
      else { ell(ctx, 5.6, -35, 2.5, 3.5); ctx.fill(); ctx.fillStyle = '#ffffff'; ell(ctx, 6.4, -36.3, 0.95, 1.25); ctx.fill(); ctx.fillStyle = '#2a1608'; }
      ell(ctx, 12.6, -31.2, 1.9, 1.5); ctx.fill();
      ctx.lineWidth = 1.2; ctx.beginPath();
      if (clear || (air && this.vy < 0) || dash) { ctx.fillStyle = '#b8323c'; ell(ctx, 9.5, -27.3, 2.2, 2.4); ctx.fill(); }
      else { ctx.arc(9, -29.4, 2.4, 0.3, 2.3); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,120,120,.45)'; ell(ctx, 1.5, -29.5, 2.6, 1.7); ctx.fill();
    }
    ctx.restore();
  }
}
