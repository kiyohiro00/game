'use strict';
// ===== ボス「マグマキング」 =====
class Shockwave extends Ent {
  constructor(x, y, dir) { super(x - 18, y - 36, 36, 36); this.dir = dir; this.always = true; this.life = 2.4; }
  update(dt) {
    this.t += dt; this.life -= dt; this.x += this.dir * 340 * dt;
    if (Math.random() < 0.7) FX.fire(this.cx, this.y + this.h - 4, 1, 1);
    if (this.life <= 0 || World.solid(Math.floor((this.cx + this.dir * 16) / TILE), Math.floor((this.cy) / TILE))) { this.dead = true; FX.fire(this.cx, this.cy, 8, 2); }
  }
  touch(p) { p.hurt(this.cx); }
  draw(ctx) {
    const x = this.cx, by = this.y + this.h, f = Math.sin(this.t * 22) * 3;
    glow(ctx, x, by - 14, 44, '#ff7a1a', 0.85); R.light(x, by - 14, 120);
    ctx.save(); ctx.translate(x, by); ctx.scale(this.dir, 1);
    ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.quadraticCurveTo(-14, -30 - f, 8, -38 - f); ctx.quadraticCurveTo(0, -22, 18, -16 + f); ctx.quadraticCurveTo(12, -6, 18, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(-8, -18 - f, 4, -24 - f); ctx.quadraticCurveTo(0, -12, 10, -8); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
class BossFire extends Ent {
  constructor(x, y, vx, vy, rock) { super(x - 13, y - 13, 26, 26); this.vx = vx; this.vy = vy; this.always = true; this.rock = rock; }
  update(dt) {
    this.t += dt; this.vy += 1300 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (Math.random() < 0.6) FX.fire(this.cx, this.cy, 1, 0.5);
    if ((this.vy > 0 && this.cy > 2.6 * TILE && World.solid(Math.floor(this.cx / TILE), Math.floor((this.cy + 8) / TILE))) || this.y > World.h * TILE) { this.dead = true; FX.boom(this.cx, this.cy, 0.45); if (Math.abs(this.cx - Game.cam.x - VW / 2) < VW) Snd.play('land'); }
  }
  touch(p) { if (p.hurt(this.cx)) { this.dead = true; FX.boom(this.cx, this.cy, 0.4); } }
  draw(ctx) {
    const x = this.cx, y = this.cy, r = 13 + Math.sin(this.t * 18) * 1.5;
    glow(ctx, x, y, 40, '#ff7a1a', 0.9); R.light(x, y, 110);
    if (this.rock) { ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 5); ctx.fillStyle = '#3a1f2a'; ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr = 14 + (i % 2) * 4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(0, 2); ctx.lineTo(7, -5); ctx.moveTo(0, 2); ctx.lineTo(-2, 10); ctx.stroke(); ctx.restore(); return; }
    ctx.fillStyle = '#ff5a1a'; ell(ctx, x, y, r, r); ctx.fill(); ctx.fillStyle = '#ffd23c'; ell(ctx, x, y, r * 0.68, r * 0.68); ctx.fill(); ctx.fillStyle = '#fffbe0'; ell(ctx, x, y, r * 0.34, r * 0.34); ctx.fill();
  }
}

class Boss extends Enemy {
  constructor(x, y) {
    super(x - 34, y + TILE - 104, 116, 104);
    this.isBoss = true; this.dashable = false; this.shootable = false; this.poundable = false; this.always = true;
    this.arenaL = x - 15 * TILE; this.arenaR = x + 5 * TILE; this.groundY = y + TILE;
    this.hp = 6; this.maxHp = 6; this.state = 'sleep'; this.timer = 0; this.seq = 0; this.inv = 0; this.dir = -1; this.sq = 1; this.flash = 0; this.mouth = 0;
    this.running = false; this.shot = false; this.exT = 0; this.name = 'マグマキング';
    World.boss = this;
  }
  kill() { }
  get phase2() { return this.hp <= 3; }
  update(dt) {
    this.t += dt; const p = Game.player; this.inv -= dt; this.flash -= dt; this.sq = lerp(this.sq, 1, 0.12);
    this.mouth = lerp(this.mouth, (this.state === 'intro' || this.state === 'fire') ? 1 : (this.state === 'stun' ? 0.6 : 0), 0.2);
    if (this.state === 'sleep') {
      if (p.state === 'play' && p.x > this.arenaL + TILE * 2.2 && p.x < this.arenaR) {
        const tx = Math.round(this.arenaL / TILE), ty = Math.round(this.groundY / TILE);
        for (let i = 1; i <= 3; i++) { World.set(tx, ty - i, 'X'); FX.dust(this.arenaL + 24, (ty - i) * TILE + 24, 5, 1, 2); }
        World.camLock = { l: this.arenaL, r: this.arenaR }; Game.shake(12, 0.6); Snd.play('crush'); Snd.play('roar'); Music.play('boss');
        this.state = 'intro'; this.timer = 2.2; Game.bossBanner = 2.6; this.sq = 1.3;
      }
      return;
    }
    if (this.state === 'dead') {
      this.timer -= dt; this.exT -= dt; this.vx = 0;
      if (this.exT <= 0) { this.exT = 0.13; FX.boom(this.x + rand(this.w), this.y + rand(this.h), rand(0.6, 1.1)); Snd.play('boom'); Game.shake(7, 0.2); }
      if (this.timer <= 0) {
        this.dead = true; World.boss = null; World.camLock = null; FX.boom(this.cx, this.cy, 2.4); Game.flash('#ffffff', 0.7, 1); Game.shake(18, 0.8); Snd.play('boom'); Snd.play('star');
        FX.sparkle(this.cx, this.cy, 40, '#fff6a8', 2.5);
        const g = new Goal(this.arenaL + 9.5 * TILE, this.groundY - TILE); World.ents.push(g); FX.ring(g.cx, g.cy, '#fff6a8', 10, 200, 0.8, 10);
        Game.addScore(5000); FX.text(this.cx, this.y, 5000, '#ffe45a', 30);
      }
      return;
    }
    // 行動
    this.timer -= dt;
    switch (this.state) {
      case 'intro': if (this.timer <= 0) this.toIdle(0.6); if (Math.random() < 0.3) Game.shake(3, 0.1); break;
      case 'idle':
        this.vx = 0; if (Math.abs(p.cx - this.cx) > 40) this.dir = p.cx < this.cx ? -1 : 1;
        if (this.timer <= 0 && this.onGround) this.nextAction(p);
        break;
      case 'hop':
        if (this.onGround && this.vy >= 0 && this.timer < 0.5) {
          this.vx = 0; Game.shake(12, 0.3); Snd.play('crush'); this.sq = 0.65;
          FX.dust(this.x + 10, this.groundY, 8, -1, 2.5); FX.dust(this.x + this.w - 10, this.groundY, 8, 1, 2.5);
          World.ents.push(new Shockwave(this.x, this.groundY, -1), new Shockwave(this.x + this.w, this.groundY, 1));
          this.toIdle(this.phase2 ? 0.55 : 0.9);
        }
        break;
      case 'fire':
        this.vx = 0;
        if (!this.shot && this.timer <= 0.55) {
          this.shot = true; const n = this.phase2 ? 5 : 3; Snd.play('shot'); this.sq = 1.2;
          for (let i = 0; i < n; i++) { const tx = p.cx + (i - (n - 1) / 2) * 130, T = 1.0, sx = this.cx + this.dir * 40, sy = this.y + 44; World.ents.push(new BossFire(sx, sy, (tx - sx) / T, -520 - rand(120))); }
          FX.fire(this.cx + this.dir * 44, this.y + 46, 14, 2.5);
        }
        if (this.timer <= 0) this.toIdle(this.phase2 ? 0.5 : 0.8);
        break;
      case 'charge':
        if (!this.running) {
          this.vx = 0; if (Math.random() < 0.5) FX.dust(this.cx - this.dir * 40, this.groundY, 1, -this.dir, 2); if (Math.random() < 0.4) FX.fire(this.cx + rand(-30, 30), this.y + 6, 1, 1);
          if (this.timer <= 0) { this.running = true; Snd.play('roar'); }
        } else {
          this.vx = this.dir * (this.phase2 ? 640 : 540);
          if (Math.random() < 0.8) FX.fire(this.cx + rand(-40, 40), this.y + rand(0, 20), 1, 1.2); if (Math.random() < 0.5) FX.dust(this.cx - this.dir * 50, this.groundY, 1, -this.dir, 2);
          if (this.hitL || this.hitR) {
            this.running = false; this.state = 'stun'; this.timer = 2.4; this.vx = -this.dir * 150; this.vy = -360; Game.shake(16, 0.5); Snd.play('crush'); Game.hitstop(0.08); this.sq = 0.7;
            FX.sparks(this.cx + this.dir * 56, this.cy, 16, '#ffe9a8', 1.5); FX.ring(this.cx + this.dir * 56, this.cy, '#ffffff', 10, 120, 0.4, 8);
            if (this.phase2) for (let i = 0; i < 5; i++) World.ents.push(new BossFire(this.arenaL + TILE * 2 + rand(TILE * 16), 2 * TILE + 20 - i * 110, 0, 0, true));
          }
        }
        break;
      case 'stun': if (this.onGround) this.vx = 0; if (this.timer <= 0) this.toIdle(0.4); break;
      case 'hurt': if (this.onGround) this.vx = approach(this.vx, 0, 900 * dt); if (this.timer <= 0) this.toIdle(0.3); break;
    }
    this.vy = Math.min(this.vy + 2300 * dt, 1200);
    moveEnt(this, this.vx * dt, this.vy * dt);
    if (this.onGround && this.vy > 0) this.vy = 0;
  }
  toIdle(t) { this.state = 'idle'; this.timer = t; this.running = false; }
  nextAction(p) {
    const order = this.phase2 ? ['hop', 'fire', 'hop', 'charge'] : ['hop', 'hop', 'fire', 'charge'], a = order[this.seq++ % order.length];
    this.state = a;
    if (a === 'hop') { const air = 2 * 1000 / 2300; this.vy = -1000; this.vx = clamp((p.cx - this.cx) / air, -430, 430); this.timer = air; this.onGround = false; this.sq = 1.3; Snd.play('jump'); FX.dust(this.cx, this.groundY, 8, 0, 2); }
    else if (a === 'fire') { this.timer = 1.0; this.shot = false; }
    else { this.timer = this.phase2 ? 0.6 : 0.85; this.running = false; this.dir = p.cx < this.cx ? -1 : 1; }
  }
  damage(n) {
    this.hp -= n; this.inv = 1.3; this.flash = 0.5; Snd.play('bosshit'); Game.hitstop(0.13); Game.shake(14, 0.35); Game.flash('#ffffff', 0.15, 0.4); this.sq = 0.6;
    FX.sparkle(this.cx, this.y, 16, '#fff6a8', 2); FX.ring(this.cx, this.y, '#ffffff', 10, 140, 0.4, 9); FX.text(this.cx, this.y - 16, n > 1 ? 'CRITICAL!!' : 'HIT!', n > 1 ? '#ff7a5a' : '#ffe45a', 24);
    if (this.hp <= 0) { this.hp = 0; this.state = 'dead'; this.timer = 2.6; this.exT = 0; Music.stop(); Game.slowmo = 1.2; Snd.play('roar'); this.running = false; }
    else { this.state = 'hurt'; this.timer = 0.7; this.running = false; if (this.hp === 3) { Snd.play('roar'); Game.bossBanner2 = 1.6; } }
  }
  touch(p) {
    if (this.state === 'sleep' || this.state === 'dead' || p.state !== 'play') return;
    const above = p.vy > 0 && p.prevBottom <= this.y + 36;
    if (above) {
      if (this.running) { p.hurt(this.cx); return; }
      const big = p.pound === 2;
      if (this.inv <= 0) this.damage(big && this.state === 'stun' ? 2 : 1);
      p.pound = 0; p.rot = 0; p.vy = Input.held('jump') ? -900 : -700; p.noCut = true; p.jumps = 1; p.canDash = true; p.y = this.y - p.h; p.onGround = false; Snd.play('stomp');
      return;
    }
    if (this.state === 'hurt') return;
    p.hurt(this.cx);
  }
  draw(ctx) {
    const fl = this.flash > 0 && Math.floor(this.t * 28) % 2 === 0, dead = this.state === 'dead', stun = this.state === 'stun', sleep = this.state === 'sleep';
    const rage = this.phase2 && !sleep; const bob = Math.sin(this.t * 4) * 2;
    const shakeX = (this.state === 'charge' && !this.running) || dead ? rand(-3, 3) : 0;
    R.light(this.cx, this.cy, 300);
    glow(ctx, this.cx, this.cy, 120, rage ? '#ff4d1a' : '#ff7a1a', 0.35 + (this.running ? 0.3 : 0));
    ctx.save(); ctx.translate(this.cx + shakeX, this.y + this.h); ctx.scale(this.dir * (2 - this.sq), this.sq);
    const body = fl ? '#ffffff' : (rage ? '#4a1420' : '#3a1f2a'), body2 = fl ? '#ffe0d0' : (rage ? '#240810' : '#1c0d14'), lava = rage ? '#ffb01a' : '#ff7a1a';
    // 足
    ctx.fillStyle = body2; rrect(ctx, -46, -16, 34, 16, 6); ctx.fill(); rrect(ctx, 12, -16, 34, 16, 6); ctx.fill();
    // こぶし
    const fy = -44 + bob + (this.state === 'fire' ? -16 : 0);
    ctx.fillStyle = body2; ell(ctx, -62, fy, 17, 16); ctx.fill(); ell(ctx, 64, fy + 2, 17, 16); ctx.fill();
    // 体
    const g = ctx.createLinearGradient(0, -106, 0, -8); g.addColorStop(0, body); g.addColorStop(1, body2); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-50, -10); ctx.bezierCurveTo(-66, -50, -52, -106 + bob, 0, -106 + bob); ctx.bezierCurveTo(52, -106 + bob, 66, -50, 50, -10); ctx.closePath(); ctx.fill();
    // 溶岩のひび
    ctx.strokeStyle = lava; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.75 + Math.sin(this.t * 6) * 0.25;
    ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(-30, -44); ctx.lineTo(-38, -58); ctx.moveTo(-30, -44); ctx.lineTo(-18, -40);
    ctx.moveTo(36, -24); ctx.lineTo(30, -40); ctx.lineTo(40, -52); ctx.moveTo(-8, -16); ctx.lineTo(0, -26); ctx.lineTo(12, -18); ctx.moveTo(-44, -76); ctx.lineTo(-36, -84); ctx.stroke();
    ctx.globalAlpha = 1;
    // つの
    ctx.fillStyle = '#e9e0d0'; ctx.beginPath(); ctx.moveTo(-40, -90 + bob); ctx.quadraticCurveTo(-60, -104 + bob, -54, -128 + bob); ctx.quadraticCurveTo(-40, -112 + bob, -26, -100 + bob); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, -90 + bob); ctx.quadraticCurveTo(60, -104 + bob, 54, -128 + bob); ctx.quadraticCurveTo(40, -112 + bob, 26, -100 + bob); ctx.fill();
    // 王冠
    ctx.fillStyle = '#ffc21a'; ctx.beginPath(); ctx.moveTo(-22, -100 + bob); ctx.lineTo(-24, -124 + bob); ctx.lineTo(-11, -112 + bob); ctx.lineTo(0, -130 + bob); ctx.lineTo(11, -112 + bob); ctx.lineTo(24, -124 + bob); ctx.lineTo(22, -100 + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff3a8'; ctx.fillRect(-22, -106 + bob, 44, 4); ctx.fillStyle = '#ff3050'; ell(ctx, 0, -112 + bob, 4, 4.5); ctx.fill();
    // 顔
    const ex = 10, ey = -72 + bob;
    if (sleep) { ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex - 18, ey, 8, 0.2, Math.PI - 0.2); ctx.moveTo(ex + 26, ey); ctx.arc(ex + 18, ey, 8, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (stun || dead) { ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 4; for (const s of [-18, 18]) { ctx.beginPath(); ctx.moveTo(ex + s - 7, ey - 7); ctx.lineTo(ex + s + 7, ey + 7); ctx.moveTo(ex + s + 7, ey - 7); ctx.lineTo(ex + s - 7, ey + 7); ctx.stroke(); } }
    else {
      ctx.fillStyle = rage ? '#ff5a3a' : '#ffd23c'; ell(ctx, ex - 18, ey, 10, 9); ctx.fill(); ell(ctx, ex + 18, ey, 10, 9); ctx.fill();
      ctx.fillStyle = '#1a0508'; ell(ctx, ex - 15, ey + 1, 3.5, 6); ctx.fill(); ell(ctx, ex + 21, ey + 1, 3.5, 6); ctx.fill();
      ctx.fillStyle = body2; ctx.beginPath(); ctx.moveTo(ex - 34, ey - 16); ctx.lineTo(ex - 4, ey - 5); ctx.lineTo(ex - 6, ey - 12); ctx.lineTo(ex - 32, ey - 22); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex + 34, ey - 16); ctx.lineTo(ex + 4, ey - 5); ctx.lineTo(ex + 6, ey - 12); ctx.lineTo(ex + 32, ey - 22); ctx.fill();
    }
    // 口
    const mo = 6 + this.mouth * 18;
    ctx.fillStyle = this.mouth > 0.3 ? lava : '#1a0508'; rrect(ctx, ex - 24, -52 + bob, 48, mo, 5); ctx.fill();
    ctx.fillStyle = '#e9e0d0'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(ex - 22 + i * 9, -52 + bob); ctx.lineTo(ex - 18 + i * 9, -45 + bob); ctx.lineTo(ex - 14 + i * 9, -52 + bob); ctx.fill(); }
    if (this.mouth > 0.3) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(ex - 18 + i * 9, -52 + bob + mo); ctx.lineTo(ex - 14 + i * 9, -58 + bob + mo); ctx.lineTo(ex - 10 + i * 9, -52 + bob + mo); ctx.fill(); }
    ctx.restore();
    // 突進中は頭が燃える（踏めない合図）
    if (this.running || (this.state === 'charge' && this.timer < 0.4)) for (let i = 0; i < 2; i++) FX.fire(this.cx + rand(-36, 36), this.y + rand(-6, 14), 1, 1.4);
    if (stun) for (let i = 0; i < 4; i++) { const a = this.t * 5 + i * TAU / 4; ctx.fillStyle = '#ffe45a'; starPath(ctx, this.cx + Math.cos(a) * 44, this.y - 22 + Math.sin(a) * 10, 8, 3.5, 5, a); ctx.fill(); }
    if (sleep) { ctx.font = FONT(20); ctx.textAlign = 'center'; for (let i = 0; i < 3; i++) { const k = (this.t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; otext(ctx, 'Z', this.cx + 30 + k * 30, this.y - 20 - k * 50, '#ffffff', '#1a1030', 4); } ctx.globalAlpha = 1; }
  }
}
