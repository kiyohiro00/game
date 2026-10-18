'use strict';
const $ = s => document.querySelector(s);
const K = (x, y) => x + ',' + y;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const G = {
  state: 'title', time: 0, W: 0, H: 0, dpr: 1, z: 1, zUser: null,
  cam: { x: 0, y: 0, tx: 0, ty: 0 }, cur: { x: 0, y: 0, sx: 0, sy: 0 },
  units: [], turn: 1, phase: 'player', chIdx: 0, ch: null, map: null, cols: 0, rows: 0, tb: null,
  sel: null, selOrig: null, reach: null, rangeView: null, path: [],
  danger: false, dangerView: null, pinned: new Set(), pinView: null, hoverView: null, enemyView: null,
  mover: null, menu: null, targets: null, tIdx: 0, tWeapon: null, mode: null,
  anims: true, mapTexts: [], particles: [], roster: null, rosterStart: null,
  visited: new Set(), uidSeq: 0, over: false, bake: {}, fade: 0, stats: { turns: [] },
};

// =============================== setup ===============================
function init() {
  G.cv = $('#cv'); G.ctx = G.cv.getContext('2d');
  resize(); addEventListener('resize', resize);
  setupInput();
  $('#btnStart').onclick = () => { Snd.init(); Snd.play('select'); startGame(); };
  $('#btnHelp').onclick = () => { Snd.init(); openModal('#help'); };
  $('#helpClose').onclick = () => closeModal();
  $('#stClose').onclick = () => closeModal();
  $('#tbEnd').onclick = () => { Snd.init(); if (G.state === 'idle') { Snd.play('menu'); endPlayerTurn(); } };
  $('#tbDanger').onclick = () => { Snd.init(); toggleDanger(); };
  $('#tbSound').onclick = () => { Snd.init(); toggleMute(); };
  $('#tbInfo').onclick = () => { Snd.init(); infoAtCursor(); };
  G.titleT = 0;
  requestAnimationFrame(loop);
}
function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = innerWidth; G.H = innerHeight;
  G.cv.width = Math.round(G.W * G.dpr); G.cv.height = Math.round(G.H * G.dpr);
  G.zBase = clamp(Math.min(G.W / (T * 16), G.H / (T * 10.5)), 0.6, 1.5);
  G.zFill = G.map ? Math.max(G.W / (G.cols * T), G.H / (G.rows * T)) : 0.45;
  G.z = Math.max(G.zFill, G.zUser ? clamp(G.zUser, 0.45, 2) : G.zBase);
  Spr.setCacheScale(G.z * G.dpr);
  G.titleBg = null;
  if (G.map) clampCam(true);
}

// =============================== helpers ===============================
const inMap = (x, y) => x >= 0 && y >= 0 && x < G.cols && y < G.rows;
const tileCh = (x, y) => inMap(x, y) ? G.map[y][x] : null;
const terr = (x, y) => TERRAIN[tileCh(x, y)] || TERRAIN['.'];
const unitAt = (x, y) => G.units.find(u => u.alive && u.x === x && u.y === y);
const mdist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const moveCost = (u, x, y) => terr(x, y).cost[CLASSES[u.cls].move];
const atkWeapons = u => u.weapons.filter(w => !WEAPONS[w].staff);
const staffOf = u => u.weapons.find(w => WEAPONS[w].staff);
const inRng = (w, d) => WEAPONS[w].rng[0] <= d && d <= WEAPONS[w].rng[1];
const alive = team => G.units.filter(u => u.alive && u.team === team);
function w2s(wx, wy) { return [(wx - G.cam.x) * G.z + G.W / 2, (wy - G.cam.y) * G.z + G.H / 2]; }
function s2w(sx, sy) { return [(sx - G.W / 2) / G.z + G.cam.x, (sy - G.H / 2) / G.z + G.cam.y]; }

function clampCam(snap) {
  const z = G.z, vw = G.W / z, vh = G.H / z, mw = G.cols * T, mh = G.rows * T;
  const pl = 0, pt = 0, pb = 0;
  G.cam.tx = mw + 2 * pl <= vw ? mw / 2 : clamp(G.cam.tx, vw / 2 - pl, mw - vw / 2 + pl);
  G.cam.ty = mh + pt + pb <= vh ? mh / 2 : clamp(G.cam.ty, vh / 2 - pt, mh - vh / 2 + pb);
  if (snap) { G.cam.x = G.cam.tx; G.cam.y = G.cam.ty; }
}
function focusTile(x, y, snap) { G.cam.tx = x * T + T / 2; G.cam.ty = y * T + T / 2; clampCam(snap); }
function keepVisible(x, y, m = 1.6) {
  const [sx, sy] = [(x * T + T / 2 - G.cam.tx) * G.z + G.W / 2, (y * T + T / 2 - G.cam.ty) * G.z + G.H / 2];
  const mg = T * G.z * m;
  if (sx < mg) G.cam.tx -= (mg - sx) / G.z; if (sx > G.W - mg) G.cam.tx += (sx - (G.W - mg)) / G.z;
  if (sy < mg) G.cam.ty -= (mg - sy) / G.z; if (sy > G.H - mg) G.cam.ty += (sy - (G.H - mg)) / G.z;
  clampCam();
}

// =============================== units ===============================
function makeUnit(key, src, team, x, y, extra = {}) {
  const u = {
    uid: 'u' + (G.uidSeq++), key, team, x, y, px: x, py: y, alive: true, done: false,
    name: src.name || (CLASSES[src.cls] && CLASSES[src.cls].name), cls: src.cls, lv: src.lv || 1, exp: src.exp || 0,
    stats: Object.assign({}, src.stats), growth: Object.assign({}, src.growth || {}),
    weapons: src.weapons.slice(), items: (src.items || []).map(i => typeof i === 'string' ? { id: i, uses: ITEMS[i].uses } : Object.assign({}, i)),
    look: src.look, lord: !!src.lord, boss: !!src.boss, female: !!src.female, bio: src.bio || '',
    facing: team === 'player' ? 1 : -1, ph: Math.random() * 6, lx: 0, ly: 0, flash: 0, fade: 1,
  };
  u.shield = CLASSES[u.cls].body === 'armor';
  u.weapon = atkWeapons(u)[0] || u.weapons[0];
  Object.assign(u, extra);
  u.maxhp = u.stats.hp; u.hp = u.maxhp;
  return u;
}
function foeUnit(def) {
  const f = FOES[def.t], lv = def.lv;
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = f.stats[k] + (f.boss ? 0 : Math.floor((f.growth[k] || 0) * (lv - 1) / 100 + 0.35));
  const src = Object.assign({}, f, { lv, stats });
  return makeUnit(def.t, src, 'enemy', def.x, def.y, { ai: def.ai });
}
// ---------- illustrated portraits ----------
const PORTRAIT_IMG = {};
if (typeof PORTRAIT_DATA !== 'undefined') for (const [k, src] of Object.entries(PORTRAIT_DATA)) { const im = new Image(); im.src = src; PORTRAIT_IMG[k] = im; }
const PKEY = { jsoldier: 'soldier', ecav: 'soldier' };
const _procPortrait = {};
function portraitKey(u) { const k = u.key || u.uid; return PKEY[k] && !PORTRAIT_IMG[k] ? PKEY[k] : k; }
function portraitImage(u) {
  const im = PORTRAIT_IMG[portraitKey(u)];
  if (im && im.complete && im.naturalWidth) return im;
  const k = (u.key || u.uid) + '|' + u.team;
  if (!_procPortrait[k]) { const cv = makeCanvas(400, 400); paintPortraitProc(cv, u); _procPortrait[k] = cv; }
  return _procPortrait[k];
}
function portraitUnit(key) {
  if (HEROES[key]) return Object.assign({ team: 'player', uid: key, key }, HEROES[key]);
  const f = FOES[key];
  return Object.assign({ team: 'enemy', uid: key, key, name: f.name }, f);
}

// =============================== reach / ranges ===============================
function computeReach(u, hold) {
  const mov = hold ? 0 : CLASSES[u.cls].mov;
  const R = new Map();
  R.set(K(u.x, u.y), { x: u.x, y: u.y, c: 0, p: null });
  const open = [[u.x, u.y, 0]];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][2] < open[bi][2]) bi = i;
    const [x, y, c] = open.splice(bi, 1)[0];
    if (R.get(K(x, y)).c < c) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const mc = moveCost(u, nx, ny); if (mc >= 99) continue;
      const nc = c + mc; if (nc > mov) continue;
      const o = unitAt(nx, ny); if (o && o.team !== u.team) continue;
      const k = K(nx, ny), e = R.get(k);
      if (e && e.c <= nc) continue;
      R.set(k, { x: nx, y: ny, c: nc, p: K(x, y) }); open.push([nx, ny, nc]);
    }
  }
  for (const e of R.values()) { const o = unitAt(e.x, e.y); e.stop = !o || o === u; }
  return R;
}
function buildPath(R, k) {
  const out = []; let e = R.get(k);
  while (e) { out.unshift([e.x, e.y]); e = e.p ? R.get(e.p) : null; }
  return out;
}
function rangeView(u, R, opts = {}) {
  const move = [], moveSet = new Set();
  for (const e of R.values()) { const k = K(e.x, e.y); moveSet.add(k); move.push([e.x, e.y]); }
  const ws = opts.staff ? [staffOf(u)].filter(Boolean) : atkWeapons(u);
  const atk = [], atkSet = new Set();
  if (ws.length) {
    let mn = 9, mx = 0; for (const w of ws) { mn = Math.min(mn, WEAPONS[w].rng[0]); mx = Math.max(mx, WEAPONS[w].rng[1]); }
    for (const e of R.values()) {
      if (!e.stop) continue;
      for (let dy = -mx; dy <= mx; dy++) for (let dx = -mx; dx <= mx; dx++) {
        const d = Math.abs(dx) + Math.abs(dy); if (d < mn || d > mx) continue;
        const x = e.x + dx, y = e.y + dy, k = K(x, y);
        if (!inMap(x, y) || moveSet.has(k) || atkSet.has(k)) continue;
        atkSet.add(k); atk.push([x, y]);
      }
    }
  }
  return { move, moveSet, atk, atkSet };
}
function enemyRange(u) { return rangeView(u, computeReach(u, u.ai === 'hold')); }
function mergeViews(vs) {
  const move = [], atk = [], moveSet = new Set(), atkSet = new Set();
  for (const v of vs) {
    for (const [x, y] of v.move) { const k = K(x, y); if (!moveSet.has(k)) { moveSet.add(k); move.push([x, y]); } }
  }
  for (const v of vs) for (const [x, y] of v.atk.concat(v.move)) { const k = K(x, y); if (!moveSet.has(k) && !atkSet.has(k)) { atkSet.add(k); atk.push([x, y]); } }
  return { move, moveSet, atk, atkSet };
}
function refreshViews() {
  G.pinView = G.pinned.size ? mergeViews(G.units.filter(u => u.alive && G.pinned.has(u.uid)).map(enemyRange)) : null;
  if (G.danger) {
    const all = alive('enemy').map(enemyRange);
    const set = new Set(), arr = [];
    for (const v of all) for (const [x, y] of v.move.concat(v.atk)) { const k = K(x, y); if (!set.has(k)) { set.add(k); arr.push([x, y]); } }
    G.dangerView = { arr, set };
  } else G.dangerView = null;
}

// =============================== combat math ===============================
const ADV = { sword: 'axe', axe: 'lance', lance: 'sword' };
function tri(a, b) {
  if (!a || !b) return 0;
  const A = WEAPONS[a].type, B = WEAPONS[b].type;
  return ADV[A] === B ? 1 : ADV[B] === A ? -1 : 0;
}
function calc(a, aw, d, dw, dpos) {
  const w = WEAPONS[aw], t = tri(aw, dw), td = terr(dpos[0], dpos[1]);
  const atk = (w.magic ? a.stats.mag : a.stats.str) + w.mt + t;
  const df = (w.magic ? d.stats.res : d.stats.def) + td.def;
  const dmg = Math.max(0, atk - df);
  const hit = clamp(w.hit + a.stats.skl * 2 + Math.floor(a.stats.lck / 2) + t * 15 - (d.stats.spd * 2 + d.stats.lck + td.avo), 0, 100);
  const crit = clamp(w.crit + Math.floor(a.stats.skl / 2) - d.stats.lck, 0, 100);
  return { dmg, hit, crit, tri: t, dbl: a.stats.spd >= d.stats.spd + 4 };
}
function counterWeapon(d, dist) {
  const ws = atkWeapons(d);
  if (ws.includes(d.weapon) && inRng(d.weapon, dist)) return d.weapon;
  return ws.find(w => inRng(w, dist)) || null;
}
function forecast(a, aw, apos, d, dpos) {
  const dist = Math.abs(apos[0] - dpos[0]) + Math.abs(apos[1] - dpos[1]);
  const dw = counterWeapon(d, dist);
  const A = calc(a, aw, d, dw, dpos);
  const D = dw ? calc(d, dw, a, aw, apos) : null;
  return { A, D, aw, dw, dist };
}
const rollHit = h => (Math.random() * 100 + Math.random() * 100) / 2 < h;
function resolve(a, d, fc) {
  let ha = a.hp, hd = d.hp;
  const R = [], seq = ['A'];
  if (fc.D) seq.push('D');
  if (fc.A.dbl) seq.push('A'); else if (fc.D && fc.D.dbl) seq.push('D');
  for (const s of seq) {
    const att = s === 'A' ? a : d, def = s === 'A' ? d : a, st = s === 'A' ? fc.A : fc.D;
    const hit = rollHit(st.hit), crit = hit && Math.random() * 100 < st.crit;
    const dmg = hit ? st.dmg * (crit ? 3 : 1) : 0;
    if (s === 'A') hd = Math.max(0, hd - dmg); else ha = Math.max(0, ha - dmg);
    R.push({ att: att.uid, def: def.uid, hit, crit, dmg });
    if (ha <= 0 || hd <= 0) break;
  }
  return { rounds: R, ha, hd };
}
function expFor(u, foe, hitAny, killed) {
  if (u.lv >= 20) return 0;
  const diff = (foe.lv + (foe.boss ? 4 : 0)) - u.lv;
  if (!hitAny) return 1;
  let e = Math.max(1, Math.floor((31 + diff) / 3));
  if (killed) e += Math.max(8, 20 + diff * 3) + (foe.boss ? 40 : 0);
  return clamp(e, 1, 100);
}

// =============================== game flow ===============================
async function startGame() {
  $('#title').hidden = true;
  G.roster = {};
  for (const k of Object.keys(HEROES)) {
    const h = HEROES[k];
    G.roster[k] = { lv: h.lv, exp: 0, stats: Object.assign({}, h.stats), weapons: h.weapons.slice(), items: h.items.map(i => ({ id: i, uses: ITEMS[i].uses })) };
  }
  G.stats = { turns: [] };
  try { await Promise.all(['700 20px "Cinzel"', '700 20px "Shippori Mincho B1"', '500 14px "Zen Kaku Gothic New"'].map(f => document.fonts.load(f))); } catch (e) { }
  await loadChapter(0);
}
async function loadChapter(i, retry) {
  G.state = 'loading'; G.over = false;
  $('#hud').hidden = true; $('#endScreen').hidden = true;
  const ld = $('#loading'); ld.hidden = false; ld.querySelector('i').style.width = '0%';
  G.chIdx = i; G.ch = CHAPTERS[i];
  G.map = G.ch.map.slice(); G.rows = G.map.length; G.cols = G.map[0].length;
  if (!G.bake[i]) {
    const tb = await Terrain.bake(G.ch, p => ld.querySelector('i').style.width = (p * 100).toFixed(0) + '%');
    G.bake[i] = { tb, wave: Terrain.makeWaveTexture(tb.nz), cloud: Terrain.makeCloudTexture(tb.nz) };
  }
  Object.assign(G, { tb: G.bake[i].tb, wave: G.bake[i].wave, cloud: G.bake[i].cloud, wavePat: null, cloudPat: null });
  G.waterCv = makeCanvas(G.tb.mask.width, G.tb.mask.height);
  resize();
  if (retry) G.roster = JSON.parse(JSON.stringify(G.rosterStart));
  G.rosterStart = JSON.parse(JSON.stringify(G.roster));
  G.units = [];
  for (const [k, x, y] of G.ch.players) {
    const r = G.roster[k]; if (!r) continue;
    const h = HEROES[k];
    G.units.push(makeUnit(k, Object.assign({}, h, { lv: r.lv, exp: r.exp, stats: r.stats, weapons: r.weapons, items: r.items }), 'player', x, y));
  }
  for (const e of G.ch.enemies) G.units.push(foeUnit(e));
  G.turn = 1; G.visited = new Set(); G.pinned.clear(); G.danger = false; G.dangerView = null; G.pinView = null; G.hoverView = null;
  G.sel = null; G.path = []; G.mapTexts = []; G.particles = []; G.smokeT = 0;
  const lord = G.units.find(u => u.lord);
  G.cur.x = lord.x; G.cur.y = lord.y; G.cur.sx = lord.x; G.cur.sy = lord.y;
  focusTile(lord.x, lord.y, true);
  ld.hidden = true;
  G.fade = 1;
  G.state = 'busy';
  updateGoal();
  await chapterCard();
  await dialogue(G.ch.intro);
  await playerPhase();
}
function chapterCard() {
  return new Promise(res => {
    const c = $('#chapterCard');
    c.querySelector('.cc-num').textContent = G.ch.num;
    c.querySelector('.cc-name').textContent = G.ch.name;
    c.querySelector('.cc-sub').textContent = G.ch.sub.toUpperCase();
    c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    Snd.play('phase'); Snd.music('title');
    setTimeout(() => { c.hidden = true; res(); }, 3200);
  });
}
function updateGoal() {
  $('#goalPanel .gp-turn b').textContent = G.turn;
  $('#goalPanel .gp-goal').textContent = G.ch ? G.ch.goalText : '';
}
function banner(en, jp, cls) {
  return new Promise(res => {
    const b = $('#banner');
    b.innerHTML = `<div class="b-band ${cls}"><span class="b-en">${en}</span><span class="b-jp">${jp}</span></div>`;
    b.hidden = false;
    setTimeout(() => { b.hidden = true; res(); }, 1750);
  });
}
async function playerPhase() {
  if (G.over) return;
  G.phase = 'player'; G.state = 'busy';
  for (const u of G.units) u.done = false;
  updateGoal();
  Snd.play('phase'); Snd.music('player');
  await banner('PLAYER PHASE', `第 ${G.turn} ターン ・ 自軍`, 'player');
  await fortHeal('player');
  const lord = G.units.find(u => u.lord && u.alive);
  if (G.turn === 1 && lord) { G.cur.x = lord.x; G.cur.y = lord.y; }
  G.state = 'idle';
  $('#hud').hidden = false;
  refreshViews(); refreshPanels();
}
async function fortHeal(team) {
  let any = false;
  for (const u of alive(team)) {
    if (terr(u.x, u.y).heal && u.hp < u.maxhp) {
      const amt = Math.min(u.maxhp - u.hp, Math.max(1, Math.round(u.maxhp * 0.2)));
      u.hp += amt; any = true;
      mapText(u, '+' + amt, '#8ff0b0'); sparkle(u, '140,255,200');
    }
  }
  if (any) { Snd.play('heal'); await sleep(700); }
}
async function endPlayerTurn() {
  if (G.state !== 'idle') return;
  G.state = 'busy';
  G.sel = null; G.rangeView = null; G.path = []; G.hoverView = null;
  hidePanels();
  await enemyPhase();
}
async function enemyPhase() {
  if (G.over) return;
  G.phase = 'enemy';
  Snd.play('ephase'); Snd.music('enemy');
  await banner('ENEMY PHASE', '敵軍', 'enemy');
  await fortHeal('enemy');
  const players = alive('player');
  const es = alive('enemy').sort((a, b) => {
    const da = Math.min(...players.map(p => mdist(a, p))), db = Math.min(...players.map(p => mdist(b, p)));
    return da - db;
  });
  for (const e of es) {
    if (!e.alive || G.over) continue;
    await aiAct(e);
    refreshViews();
    if (G.over) return;
  }
  G.enemyView = null;
  G.turn++;
  await playerPhase();
}

// =============================== AI ===============================
function distField(e) {
  const D = new Map(), open = [];
  for (const p of alive('player')) { D.set(K(p.x, p.y), 0); open.push([p.x, p.y, 0]); }
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][2] < open[bi][2]) bi = i;
    const [x, y, c] = open.splice(bi, 1)[0];
    if (D.get(K(x, y)) < c) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
      const mc = moveCost(e, x, y); if (mc >= 99 && c > 0) continue;
      const cc = moveCost(e, nx, ny); if (cc >= 99) continue;
      const nc = c + cc, k = K(nx, ny);
      if (D.has(k) && D.get(k) <= nc) continue;
      D.set(k, nc); open.push([nx, ny, nc]);
    }
  }
  return D;
}
async function aiAct(e) {
  const hold = e.ai === 'hold';
  const R = computeReach(e, hold);
  const ws = atkWeapons(e);
  let best = null;
  for (const t of R.values()) {
    if (!t.stop) continue;
    for (const p of alive('player')) {
      const dist = Math.abs(p.x - t.x) + Math.abs(p.y - t.y);
      for (const w of ws) {
        if (!inRng(w, dist)) continue;
        const fc = forecast(e, w, [t.x, t.y], p, [p.x, p.y]);
        const n = fc.A.dbl ? 2 : 1, expd = fc.A.hit / 100 * fc.A.dmg * n, kill = fc.A.dmg * n >= p.hp;
        const taken = fc.D ? fc.D.hit / 100 * fc.D.dmg * (fc.D.dbl ? 2 : 1) : 0;
        const tt = terr(t.x, t.y);
        const s = expd * 3 + (kill ? 60 * fc.A.hit / 100 : 0) + fc.A.hit * 0.15 - taken * 1.1 + tt.def * 2 + tt.avo * 0.08 - t.c * 0.05 + (p.lord ? 4 : 0) + (fc.A.dmg === 0 ? -30 : 0);
        if (!best || s > best.s) best = { s, t, p, w };
      }
    }
  }
  let dest = null;
  if (best) dest = best.t;
  else if (e.ai === 'aggro') {
    const D = distField(e);
    let bt = null;
    for (const t of R.values()) {
      if (!t.stop) continue;
      const v = D.has(K(t.x, t.y)) ? D.get(K(t.x, t.y)) : 999;
      if (!bt || v < bt.v || (v === bt.v && t.c < bt.t.c)) bt = { v, t };
    }
    dest = bt && bt.t;
  }
  if (!dest) return;
  const moving = dest.x !== e.x || dest.y !== e.y;
  if (!moving && !best) return;
  G.cur.x = e.x; G.cur.y = e.y;
  focusTile(e.x, e.y); await sleep(260);
  if (moving) {
    G.enemyView = rangeView(e, R);
    await sleep(320);
    G.enemyView = null;
    await moveUnit(e, buildPath(R, K(dest.x, dest.y)), 0.13);
  }
  if (best) {
    G.cur.x = best.p.x; G.cur.y = best.p.y;
    await sleep(220);
    await combat(e, best.w, best.p);
    checkEnd();
  }
}

// =============================== movement ===============================
function moveUnit(u, path, step = 0.1) {
  return new Promise(res => {
    if (path.length < 2) { res(); return; }
    G.mover = { u, path, i: 0, t: 0, step, res };
    u.moving = true;
  });
}
function updateMover(dt) {
  const m = G.mover; if (!m) return;
  m.t += dt / m.step;
  while (m.t >= 1 && m.i < m.path.length - 1) { m.t -= 1; m.i++; if (m.i % 2) Snd.play('step'); }
  const u = m.u;
  if (m.i >= m.path.length - 1) {
    const [x, y] = m.path[m.path.length - 1];
    u.x = x; u.y = y; u.px = x; u.py = y; u.moving = false; G.mover = null; m.res();
    return;
  }
  const a = m.path[m.i], b = m.path[m.i + 1];
  u.px = lerp(a[0], b[0], m.t); u.py = lerp(a[1], b[1], m.t);
  if (b[0] !== a[0]) u.facing = b[0] > a[0] ? 1 : -1;
  G.cam.tx = u.px * T + T / 2; G.cam.ty = u.py * T + T / 2; clampCam();
}

// =============================== combat orchestration ===============================
async function combat(a, aw, d) {
  const boss = a.boss ? a : d.boss ? d : null;
  if (boss && !boss.quoted && G.ch.bossTalk) { boss.quoted = true; await dialogue(G.ch.bossTalk); }
  const fc = forecast(a, aw, [a.x, a.y], d, [d.x, d.y]);
  a.weapon = aw; if (fc.dw) d.weapon = fc.dw;
  if (d.x !== a.x) { a.facing = d.x > a.x ? 1 : -1; d.facing = -a.facing; }
  const res = resolve(a, d, fc);
  hidePanels(); $('#hud').hidden = true;
  const fcs = (st, dbl) => st ? { hit: st.hit, dmg: st.dmg + (st.dbl ? '×2' : ''), crit: st.crit } : { hit: null, dmg: null, crit: null };
  if (G.anims) {
    G.state = 'battle';
    await Battle.start({
      att: a, def: d, rounds: res.rounds, W: G.W, H: G.H, dpr: G.dpr, time: G.ch.time, dist: fc.dist,
      terrain: { [a.uid]: tileCh(a.x, a.y), [d.uid]: tileCh(d.x, d.y) }, hp: { [a.uid]: a.hp, [d.uid]: d.hp },
      forecast: { [a.uid]: fcs(fc.A), [d.uid]: fcs(fc.D) },
    });
  } else {
    G.state = 'busy';
    await mapCombat(a, d, res.rounds);
  }
  a.hp = res.ha; d.hp = res.hd;
  G.state = 'busy';
  if (!G.over) $('#hud').hidden = false;
  if (d.ai === 'guard') d.ai = 'aggro';
  for (const u of [d, a]) if (u.hp <= 0) await killUnit(u);
  const pl = a.team === 'player' ? a : d.team === 'player' ? d : null;
  if (pl && pl.alive) {
    const foe = pl === a ? d : a;
    const hitAny = res.rounds.some(r => r.att === pl.uid && r.hit);
    await gainExp(pl, expFor(pl, foe, hitAny, !foe.alive));
  }
}
async function mapCombat(a, d, rounds) {
  const by = { [a.uid]: a, [d.uid]: d };
  const hp = { [a.uid]: a.hp, [d.uid]: d.hp };
  for (const r of rounds) {
    const at = by[r.att], df = by[r.def];
    const dx = Math.sign(df.x - at.x) * 0.28, dy = Math.sign(df.y - at.y) * 0.28;
    for (let k = 0; k <= 6; k++) { at.lx = dx * Math.sin(k / 6 * Math.PI); at.ly = dy * Math.sin(k / 6 * Math.PI); await sleep(16); if (k === 3) { if (r.hit) { hp[df.uid] = Math.max(0, hp[df.uid] - r.dmg); df.hp = hp[df.uid]; df.flash = 1; mapText(df, String(r.dmg) + (r.crit ? '!' : ''), r.crit ? '#ffb040' : '#ffffff'); Snd.play(r.crit ? 'crit' : 'hit'); } else { mapText(df, 'MISS', '#b8c8ff'); Snd.play('miss'); } } }
    at.lx = at.ly = 0;
    await sleep(380);
    if (hp[df.uid] <= 0) break;
  }
}
async function killUnit(u) {
  Snd.play('death');
  for (let k = 0; k <= 20; k++) { u.fade = 1 - k / 20; u.flash = (k % 4 < 2) ? 0.8 : 0; await sleep(28); }
  u.alive = false; u.fade = 0;
  G.pinned.delete(u.uid);
  if (u.team === 'player' && !u.lord) toast(`<b>${u.name}</b> は戦線を離脱した…`);
}
function gainExp(u, amt) {
  return new Promise(res => {
    if (amt <= 0) { res(); return; }
    const el = $('#expbar'), bar = el.querySelector('i'), num = el.querySelector('.num');
    el.hidden = false;
    const from = u.exp, to = u.exp + amt;
    const t0 = performance.now(), dur = 700 + amt * 6;
    let leveled = false;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const v = Math.floor(lerp(from, to, Ease.outCubic(k)));
      const shown = v % 100;
      bar.style.width = shown + '%'; num.textContent = shown;
      if (v >= 100 && !leveled) { leveled = true; }
      if (k < 1) { requestAnimationFrame(step); return; }
      setTimeout(async () => {
        el.hidden = true;
        u.exp = to % 100;
        if (to >= 100) await levelUp(u);
        res();
      }, 350);
    };
    Snd.play('menu');
    requestAnimationFrame(step);
  });
}
function levelUp(u) {
  return new Promise(res => {
    const gains = {};
    let any = false;
    for (const k of STAT_KEYS) { gains[k] = Math.random() * 100 < (u.growth[k] || 0) ? 1 : 0; if (gains[k]) any = true; }
    if (!any) { const ks = STAT_KEYS.slice().sort((a, b) => (u.growth[b] || 0) - (u.growth[a] || 0)); gains[ks[0]] = 1; }
    const old = Object.assign({}, u.stats);
    u.lv++;
    for (const k of STAT_KEYS) u.stats[k] += gains[k];
    u.maxhp = u.stats.hp; u.hp = Math.min(u.maxhp, u.hp + gains.hp);
    const el = $('#levelup');
    paintPortrait($('#luPortrait'), u);
    el.querySelector('.lu-name').textContent = `${u.name} ・ ${CLASSES[u.cls].name}`;
    el.querySelector('.lu-lv').innerHTML = `Lv <b>${u.lv - 1}</b> → <b>${u.lv}</b>`;
    el.querySelector('.lu-grid').innerHTML = STAT_KEYS.map(k => `<div class="lu-s" data-k="${k}"><span>${STAT_JP[k]}</span><span><b>${old[k]}</b><em>+1</em></span></div>`).join('');
    el.hidden = false;
    Snd.play('levelup');
    G.prevState = G.state; G.state = 'levelup';
    let i = 0, ready = false;
    const ups = STAT_KEYS.filter(k => gains[k]);
    const tick = () => {
      if (i >= ups.length) { ready = true; return; }
      const k = ups[i++];
      const row = el.querySelector(`[data-k="${k}"]`);
      row.classList.add('up'); row.querySelector('b').textContent = u.stats[k]; row.querySelector('em').classList.add('show');
      Snd.play('stat');
      setTimeout(tick, 230);
    };
    setTimeout(tick, 600);
    G.luClose = () => { if (!ready) return; el.hidden = true; G.state = G.prevState; G.luClose = null; res(); };
    el.onclick = () => G.luClose && G.luClose();
  });
}
async function doHeal(c, t) {
  const amt = Math.min(t.maxhp - t.hp, WEAPONS.heal.heal + c.stats.mag);
  c.weapon = staffOf(c);
  if (t.x !== c.x) c.facing = t.x > c.x ? 1 : -1;
  hidePanels(); $('#hud').hidden = true;
  if (G.anims) {
    G.state = 'battle';
    await Battle.start({
      att: c, def: t, heal: true, rounds: [{ att: c.uid, def: t.uid, heal: true, amount: amt, hit: true }], W: G.W, H: G.H, dpr: G.dpr, time: G.ch.time, dist: 1,
      terrain: { [c.uid]: tileCh(c.x, c.y), [t.uid]: tileCh(t.x, t.y) }, hp: { [c.uid]: c.hp, [t.uid]: t.hp },
      forecast: { [c.uid]: {}, [t.uid]: {} },
    });
  } else { Snd.play('heal'); sparkle(t, '140,255,200'); mapText(t, '+' + amt, '#8ff0b0'); await sleep(700); }
  t.hp += amt;
  G.state = 'busy';
  $('#hud').hidden = false;
  await gainExp(c, c.lv >= 20 ? 0 : 12);
}

// =============================== player interaction ===============================
function selectUnit(u, keepCursor) {
  G.sel = u; G.selOrig = { x: u.x, y: u.y, f: u.facing };
  G.reach = computeReach(u);
  const staff = !atkWeapons(u).length && staffOf(u);
  G.rangeView = rangeView(u, G.reach, { staff });
  G.rangeView.heal = !!staff;
  G.state = 'select';
  if (!keepCursor) { G.cur.x = u.x; G.cur.y = u.y; }
  updatePath(); refreshPanels();
  Snd.play('select');
}
function updatePath() {
  if (G.state !== 'select' || !G.sel) { G.path = []; return; }
  const k = K(G.cur.x, G.cur.y);
  G.path = G.reach.has(k) ? buildPath(G.reach, k) : [];
}
function deselect() {
  const u = G.sel;
  G.sel = null; G.rangeView = null; G.path = []; G.state = 'idle';
  if (u) { G.cur.x = u.x; G.cur.y = u.y; }
  refreshPanels();
}
function enemiesInRange(u, x = u.x, y = u.y) {
  const ws = atkWeapons(u);
  return alive('enemy').filter(e => ws.some(w => inRng(w, Math.abs(e.x - x) + Math.abs(e.y - y))));
}
function alliesHealable(u) {
  return alive('player').filter(a => a !== u && a.hp < a.maxhp && mdist(a, u) === 1);
}
async function onConfirm() {
  const cx = G.cur.x, cy = G.cur.y;
  if (G.state === 'idle') {
    const u = unitAt(cx, cy);
    if (u && u.team === 'player' && !u.done) selectUnit(u);
    else if (u && u.team === 'enemy') { if (G.pinned.has(u.uid)) G.pinned.delete(u.uid); else G.pinned.add(u.uid); Snd.play('menu'); refreshViews(); }
    else if (u && u.team === 'player') { openStatus(u); }
    else openMapMenu();
    return;
  }
  if (G.state === 'select') {
    const u = G.sel, k = K(cx, cy), occ = unitAt(cx, cy);
    const e = G.reach.get(k);
    if (e && e.stop) {
      G.state = 'busy'; G.path = [];
      Snd.play('select');
      await moveUnit(u, buildPath(G.reach, k));
      G.state = 'action'; openActionMenu();
      return;
    }
    if (occ && occ.team === 'enemy' && G.rangeView.atkSet.has(k) === false && !G.rangeView.moveSet.has(k)) { Snd.play('cancel'); return; }
    if (occ && occ.team === 'enemy' && !G.rangeView.heal) {
      // auto-approach: choose a stop tile in range of this enemy, prefer current path end
      const ws = atkWeapons(u);
      const cands = [...G.reach.values()].filter(t => t.stop && ws.some(w => inRng(w, Math.abs(t.x - cx) + Math.abs(t.y - cy))));
      if (!cands.length) { Snd.play('cancel'); return; }
      const last = G.lastPathEnd && cands.find(t => t.x === G.lastPathEnd[0] && t.y === G.lastPathEnd[1]);
      const pick = last || cands.sort((a, b) => terr(b.x, b.y).avo - terr(a.x, a.y).avo || a.c - b.c)[0];
      G.state = 'busy'; G.path = [];
      Snd.play('select');
      await moveUnit(u, buildPath(G.reach, K(pick.x, pick.y)));
      const targets = enemiesInRange(u);
      G.state = 'action';
      enterTarget('attack', targets, occ);
      return;
    }
    if (occ && occ.team === 'player' && occ !== u && !occ.done) { selectUnit(occ); return; }
    Snd.play('cancel'); deselect();
    return;
  }
  if (G.state === 'target') {
    const u = G.sel, t = G.targets[G.tIdx];
    hideForecast();
    G.state = 'busy';
    G.rangeView = null;
    if (G.mode === 'heal') await doHeal(u, t);
    else await combat(u, G.tWeapon, t);
    if (G.over) return;
    finishUnit(u);
  }
}
function onCancel() {
  if (G.state === 'select') { Snd.play('cancel'); deselect(); return; }
  if (G.state === 'target') { Snd.play('cancel'); hideForecast(); G.state = 'action'; G.cur.x = G.sel.x; G.cur.y = G.sel.y; openActionMenu(); return; }
  if (G.state === 'idle' && G.pinned.size) { G.pinned.clear(); refreshViews(); Snd.play('cancel'); }
}
function moveCursor(dx, dy) {
  if (G.state === 'target') { cycleTarget(dx + dy > 0 ? 1 : -1); return; }
  if (G.state !== 'idle' && G.state !== 'select') return;
  const nx = clamp(G.cur.x + dx, 0, G.cols - 1), ny = clamp(G.cur.y + dy, 0, G.rows - 1);
  if (nx === G.cur.x && ny === G.cur.y) return;
  setCursor(nx, ny);
  keepVisible(nx, ny);
}
function setCursor(x, y) {
  if (x === G.cur.x && y === G.cur.y) return;
  G.cur.x = x; G.cur.y = y;
  Snd.play('cursor');
  if (G.state === 'select') { updatePath(); if (G.path.length) G.lastPathEnd = G.path[G.path.length - 1]; }
  refreshPanels();
}
function finishUnit(u) {
  u.done = true; G.sel = null; G.rangeView = null; G.path = []; G.lastPathEnd = null;
  G.state = 'idle';
  refreshViews(); refreshPanels();
  if (checkEnd()) return;
  if (alive('player').every(p => p.done)) setTimeout(() => endPlayerTurn(), 350);
}
function checkEnd() {
  if (G.over) return true;
  const lord = G.units.find(u => u.lord);
  if (!lord || !lord.alive) { gameOver(); return true; }
  if (G.ch.goal === 'boss' && !G.units.some(u => u.boss && u.alive)) { victory(); return true; }
  return false;
}

// ---------- menus ----------
function openMenu(items, anchor, onCancel) {
  const el = $('#actionMenu');
  el.innerHTML = '';
  G.menu = { items, idx: items.findIndex(i => !i.disabled), onCancel, prev: G.state };
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'mi'; b.disabled = !!it.disabled;
    b.innerHTML = `<span>${it.label}</span>${it.sub ? `<small>${it.sub}</small>` : ''}`;
    b.onclick = (ev) => { ev.stopPropagation(); G.menu.idx = i; menuConfirm(); };
    b.onmouseenter = () => { if (!it.disabled) { G.menu.idx = i; menuHi(); } };
    el.appendChild(b);
  });
  el.hidden = false;
  const r = el.getBoundingClientRect();
  let [sx, sy] = anchor;
  let x = sx + T * G.z * 0.8, y = sy - r.height / 2;
  if (x + r.width > G.W - 12) x = sx - T * G.z * 0.8 - r.width;
  x = clamp(x, 12, G.W - r.width - 12); y = clamp(y, 60, G.H - r.height - 60);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  G.state = 'menu';
  menuHi();
}
function menuHi() { [...$('#actionMenu').children].forEach((b, i) => b.classList.toggle('on', i === G.menu.idx)); }
function menuMove(d) {
  const n = G.menu.items.length; let i = G.menu.idx;
  for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!G.menu.items[i].disabled) break; }
  G.menu.idx = i; menuHi(); Snd.play('cursor');
}
function closeMenu() { $('#actionMenu').hidden = true; const m = G.menu; G.menu = null; return m; }
function menuConfirm() { const m = closeMenu(); const it = m.items[m.idx]; G.state = m.prev; Snd.play('menu'); it.fn(); }
function menuCancel() { const m = closeMenu(); G.state = m.prev; Snd.play('cancel'); m.onCancel && m.onCancel(); }
function unitScreen(u) { return w2s(u.px * T + T / 2, u.py * T + T / 2); }
function openActionMenu() {
  const u = G.sel;
  G.rangeView = null;
  const items = [];
  const targets = enemiesInRange(u);
  if (targets.length) items.push({ label: '攻撃', fn: () => enterTarget('attack', targets) });
  const st = staffOf(u);
  if (st) { const al = alliesHealable(u); items.push({ label: '杖', sub: WEAPONS[st].name, disabled: !al.length, fn: () => enterTarget('heal', al) }); }
  const k = K(u.x, u.y);
  if (tileCh(u.x, u.y) === 'h' && G.ch.villages[k] && !G.visited.has(k)) items.push({ label: '訪問', fn: () => visit(u) });
  if (G.ch.goal === 'seize' && u.lord && tileCh(u.x, u.y) === 'T') items.push({ label: '制圧', fn: () => seize(u) });
  if (u.items.length) items.push({ label: 'アイテム', fn: () => openItems(u) });
  items.push({ label: '待機', fn: () => finishUnit(u) });
  G.state = 'action';
  refreshPanels();
  openMenu(items, unitScreen(u), () => {
    u.x = G.selOrig.x; u.y = G.selOrig.y; u.px = u.x; u.py = u.y; u.facing = G.selOrig.f;
    selectUnit(u, true);
  });
}
function openItems(u) {
  const items = u.items.map((it, i) => ({ label: ITEMS[it.id].name, sub: `${ITEMS[it.id].desc} ・ 残${it.uses}`, fn: () => useItem(u, i) }));
  openMenu(items, unitScreen(u), () => openActionMenu());
}
async function useItem(u, i) {
  const it = u.items[i], d = ITEMS[it.id];
  if (d.heal) {
    if (u.hp >= u.maxhp) { toast('HPは満タンです'); openItems(u); return; }
    const amt = Math.min(d.heal, u.maxhp - u.hp);
    u.hp += amt; Snd.play('heal'); sparkle(u, '140,255,200'); mapText(u, '+' + amt, '#8ff0b0');
  } else if (d.boost) {
    for (const [k, v] of Object.entries(d.boost)) u.stats[k] += v;
    u.maxhp = u.stats.hp;
    Snd.play('levelup'); sparkle(u, '255,230,150');
    toast(`<b>${u.name}</b> の${Object.keys(d.boost).map(k => STAT_JP[k]).join('・')}が上がった`);
  }
  it.uses--; if (it.uses <= 0) u.items.splice(i, 1);
  G.state = 'busy';
  await sleep(700);
  finishUnit(u);
}
function openMapMenu() {
  openMenu([
    { label: 'ターン終了', fn: () => endPlayerTurn() },
    { label: '危険範囲', sub: G.danger ? 'ON' : 'OFF', fn: () => toggleDanger() },
    { label: '戦闘アニメ', sub: G.anims ? 'ON' : 'OFF', fn: () => { G.anims = !G.anims; toast(`戦闘アニメ <b>${G.anims ? 'ON' : 'OFF'}</b>`); } },
    { label: 'サウンド', sub: Snd.muted ? 'OFF' : 'ON', fn: () => toggleMute() },
    { label: '遊び方', fn: () => openModal('#help') },
  ], w2s(G.cur.x * T + T / 2, G.cur.y * T + T / 2), null);
}
function enterTarget(mode, list, pre) {
  G.mode = mode; G.targets = list.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  G.tIdx = pre ? Math.max(0, G.targets.indexOf(pre)) : 0;
  G.state = 'target';
  pickWeapon();
  focusTarget();
}
function pickWeapon() {
  const u = G.sel, t = G.targets[G.tIdx];
  if (G.mode === 'heal') { G.tWeapon = staffOf(u); return; }
  const d = mdist(u, t);
  const ws = atkWeapons(u).filter(w => inRng(w, d));
  if (!ws.includes(G.tWeapon)) G.tWeapon = ws.includes(u.weapon) ? u.weapon : ws[0];
}
function cycleTarget(d) {
  G.tIdx = (G.tIdx + d + G.targets.length) % G.targets.length;
  pickWeapon(); focusTarget(); Snd.play('cursor');
}
function cycleWeapon() {
  if (G.state !== 'target' || G.mode !== 'attack') return;
  const u = G.sel, t = G.targets[G.tIdx], d = mdist(u, t);
  const ws = atkWeapons(u).filter(w => inRng(w, d));
  if (ws.length < 2) return;
  G.tWeapon = ws[(ws.indexOf(G.tWeapon) + 1) % ws.length];
  Snd.play('menu'); showForecast();
}
function focusTarget() {
  const t = G.targets[G.tIdx];
  G.cur.x = t.x; G.cur.y = t.y;
  keepVisible(t.x, t.y, 2.2);
  if (t.x !== G.sel.x) G.sel.facing = t.x > G.sel.x ? 1 : -1;
  showForecast(); refreshPanels();
}
function showForecast() {
  const u = G.sel, t = G.targets[G.tIdx], el = $('#forecast');
  const hpbar = (v, m) => `<div class="bar fc-hpbar"><i style="width:${Math.max(0, v / m * 100)}%"></i></div>`;
  if (G.mode === 'heal') {
    const amt = Math.min(t.maxhp - t.hp, WEAPONS.heal.heal + u.stats.mag);
    el.innerHTML = `<div class="fc-head"><div class="fc-side fc-player"><div class="fc-name">${u.name}</div><div class="fc-w">${WEAPONS[staffOf(u)].name}</div></div><div class="fc-vs">HEAL</div><div class="fc-side r fc-player"><div class="fc-name">${t.name}</div><div class="fc-w">${CLASSES[t.cls].name}</div></div></div>
      <div class="fc-rows fc-heal"><div class="v l">${t.hp}</div><div class="k">HP</div><div class="v">${t.hp + amt}</div><div class="v l">+${amt}</div><div class="k">回復</div><div class="v"></div></div>
      <div class="fc-tip">決定で回復 ・ キャンセルで戻る</div>`;
    el.hidden = false; return;
  }
  const fc = forecast(u, G.tWeapon, [u.x, u.y], t, [t.x, t.y]);
  const triM = v => v > 0 ? '<span class="tri up">▲</span>' : v < 0 ? '<span class="tri down">▼</span>' : '';
  const ws = atkWeapons(u).filter(w => inRng(w, mdist(u, t)));
  const wsw = ws.length > 1 ? `<button class="fc-wbtn" id="fcW" title="武器切替 (Tab)">⇄</button>` : '';
  const n = (st, k) => st ? st[k] : '--';
  const dm = st => st ? `${st.dmg}${st.dbl ? '<span class="x2">×2</span>' : ''}` : '--';
  const after = (hp, st) => st ? Math.max(0, hp - st.dmg * (st.dbl ? 2 : 1)) : hp;
  el.innerHTML = `<div class="fc-head">
      <div class="fc-side fc-player"><div class="fc-name">${u.name}</div><div class="fc-w">${triM(fc.A.tri)}${WEAPONS[G.tWeapon].name}${wsw}</div>${hpbar(u.hp, u.maxhp)}</div>
      <div class="fc-vs">VS</div>
      <div class="fc-side r fc-enemy"><div class="fc-name">${t.name}</div><div class="fc-w">${fc.dw ? triM(fc.D.tri) + WEAPONS[fc.dw].name : '反撃不可'}</div>${hpbar(t.hp, t.maxhp)}</div></div>
    <div class="fc-rows">
      <div class="v l">${u.hp}</div><div class="k">HP</div><div class="v">${t.hp}</div>
      <div class="v l">${dm(fc.A)}</div><div class="k">威力</div><div class="v">${dm(fc.D)}</div>
      <div class="v l">${fc.A.hit}</div><div class="k">命中</div><div class="v">${n(fc.D, 'hit')}</div>
      <div class="v l">${fc.A.crit}</div><div class="k">必殺</div><div class="v">${n(fc.D, 'crit')}</div>
    </div>
    <div class="fc-tip">予測 HP ${u.hp}→${after(u.hp, fc.D)} ／ ${t.hp}→${after(t.hp, fc.A)} ・ 決定で攻撃</div>`;
  el.hidden = false;
  const b = $('#fcW'); if (b) b.onclick = (e) => { e.stopPropagation(); cycleWeapon(); };
}
function hideForecast() { $('#forecast').hidden = true; }

async function visit(u) {
  const k = K(u.x, u.y), v = G.ch.villages[k];
  G.visited.add(k);
  G.state = 'busy';
  Snd.play('visit');
  await dialogue([{ who: null, text: v.text, villager: true }]);
  const id = v.reward;
  if (WEAPONS[id]) {
    const rec = (v.to && G.units.find(x => x.key === v.to && x.alive)) || u;
    rec.weapons.push(id);
    toast(`<b>${rec.name}</b> は「${WEAPONS[id].name}」を手に入れた`);
  } else {
    u.items.push({ id, uses: ITEMS[id].uses });
    toast(`<b>${u.name}</b> は「${ITEMS[id].name}」を手に入れた`);
  }
  Snd.play('levelup');
  await sleep(600);
  finishUnit(u);
}
async function seize(u) { G.state = 'busy'; await sleep(200); victory(); }
async function victory() {
  if (G.over) return;
  G.over = true; G.state = 'busy';
  hidePanels(); $('#hud').hidden = true;
  Snd.stopMusic(); Snd.play('victory');
  await banner('CHAPTER CLEAR', G.ch.goal === 'seize' ? '制圧完了' : '敵将撃破', 'gold');
  await dialogue(G.ch.outro);
  G.stats.turns.push(G.turn);
  const roster = {};
  for (const u of G.units) if (u.team === 'player' && u.alive) roster[u.key] = { lv: u.lv, exp: u.exp, stats: Object.assign({}, u.stats), weapons: u.weapons.slice(), items: u.items.map(i => Object.assign({}, i)) };
  G.roster = roster;
  if (G.chIdx + 1 < CHAPTERS.length) await loadChapter(G.chIdx + 1);
  else showEnding();
}
function gameOver() {
  if (G.over) return;
  G.over = true; G.state = 'end';
  hidePanels(); $('#hud').hidden = true;
  Snd.stopMusic(); Snd.play('death');
  const el = $('#endScreen');
  el.innerHTML = `<div class="end-title" style="background:linear-gradient(180deg,#ffe0d8,#d0564b 60%,#5a1418);-webkit-background-clip:text;background-clip:text">GAME OVER</div>
    <div class="end-sub">リオネルは倒れた…</div>
    <div class="end-btns" style="margin-top:30px"><button class="t-btn" id="eRetry">この章をやり直す</button><button class="t-btn ghost" id="eTitle">タイトルへ</button></div>`;
  el.hidden = false;
  $('#eRetry').onclick = () => { Snd.play('select'); loadChapter(G.chIdx, true); };
  $('#eTitle').onclick = () => toTitle();
}
function showEnding() {
  G.state = 'end';
  Snd.music('title');
  const el = $('#endScreen');
  const units = Object.keys(G.roster);
  const total = G.stats.turns.reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="cc-num">蒼焔戦記</div><div class="end-title">完</div>
    <div class="end-sub">THE AZURE FLAME BURNS ON ・ 総ターン数 ${total}</div>
    <div class="end-roster">${units.map(k => `<figure><canvas data-k="${k}" width="192" height="192"></canvas><figcaption>${HEROES[k].name}<span>Lv ${G.roster[k].lv}</span></figcaption></figure>`).join('')}</div>
    <div class="end-btns"><button class="t-btn" id="eTitle">タイトルへ</button></div>`;
  el.hidden = false;
  el.querySelectorAll('canvas').forEach(c => paintPortrait(c, portraitUnit(c.dataset.k)));
  $('#eTitle').onclick = () => toTitle();
}
function toTitle() {
  $('#endScreen').hidden = true; $('#hud').hidden = true;
  G.map = null; G.units = []; G.state = 'title';
  $('#title').hidden = false;
  Snd.music('title');
}

// =============================== DOM panels ===============================
function paintPortrait(cv, u) {
  const im = PORTRAIT_IMG[portraitKey(u)];
  if (im && im.complete && im.naturalWidth) {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.imageSmoothingQuality = 'high'; c.drawImage(im, 0, 0, w, h);
    const v = c.createRadialGradient(w / 2, h * 0.45, w * 0.35, w / 2, h / 2, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
    return;
  }
  paintPortraitProc(cv, u);
}
function paintPortraitProc(cv, u) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const enemy = u.team === 'enemy';
  const g = c.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, w * 0.75);
  g.addColorStop(0, enemy ? '#5a2a30' : '#2f4a7a'); g.addColorStop(1, enemy ? '#1a0a0e' : '#0c1428');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = w * 0.004;
  for (let i = -h; i < w; i += w * 0.04) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); }
  Spr.drawPortrait(c, u, w, h * 1.0);
}
function refreshPanels() {
  const up = $('#unitPanel'), tp = $('#terrainPanel');
  if (!G.map) return;
  const showFor = G.state === 'select' && G.sel ? (unitAt(G.cur.x, G.cur.y) || G.sel) : unitAt(G.cur.x, G.cur.y);
  const [sx] = w2s(G.cur.x * T + T / 2, 0);
  const right = sx < G.W * 0.42;
  const inset = 'env(safe-area-inset-left,0px)';
  if (showFor) {
    up.hidden = false;
    up.className = 'panel ' + showFor.team;
    if (up.dataset.uid !== showFor.uid + showFor.lv) { paintPortrait($('#upPortrait'), showFor); up.dataset.uid = showFor.uid + showFor.lv; }
    up.querySelector('.up-name').textContent = showFor.name;
    up.querySelector('.up-class').textContent = `${CLASSES[showFor.cls].name} ・ Lv ${showFor.lv}${showFor.boss ? ' ・ 敵将' : ''}`;
    up.querySelector('.num').textContent = `${showFor.hp}/${showFor.maxhp}`;
    up.querySelector('.bar i').style.width = (showFor.hp / showFor.maxhp * 100) + '%';
    if (right) { up.style.left = 'auto'; up.style.right = `calc(env(safe-area-inset-right,0px) + 12px)`; up.style.top = `calc(env(safe-area-inset-top,0px) + 74px)`; }
    else { up.style.right = 'auto'; up.style.left = `calc(${inset} + 12px)`; up.style.top = `calc(env(safe-area-inset-top,0px) + ${G.W < 640 ? 74 : 12}px)`; }
  } else up.hidden = true;
  const t = terr(G.cur.x, G.cur.y);
  tp.hidden = false;
  tp.querySelector('.tp-name').textContent = t.name;
  tp.querySelector('.tp-def').textContent = t.def;
  tp.querySelector('.tp-avo').textContent = t.avo;
  if (right) { tp.style.left = 'auto'; tp.style.right = `calc(env(safe-area-inset-right,0px) + 12px)`; tp.style.bottom = `calc(env(safe-area-inset-bottom,0px) + 62px)`; }
  else { tp.style.right = 'auto'; tp.style.left = `calc(${inset} + 12px)`; tp.style.bottom = `calc(env(safe-area-inset-bottom,0px) + 12px)`; }
  // hover enemy range
  const hu = unitAt(G.cur.x, G.cur.y);
  G.hoverView = (G.state === 'idle' && hu && hu.team === 'enemy' && !G.pinned.has(hu.uid)) ? enemyRange(hu) : null;
  $('#tbDanger').classList.toggle('on', G.danger);
}
function hidePanels() { $('#unitPanel').hidden = true; $('#terrainPanel').hidden = true; hideForecast(); }
function toast(html) {
  const el = $('#toast'); el.innerHTML = html; el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(G.toastT); G.toastT = setTimeout(() => el.hidden = true, 2400);
}
function toggleDanger() { if (!G.map) return; G.danger = !G.danger; refreshViews(); refreshPanels(); Snd.play('menu'); }
function toggleMute() { Snd.setMuted(!Snd.muted); $('#tbSound').textContent = Snd.muted ? '♪̸' : '♪'; $('#tbSound').style.opacity = Snd.muted ? .5 : 1; }
function infoAtCursor() { if (G.state !== 'idle' && G.state !== 'select') return; const u = unitAt(G.cur.x, G.cur.y) || G.sel; if (u) openStatus(u); }
function openModal(sel) { G.modalPrev = G.state; G.state = 'modal'; G.modal = sel; $(sel).hidden = false; }
function closeModal() { if (!G.modal) return; $(G.modal).hidden = true; G.modal = null; G.state = G.modalPrev || 'title'; Snd.play('cancel'); }
function openStatus(u) {
  const el = $('#status');
  paintPortrait($('#stPortrait'), u);
  el.querySelector('.st-name').textContent = u.name;
  el.querySelector('.st-cls').textContent = `${CLASSES[u.cls].name} ・ Lv ${u.lv}${u.team === 'player' ? ` ・ EXP ${u.exp}` : ''} ・ 移動 ${CLASSES[u.cls].mov}`;
  el.querySelector('.st-grid').innerHTML = STAT_KEYS.map(k => {
    const v = k === 'hp' ? `${u.hp}/${u.maxhp}` : u.stats[k];
    const pct = k === 'hp' ? u.hp / u.maxhp * 100 : Math.min(100, u.stats[k] / 20 * 100);
    return `<span class="k">${STAT_JP[k]}</span><div class="bar"><i style="width:${pct}%"></i></div><span class="v">${v}</span>`;
  }).join('');
  el.querySelector('.st-inv').innerHTML = u.weapons.map(w => `${WEAPONS[w].name} <span>${WTYPE_JP[WEAPONS[w].type]} ・ ${WEAPONS[w].staff ? '回復' : `威力${WEAPONS[w].mt} 命中${WEAPONS[w].hit} 必殺${WEAPONS[w].crit}`} ・ 射程${WEAPONS[w].rng[0]}${WEAPONS[w].rng[1] > WEAPONS[w].rng[0] ? '-' + WEAPONS[w].rng[1] : ''}</span>`).join('<br>') +
    (u.items.length ? '<br>' + u.items.map(i => `${ITEMS[i.id].name} <span>残${i.uses}</span>`).join('<br>') : '');
  el.querySelector('.st-bio').textContent = u.bio || (u.boss ? 'この戦場を率いる敵将。' : '');
  openModal('#status');
}

// ---------- dialogue ----------
function dialogue(lines) {
  return new Promise(res => {
    if (!lines || !lines.length) { res(); return; }
    const el = $('#dialog'), nameEl = el.querySelector('.dlg-name'), textEl = el.querySelector('.dlg-text');
    let i = 0, typing = null, full = '';
    const prev = G.state; G.state = 'dialog';
    const show = () => {
      const L = lines[i];
      el.classList.toggle('narr', !L.who);
      if (L.who) {
        const u = portraitUnit(L.who);
        paintPortrait($('#dlgPortrait'), u);
        nameEl.textContent = u.name; nameEl.classList.toggle('enemy', u.team === 'enemy');
      }
      full = L.text; let n = 0; textEl.textContent = '';
      clearInterval(typing);
      typing = setInterval(() => { n += 2; textEl.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; } }, 32);
      el.hidden = false;
    };
    G.dlgAdvance = () => {
      if (typing) { clearInterval(typing); typing = null; textEl.textContent = full; return; }
      i++;
      Snd.play('menu');
      if (i >= lines.length) { el.hidden = true; G.state = prev; G.dlgAdvance = null; res(); }
      else show();
    };
    el.onclick = () => G.dlgAdvance && G.dlgAdvance();
    show();
  });
}

// =============================== effects ===============================
function mapText(u, text, col) { G.mapTexts.push({ x: (u.px + 0.5) * T, y: u.py * T + T * 0.1, text, col, t: 0, dur: 1.1 }); }
function sparkle(u, col) {
  for (let i = 0; i < 26; i++) G.particles.push({ x: (u.px + 0.2 + Math.random() * 0.6) * T, y: (u.py + 0.4 + Math.random() * 0.5) * T, vx: (Math.random() - .5) * 10, vy: -(20 + Math.random() * 40), life: 0, max: 0.9 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, col, glow: true });
}

// =============================== input ===============================
function setupInput() {
  const cv = G.cv;
  const firstGesture = () => { Snd.init(); if (G.state === 'title') Snd.music('title'); };
  addEventListener('pointerdown', firstGesture, { once: true });
  addEventListener('keydown', firstGesture, { once: true });
  addEventListener('keydown', e => {
    const k = e.key;
    const conf = k === 'Enter' || k === 'z' || k === 'Z' || k === ' ';
    const canc = k === 'Escape' || k === 'x' || k === 'X' || k === 'Backspace';
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(k)) e.preventDefault();
    if (G.state === 'title') { if (conf && $('#title').hidden === false && document.activeElement === document.body) { Snd.init(); startGame(); } return; }
    if (G.state === 'dialog') { if (conf || canc) G.dlgAdvance && G.dlgAdvance(); return; }
    if (G.state === 'levelup') { if (conf || canc) G.luClose && G.luClose(); return; }
    if (G.state === 'modal') { if (conf || canc) closeModal(); return; }
    if (G.state === 'battle') { if (conf || canc) Battle.skip(); return; }
    if (G.state === 'menu') {
      if (k === 'ArrowUp' || k === 'w') menuMove(-1); else if (k === 'ArrowDown' || k === 's') menuMove(1);
      else if (conf) menuConfirm(); else if (canc) menuCancel();
      return;
    }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (k === 'a' || k === 'A') { G.anims = !G.anims; toast(`戦闘アニメ <b>${G.anims ? 'ON' : 'OFF'}</b>`); return; }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1] }[k];
    if (dir) { moveCursor(dir[0], dir[1]); return; }
    if (conf) { onConfirm(); return; }
    if (canc) { onCancel(); return; }
    if (k === 'Tab') { cycleWeapon(); return; }
    if (k === 'i' || k === 'I') { infoAtCursor(); return; }
    if (k === 'd' || k === 'D') { if (G.state === 'idle') toggleDanger(); return; }
    if (k === 'e' || k === 'E') { if (G.state === 'idle') endPlayerTurn(); return; }
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  let ptr = null;
  const pinch = new Map();
  cv.addEventListener('pointerdown', e => {
    pinch.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.size === 2) { const [a, b] = [...pinch.values()]; ptr = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: G.z }; return; }
    ptr = { x: e.clientX, y: e.clientY, cx: G.cam.tx, cy: G.cam.ty, moved: false, button: e.button, type: e.pointerType };
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  });
  cv.addEventListener('pointermove', e => {
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr && ptr.pinch && pinch.size === 2) {
      const [a, b] = [...pinch.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      setZoom(ptr.z0 * d / ptr.pinch); return;
    }
    if (ptr && !ptr.pinch) {
      const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
      if (!ptr.moved && Math.hypot(dx, dy) > 9) ptr.moved = true;
      if (ptr.moved && G.map) { G.cam.tx = ptr.cx - dx / G.z; G.cam.ty = ptr.cy - dy / G.z; clampCam(true); }
      return;
    }
    if (e.pointerType === 'mouse' && G.map && (G.state === 'idle' || G.state === 'select')) {
      const [wx, wy] = s2w(e.clientX, e.clientY);
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (inMap(tx, ty)) setCursor(tx, ty);
    }
  });
  const up = e => {
    pinch.delete(e.pointerId);
    if (!ptr) return;
    const p = ptr; ptr = null;
    if (p.pinch || p.moved) return;
    if (p.button === 2) { if (G.state === 'menu') menuCancel(); else if (G.state === 'battle') Battle.skip(); else onCancel(); return; }
    onClick(e.clientX, e.clientY);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { pinch.delete(e.pointerId); ptr = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); if (!G.map || G.state === 'battle') return; setZoom(G.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
}
function setZoom(z) {
  G.zUser = clamp(z, Math.max(0.45, G.zFill || 0), 2); G.z = G.zUser;
  Spr.setCacheScale(G.z * G.dpr); clampCam(true);
}
function onClick(sx, sy) {
  if (G.state === 'battle') { Battle.skip(); return; }
  if (G.state === 'dialog') { G.dlgAdvance && G.dlgAdvance(); return; }
  if (G.state === 'levelup') { G.luClose && G.luClose(); return; }
  if (G.state === 'menu') { menuCancel(); return; }
  if (!G.map) return;
  const [wx, wy] = s2w(sx, sy);
  const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
  if (!inMap(tx, ty)) return;
  if (G.state === 'target') {
    const i = G.targets.findIndex(t => t.x === tx && t.y === ty);
    if (i < 0) { onCancel(); return; }
    if (i !== G.tIdx) { G.tIdx = i; pickWeapon(); focusTarget(); Snd.play('cursor'); return; }
    onConfirm(); return;
  }
  if (G.state !== 'idle' && G.state !== 'select') return;
  G.cur.x = tx; G.cur.y = ty;
  if (G.state === 'select') { updatePath(); }
  refreshPanels();
  onConfirm();
}

// =============================== main loop ===============================
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  G.time += dt;
  try { update(dt); render(); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}
function update(dt) {
  if (Battle.active()) { Battle.update(dt); return; }
  if (G.state === 'title' || !G.map) { G.titleT += dt; return; }
  if (G.state === 'loading' || !G.tb) return;
  updateMover(dt);
  const k = Math.min(1, dt * 9);
  G.cam.x += (G.cam.tx - G.cam.x) * k; G.cam.y += (G.cam.ty - G.cam.y) * k;
  const ck = Math.min(1, dt * 22);
  G.cur.sx += (G.cur.x - G.cur.sx) * ck; G.cur.sy += (G.cur.y - G.cur.sy) * ck;
  G.fade = Math.max(0, G.fade - dt * 1.2);
  for (const u of G.units) u.flash = Math.max(0, (u.flash || 0) - dt * 4);
  for (const t of G.mapTexts) t.t += dt;
  G.mapTexts = G.mapTexts.filter(t => t.t < t.dur);
  // ambient particles
  const dusk = G.ch.time === 'dusk';
  G.smokeT += dt;
  if (G.smokeT > 0.45) {
    G.smokeT = 0;
    for (const s of G.tb.smokes) if (!G.visited.has(s.key)) G.particles.push({ x: s.x + Math.random() * 2, y: s.y, vx: 4 + Math.random() * 3, vy: -9 - Math.random() * 4, life: 0, max: 4.2, size: 3, grow: 3.2, col: '200,200,205', smoke: true });
  }
  if (Math.random() < dt * (dusk ? 10 : 7)) {
    const [x0, y0] = s2w(0, 0), [x1, y1] = s2w(G.W, G.H);
    if (dusk) {
      const tr = G.tb.torches[Math.random() * G.tb.torches.length | 0];
      if (tr && Math.random() < 0.7) G.particles.push({ x: tr.x + (Math.random() - .5) * 8, y: tr.y, vx: (Math.random() - .5) * 10, vy: -20 - Math.random() * 25, life: 0, max: 1.6, size: 1.2 + Math.random(), col: '255,160,70', glow: true });
      else G.particles.push({ x: lerp(x0, x1, Math.random()), y: lerp(y0, y1, Math.random()), vx: 6, vy: -3, life: 0, max: 5, size: 1 + Math.random(), col: '255,200,140', glow: true, mote: true });
    } else {
      if (Math.random() < 0.5) G.particles.push({ x: lerp(x0, x1, Math.random()), y: lerp(y0, y1, Math.random()), vx: 8 + Math.random() * 6, vy: -2 + Math.random() * 4, life: 0, max: 5, size: 1 + Math.random() * 1.2, col: '255,250,200', glow: true, mote: true });
      else G.particles.push({ x: lerp(x0, x1, Math.random()) - 60, y: lerp(y0, y1, Math.random()) - 40, vx: 22 + Math.random() * 14, vy: 10 + Math.random() * 8, life: 0, max: 5, size: 2.4 + Math.random() * 1.5, col: Math.random() < 0.5 ? '150,190,80' : '214,190,90', leaf: true, rot: Math.random() * TAU, vr: (Math.random() - .5) * 4 });
    }
  }
  for (const p of G.particles) {
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.leaf) { p.rot += p.vr * dt; p.x += Math.sin(p.life * 2 + p.rot) * 0.3; }
    if (p.smoke) { p.vx *= 0.995; }
  }
  G.particles = G.particles.filter(p => p.life < p.max);
  if (G.particles.length > 260) G.particles.splice(0, G.particles.length - 260);
}

// =============================== rendering ===============================
function render() {
  const ctx = G.ctx, dpr = G.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (Battle.active()) { Battle.draw(ctx); return; }
  if (G.state === 'title' || !G.map) { renderTitle(ctx); return; }
  if (G.state === 'loading' || !G.tb) { ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, G.cv.width, G.cv.height); return; }
  ctx.fillStyle = '#06080d'; ctx.fillRect(0, 0, G.cv.width, G.cv.height);
  ctx.setTransform(dpr * G.z, 0, 0, dpr * G.z, dpr * (G.W / 2 - G.cam.x * G.z), dpr * (G.H / 2 - G.cam.y * G.z));
  const tb = G.tb, t = G.time, dusk = G.ch.time === 'dusk';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tb.canvas, 0, 0);
  drawWater(ctx);
  // visited villages: dim windows
  for (const k of G.visited) {
    const [x, y] = k.split(',').map(Number), x0 = x * T, y0 = y * T;
    const wL = x0 + T * 0.15, wR = x0 + T * 0.85, eave = y0 + T * 0.46;
    ctx.fillStyle = 'rgba(40,28,18,0.9)';
    for (const wx of [wL + T * 0.08, (wL + wR) / 2 - T * 0.16]) ctx.fillRect(wx, eave + 4.5, T * 0.11, T * 0.1);
  }
  // regions
  const pulse = 0.85 + 0.15 * Math.sin(t * 3);
  if (G.dangerView) drawRegion(ctx, G.dangerView.arr, G.dangerView.set, `rgba(150,40,170,${0.2 * pulse})`, 'rgba(220,120,255,0.75)');
  if (G.pinView) { drawRegion(ctx, G.pinView.move, G.pinView.moveSet, `rgba(255,120,80,${0.18 * pulse})`, 'rgba(255,170,130,0.6)'); drawRegion(ctx, G.pinView.atk, G.pinView.atkSet, `rgba(230,50,50,${0.26 * pulse})`, 'rgba(255,110,100,0.7)'); }
  const v = G.enemyView || G.hoverView;
  if (v) { drawRegion(ctx, v.move, v.moveSet, `rgba(255,120,80,${0.2 * pulse})`, 'rgba(255,170,130,0.6)'); drawRegion(ctx, v.atk, v.atkSet, `rgba(230,50,50,${0.24 * pulse})`, 'rgba(255,110,100,0.7)'); }
  if (G.rangeView) {
    drawRegion(ctx, G.rangeView.move, G.rangeView.moveSet, `rgba(60,130,255,${0.34 * pulse})`, 'rgba(160,210,255,0.9)');
    if (G.rangeView.heal) drawRegion(ctx, G.rangeView.atk, G.rangeView.atkSet, `rgba(60,220,140,${0.26 * pulse})`, 'rgba(140,255,190,0.7)');
    else drawRegion(ctx, G.rangeView.atk, G.rangeView.atkSet, `rgba(235,60,50,${0.3 * pulse})`, 'rgba(255,130,110,0.8)');
  }
  if (G.state === 'target') {
    for (const tg of G.targets) {
      const heal = G.mode === 'heal';
      ctx.fillStyle = heal ? `rgba(60,220,140,${0.3 * pulse})` : `rgba(235,60,50,${0.35 * pulse})`;
      ctx.fillRect(tg.x * T + 2, tg.y * T + 2, T - 4, T - 4);
    }
  }
  if (G.path.length > 1) drawPath(ctx, G.path);
  // units
  const us = G.units.filter(u => u.alive).sort((a, b) => a.py - b.py);
  for (const u of us) drawUnit(ctx, u);
  // flags
  for (const f of tb.flags) {
    ctx.save(); ctx.translate(f.x, f.y);
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let i = 0; i <= 8; i++) ctx.lineTo(i * 2.6, Math.sin(t * 5 - i * 0.7) * (i * 0.25));
    for (let i = 8; i >= 0; i--) ctx.lineTo(i * 2.6, 11 + Math.sin(t * 5 - i * 0.7) * (i * 0.25));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 20, 10); g.addColorStop(0, '#d23a3a'); g.addColorStop(1, '#6a1218');
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
  }
  // particles (smoke, leaves, motes)
  for (const p of G.particles) {
    const k = p.life / p.max;
    if (p.smoke) {
      const r = p.size + p.grow * p.life * 2.2, a = 0.32 * (1 - k) * Math.min(1, p.life * 3);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    } else if (p.leaf) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `rgba(${p.col},${Math.min(1, (1 - k) * 2)})`;
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  // cloud shadows
  if (!G.cloudPat) G.cloudPat = ctx.createPattern(G.cloud, 'repeat');
  ctx.save();
  ctx.beginPath(); ctx.rect(0, -T, tb.W, tb.H + T); ctx.clip();
  const ox = (t * 9) % (512 * 3), oy = (t * 4) % (512 * 3);
  ctx.translate(ox, oy); ctx.scale(3, 3);
  ctx.globalAlpha = dusk ? 0.22 : 0.42;
  ctx.fillStyle = G.cloudPat; ctx.fillRect(-ox / 3 - 512, -oy / 3 - 512, tb.W / 3 + 1024, tb.H / 3 + 1024);
  ctx.restore();
  // grade
  ctx.save();
  if (dusk) {
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(0, 0, tb.W, tb.H);
    g.addColorStop(0, '#8a7cb8'); g.addColorStop(0.55, '#d0a0a8'); g.addColorStop(1, '#f2b27a');
    ctx.fillStyle = g; ctx.fillRect(0, -T, tb.W, tb.H + T);
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of tb.torches) {
      const f = 0.85 + 0.1 * Math.sin(t * 11 + tr.x) + 0.05 * Math.sin(t * 23 + tr.y);
      const r = T * 2.6 * f;
      const g2 = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, r);
      g2.addColorStop(0, 'rgba(255,150,60,0.45)'); g2.addColorStop(0.4, 'rgba(255,110,40,0.14)'); g2.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tr.x, tr.y, r, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const fx = tr.x + Math.sin(t * 9 + i * 2 + tr.x) * 1.5, fy = tr.y + 3 - i * 4 - Math.abs(Math.sin(t * 13 + i)) * 3;
        const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 7 - i * 1.5);
        fg.addColorStop(0, 'rgba(255,240,180,0.95)'); fg.addColorStop(0.5, 'rgba(255,150,50,0.6)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 7 - i * 1.5, 0, TAU); ctx.fill();
      }
    }
  } else {
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(0, 0, tb.W, tb.H);
    g.addColorStop(0, 'rgba(255,236,190,0.55)'); g.addColorStop(1, 'rgba(50,80,140,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, -T, tb.W, tb.H + T);
  }
  ctx.restore();
  // glowing motes
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of G.particles) {
    if (!p.glow) continue;
    const k = p.life / p.max, a = (p.mote ? Math.sin(k * Math.PI) : 1 - k) * 0.9;
    const r = p.size * 3;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // cursor
  if (['idle', 'select', 'target', 'action', 'menu', 'busy'].includes(G.state) && G.phase === 'player' || G.phase === 'enemy') drawCursor(ctx);
  // floating texts
  for (const m of G.mapTexts) {
    const k = m.t / m.dur, y = m.y - Ease.outCubic(Math.min(1, k * 2)) * 18, a = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 20px "Cinzel", serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(m.text, m.x, y);
    ctx.fillStyle = m.col; ctx.fillText(m.text, m.x, y); ctx.restore();
  }
  // screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.35, G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, dusk ? 'rgba(10,0,12,0.6)' : 'rgba(0,4,12,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, G.W, G.H);
  if (G.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${G.fade})`; ctx.fillRect(0, 0, G.W, G.H); }
}
function drawWater(ctx) {
  const wc = G.waterCv, x = wc.getContext('2d'), w = wc.width, h = wc.height, t = G.time;
  if (!G.wavePat) G.wavePat = x.createPattern(G.wave, 'repeat');
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
  x.save(); x.globalAlpha = 0.8; const a = (t * 7) % 256, b = (t * 3) % 256; x.translate(a, b); x.fillStyle = G.wavePat; x.fillRect(-a - 256, -b - 256, w + 512, h + 512); x.restore();
  x.save(); x.globalAlpha = 0.5; x.scale(1.7, 1.7); const c = (t * 5) % 256, d = (t * 4) % 256; x.translate(-c, d); x.fillStyle = G.wavePat; x.fillRect(c - 256, -d - 256, w + 512, h + 512); x.restore();
  x.globalCompositeOperation = 'destination-in'; x.drawImage(G.tb.mask, 0, 0);
  x.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.globalAlpha = 0.5; ctx.drawImage(wc, 0, 0, G.tb.W, G.tb.H); ctx.restore();
}
function drawRegion(ctx, arr, set, fill, edge) {
  ctx.fillStyle = fill;
  for (const [x, y] of arr) ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath();
  for (const [x, y] of arr) {
    const x0 = x * T + 1, y0 = y * T + 1, x1 = x0 + T - 2, y1 = y0 + T - 2;
    if (!set.has(K(x, y - 1))) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
    if (!set.has(K(x, y + 1))) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
    if (!set.has(K(x - 1, y))) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
    if (!set.has(K(x + 1, y))) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
  }
  ctx.stroke();
}
function drawPath(ctx, path) {
  const pts = path.map(([x, y]) => [x * T + T / 2, y * T + T / 2]);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
  const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
  const ang = Math.atan2(ey - py, ex - px);
  pts[pts.length - 1] = [ex - Math.cos(ang) * 12, ey - Math.sin(ang) * 12];
  line(); ctx.strokeStyle = 'rgba(10,14,30,0.65)'; ctx.lineWidth = 15; ctx.stroke();
  line(); ctx.strokeStyle = '#f2d99c'; ctx.lineWidth = 10; ctx.stroke();
  line(); ctx.strokeStyle = '#c9884a'; ctx.lineWidth = 4; ctx.stroke();
  ctx.translate(ex, ey); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, -13); ctx.lineTo(-10, 13); ctx.closePath();
  ctx.fillStyle = '#f2d99c'; ctx.strokeStyle = 'rgba(10,14,30,0.7)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fill();
  ctx.restore();
}
function drawUnit(ctx, u) {
  const cx = (u.px + 0.5 + u.lx) * T, fy = (u.py + u.ly) * T + T * 0.86;
  const mounted = !!CLASSES[u.cls].mount;
  ctx.save();
  ctx.globalAlpha = u.fade;
  // shadow & ring
  const sg = ctx.createRadialGradient(cx + 4, fy + 1, 0, cx + 4, fy + 1, mounted ? 30 : 20);
  sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cx + 4, fy + 1, mounted ? 30 : 20, 7, 0, 0, TAU); ctx.fill();
  const col = u.team === 'player' ? (u.done ? '120,130,150' : '90,160,255') : '255,80,70';
  ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, fy + 1, 20, 6.5, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(${col},0.25)`; ctx.lineWidth = 5; ctx.stroke();
  if (u.boss) { ctx.strokeStyle = 'rgba(242,217,156,0.95)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(cx, fy + 1, 24, 8.5, 0, 0, TAU); ctx.stroke(); }
  // sprite
  const walking = u.moving || (u === G.sel && G.state === 'select');
  const fi = Math.floor(G.time * (walking ? 11 : 5) + u.ph) % 6;
  const img = Spr.mapSprite(u, walking ? 'walk' : 'idle', fi, u.done && u.team === 'player' && G.phase === 'player');
  ctx.translate(cx, fy);
  if (u.facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, -Spr.SPR_W / 2, -Spr.FOOT_Y, Spr.SPR_W, Spr.SPR_H);
  if (u.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = u.flash * u.fade; ctx.drawImage(img, -Spr.SPR_W / 2, -Spr.FOOT_Y, Spr.SPR_W, Spr.SPR_H); }
  ctx.restore();
  // hp bar
  if (u.fade > 0.5) {
    const w = 30, x = cx - w / 2, y = fy + 6, r = u.hp / u.maxhp;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = r > 0.5 ? '#7ee05a' : r > 0.25 ? '#f0c040' : '#f05a40'; ctx.fillRect(x, y, w * r, 3);
    if (u.boss) { ctx.fillStyle = '#f2d99c'; ctx.beginPath(); ctx.moveTo(x - 6, y + 1.5); ctx.lineTo(x - 3, y - 1.5); ctx.lineTo(x, y + 1.5); ctx.lineTo(x - 3, y + 4.5); ctx.fill(); }
  }
}
function drawCursor(ctx) {
  const x = G.cur.sx * T, y = G.cur.sy * T, p = 3 + Math.sin(G.time * 6) * 2.5, s = 15;
  ctx.save();
  ctx.fillStyle = 'rgba(255,240,200,0.09)'; ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
  ctx.lineCap = 'square';
  for (const [w, c] of [[6, 'rgba(10,12,24,0.7)'], [3, '#f2d99c']]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
    const a = -p + 2, b = T + p - 2;
    ctx.moveTo(x + a, y + a + s); ctx.lineTo(x + a, y + a); ctx.lineTo(x + a + s, y + a);
    ctx.moveTo(x + b - s, y + a); ctx.lineTo(x + b, y + a); ctx.lineTo(x + b, y + a + s);
    ctx.moveTo(x + a, y + b - s); ctx.lineTo(x + a, y + b); ctx.lineTo(x + a + s, y + b);
    ctx.moveTo(x + b - s, y + b); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + b - s);
    ctx.stroke();
  }
  ctx.restore();
}

// =============================== title scene ===============================
function paintTitle(W, H, dpr) {
  const cv = makeCanvas(W * dpr, H * dpr), c = cv.getContext('2d');
  c.scale(dpr, dpr);
  const nz = makeNoise(2024), hz = H * 0.66;
  const g = c.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#070b1e'); g.addColorStop(0.35, '#1b2a5a'); g.addColorStop(0.68, '#7a4a7a'); g.addColorStop(0.88, '#e48a6a'); g.addColorStop(1, '#ffd08a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // stars
  const r = mulberry32(3);
  for (let i = 0; i < 220; i++) { const y = Math.pow(r(), 2) * hz * 0.55; c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6 * (1 - y / (hz * 0.55))})`; c.fillRect(r() * W, y, 1.2, 1.2); }
  // sun
  const sx = W * 0.68, sy = hz * 0.98;
  const sg = c.createRadialGradient(sx, sy, 0, sx, sy, W * 0.6);
  sg.addColorStop(0, 'rgba(255,235,190,1)'); sg.addColorStop(0.05, 'rgba(255,200,130,0.8)'); sg.addColorStop(0.3, 'rgba(240,120,90,0.25)'); sg.addColorStop(1, 'rgba(120,60,120,0)');
  c.fillStyle = sg; c.fillRect(0, 0, W, H);
  const ridge = (base, amp, f, col, seed) => {
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) c.lineTo(x, base - amp * (nz.ridge(x * f + seed, seed * 0.3, 4) * 0.85 + nz.fbm(x * f * 2.5, seed, 3) * 0.3));
    c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
  };
  ridge(hz * 0.92, hz * 0.4, 0.0035, 'rgba(120,80,130,0.85)', 5);
  ridge(hz * 0.98, hz * 0.3, 0.005, '#4a3058', 17);
  // castle on far hill
  const cx = W * 0.7, cy = hz * 0.93, s = Math.min(W, H) * 0.0016;
  c.fillStyle = '#2c1c36';
  c.beginPath(); c.ellipse(cx, cy + 30 * s, 160 * s, 40 * s, 0, Math.PI, 0); c.fill();
  const towers = [[-90, 70, 16], [-45, 110, 20], [0, 150, 26], [48, 100, 18], [92, 64, 14]];
  c.fillRect(cx - 100 * s, cy - 40 * s, 200 * s, 70 * s);
  for (let x = -100; x < 100; x += 12) c.fillRect(cx + x * s, cy - 48 * s, 7 * s, 8 * s);
  for (const [dx, h, w] of towers) {
    c.fillRect(cx + (dx - w / 2) * s, cy - h * s, w * s, h * s);
    c.beginPath(); c.moveTo(cx + (dx - w / 2 - 4) * s, cy - h * s); c.lineTo(cx + dx * s, cy - (h + w * 1.6) * s); c.lineTo(cx + (dx + w / 2 + 4) * s, cy - h * s); c.fill();
  }
  c.fillStyle = 'rgba(255,190,110,0.9)';
  for (let i = 0; i < 14; i++) c.fillRect(cx + (r() * 180 - 90) * s, cy - (10 + r() * 90) * s, 2.2 * s + 0.6, 3.2 * s + 0.6);
  // valley mist
  const mg = c.createLinearGradient(0, hz * 0.85, 0, hz * 1.1);
  mg.addColorStop(0, 'rgba(255,180,150,0)'); mg.addColorStop(0.5, 'rgba(240,160,150,0.35)'); mg.addColorStop(1, 'rgba(255,180,150,0)');
  c.fillStyle = mg; c.fillRect(0, hz * 0.8, W, hz * 0.4);
  ridge(hz * 1.08, hz * 0.12, 0.008, '#24162e', 29);
  // trees on mid ridge
  c.fillStyle = '#1a1022';
  for (let x = 0; x < W; x += 6 + r() * 10) { const th = 10 + r() * 18, y = hz * 1.03 + nz.fbm(x * 0.01, 3, 2) * 14; c.beginPath(); c.moveTo(x - th * 0.3, y); c.lineTo(x, y - th); c.lineTo(x + th * 0.3, y); c.fill(); }
  c.fillRect(0, hz * 1.04, W, H);
  // foreground cliff
  c.beginPath(); c.moveTo(-10, H);
  const edgeX = W * 0.36, top = H * 0.8;
  c.lineTo(-10, top - H * 0.03);
  for (let x = 0; x <= edgeX; x += 6) c.lineTo(x, top - nz.fbm(x * 0.02, 9, 3) * 16 + (x / edgeX) * 4);
  c.lineTo(edgeX + 18, top + 30); c.lineTo(edgeX + 6, top + 80); c.lineTo(edgeX + 40, H); c.closePath();
  const cg = c.createLinearGradient(0, top, 0, H); cg.addColorStop(0, '#2a1a2a'); cg.addColorStop(1, '#0a060c');
  c.fillStyle = cg; c.fill();
  c.strokeStyle = 'rgba(255,170,120,0.45)'; c.lineWidth = 1.5; c.beginPath();
  for (let x = W * 0.05; x <= edgeX; x += 6) c.lineTo(x, top - nz.fbm(x * 0.02, 9, 3) * 16 + (x / edgeX) * 4);
  c.stroke();
  // grass silhouettes on cliff
  c.strokeStyle = '#120a14'; c.lineWidth = 1.2;
  for (let x = 0; x < edgeX; x += 3) { const y = top - nz.fbm(x * 0.02, 9, 3) * 16 + (x / edgeX) * 4; c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x + (r() - .3) * 5, y - 4 - r() * 8); c.stroke(); }
  return { cv, edgeX, top, nz };
}
function renderTitle(ctx) {
  const W = G.W, H = G.H, dpr = G.dpr, t = G.titleT;
  if (!G.titleBg) {
    G.titleBg = paintTitle(W, H, dpr);
    G.titleClouds = (() => {
      const cv = makeCanvas(W * 2, H * 0.6), c = cv.getContext('2d'), r = mulberry32(8);
      for (let i = 0; i < 16; i++) {
        const cx = r() * W * 2, cy = H * (0.1 + r() * 0.35), s = H * (0.03 + r() * 0.05);
        for (let k = 0; k < 10; k++) {
          const x = cx + (r() - .5) * s * 6, y = cy + (r() - .5) * s, rr = s * (0.6 + r() * 0.9);
          const g = c.createRadialGradient(x, y + rr * 0.3, 0, x, y, rr);
          g.addColorStop(0, 'rgba(255,170,140,0.32)'); g.addColorStop(0.6, 'rgba(120,70,130,0.18)'); g.addColorStop(1, 'rgba(60,40,90,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
        }
      }
      return cv;
    })();
    G.titleHero = makeUnit('lionel', HEROES.lionel, 'player', 0, 0);
    G.titleMotes = [];
  }
  const bg = G.titleBg;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg.cv, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // god rays
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const sx = W * 0.68, sy = H * 0.66 * 0.98;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.22 + Math.sin(t * 0.15 + i) * 0.04;
    const len = H * 0.9, wd = 0.05 + (i % 3) * 0.02;
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,200,150,${0.08 + 0.04 * Math.sin(t * 0.6 + i * 1.7)})`); g.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - wd) * len, sy + Math.sin(a - wd) * len); ctx.lineTo(sx + Math.cos(a + wd) * len, sy + Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const off = (t * 8) % (W * 2);
  ctx.drawImage(G.titleClouds, -off, 0, W * 2, H * 0.6); ctx.drawImage(G.titleClouds, W * 2 - off, 0, W * 2, H * 0.6);
  // birds
  ctx.strokeStyle = 'rgba(20,10,24,0.8)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const bx = ((t * (18 + i * 3) + i * 140) % (W + 200)) - 100, by = H * (0.3 + i * 0.03) + Math.sin(t * 0.8 + i) * 10, f = Math.sin(t * 8 + i) * 4;
    ctx.beginPath(); ctx.moveTo(bx - 7, by - f); ctx.quadraticCurveTo(bx - 3, by - 2, bx, by); ctx.quadraticCurveTo(bx + 3, by - 2, bx + 7, by - f); ctx.stroke();
  }
  // hero on the cliff
  const hs = Math.min(H * 0.0042, W * 0.006);
  const hx = bg.edgeX - 40 * hs, hy = bg.top + 2;
  const p = Spr.idlePose(G.titleHero, t);
  p.t = t; p.capeWind = 6 + Math.sin(t * 1.3) * 3; p.armF = [0.35, 0.95]; p.wa = 0.25; p.lean = 0.02;
  const hw = 150 * hs, hh = 110 * hs;
  if (!G.heroCv || G.heroCv.width !== Math.ceil(hw * dpr)) G.heroCv = makeCanvas(hw * dpr, hh * dpr);
  const hc = G.heroCv.getContext('2d');
  hc.setTransform(1, 0, 0, 1, 0, 0); hc.clearRect(0, 0, G.heroCv.width, G.heroCv.height);
  hc.setTransform(hs * dpr, 0, 0, hs * dpr, hw / 2 * dpr, (hh - 6 * hs) * dpr);
  Spr.drawFigure(hc, G.titleHero, p);
  hc.setTransform(1, 0, 0, 1, 0, 0);
  hc.globalCompositeOperation = 'source-atop';
  const lg = hc.createLinearGradient(0, 0, G.heroCv.width, 0);
  lg.addColorStop(0, 'rgba(18,10,30,0.82)'); lg.addColorStop(0.55, 'rgba(40,20,44,0.62)'); lg.addColorStop(1, 'rgba(255,150,100,0.18)');
  hc.fillStyle = lg; hc.fillRect(0, 0, G.heroCv.width, G.heroCv.height);
  hc.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.shadowColor = 'rgba(255,160,110,0.7)'; ctx.shadowBlur = 12;
  ctx.drawImage(G.heroCv, hx - hw / 2, hy - hh + 6 * hs, hw, hh);
  ctx.restore();
  // embers
  if (Math.random() < 0.5) G.titleMotes.push({ x: Math.random() * W, y: H + 10, vx: (Math.random() - .3) * 20, vy: -(20 + Math.random() * 40), life: 0, max: 6 + Math.random() * 4, s: 1 + Math.random() * 2 });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const m of G.titleMotes) {
    m.life += 1 / 60; m.x += m.vx / 60 + Math.sin(m.life * 2 + m.s) * 0.3; m.y += m.vy / 60;
    const a = Math.sin(Math.min(1, m.life / m.max) * Math.PI) * 0.8;
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.s * 4);
    g.addColorStop(0, `rgba(255,190,120,${a})`); g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.s * 4, 0, TAU); ctx.fill();
  }
  ctx.restore();
  G.titleMotes = G.titleMotes.filter(m => m.life < m.max);
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

init();
