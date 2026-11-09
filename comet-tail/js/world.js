'use strict';
// ===== ワールド（タイル・当たり判定・ブロック処理） =====
const World = {
  w: 0, h: 0, tiles: [], theme: 'grass', ents: [], plats: [], bumps: [], decor: [], switchRed: true, swCD: 0, shots: 0,
  load(idx) {
    const def = LEVELS[idx], d = buildLevel(def);
    this.def = def; this.idx = idx; this.w = d.w; this.h = d.h; this.tiles = d.tiles.slice(); this.theme = def.theme;
    this.ents = []; this.plats = []; this.bumps = []; this.switchRed = true; this.swCD = 0; this.shots = 0; this.boss = null; this.camLock = null;
    this.start = { x: 2 * TILE + 11, y: (d.h - 4) * TILE + 8 };
    const starList = [];
    for (const s of d.spawns) {
      const x = s.x * TILE, y = s.y * TILE;
      if (s.c === 'P') { this.start = { x: x + 11, y: y + 8 }; continue; }
      const f = SPAWN[s.c]; if (!f) { console.warn('未定義のスポーン', s.c); continue; }
      const e = f(x, y); if (s.c === 'C') starList.push(e);
      this.ents.push(e);
    }
    starList.sort((a, b) => a.x - b.x).forEach((e, i) => e.idx = i);  // 登場順に番号づけ
    this.starTotal = starList.length;
    this.genDecor();
  },
  get(tx, ty) { if (tx < 0 || tx >= this.w) return 'X'; if (ty < 0 || ty >= this.h) return '.'; return this.tiles[ty * this.w + tx]; },
  set(tx, ty, c) { if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) this.tiles[ty * this.w + tx] = c; },
  isSolid(c) {
    switch (c) {
      case '#': case 'X': case 'B': case '?': case 'M': case 'U': case '<': case '>': case '!': case 'T': case 'R': return true;
      case '1': return this.switchRed; case '2': return !this.switchRed;
    }
    return false;
  },
  solid(tx, ty) { return this.isSolid(this.get(tx, ty)); },
  addBump(tx, ty, dir = -1) { this.bumps.push({ tx, ty, t: 0, dir }); },
  bumpOff(tx, ty) { for (const b of this.bumps) if (b.tx === tx && b.ty === ty) return Math.sin(b.t / 0.2 * Math.PI) * 11 * b.dir; return 0; },
  update(dt) {
    this.swCD -= dt;
    for (let i = this.bumps.length - 1; i >= 0; i--) { this.bumps[i].t += dt; if (this.bumps[i].t > 0.2) this.bumps.splice(i, 1); }
  },
  // ブロックの上にいる敵やコインに影響
  hitAbove(tx, ty) {
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.x + e.w > tx * TILE && e.x < (tx + 1) * TILE && Math.abs(e.y + e.h - ty * TILE) < 8) {
        if (e.enemy && !e.dying) { e.kill('flip', 0); Game.addScore(100); FX.text(e.cx, e.y - 6, 100); }
        else if (e.isCoin) e.collect();
      }
    }
  },
  breakTile(tx, ty) {
    this.set(tx, ty, '.'); const pal = TILE_PAL[this.theme];
    FX.debris(tx * TILE + 24, ty * TILE + 24, pal.brick, pal.brickD, 9); Snd.play('brk'); Game.addScore(50);
  },
  toggleSwitch(tx, ty) {
    if (this.swCD > 0) return; this.swCD = 0.35; this.switchRed = !this.switchRed;
    Snd.play('sw'); const col = this.switchRed ? '#ff5a6e' : '#4aa8ff';
    FX.ring(tx * TILE + 24, ty * TILE + 24, col, 10, 150, 0.45, 8); Game.flash(col, 0.12, 0.25);
    // 新しく実体化したブロックに重なった敵は消える
    for (const e of this.ents) if (e.enemy && !e.dying && !e.dead && this.solid(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE))) e.kill('flip', 0);
  },
  bumpTile(tx, ty, from) {
    const c = this.get(tx, ty), cx = tx * TILE + 24, cy = ty * TILE + 24;
    if (c === 'B') { if (from === 'below') this.hitAbove(tx, ty); this.breakTile(tx, ty); return 'break'; }
    if (c === '?' || c === 'M') {
      this.set(tx, ty, 'U'); this.addBump(tx, ty, from === 'pound' ? 1 : -1); if (from !== 'pound') this.hitAbove(tx, ty);
      if (c === '?') { Game.addCoin(); FX.coinPop(cx, ty * TILE - 6); FX.sparkle(cx, ty * TILE - 20, 4); }
      else { const p = Game.player; this.ents.push(new PowerItem(tx * TILE, ty * TILE, p.fire ? 'heart' : 'flower')); Snd.play('check'); }
      Snd.play('bump'); return 'hit';
    }
    if (c === '!') { this.addBump(tx, ty, from === 'pound' ? 1 : -1); this.toggleSwitch(tx, ty); return 'hit'; }
    if (this.isSolid(c)) { if (from === 'below') { Snd.play('bump'); if (c === 'U') this.addBump(tx, ty, -0.4); } return 'solid'; }
    return null;
  },
  genDecor() {
    this.decor = []; const th = this.theme, W = this.w, H = this.h;
    const kinds = { grass: ['flower', 'flower', 'bush', 'tree', 'shroom', 'grass'], cave: ['crystal', 'gshroom', 'rock', 'crystal'], sky: ['flower', 'column', 'bush', 'grass'], castle: ['candle', 'bones', 'candle'] }[th];
    for (let x = 1; x < W - 1; x++) for (let y = 2; y < H; y++) {
      if (this.get(x, y) !== '#' || this.get(x, y - 1) !== '.') continue;
      const r = hash(x * 13 + this.idx * 101, y * 7 + 3);
      if (r > 0.42) continue;
      const k = kinds[Math.floor(hash(x + 31, y + this.idx * 17) * kinds.length)];
      if ((k === 'tree' || k === 'column') && (this.get(x, y - 2) !== '.' || this.get(x, y - 3) !== '.' || this.get(x, y - 4) !== '.')) continue;
      this.decor.push({ k, x: x * TILE + 24, y: y * TILE, v: hash(x * 3, y * 5 + 1) });
    }
  }
};

// 軸分離の移動＋タイル衝突。e: {x,y,w,h}  結果: onGround/hitL/hitR/hitCeil/groundC
function moveEnt(e, dx, dy) {
  const T = TILE, W = World;
  e.hitL = e.hitR = e.hitCeil = false;
  if (dx) {
    e.x += dx;
    const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
    if (dx > 0) { const tx = Math.floor((e.x + e.w - 0.01) / T); for (let ty = y0; ty <= y1; ty++) if (W.solid(tx, ty)) { e.x = tx * T - e.w; e.hitR = true; e.hitTX = tx; break; } }
    else { const tx = Math.floor(e.x / T); for (let ty = y0; ty <= y1; ty++) if (W.solid(tx, ty)) { e.x = (tx + 1) * T; e.hitL = true; e.hitTX = tx; break; } }
  }
  e.onGround = false;
  if (dy) {
    const pb = e.y + e.h; e.y += dy;
    const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T), cxT = Math.floor((e.x + e.w / 2) / T);
    if (dy > 0) {
      const ty = Math.floor((e.y + e.h - 0.01) / T); let gc = null;
      for (let tx = x0; tx <= x1; tx++) { const c = W.get(tx, ty); if (W.isSolid(c) || (c === '=' && pb <= ty * T + 0.5)) { if (gc === null || tx === cxT) gc = c; } }
      if (gc !== null) { e.y = ty * T - e.h; e.onGround = true; e.groundC = gc; }
    } else {
      const ty = Math.floor(e.y / T); let hit = false;
      for (let tx = x0; tx <= x1; tx++) if (W.solid(tx, ty)) hit = true;
      if (hit) {
        if (e.cornerFix && !W.solid(cxT, ty)) {  // 角にちょっと引っかかっただけなら横にずらす
          if (x0 < cxT && W.solid(x0, ty)) { const s = (x0 + 1) * T - e.x; if (s <= 14) { e.x += s; hit = false; } }
          else if (x1 > cxT && W.solid(x1, ty)) { const s = e.x + e.w - x1 * T; if (s <= 14) { e.x -= s; hit = false; } }
        }
        if (hit) { e.y = (ty + 1) * T; e.hitCeil = true; e.ceilTY = ty; e.ceilTX = W.solid(cxT, ty) ? cxT : (W.solid(x0, ty) ? x0 : x1); }
      }
    }
  }
}
