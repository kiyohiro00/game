// 焚火 ― 全体のつなぎ込み（描画ループ・操作・カメラ・UI）
import * as THREE from '../lib/three.module.js';
import { FireFluid, makeFireMesh, DOMAIN } from './fluid.js';
import { Hearth, NODES, MAX_PIECES } from './wood.js';
import { PieceView, setLogTime, makeEmberBed, staticPiece } from './logs.js';
import { buildScene } from './scene.js';
import { Post } from './post.js';
import { Sparks } from './sparks.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16/9, 0.05, 600);
const env = buildScene(scene);
const hearth = new Hearth();
hearth.stones = env.stones;
const fluid = new FireFluid(renderer);
const fireBack = makeFireMesh(fluid, 0.0, 0.66);
const fireFront = makeFireMesh(fluid, 0.27, 0.46);
scene.add(fireBack, fireFront);
const bed = makeEmberBed();
scene.add(bed);
const sparks = new Sparks(scene);
const post = new Post(renderer);
const sound = new Sound();

// ───────── 状態 ─────────
const views = new Map();
let viewVersion = -1;
let time = 0, started = false, litAt = -1;
let wind = 0, gust = 0;
let exposure = 2.6;
const cam = { yaw: 0, pitch: 0, lean: 0, leanT: 0, blowLean: 0 };
const CAM_BASE = new THREE.Vector3(0, 0.88, 1.9), CAM_LOOK = new THREE.Vector3(0, 0.36, 0);
const mouse = { x: 0, y: 0, nx: 0, ny: -0.2, down: false, moved: 0, button: 0 };
let tool = 'hand';            // hand | tinder | kindling | log | match
let held = null;              // { mesh, kind, L, r, shape, seed, roll, yaw, tilt }
let drag = null;              // { piece, plane }
let looking = false;
const match = { state: 'none', t: 0, mesh: null, pos: new THREE.Vector3(), smokeT: 0 };
const blow = { held: false, amount: 0, breath: 1, pos: new THREE.Vector3(0, 0.1, 0) };
const hover = { point: new THREE.Vector3(0, 0, 0), piece: null, s: 0.5, pick: null, valid: false };
const ray = new THREE.Raycaster();
let uiIdle = 0, uiHidden = false;
let hintText = '', hintStage = 0, hintDoneAt = -1;

// マッチ棒
{
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.0022, 0.0022), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.8 }));
  stick.position.x = -0.023;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.7, emissive: new THREE.Color(1, 0.4, 0.1), emissiveIntensity: 0 }));
  g.add(stick, head); g.visible = false; g.userData.head = head; g.userData.stick = stick;
  scene.add(g); match.mesh = g;
  // 炎は涙形のグラデーションを貼った板で描く（流体の格子より小さいため）
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128;
  const fx = fc.getContext('2d');
  const gr = fx.createRadialGradient(32, 92, 2, 32, 80, 46);
  gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,205,105,0.95)'); gr.addColorStop(0.6, 'rgba(255,120,30,0.5)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  fx.fillStyle = gr; fx.beginPath(); fx.moveTo(32, 4); fx.bezierCurveTo(52, 60, 56, 92, 32, 122); fx.bezierCurveTo(8, 92, 12, 60, 32, 4); fx.fill();
  fx.globalCompositeOperation = 'source-atop';
  const bl = fx.createLinearGradient(0, 96, 0, 124); bl.addColorStop(0, 'rgba(60,110,255,0)'); bl.addColorStop(1, 'rgba(60,110,255,0.75)');
  fx.fillStyle = bl; fx.fillRect(0, 90, 64, 38);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(3.2, 3.0, 2.6) }));
  sp.center.set(0.5, 0.06); sp.visible = false; sp.renderOrder = 11;
  scene.add(sp); match.flame = sp;
}

// ───────── 画面サイズ ─────────
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const pw = Math.floor(w*pixelRatio), ph = Math.floor(h*pixelRatio);
  post.setSize(pw, ph);
  camera.aspect = w/h;
  // 縦長の画面では画角を広げて炉全体が入るようにする
  camera.fov = w/h < 1.2 ? 50 + (1.2 - w/h)*42 : 50;
  camera.updateProjectionMatrix();
  sparks.points.material.uniforms.uScale.value = ph;
}
window.addEventListener('resize', resize);

// ───────── 視線と当たり ─────────
function rayToPieces(o, d) {
  // 視線と各薪（太さのある線分）の最近点を調べる
  let best = null, bt = 1e9;
  for (const p of hearth.pieces) {
    const ax = p.p0.x, ay = p.p0.y, az = p.p0.z;
    const ux = p.p1.x - ax, uy = p.p1.y - ay, uz = p.p1.z - az;
    const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
    const a = 1, b = d.x*ux + d.y*uy + d.z*uz, c = ux*ux + uy*uy + uz*uz;
    const dd = d.x*wx + d.y*wy + d.z*wz, e = ux*wx + uy*wy + uz*wz;
    const den = a*c - b*b;
    let s = den > 1e-9 ? (a*e - b*dd)/den : 0.5;
    s = Math.max(0, Math.min(1, s));
    const t = b*s - dd;
    if (t < 0) continue;
    const px = o.x + d.x*t - (ax + ux*s), py = o.y + d.y*t - (ay + uy*s), pz = o.z + d.z*t - (az + uz*s);
    const dist = Math.hypot(px, py, pz);
    const rr = Math.max(p.rc*1.25, 0.012);
    if (dist < rr && t < bt) { bt = t; best = { piece: p, s, t }; }
  }
  return best;
}

function updateHover() {
  ray.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  hover.piece = null; hover.pick = null; hover.valid = false;
  const hit = rayToPieces(o, d);
  let tG = 1e9;
  if (d.y < -1e-4) tG = (hearth.bedHeight()*0.5 - o.y)/d.y;
  if (hit && hit.t < tG) {
    hover.piece = hit.piece; hover.s = hit.s;
    hit.piece.nodePos(0, hover.point).lerpVectors(hit.piece.p0, hit.piece.p1, hit.s);
    hover.point.y += hit.piece.rc;
    hover.valid = true;
  } else if (tG < 6) {
    hover.point.copy(o).addScaledVector(d, tG);
    hover.valid = true;
  } else {
    hover.point.copy(o).addScaledVector(d, 1.3);
  }
  // 炉の外へ行きすぎないように
  const r = Math.hypot(hover.point.x, hover.point.z);
  if (r > 0.8) { hover.point.x *= 0.8/r; hover.point.z *= 0.8/r; if (!hover.piece) hover.point.y = Math.max(hover.point.y, 0); }
  // 手元の道具
  if (tool === 'hand' && !hover.piece && !drag) {
    const hits = ray.intersectObjects(env.pick, true);
    if (hits.length && hits[0].distance < 4) hover.pick = hits[0].object.userData.pick;
  }
}

// ───────── 道具の持ち替え ─────────
const TOOL_NAMES = { hand: '火ばさみ', tinder: '火口', kindling: '細枝', log: '薪', match: 'マッチ' };
function newHeld(kind) {
  if (held) { scene.remove(held.mesh); held.mesh.material.dispose(); held = null; }
  if (kind !== 'tinder' && kind !== 'kindling' && kind !== 'log') return;
  const R = Math.random;
  let L, r;
  if (kind === 'tinder') { L = 0.10; r = 0.042; }
  else if (kind === 'kindling') { L = 0.25 + R()*0.09; r = 0.006 + R()*0.003; }
  else { L = 0.33 + R()*0.07; r = 0.033 + R()*0.014; }
  const shape = Math.floor(R()*1e6), seed = R()*1000;
  const mesh = staticPiece(kind, shape, L, r, seed);
  mesh.castShadow = true;
  scene.add(mesh);
  const prev = held;
  held = { mesh, kind, L, r, shape, seed, roll: R()*6.28, yaw: (R() - 0.5)*0.6, tilt: kind === 'kindling' ? 0.95 : kind === 'log' ? 0.38 : 0 };
  if (prev && prev.kind === kind) { held.tilt = prev.tilt; }
}
function setTool(t) {
  if (match.state === 'lit' || match.state === 'strike') endMatch(false);
  const keepTilt = held && held.kind === t ? held.tilt : null;
  tool = t;
  newHeld(t);
  if (held && keepTilt !== null) held.tilt = keepTilt;
  if (t === 'match') strikeMatch();
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.tool === t);
  wakeUI();
}
function strikeMatch() {
  match.state = 'strike'; match.t = 0; match.mesh.visible = true;
  sound.matchStrike();
}
function endMatch(dropped) {
  if (match.state === 'lit') { match.smokeT = 1.4; sound.matchOut(); }
  match.state = 'none'; match.mesh.visible = false; match.flame.visible = false; hearth.match.lit = false;
  env.matchLight.intensity = 0;
}

const _dir = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
function heldPose() {
  // カーソルの指す場所の真上に、炉の中心へ向けて立てかける姿勢で構える
  const hp = hover.point;
  let tx = -hp.x, tz = -hp.z; const l = Math.hypot(tx, tz);
  if (l < 0.03) { tx = 1; tz = 0; } else { tx /= l; tz /= l; }
  const ca = Math.cos(held.yaw), sa = Math.sin(held.yaw);
  const hx = tx*ca - tz*sa, hz = tx*sa + tz*ca;
  const ct = Math.cos(held.tilt), st = Math.sin(held.tilt);
  _dir.set(hx*ct, st, hz*ct);
  _c.copy(hp); _c.y += held.r + 0.035 + held.L*0.5*Math.abs(st);
  // 立てかけるときは、下端がカーソルの位置に来るように
  if (held.tilt > 0.2) { _c.x += hx*ct*held.L*0.5; _c.z += hz*ct*held.L*0.5; }
}
function placeHeld() {
  if (!held) return;
  if (hearth.pieces.length >= MAX_PIECES) { flashHint('炉がいっぱいだ。燃え落ちるのを待とう'); return; }
  heldPose();
  const p = hearth.addPiece(held.kind, _c, _dir, { L: held.L, r: held.r, shape: held.shape });
  if (!p) return;
  p.seed = held.seed; p.roll = held.roll;
  p.q0.y += 0.004; p.q1.y += 0.004;   // そっと落とす
  newHeld(held.kind);
}

// ───────── 入力 ─────────
function wakeUI() { uiIdle = 0; if (uiHidden) { uiHidden = false; document.body.classList.remove('idle'); } }
function setMouse(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.nx = e.clientX/window.innerWidth*2 - 1; mouse.ny = -(e.clientY/window.innerHeight*2 - 1);
}
canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
  setMouse(e); wakeUI();
  if (looking) {
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    cam.yaw = THREE.MathUtils.clamp(cam.yaw - dx*0.0028, -1.15, 1.15);
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - dy*0.0028, -0.32, 1.25);
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  setMouse(e); wakeUI(); mouse.moved = 0; mouse.button = e.button;
  canvas.setPointerCapture(e.pointerId);
  updateHover();
  if (e.button === 2 || e.button === 1) { looking = true; return; }
  if (tool === 'match') { if (match.state === 'lit') endMatch(true); setTool('hand'); return; }
  if (held) { placeHeld(); return; }
  if (hover.piece) {
    // 火ばさみでつかむ：つかんだ点を通り、視線に垂直な面の上を動かす
    const n = camera.getWorldDirection(new THREE.Vector3());
    const pt = new THREE.Vector3().lerpVectors(hover.piece.p0, hover.piece.p1, hover.s);
    drag = { piece: hover.piece, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, pt) };
    hover.piece.grab = { s: hover.s, target: pt.clone() };
    document.body.classList.add('grab');
    return;
  }
  if (hover.pick) { setTool(hover.pick); return; }
  looking = true;
});
function endPointer(e) {
  if (drag) { drag.piece.grab = null; drag = null; document.body.classList.remove('grab'); }
  if (looking && mouse.button === 2 && mouse.moved < 4 && tool !== 'hand') setTool('hand');
  looking = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); wakeUI();
  if (held) held.yaw += Math.sign(e.deltaY)*0.26;
  else cam.leanT = THREE.MathUtils.clamp(cam.leanT - Math.sign(e.deltaY)*0.2, 0, 1);
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Space') { blow.held = true; e.preventDefault(); return; }
  if (e.repeat) return;
  wakeUI();
  switch (e.key.toLowerCase()) {
    case '1': setTool('tinder'); break;
    case '2': setTool('kindling'); break;
    case '3': setTool('log'); break;
    case '4': case 'm': setTool('match'); break;
    case '0': case 'escape': setTool('hand'); $('help').classList.remove('show'); break;
    case 'q': if (held) held.tilt = Math.max(0, held.tilt - 0.19); break;
    case 'e': if (held) held.tilt = Math.min(1.35, held.tilt + 0.19); break;
    case 'h': case '?': $('help').classList.toggle('show'); break;
    case 'f': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); break;
    case 'u': document.body.classList.toggle('noui'); break;
  }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') blow.held = false; });
window.addEventListener('blur', () => { blow.held = false; });
for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => { if (started) setTool(tool === b.dataset.tool ? 'hand' : b.dataset.tool); });
for (const b of document.querySelectorAll('#pace button')) b.addEventListener('click', () => {
  hearth.pace = parseFloat(b.dataset.pace);
  for (const o of document.querySelectorAll('#pace button')) o.classList.toggle('on', o === b);
});
$('btnHelp').addEventListener('click', () => $('help').classList.toggle('show'));
$('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').classList.remove('show'); });
$('blowBtn').addEventListener('pointerdown', (e) => { blow.held = true; e.preventDefault(); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('blowBtn').addEventListener(ev, () => { blow.held = false; });

// ───────── 手引き ─────────
let flashT = 0, flashMsg = '';
function flashHint(msg) { flashMsg = msg; flashT = 4; }
function updateHints(dt) {
  const P = hearth.pieces;
  const nT = P.filter(p => p.kind === 'tinder').length, nK = P.filter(p => p.kind === 'kindling').length, nL = P.filter(p => p.kind === 'log').length;
  const burning = hearth.intensity > 0.03;
  const logsBurning = P.some(p => p.kind === 'log' && p.burning);
  let msg = '';
  if (hintStage < 5) {
    if (logsBurning && hearth.intensity > 0.5) { if (hintStage !== 4) { hintStage = 4; hintDoneAt = time + 16; } }
    else if (burning && hintStage < 4) hintStage = 3;
    else if (!burning && hintStage < 3) hintStage = nT === 0 && !hearth.everLit ? 0 : nK < 4 ? 1 : 2;
    msg = [
      '切り株の上の火口（ほくち）を手に取り、炉のまんなかに置く',
      '細枝を、火口に立てかけるように五、六本。空気の通り道を残して',
      'マッチを擦り、火口にそっと近づける',
      '細枝に火が移ったら、薪を二、三本。寄り添わせるようにくべる　／　弱いときは Space 長押しで息を吹く',
      'あとは、ただ火を見つめる。弱くなったら薪をくべ、熾（おき）に息を吹きかける',
    ][hintStage];
    if (hintStage === 4 && time > hintDoneAt) { hintStage = 5; msg = ''; }
  } else {
    // 手引きが済んだあとは、火が落ちたときだけそっと知らせる
    if (!burning && hearth.bed.E > 0.25 && nL === 0) msg = '熾が残っている。薪をのせて息を吹けば、また燃え上がる';
    else if (!burning && hearth.bed.E < 0.05 && hearth.glowPower < 0.02 && hearth.everLit && P.every(p => p.maxT < 150)) msg = '火が消えた。もういちど、火口から';
  }
  if (flashT > 0) { flashT -= dt; msg = flashMsg; }
  if (held) {
    const k = held.kind === 'tinder' ? 'クリックで置く' : 'クリックで置く　ホイール：向き　Q / E：傾き';
    msg = msg ? msg + '<span class="sub">' + k + '　右クリック：手を空ける</span>' : '<span class="sub">' + k + '　右クリック：手を空ける</span>';
  } else if (tool === 'match' && match.state === 'lit') {
    msg = (msg || '') + '<span class="sub">火を近づけてしばらく待つ　クリックで捨てる</span>';
  }
  if (msg !== hintText) { hintText = msg; const h = $('hint'); h.innerHTML = msg; h.classList.toggle('show', !!msg); }
}

// ───────── 1フレーム ─────────
const emitters = [];
const _camPos = new THREE.Vector3(), _p = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, slowStrikes = 0, uiTick = 0, lightFl = 0, lightFl2 = 0, flash = 0;

function update(dt) {
  time += dt;
  // 風：ゆるやかな流れに、ときどき突風
  gust += (Math.random() - 0.5)*dt*1.6; gust *= Math.exp(-dt*0.35);
  wind = THREE.MathUtils.clamp(0.28*Math.sin(time*0.043) + 0.18*Math.sin(time*0.11 + 2) + gust, -1, 1);
  hearth.wind = wind;

  updateCamera(dt);
  updateHover();

  // 息
  if (blow.held && blow.breath > 0.02) { blow.amount += (1 - blow.amount)*Math.min(1, dt*5); blow.breath -= dt/3.4; }
  else { blow.amount *= Math.exp(-dt*7); blow.breath = Math.min(1, blow.breath + dt/1.6); if (blow.breath < 0.3 && blow.held) blow.amount *= 0.9; }
  if (hover.valid && Math.hypot(hover.point.x, hover.point.z) < 0.6) blow.pos.lerp(_v.copy(hover.point).setY(Math.min(0.35, hover.point.y + 0.03)), 0.2);
  else blow.pos.lerp(_v.set(0, 0.1, 0), 0.1);
  hearth.blow.amount = blow.amount; hearth.blow.pos.copy(blow.pos);
  $('blowBtn').classList.toggle('on', blow.amount > 0.2);

  // マッチ
  if (match.state !== 'none') {
    match.t += dt;
    match.pos.copy(hover.point); match.pos.y += 0.022;
    if (!hover.valid) match.pos.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 1.1);
    match.mesh.position.copy(match.pos);
    match.mesh.rotation.set(0, 0.5, -0.55);
    if (match.state === 'strike' && match.t > 0.24) { match.state = 'lit'; match.t = 0; flash = 0.5; }
    if (match.state === 'lit') {
      hearth.match.lit = true; hearth.match.pos.copy(match.pos);
      const burn = match.t/11;
      match.mesh.userData.stick.material.color.setRGB(0.85 - 0.8*burn, 0.76 - 0.72*burn, 0.6 - 0.57*burn);
      env.matchLight.position.copy(match.pos); env.matchLight.position.y += 0.02;
      const mf = 0.85 + 0.12*Math.sin(time*23) + 0.08*Math.sin(time*37.7);
      env.matchLight.intensity = 0.2*mf*(1 + flash*3);
      match.flame.visible = true; match.flame.position.copy(match.pos);
      match.flame.scale.set(0.017*(1 + flash*1.5), 0.04*mf*(1 + flash*1.2)*(1 - 0.35*burn), 1);
      if (match.t > 11 || (blow.amount > 0.6 && Math.random() < dt*3)) { endMatch(false); setTool('hand'); }
    }
  }
  if (match.smokeT > 0) match.smokeT -= dt;
  flash *= Math.exp(-dt*5);

  // 手に持った薪
  if (held) {
    heldPose();
    held.mesh.position.copy(_c);
    _q.setFromUnitVectors(_x, _dir); _q2.setFromAxisAngle(_x, held.roll);
    held.mesh.quaternion.copy(_q).multiply(_q2);
  }
  // 火ばさみ
  if (drag) {
    ray.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), camera);
    if (ray.ray.intersectPlane(drag.plane, _p)) {
      _p.y = Math.max(_p.y, 0.02);
      const r = Math.hypot(_p.x, _p.z); if (r > 1.1) { _p.x *= 1.1/r; _p.z *= 1.1/r; }
      drag.piece.grab.target.copy(_p);
    }
    if (!hearth.pieces.includes(drag.piece)) { drag = null; document.body.classList.remove('grab'); }
  }

  hearth.update(dt);
  if (litAt < 0 && hearth.everLit) litAt = time;

  // 薪の見た目を同期
  if (viewVersion !== hearth.version) {
    viewVersion = hearth.version;
    const alive = new Set(hearth.pieces.map(p => p.id));
    for (const [id, v] of views) if (!alive.has(id)) { scene.remove(v.mesh); v.dispose(); views.delete(id); }
    for (const p of hearth.pieces) if (!views.has(p.id)) { const v = new PieceView(p); views.set(p.id, v); scene.add(v.mesh); }
  }
  for (const v of views.values()) v.sync();
  setLogTime(time);

  // 出来事 → 音と火の粉
  for (const e of hearth.events) {
    const pan = THREE.MathUtils.clamp(e.x/0.55, -1, 1);
    if (e.type === 'crackle') {
      sound.crackle(e.power, pan);
      if (e.power > 0.72) { sparks.emit(e.x, e.y, e.z, 1 + Math.floor(e.power*e.power*6), e.power); lightFl2 += e.power*0.25; }
    } else if (e.type === 'spark') {
      sparks.emit(e.x, e.y, e.z, 1 + Math.floor(Math.random()*3), 0.7);
      if (Math.random() < 0.3) sound.crackle(0.1, pan);
    } else if (e.type === 'crumble') {
      sound.crumble(e.power, pan);
      sparks.emit(e.x, e.y, e.z, Math.floor(8 + 26*e.power), 0.9);
    } else if (e.type === 'knock') {
      sound.knock(e.power, e.kind, pan);
      if (e.hot) sparks.emit(e.x, e.y, e.z, Math.floor(4 + 14*e.power), 0.8);
    }
  }
  if (drag && drag.piece.maxT > 400 && Math.random() < dt*6) sparks.emit(drag.piece.p0.x, drag.piece.p0.y, drag.piece.p0.z, 2, 0.6);
  const I = hearth.intensity, G = hearth.glowPower;
  if (I > 0.05 && Math.random() < I*dt*0.7) sparks.emit(hearth.centroid.x + (Math.random() - 0.5)*0.2, hearth.centroid.y, hearth.centroid.z + (Math.random() - 0.5)*0.2, 1, 0.4);

  // 流体へ発生源を渡す（カメラから見て z=0 面へ投影）
  hearth.collectEmitters(emitters);
  if (match.state === 'lit') emitters.unshift({ x: match.pos.x, y: match.pos.y + 0.03, z: match.pos.z, r: 0.02, fuel: 0, heat: 1.2, smoke: 0.05 });
  else if (match.smokeT > 0) emitters.unshift({ x: match.pos.x, y: match.pos.y, z: match.pos.z, r: 0.014, fuel: 0, heat: 0.5, smoke: 1.5*match.smokeT });
  _camPos.copy(camera.position);
  for (const e of emitters) {
    const s = _camPos.z/Math.max(0.2, _camPos.z - e.z);
    e.x = _camPos.x + (e.x - _camPos.x)*s; e.y = _camPos.y + (e.y - _camPos.y)*s; e.r *= s;
  }
  fluid.setEmitters(emitters);
  fluid.wind = wind*1.5;
  {
    const s = _camPos.z/Math.max(0.2, _camPos.z - blow.pos.z);
    fluid.blowPos.set(_camPos.x + (blow.pos.x - _camPos.x)*s - DOMAIN.x0, _camPos.y + (blow.pos.y - _camPos.y)*s - DOMAIN.y0);
    fluid.blow = blow.amount*0.35;
  }
  fluid.update(dt);

  // 炎の板
  for (const m of [fireBack, fireFront]) {
    const u = m.material.uniforms;
    u.uDye.value = fluid.texture; u.uTime.value = time; u.uCam.value.copy(_camPos);
    u.uSmokeLit.value.setRGB(0.55*Math.min(1.5, I + G*0.4), 0.2*Math.min(1.5, I + G*0.3), 0.05*Math.min(1.5, I));
  }

  // 火の明かり：炎の量に合わせて明滅し、影が踊る
  lightFl += (Math.random() - 0.5)*dt*14; lightFl *= Math.exp(-dt*7);
  lightFl2 *= Math.exp(-dt*9);
  const fl = Math.max(0.35, 1 + lightFl*0.55 + 0.07*Math.sin(time*11.3) + 0.05*Math.sin(time*23.7) + lightFl2);
  const Ivis = Math.pow(Math.min(2.2, I), 0.8);
  env.fireLight.intensity = 2.6*Ivis*fl + flash*0.2;
  const hgt = 0.14 + 0.3*Math.sqrt(Math.min(2, I));
  env.fireLight.position.set(hearth.centroid.x + lightFl*0.05 + 0.02*Math.sin(time*9.1), hearth.centroid.y + hgt + 0.03*Math.sin(time*13.3), hearth.centroid.z + 0.03*Math.sin(time*7.7));
  env.fireLight.color.setRGB(1.0, 0.40 + 0.09*Math.min(1, I), 0.105 + 0.06*Math.min(1, I));
  env.fireLight.castShadow = env.fireLight.intensity > 0.02;
  env.emberLight.intensity = 0.55*Math.min(2, G)*(0.9 + 0.1*Math.sin(time*2.3)) ;
  env.emberLight.position.y = hearth.bedHeight() + 0.09;

  // 熾床
  const bu = bed.userData.u;
  bu.uBedH.value = hearth.bedHeight(); bu.uBedE.value += (hearth.bed.E - bu.uBedE.value)*Math.min(1, dt*3);
  bu.uCoal.value = hearth.bed.coal; bu.uAsh.value = hearth.bed.ash; bu.uBlow.value = blow.amount;

  sparks.update(dt, wind, hearth.centroid.y + 0.3 + 0.5*Math.min(1.5, I));
  env.update(time, dt);

  // 眼の順応：火が強いと周りは闇に沈み、熾だけになると星が見えてくる
  const lum = Ivis + 0.8*Math.min(1.5, G) + (match.state === 'lit' ? 0.05 : 0);
  const target = THREE.MathUtils.clamp(1.25/(0.42 + 1.45*lum), 0.5, 3.0);
  exposure += (target - exposure)*Math.min(1, dt*(target < exposure ? 1.6 : 0.22));
  const pu = post.u;
  pu.uExposure.value = exposure; pu.uTime.value = time;
  pu.uHaze.value = 0.0045*Math.min(1.4, I + G*0.25);
  pu.uWarm.value = Math.min(1.5, I);
  _p.set(hearth.centroid.x, 0.12, 0).project(camera); pu.uFireA.value.set(_p.x*0.5 + 0.5, _p.y*0.5 + 0.5, 0.075*(1.9/_camPos.z));
  _p.set(hearth.centroid.x + wind*0.35, 1.9, 0).project(camera); pu.uFireB.value.set(_p.x*0.5 + 0.5, _p.y*0.5 + 0.5, 0);

  // UI
  uiTick -= dt;
  if (uiTick <= 0) {
    uiTick = 0.25; updateHints(0.25);
    if (litAt >= 0) { const s = Math.floor(time - litAt); $('elapsed').textContent = `${String(Math.floor(s/3600)).padStart(2, '0')}:${String(Math.floor(s/60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    const tip = $('tip');
    if (hover.pick && tool === 'hand') { tip.textContent = TOOL_NAMES[hover.pick]; tip.style.left = mouse.x + 16 + 'px'; tip.style.top = mouse.y + 12 + 'px'; tip.classList.add('show'); canvas.style.cursor = 'pointer'; }
    else { tip.classList.remove('show'); canvas.style.cursor = hover.piece && tool === 'hand' ? 'grab' : ''; }
  }
  uiIdle += dt;
  if (!uiHidden && uiIdle > 7 && !held && tool === 'hand' && !$('help').classList.contains('show')) { uiHidden = true; document.body.classList.add('idle'); }

  sound.update(dt, { intensity: I, glow: G, hiss: hearth.hiss, wind, blow: blow.amount });
}

function updateCamera(dt) {
  cam.lean += (cam.leanT - cam.lean)*Math.min(1, dt*3);
  cam.blowLean += ((blow.amount > 0.1 ? 1 : 0) - cam.blowLean)*Math.min(1, dt*2.5);
  const ln = Math.min(1, cam.lean + cam.blowLean*0.22);
  camera.position.set(
    CAM_BASE.x + 0.006*Math.sin(time*0.31),
    CAM_BASE.y - 0.2*ln + 0.0045*Math.sin(time*1.25) + 0.002*Math.sin(time*0.53),
    CAM_BASE.z - 0.75*ln + 0.004*Math.sin(time*0.41));
  const basePitch = Math.atan2(CAM_LOOK.y - camera.position.y, camera.position.z) ;
  camera.rotation.order = 'YXZ';
  camera.rotation.set(basePitch + cam.pitch + 0.0025*Math.sin(time*0.9), cam.yaw + 0.002*Math.sin(time*0.37), 0);
  camera.updateMatrixWorld();
}

function render() { post.render(scene, camera); }

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last)/1000); last = now;
  if (document.hidden) return;
  update(dt); render();
  // 重い環境では解像度を下げる
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) {
    const ms = fpsAcc/fpsN*1000; fpsAcc = 0; fpsN = 0;
    if (ms > 27 && pixelRatio > 0.75) { if (++slowStrikes >= 2) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); fluid.pressureIters = 14; resize(); slowStrikes = 0; } } else slowStrikes = 0;
  }
}

// ───────── 起動 ─────────
resize();
updateCamera(0);
update(1/60); render();
$('title').classList.add('ready');
$('title').addEventListener('click', () => {
  if (started) return;
  started = true;
  sound.start();
  $('title').classList.add('gone');
  document.body.classList.add('playing');
  setTimeout(() => { $('title').style.display = 'none'; }, 2600);
  wakeUI();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.suspend(); else if (started) sound.resume(); last = performance.now(); });
requestAnimationFrame(loop);

// 検証用（Browserペインが隠れていて rAF が止まるときは、ここから手動でコマ送りする）
window.__dbg = {
  hearth, fluid, camera, cam, env, post, sparks, sound, scene, renderer,
  get exposure() { return exposure; }, set exposure(v) { exposure = v; },
  step(n = 1, dt = 1/60) { for (let i = 0; i < n; i++) update(dt); render(); },
  sim(sec) { const dt = 1/60; for (let t = 0; t < sec; t += dt) hearth.update(dt); },
  start() { $('title').click(); },
  setTool, placeHeld, hover, mouse, blow, match,
  // すぐ燃えている状態を作る
  quick(logs = 3) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    hearth.addPiece('tinder', V(0, 0.06, 0), V(1, 0, 0));
    for (let i = 0; i < 9; i++) { const a = i/9*6.28 + 0.2, t = 0.9; hearth.addPiece('kindling', V(Math.cos(a)*0.07, 0.16, Math.sin(a)*0.07), V(-Math.cos(a)*Math.cos(t), Math.sin(t), -Math.sin(a)*Math.cos(t))); this.sim(0.3); }
    this.sim(1.5);
    hearth.match.lit = true; hearth.match.pos.set(0.03, 0.05, 0.02); this.sim(3); hearth.match.lit = false; this.sim(14);
    for (let i = 0; i < logs; i++) { const a = i/logs*6.28 + 0.5, t = 0.5; hearth.addPiece('log', V(Math.cos(a)*0.12, 0.22, Math.sin(a)*0.12), V(-Math.cos(a)*Math.cos(t), Math.sin(t), -Math.sin(a)*Math.cos(t)), { w0: 0.12 }); this.sim(0.8); }
    this.sim(40);
  },
  shot(name = 'shot', q = 0.9) {
    render();
    return fetch('http://localhost:8611/' + name, { method: 'POST', body: canvas.toDataURL('image/jpeg', q) }).then(r => r.text());
  },
};
