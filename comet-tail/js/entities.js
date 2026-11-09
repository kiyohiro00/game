'use strict';
// ===== 敵・ギミック・アイテム =====
class Ent {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.vx = 0; this.vy = 0; this.dead = false; this.t = rand(10); }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt) { this.t += dt; }
  draw(ctx) { }
  touch(p) { }
}

// ---------------------------------------------------------------- 敵
class Enemy extends Ent {
  constructor(x, y, w, h) { super(x, y, w, h); this.enemy = true; this.stompable = true; this.dashable = true; this.shootable = true; this.dying = 0; this.dieMode = ''; this.rot = 0; this.dir = -1; }
  touch(p) {
    if (this.dying || p.state !== 'play') return;
    if (p.dashT > 0 && this.dashable) { this.kill('flip', p.dashDir); p.onDashKill(this); return; }
    const above = p.vy > 0 && p.prevBottom <= this.y + this.h * 0.6 + 6;
    if (above && this.stompable) { this.kill(p.pound === 2 ? 'flip' : 'squash', 0); p.onStomp(this); return; }
    p.hurt(this.cx);
  }
  kill(mode, dir = 0) {
    if (this.dying) return; this.dying = 0.0001; this.dieMode = mode;
    if (mode === 'flip') { this.vy = -460; this.vx = dir * 170 + rand(-30, 30); FX.sparkle(this.cx, this.cy, 5, '#ffffff'); }
  }
  dyingUpdate(dt) {
    this.dying += dt;
    if (this.dieMode === 'flip') { this.vy += 1800 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 11; if (this.dying > 1.6) this.dead = true; }
    else if (this.dying > 0.3) { this.dead = true; FX.poof(this.cx, this.y + this.h - 6, 7); }
  }
  walk(dt, speed) {
    this.vy = Math.min(this.vy + 1800 * dt, 800);
    moveEnt(this, this.dir * speed * dt, this.vy * dt);
    if (this.onGround) {
      this.vy = 0;
      const fx = this.dir > 0 ? this.x + this.w + 2 : this.x - 2, c = World.get(Math.floor(fx / TILE), Math.floor((this.y + this.h + 4) / TILE));
      if (!(World.isSolid(c) || c === '=')) this.dir *= -1;
    }
    if (this.hitL) this.dir = 1; else if (this.hitR) this.dir = -1;
    if (this.y > World.h * TILE + 100) this.dead = true;
  }
  // 足元中央を原点に。やられ演出の変形つき
  begin(ctx) {
    ctx.save(); ctx.translate(this.cx, this.y + this.h);
    if (this.dying) {
      if (this.dieMode === 'squash') ctx.scale(1.35, 0.28);
      else { ctx.translate(0, -this.h / 2); ctx.rotate(this.rot); ctx.scale(1, -1); ctx.translate(0, this.h / 2); }
    }
  }
}
const PUNI_COL = { grass: ['#a8f58a', '#4cc25a', '#1f7a36'], cave: ['#9fe8ff', '#3f9be8', '#1f4fa8'], sky: ['#ffc2e2', '#f0689e', '#a82a6a'], castle: ['#ffb38a', '#e8553a', '#8a1f1a'] };
class Puni extends Enemy {
  constructor(x, y) { super(x + 6, y + 14, 36, 34); }
  update(dt) { this.t += dt; if (this.dying) return this.dyingUpdate(dt); this.walk(dt, 55); }
  draw(ctx) {
    const col = PUNI_COL[World.theme]; this.begin(ctx);
    const wob = Math.sin(this.t * 9) * 0.07; ctx.scale(1 + wob, 1 - wob);
    const g = ctx.createLinearGradient(0, -36, 0, 0); g.addColorStop(0, col[0]); g.addColorStop(0.6, col[1]); g.addColorStop(1, col[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.bezierCurveTo(-24, -18, -14, -36, 0, -36); ctx.bezierCurveTo(14, -36, 24, -18, 20, 0); ctx.quadraticCurveTo(0, 3, -20, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ell(ctx, -8, -26, 5, 3.2, -0.5); ctx.fill();
    const d = this.dir;
    ctx.fillStyle = '#ffffff'; ell(ctx, -6 + d * 3, -17, 5, 6.2); ctx.fill(); ell(ctx, 7 + d * 3, -17, 5, 6.2); ctx.fill();
    ctx.fillStyle = '#1a1030'; ell(ctx, -5 + d * 5, -16.5, 2.3, 3.2); ctx.fill(); ell(ctx, 8 + d * 5, -16.5, 2.3, 3.2); ctx.fill();
    ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-12 + d * 3, -25); ctx.lineTo(-3 + d * 3, -22.5); ctx.moveTo(13 + d * 3, -25); ctx.lineTo(4 + d * 3, -22.5); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(1 + d * 4, -6, 3.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();
  }
}
class Toge extends Enemy {
  constructor(x, y) { super(x + 7, y + 16, 34, 32); this.stompable = false; this.dashable = false; }
  update(dt) { this.t += dt; if (this.dying) return this.dyingUpdate(dt); this.walk(dt, 42); }
  draw(ctx) {
    this.begin(ctx); const d = this.dir, b = Math.abs(Math.sin(this.t * 7)) * 2;
    ctx.fillStyle = '#ffb347'; ell(ctx, -8 + Math.sin(this.t * 7) * 3, -2, 6, 3.5); ctx.fill(); ell(ctx, 8 - Math.sin(this.t * 7) * 3, -2, 6, 3.5); ctx.fill();
    ctx.translate(0, -b);
    ctx.fillStyle = '#e9edf7';
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) / 7 * Math.PI; const cx = Math.cos(a) * 15, cy = -17 + Math.sin(a) * 14; ctx.beginPath(); ctx.moveTo(cx - Math.sin(a) * 5, cy + Math.cos(a) * 5); ctx.lineTo(Math.cos(a) * 28, -17 + Math.sin(a) * 27); ctx.lineTo(cx + Math.sin(a) * 5, cy - Math.cos(a) * 5); ctx.fill(); }
    const g = ctx.createRadialGradient(-5, -22, 2, 0, -17, 18); g.addColorStop(0, '#8a5fd8'); g.addColorStop(1, '#3a1f7a');
    ctx.fillStyle = g; ell(ctx, 0, -17, 17, 15); ctx.fill();
    ctx.fillStyle = '#ffe45a'; ell(ctx, -5 + d * 4, -17, 4, 4.5); ctx.fill(); ell(ctx, 6 + d * 4, -17, 4, 4.5); ctx.fill();
    ctx.fillStyle = '#1a1030'; ell(ctx, -4.5 + d * 5, -16.5, 1.6, 3); ctx.fill(); ell(ctx, 6.5 + d * 5, -16.5, 1.6, 3); ctx.fill();
    ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-11 + d * 4, -24); ctx.lineTo(-2 + d * 4, -20.5); ctx.moveTo(12 + d * 4, -24); ctx.lineTo(3 + d * 4, -20.5); ctx.stroke();
    ctx.restore();
  }
}
class Bat extends Enemy {
  constructor(x, y) { super(x + 8, y + 10, 32, 26); this.ox = this.x; this.oy = this.y; this.ph = hash(x, y) * TAU; }
  update(dt) {
    this.t += dt; if (this.dying) return this.dyingUpdate(dt);
    const nx = this.ox + Math.sin(this.t * 0.9 + this.ph) * 110; this.dir = nx > this.x ? 1 : -1; this.x = nx; this.y = this.oy + Math.sin(this.t * 2.7 + this.ph) * 34;
  }
  draw(ctx) {
    this.begin(ctx); ctx.translate(0, -13); const f = Math.sin(this.t * 16), d = this.dir;
    ctx.fillStyle = '#5a2f8f';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 8, -2); ctx.quadraticCurveTo(s * 20, -16 - f * 10, s * 30, -4 - f * 12); ctx.quadraticCurveTo(s * 24, 0 - f * 5, s * 22, 6 - f * 6); ctx.quadraticCurveTo(s * 16, 0, s * 12, 7); ctx.quadraticCurveTo(s * 10, 2, s * 6, 5); ctx.fill(); }
    ctx.fillStyle = '#7a45b8'; ell(ctx, 0, 0, 12, 11.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-9, -17); ctx.lineTo(-3, -10); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(9, -17); ctx.lineTo(3, -10); ctx.fill();
    ctx.fillStyle = '#ffffff'; ell(ctx, -4 + d * 2, -2, 3.4, 4); ctx.fill(); ell(ctx, 5 + d * 2, -2, 3.4, 4); ctx.fill();
    ctx.fillStyle = '#c8203a'; ell(ctx, -3.5 + d * 3, -1.6, 1.6, 2.2); ctx.fill(); ell(ctx, 5.5 + d * 3, -1.6, 1.6, 2.2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-3 + d * 2, 5); ctx.lineTo(-1.5 + d * 2, 9); ctx.lineTo(0 + d * 2, 5); ctx.moveTo(2 + d * 2, 5); ctx.lineTo(3.5 + d * 2, 9); ctx.lineTo(5 + d * 2, 5); ctx.fill();
    ctx.restore();
  }
}
class Frog extends Enemy {
  constructor(x, y) { super(x + 6, y + 18, 36, 30); this.wait = rand(0.4, 1.2); this.sq = 1; }
  update(dt) {
    this.t += dt; if (this.dying) return this.dyingUpdate(dt);
    const p = Game.player; this.vy = Math.min(this.vy + 1800 * dt, 800);
    const was = this.onGround; moveEnt(this, this.vx * dt, this.vy * dt);
    if (this.hitL || this.hitR) this.vx *= -0.6;
    if (this.onGround) {
      if (!was && this.vy > 200) { this.sq = 0.6; FX.dust(this.cx, this.y + this.h, 3); }
      this.vy = 0; this.vx = 0; this.wait -= dt; if (Math.abs(p.cx - this.cx) > 60) this.dir = p.cx < this.cx ? -1 : 1;
      if (this.wait <= 0 && Math.abs(p.cx - this.cx) < 520) { this.vx = this.dir * rand(150, 230); this.vy = -rand(560, 700); this.wait = rand(0.8, 1.5); this.sq = 1.35; this.onGround = false; }
    }
    this.sq = lerp(this.sq, 1, 0.15);
    if (this.y > World.h * TILE + 100) this.dead = true;
  }
  draw(ctx) {
    this.begin(ctx); ctx.scale(this.dir * (2 - this.sq), this.sq);
    const prep = this.onGround && this.wait < 0.25 ? 0.85 : 1; ctx.scale(1 / prep, prep);
    ctx.fillStyle = '#2f9a4a'; ell(ctx, -12, -4, 9, 5); ctx.fill(); ell(ctx, 10, -3, 6, 4); ctx.fill();
    const g = ctx.createLinearGradient(0, -30, 0, 0); g.addColorStop(0, '#9af07a'); g.addColorStop(1, '#3db04e'); ctx.fillStyle = g; ell(ctx, 0, -13, 18, 13); ctx.fill();
    ctx.fillStyle = '#eaffd0'; ell(ctx, 3, -8, 11, 6.5); ctx.fill();
    ctx.fillStyle = '#6fe06a'; ell(ctx, 2, -26, 6.5, 6.5); ctx.fill(); ell(ctx, 13, -24, 6, 6); ctx.fill();
    ctx.fillStyle = '#ffffff'; ell(ctx, 3, -26.5, 4.5, 4.8); ctx.fill(); ell(ctx, 14, -24.5, 4.2, 4.5); ctx.fill();
    ctx.fillStyle = '#1a1030'; ell(ctx, 4.5, -26.5, 2, 2.8); ctx.fill(); ell(ctx, 15.2, -24.5, 1.9, 2.6); ctx.fill();
    ctx.strokeStyle = '#1f6a30'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(4, -11); ctx.quadraticCurveTo(11, -8, 17, -12); ctx.stroke();
    ctx.restore();
  }
}
class Bullet extends Enemy {
  constructor(cx, cy, dir) { super(cx - 17, cy - 13, 34, 26); this.dir = dir; this.vx = dir * 230; this.life = 7; this.always = true; }
  update(dt) {
    this.t += dt; if (this.dying) return this.dyingUpdate(dt);
    this.x += this.vx * dt; this.life -= dt;
    if (Math.random() < 0.4) FX.add({ type: 'smoke', x: this.cx - this.dir * 18, y: this.cy + rand(-4, 4), vx: -this.dir * 20, vy: rand(-20, 10), life: 0.4, size: 5, grow: 1, color: '#cfcfdc', alpha: 0.6 });
    if (World.solid(Math.floor((this.cx + this.dir * 14) / TILE), Math.floor(this.cy / TILE)) || this.life <= 0) { this.dead = true; FX.boom(this.cx, this.cy, 0.45); }
  }
  draw(ctx) {
    this.begin(ctx); ctx.translate(0, -13); ctx.scale(this.dir, 1);
    const g = ctx.createLinearGradient(0, -13, 0, 13); g.addColorStop(0, '#5a5f78'); g.addColorStop(0.4, '#23263a'); g.addColorStop(1, '#0c0d18');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-17, -12); ctx.lineTo(4, -12); ctx.quadraticCurveTo(19, -11, 19, 0); ctx.quadraticCurveTo(19, 11, 4, 12); ctx.lineTo(-17, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a8fa8'; ctx.fillRect(-17, -12, 5, 24);
    ctx.fillStyle = '#ffffff'; ell(ctx, 7, -3, 4.5, 5); ctx.fill(); ctx.fillStyle = '#c8203a'; ell(ctx, 8.5, -2.5, 2, 2.8); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(12, -6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ell(ctx, -2, -8, 9, 2); ctx.fill();
    ctx.restore();
    if (!this.dying) glow(ctx, this.cx - this.dir * 20, this.cy, 14, '#ff9a3c', 0.8);
  }
}
class Turret extends Ent {
  constructor(x, y) { super(x, y, 48, 48); this.cdT = 1.4; this.dir = -1; this.recoil = 0; }
  update(dt) {
    this.t += dt; this.recoil = Math.max(0, this.recoil - dt * 3); const p = Game.player, dx = p.cx - this.cx;
    if (Math.abs(dx) > 30) this.dir = dx < 0 ? -1 : 1; this.cdT -= dt;
    if (this.cdT <= 0 && p.state === 'play' && Math.abs(dx) > 90 && Math.abs(dx) < 720 && Math.abs(p.cy - this.cy) < 330) {
      this.cdT = 2.6; this.recoil = 1; World.ents.push(new Bullet(this.cx + this.dir * 30, this.cy, this.dir)); Snd.play('shot'); FX.poof(this.cx + this.dir * 36, this.cy, 6, '#e0e0ea');
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.cx, this.cy); ctx.scale(this.dir, 1); const r = this.recoil * 6, warn = this.cdT < 0.5 && this.cdT > 0;
    const g = ctx.createLinearGradient(0, -14, 0, 14); g.addColorStop(0, '#6a708c'); g.addColorStop(0.5, '#2c2f45'); g.addColorStop(1, '#14151f');
    ctx.fillStyle = g; rrect(ctx, 6 - r, -14, 24, 28, 4); ctx.fill();
    ctx.fillStyle = '#8a90ac'; rrect(ctx, 24 - r, -17, 8, 34, 3); ctx.fill();
    ctx.fillStyle = warn ? '#ff5a3a' : '#0a0a12'; ell(ctx, 31 - r, 0, 2.5, 10); ctx.fill();
    ctx.restore();
    if (warn) glow(ctx, this.cx + this.dir * 30, this.cy, 22, '#ff5a3a', 0.8);
  }
}
class Crusher extends Ent {
  constructor(x, y) { super(x - 20, y, 88, 84); this.oy = y; this.state = 0; this.timer = 0; this.solid = true; this.dx = 0; this.dy = 0; this.always = true; World.plats.push(this); }
  update(dt) {
    this.t += dt; const p = Game.player, py = this.y;
    if (this.state === 0) { if (p.state === 'play' && p.cx > this.x - 34 && p.cx < this.x + this.w + 34 && p.y > this.y + 20 && p.y - this.y < TILE * 8) { this.state = 1; this.timer = 0.3; } }
    else if (this.state === 1) { this.timer -= dt; if (this.timer <= 0) { this.state = 2; this.vy = 200; } }
    else if (this.state === 2) {
      this.vy = Math.min(this.vy + 3400 * dt, 1300); this.y += this.vy * dt;
      const ty = Math.floor((this.y + this.h) / TILE), c1 = World.get(Math.floor((this.x + 10) / TILE), ty), c2 = World.get(Math.floor((this.x + this.w - 10) / TILE), ty);
      if (World.isSolid(c1) || World.isSolid(c2) || c1 === 'L' || c2 === 'L' || ty >= World.h) {
        this.y = ty * TILE - this.h; this.state = 3; this.timer = 0.9;
        if (Math.abs(this.cx - Game.cam.x - VW / 2) < VW) { Game.shake(9, 0.25); Snd.play('crush'); }
        FX.dust(this.x + 10, this.y + this.h, 6, -1, 2); FX.dust(this.x + this.w - 10, this.y + this.h, 6, 1, 2);
      }
    }
    else if (this.state === 3) { this.timer -= dt; if (this.timer <= 0) this.state = 4; }
    else { this.y -= 110 * dt; if (this.y <= this.oy) { this.y = this.oy; this.state = 0; } }
    this.dy = this.y - py;
  }
  touch(p) { if (p.y + p.h <= this.y + 18) return; p.hurt(this.cx); }
  draw(ctx) {
    const sh = this.state === 1 ? rand(-2.5, 2.5) : 0, x = this.x + sh, y = this.y, w = this.w, h = this.h;
    ctx.strokeStyle = '#3a3d55'; ctx.lineWidth = 5; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(this.cx, this.oy - 6); ctx.lineTo(this.cx, y + 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c9cede'; for (let i = 0; i < 5; i++) { const sx = x + 8 + i * 16; ctx.beginPath(); ctx.moveTo(sx - 7, y + h - 12); ctx.lineTo(sx, y + h + 2); ctx.lineTo(sx + 7, y + h - 12); ctx.fill(); }
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#9aa3c4'); g.addColorStop(1, '#4a5073'); ctx.fillStyle = g; rrect(ctx, x, y, w, h - 10, 10); ctx.fill();
    ctx.strokeStyle = '#2a2d45'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; rrect(ctx, x + 6, y + 5, w - 12, 9, 4); ctx.fill();
    const angry = this.state === 1 || this.state === 2, ey = y + 34;
    ctx.fillStyle = angry ? '#ff4d3a' : '#1a1030';
    ctx.beginPath(); ctx.moveTo(x + 16, ey - 8); ctx.lineTo(x + 38, ey); ctx.lineTo(x + 18, ey + 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w - 16, ey - 8); ctx.lineTo(x + w - 38, ey); ctx.lineTo(x + w - 18, ey + 6); ctx.fill();
    ctx.fillStyle = '#1a1030'; rrect(ctx, x + 24, y + 50, w - 48, 9, 3); ctx.fill();
    ctx.fillStyle = '#e9edf7'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 27 + i * 9, y + 50, 6, 5);
    if (angry) glow(ctx, this.cx, ey, 40, '#ff4d3a', 0.5);
    R.light(this.cx, this.cy, 120, angry ? 0.9 : 0.55);
  }
}
class Firebar extends Ent {
  constructor(x, y) { super(x + 24 - 106, y + 24 - 106, 212, 212); this.px = x + 24; this.py = y + 24; this.n = 4; this.ang = hash(x, y) * TAU; this.sp = (hash(y, x) > 0.5 ? 1 : -1) * 1.7; }
  update(dt) { this.t += dt; this.ang += this.sp * dt; }
  ball(i) { const d = 26 + i * 22; return { x: this.px + Math.cos(this.ang) * d, y: this.py + Math.sin(this.ang) * d }; }
  touch(p) { for (let i = 0; i < this.n; i++) { const b = this.ball(i), nx = clamp(b.x, p.x, p.x + p.w), ny = clamp(b.y, p.y, p.y + p.h); if ((b.x - nx) ** 2 + (b.y - ny) ** 2 < 80) { p.hurt(b.x); return; } } }
  draw(ctx) {
    for (let i = 0; i < this.n; i++) {
      const b = this.ball(i), r = 11 + Math.sin(this.t * 14 + i) * 1.5;
      glow(ctx, b.x, b.y, 30, '#ff7a1a', 0.8);
      ctx.fillStyle = '#ff7a1a'; ell(ctx, b.x, b.y, r, r); ctx.fill(); ctx.fillStyle = '#ffd23c'; ell(ctx, b.x, b.y, r * 0.68, r * 0.68); ctx.fill(); ctx.fillStyle = '#fffbe0'; ell(ctx, b.x, b.y, r * 0.35, r * 0.35); ctx.fill();
      R.light(b.x, b.y, 80);
      if (Math.random() < 0.15) FX.fire(b.x, b.y, 1, 0.5);
    }
  }
}
class LavaBlob extends Ent {
  constructor(x, y) { super(x + 8, y + 22, 32, 32); this.base = y + 22; this.wait = 0.6 + hash(x, y) * 1.6; this.active = false; }
  update(dt) {
    this.t += dt;
    if (!this.active) { this.wait -= dt; if (this.wait <= 0) { this.active = true; this.vy = -980; FX.fire(this.cx, this.base, 8, 2); } }
    else {
      this.vy += 2000 * dt; this.y += this.vy * dt; if (Math.random() < 0.5) FX.fire(this.cx, this.cy, 1, 0.6);
      if (this.y >= this.base && this.vy > 0) { this.y = this.base; this.active = false; this.wait = 1.5; FX.fire(this.cx, this.base, 8, 2); }
    }
  }
  touch(p) { if (this.active) p.hurt(this.cx); }
  draw(ctx) {
    if (!this.active) return; const x = this.cx, y = this.cy, up = this.vy < 0;
    glow(ctx, x, y, 44, '#ff7a1a', 0.9); R.light(x, y, 110);
    ctx.save(); ctx.translate(x, y); if (!up) ctx.scale(1, -1);
    ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.bezierCurveTo(-15, -20, 15, -20, 15, 0); ctx.quadraticCurveTo(10, 16, 6, 26); ctx.quadraticCurveTo(2, 14, 0, 30); ctx.quadraticCurveTo(-3, 14, -7, 24); ctx.quadraticCurveTo(-10, 14, -15, 0); ctx.fill();
    ctx.fillStyle = '#ffc93c'; ell(ctx, 0, -1, 10.5, 11); ctx.fill();
    ctx.fillStyle = '#1a1030'; ell(ctx, -4, -3, 2, 3.2); ctx.fill(); ell(ctx, 4, -3, 2, 3.2); ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- リフト・足場
class MovePlat extends Ent {
  constructor(x, y, kind) { super(x, y, TILE * 3, 18); this.ox = x; this.oy = y; this.kind = kind; this.solid = true; this.dx = 0; this.dy = 0; this.always = true; this.t = 0; World.plats.push(this); }
  update(dt) {
    this.t += dt; const k = (1 - Math.cos(this.t * 1.25)) / 2; let nx = this.ox, ny = this.oy;
    if (this.kind === 'm') nx = this.ox + k * 4 * TILE; else ny = this.oy - k * 4 * TILE;
    this.dx = nx - this.x; this.dy = ny - this.y; this.x = nx; this.y = ny;
  }
  draw(ctx) { drawPlatform(ctx, this.x, this.y, this.w, this.t); R.light(this.cx, this.y + 8, 130, 0.75); }
}
function drawPlatform(ctx, x, y, w, t) {
  const th = World.theme;
  if (th === 'sky') {
    ctx.fillStyle = 'rgba(255,170,150,.9)'; for (let i = 0; i < 5; i++) { ell(ctx, x + 14 + i * (w - 28) / 4, y + 14, 20, 11); ctx.fill(); }
    ctx.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { ell(ctx, x + 14 + i * (w - 28) / 4, y + 9 + Math.sin(t * 2 + i) * 1.2, 20, 11); ctx.fill(); }
    return;
  }
  const c = { grass: ['#e0a05a', '#a8662e', '#6b3b16'], cave: ['#8f96d8', '#555b9c', '#2c2f66'], castle: ['#8a90ac', '#4a4f6a', '#23263a'] }[th];
  const g = ctx.createLinearGradient(0, y, 0, y + 18); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = c[2]; rrect(ctx, x, y + 3, w, 17, 6); ctx.fill();
  ctx.fillStyle = g; rrect(ctx, x, y, w, 16, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)'; rrect(ctx, x + 4, y + 2, w - 8, 3.5, 2); ctx.fill();
  ctx.fillStyle = c[2]; ell(ctx, x + 10, y + 9, 2.5, 2.5); ctx.fill(); ell(ctx, x + w - 10, y + 9, 2.5, 2.5); ctx.fill();
  if (th === 'cave') glow(ctx, x + w / 2, y + 8, 22, '#6de0ff', 0.5 + Math.sin(t * 3) * 0.2);
}
class Crumble extends Ent {
  constructor(x, y) { super(x, y, TILE, 16); this.oy = y; this.solid = true; this.state = 0; this.timer = 0; this.dx = 0; this.dy = 0; this.always = true; World.plats.push(this); }
  stood() { if (this.state === 0) { this.state = 1; this.timer = 0.45; Snd.play('crumble'); } }
  update(dt) {
    this.t += dt;
    if (this.state === 1) { this.timer -= dt; if (Math.random() < 0.4) FX.dust(this.x + rand(this.w), this.y + 14, 1, 0, 0.4); if (this.timer <= 0) { this.state = 2; this.solid = false; this.timer = 2.8; this.vy = 0; const pal = TILE_PAL[World.theme]; FX.debris(this.cx, this.y + 8, pal.stone, pal.stoneD, 5); } }
    else if (this.state === 2) { this.timer -= dt; this.vy += 1500 * dt; this.y += this.vy * dt; if (this.timer <= 0) { this.state = 0; this.solid = true; this.y = this.oy; FX.poof(this.cx, this.y + 8, 6); } }
  }
  draw(ctx) {
    if (this.state === 2 && this.timer < 2.3) return;
    const pal = TILE_PAL[World.theme], sx = this.state === 1 ? rand(-1.8, 1.8) : 0, x = this.x + sx, y = this.y;
    ctx.fillStyle = pal.stoneD; rrect(ctx, x + 1, y + 3, this.w - 2, 15, 5); ctx.fill();
    ctx.fillStyle = pal.stone; rrect(ctx, x + 1, y, this.w - 2, 14, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; rrect(ctx, x + 5, y + 2, this.w - 10, 3, 1.5); ctx.fill();
    ctx.strokeStyle = pal.stoneD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 14, y + 1); ctx.lineTo(x + 19, y + 7); ctx.lineTo(x + 15, y + 13); ctx.moveTo(x + 32, y + 1); ctx.lineTo(x + 29, y + 8); ctx.lineTo(x + 35, y + 13); ctx.stroke();
  }
}

// ---------------------------------------------------------------- アイテム・仕掛け
class Coin extends Ent {
  constructor(x, y) { super(x + 10, y + 10, 28, 28); this.isCoin = true; this.ph = hash(x, y) * TAU; }
  touch(p) { this.collect(); }
  collect() { if (this.dead) return; this.dead = true; Game.addCoin(); FX.sparkle(this.cx, this.cy, 5, '#fff3a8'); FX.ring(this.cx, this.cy, '#ffe27a', 4, 24, 0.25, 3); }
  draw(ctx) {
    const t = Game.t * 4.5 + this.ph, w = Math.abs(Math.cos(t)) * 11 + 1.5, y = this.cy + Math.sin(Game.t * 3 + this.ph) * 2.5, x = this.cx;
    ctx.fillStyle = '#c98a10'; ell(ctx, x, y + 1.5, w, 13); ctx.fill();
    ctx.fillStyle = '#ffd23c'; ell(ctx, x, y, w, 13); ctx.fill();
    ctx.fillStyle = '#fff3a8'; ell(ctx, x - w * 0.15, y - 1, w * 0.62, 9); ctx.fill();
    ctx.fillStyle = '#ffc21a'; ell(ctx, x, y, w * 0.32, 6); ctx.fill();
    if (Math.sin(t * 0.5 + this.ph) > 0.96) glow(ctx, x - 4, y - 6, 12, '#ffffff', 0.9);
    R.light(x, y, 44);
  }
}
class BigStar extends Ent {
  constructor(x, y) { super(x + 2, y + 2, 44, 44); this.idx = 0; }
  touch(p) {
    if (this.dead) return; this.dead = true; const had = Game.stars[World.idx][this.idx]; Game.stars[World.idx][this.idx] = true; Game.save();
    Game.addScore(had ? 200 : 1000); FX.text(this.cx, this.y - 10, had ? 200 : 1000, '#ffe45a', 22); Snd.play('star'); Game.hitstop(0.07); Game.flash('#fff6a8', 0.25, 0.3); Game.starPop = 1;
    FX.ring(this.cx, this.cy, '#fff6a8', 10, 110, 0.5, 8); FX.sparkle(this.cx, this.cy, 18, '#fff6a8', 1.6);
  }
  draw(ctx) {
    const had = Game.stars[World.idx][this.idx], x = this.cx, y = this.cy + Math.sin(Game.t * 2.4 + this.idx) * 4, rot = Math.sin(Game.t * 1.8) * 0.25 - Math.PI / 2;
    ctx.globalAlpha = had ? 0.4 : 1;
    glow(ctx, x, y, 52, had ? '#8fd0ff' : '#ffe27a', 0.7);
    for (let i = 0; i < 4; i++) { const a = Game.t * 1.5 + i * TAU / 4; ctx.fillStyle = '#ffffff'; starPath(ctx, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 4, 1.6, 4, a); ctx.fill(); }
    ctx.fillStyle = had ? '#4a8fd8' : '#e09a10'; starPath(ctx, x, y + 2, 23, 11.5, 5, rot); ctx.fill();
    const g = ctx.createLinearGradient(0, y - 22, 0, y + 22); g.addColorStop(0, had ? '#d8f0ff' : '#fff6a8'); g.addColorStop(1, had ? '#6fb5f0' : '#ffc21a');
    ctx.fillStyle = g; starPath(ctx, x, y, 22, 11, 5, rot); ctx.fill();
    ctx.fillStyle = '#5a3a08'; ell(ctx, x - 4.5, y + 1, 1.8, 3.2); ctx.fill(); ell(ctx, x + 4.5, y + 1, 1.8, 3.2); ctx.fill();
    ctx.globalAlpha = 1; R.light(x, y, 120);
  }
}
function heartPath(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.8, y - s * 1.2, x, y - s * 0.4); ctx.bezierCurveTo(x + s * 0.8, y - s * 1.2, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); ctx.closePath(); }
class HeartItem extends Ent {
  constructor(x, y) { super(x + 8, y + 10, 32, 30); }
  touch(p) { if (this.dead) return; this.dead = true; if (p.hp < p.maxHp) p.heal(1); else Game.addScore(500); Snd.play('heart'); FX.sparkle(this.cx, this.cy, 10, '#ff9ab0'); FX.ring(this.cx, this.cy, '#ff7a9a', 6, 50, 0.35, 5); }
  draw(ctx) {
    const s = 13 * (1 + Math.max(0, Math.sin(Game.t * 6)) * 0.12), x = this.cx, y = this.cy + Math.sin(Game.t * 3) * 3;
    glow(ctx, x, y, 34, '#ff6a8a', 0.6); ctx.fillStyle = '#b01a3a'; heartPath(ctx, x, y + 2, s); ctx.fill(); ctx.fillStyle = '#ff4d6e'; heartPath(ctx, x, y, s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ell(ctx, x - s * 0.45, y - s * 0.35, s * 0.25, s * 0.16, -0.6); ctx.fill(); R.light(x, y, 70);
  }
}
class PowerItem extends Ent {
  constructor(x, y, kind) { super(x + 8, y + 8, 32, 36); this.kind = kind; this.rise = 0; this.by = y; this.t = 0; }
  update(dt) { this.t += dt; if (this.rise < 1) { this.rise = Math.min(1, this.rise + dt * 2.2); this.y = this.by + 8 - easeOut(this.rise) * TILE; } }
  touch(p) {
    if (this.dead || this.rise < 0.6) return; this.dead = true;
    if (this.kind === 'heart') { p.heal(1); Snd.play('heart'); FX.sparkle(this.cx, this.cy, 10, '#ff9ab0'); }
    else { p.fire = true; p.heal(1); Snd.play('power'); Game.flash('#ffd76a', 0.25, 0.3); Game.hitstop(0.08); FX.ring(p.cx, p.cy, '#ffd76a', 10, 90, 0.5, 8); FX.sparkle(p.cx, p.cy, 16, '#ffd76a', 1.5); FX.text(p.cx, p.y - 20, TouchUI.on ? 'スターパワー！  ★ボタンでショット' : 'スターパワー！  C でショット', '#ffe45a', 15); }
    Game.addScore(500);
  }
  draw(ctx) {
    const x = this.cx, y = this.cy + (this.rise >= 1 ? Math.sin(this.t * 3) * 2 : 0);
    if (this.kind === 'heart') { glow(ctx, x, y, 30, '#ff6a8a', 0.6); ctx.fillStyle = '#ff4d6e'; heartPath(ctx, x, y, 13); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ell(ctx, x - 6, y - 5, 3.2, 2, -0.6); ctx.fill(); R.light(x, y, 70); return; }
    glow(ctx, x, y - 4, 36, '#ffb347', 0.7);
    ctx.strokeStyle = '#3db04e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, y + 2); ctx.stroke();
    ctx.fillStyle = '#4cc25a'; ell(ctx, x - 7, y + 12, 7, 3.5, 0.5); ctx.fill(); ell(ctx, x + 7, y + 12, 7, 3.5, -0.5); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = this.t * 1.2 + i * TAU / 5; ctx.fillStyle = i % 2 ? '#ff7a3c' : '#ffb347'; ell(ctx, x + Math.cos(a) * 10, y - 5 + Math.sin(a) * 10, 7, 7); ctx.fill(); }
    ctx.fillStyle = '#fff6a8'; ell(ctx, x, y - 5, 8, 8); ctx.fill(); ctx.fillStyle = '#5a3a08'; ell(ctx, x - 2.8, y - 6, 1.2, 2.2); ctx.fill(); ell(ctx, x + 2.8, y - 6, 1.2, 2.2); ctx.fill(); R.light(x, y, 80);
  }
}
class Shot extends Ent {
  constructor(cx, cy, dir) { super(cx - 9, cy - 9, 18, 18); this.vx = dir * 540; this.vy = 100; this.life = 1.6; this.bounces = 0; this.always = true; World.shots++; }
  update(dt) {
    this.t += dt; this.life -= dt; this.vy = Math.min(this.vy + 1700 * dt, 700); moveEnt(this, this.vx * dt, this.vy * dt);
    if (this.onGround) { this.vy = -420; this.bounces++; FX.sparkle(this.cx, this.y + this.h, 2, '#ffe27a', 0.5); }
    if (this.hitL || this.hitR || this.hitCeil || this.life <= 0 || this.bounces > 4 || Math.abs(this.cx - Game.cam.x - VW / 2) > VW) return this.pop();
    if (Math.random() < 0.6) FX.add({ type: 'star', x: this.cx, y: this.cy, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, size: rand(2, 4), color: '#ffd76a', add: true, vr: 6 });
    for (const e of World.ents) {
      if (e.dead || !e.enemy || e.dying || !overlap(this, e)) continue;
      if (e.shootable) { e.kill('flip', Math.sign(this.vx)); Game.addScore(100); FX.text(e.cx, e.y - 8, 100); Snd.play('kick'); } else Snd.play('clink');
      return this.pop();
    }
  }
  pop() { if (this.dead) return; this.dead = true; World.shots = Math.max(0, World.shots - 1); FX.sparkle(this.cx, this.cy, 6, '#ffe27a'); FX.ring(this.cx, this.cy, '#ffe27a', 3, 20, 0.2, 3); }
  draw(ctx) {
    glow(ctx, this.cx, this.cy, 26, '#ffc35a', 0.9);
    ctx.fillStyle = '#ffb21a'; starPath(ctx, this.cx, this.cy, 11, 5, 5, this.t * 14); ctx.fill(); ctx.fillStyle = '#fffbe0'; starPath(ctx, this.cx, this.cy, 6, 2.8, 5, this.t * 14); ctx.fill(); R.light(this.cx, this.cy, 90);
  }
}
class Crystal extends Ent {
  constructor(x, y) { super(x + 6, y + 4, 36, 40); this.cool = 0; }
  update(dt) { this.t += dt; if (this.cool > 0) { this.cool -= dt; if (this.cool <= 0) FX.sparkle(this.cx, this.cy, 6, '#9ff0ff'); } }
  touch(p) {
    if (this.cool > 0 || p.state !== 'play' || (p.canDash && p.jumps > 0 && p.dashT <= 0)) return;
    this.cool = 2.2; p.canDash = true; p.dashRefill = true; p.jumps = 1; Snd.play('crystal'); Game.hitstop(0.04);
    FX.ring(this.cx, this.cy, '#9ff0ff', 8, 70, 0.4, 6); FX.sparkle(this.cx, this.cy, 12, '#9ff0ff', 1.4);
  }
  draw(ctx) {
    const x = this.cx, y = this.cy + Math.sin(this.t * 2.5) * 4, on = this.cool <= 0;
    ctx.save(); ctx.translate(x, y);
    if (on) { glow(ctx, 0, 0, 44, '#5ae0ff', 0.7 + Math.sin(this.t * 5) * 0.15); R.light(x, y, 100); }
    const pts = [[0, -19], [13, -3], [0, 19], [-13, -3]];
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    if (!on) { ctx.strokeStyle = 'rgba(160,230,255,.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); return; }
    const g = ctx.createLinearGradient(-13, -19, 13, 19); g.addColorStop(0, '#e8fcff'); g.addColorStop(0.5, '#5ad8ff'); g.addColorStop(1, '#2a7be0'); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(-13, -3); ctx.lineTo(-3, -5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(20,60,160,.3)'; ctx.beginPath(); ctx.moveTo(0, 19); ctx.lineTo(13, -3); ctx.lineTo(3, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
class Spring extends Ent {
  constructor(x, y) { super(x + 4, y + 20, 40, 28); this.b = 0; }
  update(dt) { this.t += dt; this.b = Math.max(0, this.b - dt * 3); }
  touch(p) {
    if (p.state !== 'play' || p.vy < 0 || p.dashT > 0 || p.y + p.h < this.y + 4) return;
    const big = p.pound === 2; p.vy = big ? -1480 : -1250; p.noCut = true; p.pound = 0; p.rot = 0; p.jumps = 1; p.canDash = true; p.y = this.y - p.h + 4; p.onGround = false; p.coyote = 0; p.launched = false;
    p.sx = 0.7; p.sy = 1.35; this.b = 1; Snd.play('spring'); FX.ring(this.cx, this.y, '#ffffff', 8, 50, 0.3, 5); FX.dust(this.cx, this.y + this.h, 4);
    if (big) { FX.sparkle(this.cx, this.y, 10); Game.shake(5, 0.15); }
  }
  draw(ctx) {
    const x = this.cx, by = this.y + this.h, k = this.b > 0 ? Math.sin(this.b * Math.PI * 3) * this.b : 0, top = this.y + 4 - k * 12;
    ctx.fillStyle = '#4a4f6a'; rrect(ctx, x - 19, by - 7, 38, 7, 3); ctx.fill();
    ctx.strokeStyle = '#c9cede'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
    const n = 4, hgt = by - 7 - (top + 8); for (let i = 0; i <= n; i++) { const yy = by - 7 - hgt * i / n; ctx.lineTo(x + (i % 2 ? 11 : -11), yy); } ctx.stroke();
    ctx.fillStyle = '#b01a3a'; rrect(ctx, x - 21, top + 3, 42, 8, 4); ctx.fill(); ctx.fillStyle = '#ff4d6e'; rrect(ctx, x - 21, top, 42, 8, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; rrect(ctx, x - 16, top + 1.5, 32, 2.5, 1.2); ctx.fill();
  }
}
class Checkpoint extends Ent {
  constructor(x, y) { super(x + 6, y - 48, 36, 96); this.on = false; this.pop = 0; this.id = x; }
  update(dt) { this.t += dt; this.pop = Math.max(0, this.pop - dt * 2); if (!this.on && Game.checkpoint && Game.checkpoint.id === this.id) this.on = true; }
  touch(p) {
    if (this.on || p.state !== 'play') return; this.on = true; this.pop = 1; Game.checkpoint = { id: this.id, x: this.x + 5, y: this.y + this.h - p.h };
    p.heal(1); Snd.play('check'); FX.ring(this.cx, this.y + 20, '#fff6a8', 10, 100, 0.5, 7); FX.sparkle(this.cx, this.y + 20, 14, '#fff6a8', 1.4); FX.text(this.cx, this.y - 8, 'CHECK POINT!', '#ffe45a', 18);
  }
  draw(ctx) {
    const x = this.cx, by = this.y + this.h, top = this.y + 6;
    ctx.fillStyle = '#6b3b16'; rrect(ctx, x - 4, top, 8, by - top, 3); ctx.fill(); ctx.fillStyle = '#a8662e'; rrect(ctx, x - 4, top, 4, by - top, 2); ctx.fill();
    ctx.fillStyle = '#4a4f6a'; rrect(ctx, x - 11, by - 7, 22, 7, 3); ctx.fill();
    const w = Math.sin(this.t * 5) * 3, s = 1 + this.pop * 0.5;
    ctx.save(); ctx.translate(x + 4, top + 16); ctx.scale(s, s);
    ctx.fillStyle = this.on ? '#ffc21a' : '#8a90ac'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(17, -15 + w, 34, -10 + w * 0.6); ctx.quadraticCurveTo(26, 0, 34, 10 - w * 0.6); ctx.quadraticCurveTo(17, 9 - w, 0, 13); ctx.closePath(); ctx.fill();
    if (this.on) { ctx.fillStyle = '#ffffff'; starPath(ctx, 14, 0, 8, 3.6, 5, -Math.PI / 2 + Math.sin(this.t * 3) * 0.2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = this.on ? '#fff6a8' : '#c9cede'; ell(ctx, x, top, 6, 6); ctx.fill();
    if (this.on) { glow(ctx, x, top, 34, '#ffe27a', 0.7); R.light(x, top + 10, 150); }
  }
}
class Goal extends Ent {
  constructor(x, y) { super(x - 14, y - 96, 76, 144); this.t = 0; }
  touch(p) { if (p.state === 'play') Game.stageClear(this); }
  draw(ctx) {
    const x = this.cx, by = this.y + this.h, cy = this.y + 62, t = this.t;
    R.light(x, cy, 260);
    for (const s of [-1, 1]) {
      const px = x + s * 44; const g = ctx.createLinearGradient(px - 9, 0, px + 9, 0); g.addColorStop(0, '#fff3d0'); g.addColorStop(1, '#c9a86a');
      ctx.fillStyle = g; rrect(ctx, px - 8, this.y + 16, 16, this.h - 16, 4); ctx.fill();
      ctx.fillStyle = '#ffc21a'; rrect(ctx, px - 11, this.y + 10, 22, 10, 4); ctx.fill(); rrect(ctx, px - 12, by - 9, 24, 9, 3); ctx.fill();
      ctx.fillStyle = '#ffffff'; starPath(ctx, px, this.y + 2, 9, 4, 5, t * 2 * s); ctx.fill();
    }
    glow(ctx, x, cy, 110, '#ffe27a', 0.55 + Math.sin(t * 3) * 0.15); glow(ctx, x, cy, 60, '#ffffff', 0.5);
    ctx.save(); ctx.translate(x, cy);
    ctx.strokeStyle = 'rgba(255,246,168,.8)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) { const a = t * 1.4 + i * TAU / 6; ctx.fillStyle = ['#ff7a9a', '#ffe27a', '#7ff0c0', '#7fc8ff', '#c89aff', '#ffb347'][i]; starPath(ctx, Math.cos(a) * 40, Math.sin(a) * 40, 6, 2.6, 5, a * 2); ctx.fill(); }
    const s = 1 + Math.sin(t * 4) * 0.08; ctx.scale(s, s); ctx.rotate(Math.sin(t * 2) * 0.15);
    ctx.fillStyle = '#e09a10'; starPath(ctx, 0, 2.5, 27, 13); ctx.fill();
    const g = ctx.createLinearGradient(0, -26, 0, 26); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#ffc21a'); ctx.fillStyle = g; starPath(ctx, 0, 0, 26, 12.5); ctx.fill();
    ctx.fillStyle = '#5a3a08'; ell(ctx, -5, 1, 2, 3.6); ctx.fill(); ell(ctx, 5, 1, 2, 3.6); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.3) FX.add({ type: 'star', x: x + rand(-36, 36), y: cy + rand(-36, 36), vy: -40, life: 0.6, size: rand(2, 5), color: '#fff6a8', add: true, vr: 4 });
  }
  update(dt) { this.t += dt; }
}
const CANNON_V = { x: 520, y: -1300 };
class Cannon extends Ent {
  constructor(x, y) { super(x, y, 48, 48); this.cd = 0; this.load = 0; this.kick = 0; this.always = true; this.ang = Math.atan2(CANNON_V.y, CANNON_V.x); }
  update(dt) {
    this.t += dt; this.cd -= dt; this.kick = Math.max(0, this.kick - dt * 4);
    if (this.load > 0) {
      const p = Game.player; p.x = this.cx - p.w / 2; p.y = this.cy - p.h / 2; p.vx = p.vy = 0; this.load -= dt;
      if (this.load <= 0 && p.state === 'cannon') {
        p.state = 'play'; p.vx = CANNON_V.x; p.vy = CANNON_V.y; p.launchT = 0.4; p.launched = true; p.noCut = true; p.jumps = 1; p.canDash = true; p.onGround = false; p.coyote = 0; p.face = 1; p.inv = Math.max(p.inv, 0.25);
        p.prevBottom = p.y + p.h; this.cd = 0.7; this.kick = 1; Snd.play('cannon'); Game.shake(8, 0.2);
        const mx = this.cx + Math.cos(this.ang) * 30, my = this.cy + Math.sin(this.ang) * 30; FX.boom(mx, my, 0.6); FX.poof(mx, my, 10);
      }
    }
  }
  touch(p) { if (this.cd > 0 || this.load > 0 || p.state !== 'play') return; p.state = 'cannon'; p.dashT = 0; p.pound = 0; p.rot = 0; p.riding = null; p.trail.length = 0; this.load = 0.5; Snd.play('cannonin'); FX.poof(this.cx, this.cy, 6); }
  draw(ctx) {
    ctx.save(); ctx.translate(this.cx, this.cy + Math.sin(this.t * 2) * 2);
    const wob = this.load > 0 ? Math.sin(this.load * 40) * 0.08 : 0; ctx.rotate(this.ang + Math.PI / 2 + wob);
    const k = 1 + this.kick * 0.25 - (this.load > 0 ? 0.08 : 0); ctx.scale(2 - k, k);
    const g = ctx.createLinearGradient(-24, 0, 24, 0); g.addColorStop(0, '#7a4418'); g.addColorStop(0.35, '#d8924a'); g.addColorStop(0.7, '#b56a2a'); g.addColorStop(1, '#6b3b16');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-19, -27); ctx.quadraticCurveTo(-27, 0, -19, 27); ctx.lineTo(19, 27); ctx.quadraticCurveTo(27, 0, 19, -27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a4f6a'; ctx.fillRect(-22, -20, 44, 6); ctx.fillRect(-22, 14, 44, 6); ctx.fillStyle = '#8a90ac'; ctx.fillRect(-22, -20, 44, 2); ctx.fillRect(-22, 14, 44, 2);
    ctx.fillStyle = '#1a1030'; ell(ctx, 0, -27, 17, 5); ctx.fill();
    ctx.fillStyle = '#fff6a8'; starPath(ctx, 0, 0, 9, 4, 5, -Math.PI / 2); ctx.fill();
    ctx.restore();
    // 進行方向のガイド
    ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 1; i <= 3; i++) { const tt = 0.07 * i + (this.t * 0.25 % 0.07); ell(ctx, this.cx + CANNON_V.x * tt, this.cy + CANNON_V.y * tt + 1150 * tt * tt, 3, 3); ctx.fill(); }
  }
}
class Updraft extends Ent {
  constructor(x, y) { const hgt = 11 * TILE; super(x - 12, y + TILE - hgt, TILE * 3, hgt); this.always = true; }
  update(dt) { this.t += dt; if (Math.random() < 0.3) FX.add({ type: 'leaf', x: this.x + rand(this.w), y: this.y + this.h, vy: -rand(260, 380), life: 1.6, size: rand(3, 5), color: pick(['#ffffff', '#ffd9ec', '#fff3a8']), vr: 6, alpha: 0.8 }); }
  touch(p) { if (p.state !== 'play' || p.pound) return; p.vy = approach(p.vy, -500, 100); p.inUpdraft = 0.1; p.noCut = true; if (Math.random() < 0.05) Snd.play('land'); }
  draw(ctx) {
    const g = ctx.createLinearGradient(this.x, 0, this.x + this.w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; const n = 8, bh = this.h / n;
    for (let i = 0; i < n; i++) { ctx.globalAlpha = (i + 1) / n; ctx.fillRect(this.x, this.y + i * bh, this.w, bh + 0.5); }
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const k = ((this.t * 0.55 + i * 0.37) % 1), yy = this.y + this.h - k * this.h, xx = this.x + 8 + hash(i, 5) * (this.w - 16) + Math.sin(k * 9 + i) * 6;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * Math.sin(k * Math.PI)})`; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.sin(k * 9 + i + 0.6) * 4, yy - 34); ctx.stroke();
    }
  }
}
class Torch extends Ent {
  constructor(x, y) { super(x + 12, y + 4, 24, 40); }
  draw(ctx) {
    const x = this.cx, y = this.cy, th = World.theme, f = Math.sin(this.t * 13) * 0.12 + Math.sin(this.t * 7.3) * 0.08;
    if (th === 'cave') {
      glow(ctx, x, y, 70 * (1 + f * 0.5), '#5ae0ff', 0.55); R.light(x, y, 210, 0.95);
      ctx.fillStyle = '#2c2f66'; rrect(ctx, x - 9, y + 12, 18, 8, 3); ctx.fill();
      const g = ctx.createLinearGradient(x - 8, y - 20, x + 8, y + 12); g.addColorStop(0, '#e8fcff'); g.addColorStop(1, '#2aa8e0'); ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 8, y - 6); ctx.lineTo(x + 6, y + 13); ctx.lineTo(x - 6, y + 13); ctx.lineTo(x - 8, y - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x - 8, y - 6); ctx.lineTo(x - 2, y - 6); ctx.closePath(); ctx.fill();
    } else {
      glow(ctx, x, y - 8, 78 * (1 + f), '#ff9a3c', 0.6); R.light(x, y - 6, 230 * (1 + f * 0.3), 0.95);
      ctx.fillStyle = '#3a2418'; rrect(ctx, x - 3, y, 6, 22, 2); ctx.fill(); ctx.fillStyle = '#6a708c'; rrect(ctx, x - 8, y - 3, 16, 7, 3); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x - 7, y - 3); ctx.quadraticCurveTo(x - 9, y - 16, x + f * 20, y - 28 - f * 30); ctx.quadraticCurveTo(x + 9, y - 16, x + 7, y - 3); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.quadraticCurveTo(x - 5, y - 11, x - f * 10, y - 18); ctx.quadraticCurveTo(x + 5, y - 11, x + 4, y - 3); ctx.fill();
      if (Math.random() < 0.08) FX.fire(x, y - 14, 1, 0.5);
    }
  }
}

const SPAWN = {
  e: (x, y) => new Puni(x, y), h: (x, y) => new Toge(x, y), b: (x, y) => new Bat(x, y), f: (x, y) => new Frog(x, y),
  T: (x, y) => new Turret(x, y), Z: (x, y) => new Crusher(x, y), R: (x, y) => new Firebar(x, y), o: (x, y) => new LavaBlob(x, y),
  m: (x, y) => new MovePlat(x, y, 'm'), v: (x, y) => new MovePlat(x, y, 'v'), n: (x, y) => new Crumble(x, y),
  c: (x, y) => new Coin(x, y), C: (x, y) => new BigStar(x, y), H: (x, y) => new HeartItem(x, y), D: (x, y) => new Crystal(x, y),
  S: (x, y) => new Spring(x, y), K: (x, y) => new Checkpoint(x, y), G: (x, y) => new Goal(x, y), Q: (x, y) => new Cannon(x, y),
  u: (x, y) => new Updraft(x, y), i: (x, y) => new Torch(x, y), Y: (x, y) => new Boss(x, y),
};
