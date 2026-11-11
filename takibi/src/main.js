// 焚火 ― 全体のつなぎ込み（描画ループ・操作・しぐさ・カメラ・UI）
import * as THREE from '../lib/three.module.js';
import { FireFluid, makeFireMesh, DOMAIN } from './fluid.js';
import { Hearth, MAX_PIECES } from './wood.js';
import { PieceView, setLogTime, makeEmberBed, staticPiece, EmberChunks } from './logs.js';
import { buildScene } from './scene.js';
import { Post } from './post.js';
import { Sparks } from './sparks.js';
import { Sound } from './audio.js';
import { Hands } from './hands.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const ease = (k) => k*k*(3 - 2*k);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16/9, 0.03, 600);
const env = buildScene(scene);
const hearth = new Hearth();
hearth.stones = env.stones;
const fluid = new FireFluid(renderer);
const fireBack = makeFireMesh(fluid, 0.0, 0.66);
const fireFront = makeFireMesh(fluid, 0.27, 0.46);
scene.add(fireBack, fireFront);
const bed = makeEmberBed();
scene.add(bed);
const chunks = new EmberChunks(scene);
const sparks = new Sparks(scene);
const post = new Post(renderer);
const sound = new Sound();
const hands = new Hands(scene);
hands.setVisible(false);

// ───────── 状態 ─────────
const views = new Map();
let viewVersion = -1;
let time = 0, started = false, litAt = -1;
let wind = 0, gust = 0;
let exposure = 2.6;
const cam = { yaw: 0, pitch: 0, lean: 0, leanT: 0 };
const CAM_BASE = new V3(0, 0.88, 1.9), CAM_LOOK = new V3(0, 0.36, 0);
// 体（＝視点）：座っている姿勢から、火の世話をするときは身を乗り出し、息を吹くときは屈みこむ
const body = { pos: CAM_BASE.clone(), vel: new V3(), look: CAM_LOOK.clone(), lookVel: new V3(), work: 0, crouch: 0, crouchHold: 0, focus: new V3(0, 0.1, 0), move: 0 };
const mouse = { x: 0, y: 0, nx: 0, ny: -0.2, moved: 0, button: 0, downAt: 0 };
let tool = 'hand';            // hand(火ばさみ) | tinder | kindling | log | match
let held = null;              // 手に持っている薪 { mesh, kind, L, r, shape, seed, roll, yaw, tilt }
let drag = null;              // 火ばさみでつかんでいる薪 { piece, plane, s, attached }
let looking = false;
// 右手：いま持っているもの(impl)と、出し入れの進み具合(k)
const hs = { impl: 'none', k: 0, phase: 'retract', t: 0, done: false, tp: new V3(), tq: new THREE.Quaternion(), off: new V3() };
// 火ばさみ
const tg = { mode: 'rest', tip: new V3(0.2, 0.3, 1.0), linger: 0, reachT: 0, pokeT: 0, pokeP: new V3(), poked: false, pending: null, yHint: new V3(0.35, 0.9, 0.2) };
const match = { state: 'none', t: 0, mesh: null, pos: new V3(), smokeT: 0, shake: 0 };
const blow = { held: false, amount: 0, breath: 1, phase: 'idle', t: 0, dur: 0.45, inhale: 0, pos: new V3(0, 0.1, 0) };
const hover = { point: new V3(0, 0, 0), piece: null, s: 0.5, pick: null, valid: false };
const ray = new THREE.Raycaster();
let uiIdle = 0, uiHidden = false;
let hintText = '', hintStage = 0, hintDoneAt = -1;

// マッチ棒
{
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.0022, 0.0022), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.8 }));
  stick.position.x = -0.023;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.7 }));
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
  camera.fov = w/h < 1.2 ? 50 + (1.2 - w/h)*42 : 50;   // 縦長の画面では画角を広げる
  camera.updateProjectionMatrix();
  sparks.points.material.uniforms.uScale.value = ph;
}
window.addEventListener('resize', resize);

// ───────── 視線と当たり ─────────
function rayToPieces(o, d) {
  let best = null, bt = 1e9;
  for (const p of hearth.pieces) {
    const ax = p.p0.x, ay = p.p0.y, az = p.p0.z;
    const ux = p.p1.x - ax, uy = p.p1.y - ay, uz = p.p1.z - az;
    const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
    const b = d.x*ux + d.y*uy + d.z*uz, c = ux*ux + uy*uy + uz*uz;
    const dd = d.x*wx + d.y*wy + d.z*wz, e = ux*wx + uy*wy + uz*wz;
    const den = c - b*b;
    let s = den > 1e-9 ? (e - b*dd)/den : 0.5;
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
const _ndc = new THREE.Vector2();
function updateHover() {
  ray.setFromCamera(_ndc.set(mouse.nx, mouse.ny), camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  hover.piece = null; hover.pick = null; hover.valid = false;
  const hit = rayToPieces(o, d);
  let tG = 1e9;
  if (d.y < -1e-4) tG = (hearth.bedHeight()*0.5 - o.y)/d.y;
  if (hit && hit.t < tG) {
    hover.piece = hit.piece; hover.s = hit.s;
    hover.point.lerpVectors(hit.piece.p0, hit.piece.p1, hit.s);
    hover.point.y += hit.piece.rc;
    hover.valid = true;
  } else if (tG < 6) {
    hover.point.copy(o).addScaledVector(d, tG);
    hover.valid = true;
  } else {
    hover.point.copy(o).addScaledVector(d, 1.1);
  }
  const r = Math.hypot(hover.point.x, hover.point.z);
  if (r > 0.8) { hover.point.x *= 0.8/r; hover.point.z *= 0.8/r; if (!hover.piece) hover.point.y = Math.max(hover.point.y, 0); }
  if (tool === 'hand' && !hover.piece && !drag) {
    const hits = ray.intersectObjects(env.pick, true);
    if (hits.length && hits[0].distance < 4) hover.pick = hits[0].object.userData.pick;
  }
}

// ───────── 道具の持ち替え ─────────
const TOOL_NAMES = { hand: '火ばさみ', tinder: '火口', kindling: '細枝', log: '薪', match: 'マッチ' };
const isPiece = (k) => k === 'tinder' || k === 'kindling' || k === 'log';
const want = () => tool === 'hand' ? 'tongs' : tool;
let lastTilt = { kindling: 0.95, log: 0.38, tinder: 0 };
function dropHeld() { if (held) { scene.remove(held.mesh); held.mesh.material.dispose(); held = null; } }
function newHeld(kind) {
  dropHeld();
  if (!isPiece(kind)) return;
  const R = Math.random;
  let L, r;
  if (kind === 'tinder') { L = 0.10; r = 0.042; }
  else if (kind === 'kindling') { L = 0.24 + R()*0.10; r = 0.007 + R()*0.004; }
  else { L = 0.36 + R()*0.08; r = 0.040 + R()*0.018; }
  const shape = Math.floor(R()*1e6), seed = R()*1000;
  const mesh = staticPiece(kind, shape, L, r, seed);
  mesh.castShadow = true;
  scene.add(mesh);
  held = { mesh, kind, L, r, shape, seed, roll: R()*6.28, yaw: (R() - 0.5)*0.6, tilt: lastTilt[kind] };
}
function setTool(t) {
  if (t !== 'match' && match.state !== 'none') endMatch();
  tool = t;
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.tool === t);
  wakeUI();
}
// 手に持つものを実際に取り替える（手が画面の外にあるあいだに行う）
function swapImpl(kind) {
  dropHeld();
  hs.impl = kind;
  hands.tongs.visible = kind === 'tongs';
  if (isPiece(kind)) newHeld(kind);
  if (kind === 'match') { match.state = 'ready'; match.t = 0; match.mesh.visible = true; match.mesh.userData.stick.material.color.setRGB(0.85, 0.76, 0.6); }
  tg.mode = 'rest';
  if (started && time > 0.5) sound.pickup(kind);
}
function endMatch() {
  if (match.state === 'lit' || match.state === 'shake') match.smokeT = 1.4;
  match.state = 'none'; match.mesh.visible = false; match.flame.visible = false; hearth.match.lit = false;
  env.matchLight.intensity = 0;
}

const _dir = new V3(), _c = new V3(), _up = new V3(0, 1, 0), _x = new V3(1, 0, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new V3(), _v2 = new V3(), _v3 = new V3(), _S = new V3();
function heldPose() {
  // カーソルの指す場所に、炉の中心へ向けて立てかける姿勢で構える
  const hp = hover.point;
  let tx = -hp.x, tz = -hp.z; const l = Math.hypot(tx, tz);
  if (l < 0.03) { tx = 1; tz = 0; } else { tx /= l; tz /= l; }
  const ca = Math.cos(held.yaw), sa = Math.sin(held.yaw);
  const hx = tx*ca - tz*sa, hz = tx*sa + tz*ca;
  const ct = Math.cos(held.tilt), st = Math.sin(held.tilt);
  _dir.set(hx*ct, st, hz*ct);
  _c.copy(hp); _c.y += held.r + 0.035 + held.L*0.5*Math.abs(st);
  if (held.tilt > 0.2) { _c.x += hx*ct*held.L*0.5; _c.z += hz*ct*held.L*0.5; }   // 下端がカーソルの位置に来るように
}
function placeHeld() {
  if (!held) return;
  heldPose();
  const p = hearth.addPiece(held.kind, _c, _dir, { L: held.L, r: held.r, shape: held.shape });
  if (p) {
    p.seed = held.seed; p.roll = held.roll;
    p.q0.y += 0.004; p.q1.y += 0.004;   // そっと手を離す
    sound.letGo(held.kind);
  }
  lastTilt[held.kind] = held.tilt;
  dropHeld();
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
  mouse.moved += Math.abs(dx) + Math.abs(dy);
  if (looking) {
    cam.yaw = clamp(cam.yaw - dx*0.0028, -1.15, 1.15);
    cam.pitch = clamp(cam.pitch - dy*0.0028, -0.32, 1.25);
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  setMouse(e); wakeUI(); mouse.moved = 0; mouse.button = e.button; mouse.downAt = time;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントでは捕捉できない */ }
  updateHover();
  tg.pending = null;
  if (e.button === 2 || e.button === 1) { looking = true; return; }
  if (tool === 'match') { if (match.state === 'lit') { match.state = 'shake'; match.t = 0; sound.matchOut(); } return; }
  if (isPiece(tool)) {
    if (hs.phase === 'hold' && hs.impl === tool && held) {
      if (hearth.pieces.length >= MAX_PIECES) { flashHint('炉がいっぱいだ。燃え落ちるのを待とう'); return; }
      hs.phase = 'release'; hs.t = 0; hs.done = false;
    }
    return;
  }
  // 火ばさみ
  if (hs.impl === 'tongs' && hs.phase === 'hold') {
    if (hover.piece) {
      // 手を伸ばしてつかみにいく。つかんだら、その点を通り視線に垂直な面の上を動かす
      const n = camera.getWorldDirection(new V3());
      const pt = new V3().lerpVectors(hover.piece.p0, hover.piece.p1, hover.s);
      drag = { piece: hover.piece, s: hover.s, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, pt), attached: false };
      tg.mode = 'reach'; tg.reachT = 0;
      document.body.classList.add('grab');
      return;
    }
    if (hover.pick) { setTool(hover.pick); return; }
    if (hover.valid && Math.hypot(hover.point.x, hover.point.z) < 0.5) tg.pending = hover.point.clone();
  } else if (hover.pick) { setTool(hover.pick); return; }
  looking = true;
});
function endPointer() {
  if (drag) {
    if (drag.attached) { drag.piece.grab = null; sound.tongsRelease(panOf(tg.tip)); }
    drag = null; tg.mode = 'linger'; tg.linger = 1.1;
    document.body.classList.remove('grab');
  }
  if (looking && mouse.button === 2 && mouse.moved < 5 && tool !== 'hand') setTool('hand');
  // 動かさずに離した＝熾をつつく
  if (looking && mouse.button === 0 && tg.pending && mouse.moved < 6 && time - mouse.downAt < 0.5 && hs.impl === 'tongs' && hs.phase === 'hold') {
    tg.mode = 'poke'; tg.pokeT = 0; tg.poked = false; tg.pokeP.copy(tg.pending);
  }
  tg.pending = null;
  looking = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); wakeUI();
  if (held) held.yaw += Math.sign(e.deltaY)*0.26;
  else cam.leanT = clamp(cam.leanT - Math.sign(e.deltaY)*0.2, 0, 1);
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
    if (!burning && hearth.bed.E > 0.25 && nL === 0) msg = '熾が残っている。薪をのせて息を吹けば、また燃え上がる';
    else if (!burning && hearth.bed.E < 0.05 && hearth.glowPower < 0.02 && hearth.everLit && P.every(p => p.maxT < 150)) msg = '火が消えた。もういちど、火口から';
  }
  if (flashT > 0) { flashT -= dt; msg = flashMsg; }
  let sub = '';
  if (held) sub = (held.kind === 'tinder' ? 'クリックで置く' : 'クリックで置く　ホイール：向き　Q / E：傾き') + '　右クリック：手を空ける';
  else if (tool === 'match' && match.state === 'lit') sub = '火を近づけてしばらく待つ　クリックで振り消す';
  else if (tool === 'hand' && hintStage >= 3 && (hover.piece || (hover.valid && Math.hypot(hover.point.x, hover.point.z) < 0.5))) sub = hover.piece ? 'ドラッグ：火ばさみで薪を動かす' : 'クリック：熾をつつく';
  if (sub) msg = (msg || '') + '<span class="sub">' + sub + '</span>';
  if (msg !== hintText) { hintText = msg; const h = $('hint'); h.innerHTML = msg; h.classList.toggle('show', !!msg); }
}

// ───────── 息 ─────────
// 吸って、すぼめた口から細く長く吹く。息が切れたら自然に吸いなおす。
function updateBreath(dt) {
  const b = blow;
  if (b.phase === 'idle') {
    b.breath = Math.min(1, b.breath + dt/2.2);
    if (b.held) { b.phase = 'inhale'; b.t = 0; b.dur = 0.38 + 0.5*(1 - b.breath); }
  }
  b.inhale = 0;
  if (b.phase === 'inhale') {
    b.t += dt; b.inhale = Math.sin(Math.PI*Math.min(1, b.t/b.dur));
    b.breath = Math.min(1, b.breath + dt/b.dur*1.3);
    if (b.t >= b.dur) { if (b.held) { b.phase = 'exhale'; b.t = 0; } else b.phase = 'idle'; }
  } else if (b.phase === 'exhale') {
    b.t += dt;
    if (!b.held) b.phase = 'idle';
    else {
      const flut = 0.84 + 0.16*Math.sin(time*9.1 + Math.sin(time*3.3)*2);
      const tgt = Math.min(1, b.t/0.16)*THREE.MathUtils.smoothstep(b.breath, 0, 0.2)*flut;
      b.amount += (tgt - b.amount)*Math.min(1, dt*14);
      b.breath -= dt/3.1;
      if (b.breath <= 0) { b.phase = 'inhale'; b.t = 0; b.dur = 0.9; }
    }
  }
  if (b.phase !== 'exhale') b.amount *= Math.exp(-dt*9);
  if (hover.valid && Math.hypot(hover.point.x, hover.point.z) < 0.6) b.pos.lerp(_v.copy(hover.point).setY(Math.min(0.35, hover.point.y + 0.03)), Math.min(1, dt*6));
  else b.pos.lerp(_v.set(0, 0.1, 0), Math.min(1, dt*3));
  hearth.blow.amount = b.amount; hearth.blow.pos.copy(b.pos);
  if (b.phase !== 'idle') body.crouchHold = 0.7; else body.crouchHold -= dt;
  $('blowBtn').classList.toggle('on', b.amount > 0.2);
}

// ───────── 体と視点 ─────────
function updateBody(dt) {
  cam.lean += (cam.leanT - cam.lean)*Math.min(1, dt*3);
  // 身を乗り出す度合い：薪やマッチを持っているあいだ／火ばさみで火をいじっているあいだ
  const carrying = (want() !== 'tongs') || (hs.impl !== 'tongs' && hs.impl !== 'none');
  const tongsBusy = tg.mode === 'reach' || tg.mode === 'grip' || tg.mode === 'poke' || tg.mode === 'linger';
  const workT = carrying ? 1 : tongsBusy ? 0.9 : 0;
  const crouchT = body.crouchHold > 0 ? 1 : 0;
  body.work += (workT - body.work)*Math.min(1, dt*3.2);
  body.crouch += (crouchT - body.crouch)*Math.min(1, dt*3.6);
  if (hover.valid) body.focus.lerp(hover.point, Math.min(1, dt*2.5));
  const f = body.focus, w = ease(clamp(body.work, 0, 1)), c = ease(clamp(body.crouch, 0, 1));
  // 目標の姿勢
  const tx = CAM_BASE.x + (-0.07 + f.x*0.12 - CAM_BASE.x)*w;   // 右腕を伸ばすぶん、頭は少し左へ
  const ty = CAM_BASE.y - 0.2*cam.lean + (0.66 - (CAM_BASE.y - 0.2*cam.lean))*w;
  const tz = CAM_BASE.z - 0.75*cam.lean + (1.0 + 0.35*clamp(f.z, -0.4, 0.4) - (CAM_BASE.z - 0.75*cam.lean))*w;
  _v.set(tx, ty, tz);
  _v2.set(blow.pos.x*0.45, Math.max(0.27, blow.pos.y + 0.19), blow.pos.z + 0.72);
  _v.lerp(_v2, c);
  // ばねで追う（急に止まらず、行き過ぎもしない）
  const om = 5.6;
  _v3.copy(_v).sub(body.pos).multiplyScalar(om*om).addScaledVector(body.vel, -2*om);
  body.vel.addScaledVector(_v3, dt); body.pos.addScaledVector(body.vel, dt);
  body.move += (body.vel.length() - body.move)*Math.min(1, dt*8);
  // 視線の先
  _v.copy(CAM_LOOK).lerp(_v2.set(f.x*0.55, 0.10 + f.y*0.5, f.z*0.5), w).lerp(blow.pos, c);
  const ol = 7;
  _v3.copy(_v).sub(body.look).multiplyScalar(ol*ol).addScaledVector(body.lookVel, -2*ol);
  body.lookVel.addScaledVector(_v3, dt); body.look.addScaledVector(body.lookVel, dt);

  // 呼吸と体のゆれ。息を吸うとわずかに身を引き、吹くと前へ出る
  _v.copy(body.look).sub(body.pos).normalize();
  const breathe = 0.0045*Math.sin(time*1.25) + 0.002*Math.sin(time*0.53);
  camera.position.copy(body.pos);
  camera.position.x += 0.006*Math.sin(time*0.31);
  camera.position.y += breathe + 0.012*blow.inhale*c;
  camera.position.z += 0.004*Math.sin(time*0.41);
  camera.position.addScaledVector(_v, (-0.035*blow.inhale + 0.014*blow.amount)*c);
  const yaw0 = Math.atan2(-_v.x, -_v.z), pitch0 = Math.asin(clamp(_v.y, -1, 1));
  const shake = blow.amount*c*0.0016;
  camera.rotation.order = 'YXZ';
  camera.rotation.set(
    pitch0 + cam.pitch + 0.0025*Math.sin(time*0.9) + shake*Math.sin(time*47),
    yaw0 + cam.yaw + 0.002*Math.sin(time*0.37) + shake*Math.sin(time*39),
    clamp(-body.vel.x*0.05, -0.05, 0.05) + 0.004*Math.sin(time*0.23));
  camera.updateMatrixWorld();
}

// ───────── 右手のしぐさ ─────────
const panOf = (p) => clamp((p.x - camera.position.x)/(0.4*Math.max(0.5, camera.position.distanceTo(p))), -1, 1);
const _tipT = new V3(), _t = new V3(), _g = new V3(), _yh = new V3(), _hq = new THREE.Quaternion(), _wr = new V3(), _gp = new V3();
function updateHand(dt) {
  const w = want();
  // 肩と、手を引っこめておく場所（画面の右下の外）
  _S.set(body.pos.x + 0.28, body.pos.y - 0.31, body.pos.z + 0.02);
  hs.off.set(body.pos.x + 0.34, body.pos.y - 0.66, body.pos.z - 0.22);
  // 出し入れ
  if (hs.phase === 'hold' && hs.impl !== w) hs.phase = 'retract';
  if (hs.phase === 'retract') {
    hs.k = Math.max(0, hs.k - dt/0.28);
    if (hs.k <= 0) { swapImpl(w); hs.phase = 'present'; }
  } else if (hs.phase === 'present') {
    hs.k = Math.min(1, hs.k + dt/0.46);
    if (hs.k >= 1) { hs.phase = 'hold'; if (hs.impl === 'match' && match.state === 'ready') { match.state = 'strike'; match.t = 0; sound.matchStrike(); } }
  } else if (hs.phase === 'release') {
    hs.t += dt;
    if (hs.t > 0.10 && !hs.done) { placeHeld(); hs.done = true; }
    if (hs.t > 0.30) hs.phase = 'retract';
  }
  const k = ease(hs.k);
  let stiff = 14;

  if (hs.impl === 'tongs') {
    // ── 火ばさみ ──
    const rest = _v.set(body.pos.x + 0.12, body.pos.y - 0.52, body.pos.z - 0.80);
    let open = 0.11, rate = 5;
    _tipT.copy(rest);
    _yh.set(0.35, 0.9, 0.2);
    if (tg.mode === 'reach' && drag) {
      _gp.lerpVectors(drag.piece.p0, drag.piece.p1, drag.s);
      _tipT.copy(_gp); open = 0.26; rate = 15; tg.reachT += dt;
      if (tg.tip.distanceTo(_gp) < 0.035 || tg.reachT > 0.6) {
        drag.piece.grab = { s: drag.s, target: _gp.clone() }; drag.attached = true; tg.mode = 'grip';
        sound.tongsGrab(1, panOf(_gp));
        if (drag.piece.maxT > 350) sparks.emit(_gp.x, _gp.y, _gp.z, 4, 0.5);
      }
    } else if (tg.mode === 'grip' && drag) {
      if (!hearth.pieces.includes(drag.piece)) { drag = null; tg.mode = 'linger'; tg.linger = 0.8; document.body.classList.remove('grab'); }
      else {
        _gp.lerpVectors(drag.piece.p0, drag.piece.p1, drag.s);
        _tipT.copy(_gp); rate = 40;
        open = clamp(2*Math.asin(Math.min(0.9, (drag.piece.rc + 0.003)/hands.tongLen)), 0.02, 0.3);
        // はさむ向き：薪の軸と火ばさみの軸の両方に直交する向きで挟む
        _g.copy(drag.piece.p1).sub(drag.piece.p0).normalize();
        _t.copy(tg.tip).sub(_v2.set(body.pos.x + 0.40, body.pos.y - 0.48, body.pos.z - 0.22)).normalize();
        _v2.crossVectors(_g, _t);
        if (_v2.lengthSq() > 0.02) { _v2.normalize(); if (_v2.y < 0) _v2.negate(); _yh.copy(_v2); }
      }
    } else if (tg.mode === 'poke') {
      tg.pokeT += dt;
      const jab = tg.pokeT < 0.22 ? 0.07 : tg.pokeT < 0.34 ? -0.012 : 0.05;
      _tipT.copy(tg.pokeP); _tipT.y += jab; open = 0.03; rate = tg.pokeT < 0.22 ? 12 : 30;
      if (tg.pokeT > 0.27 && !tg.poked) { tg.poked = true; hearth.poke(tg.pokeP.x, tg.pokeP.y, tg.pokeP.z, 1); }
      if (tg.pokeT > 0.55) { tg.mode = 'linger'; tg.linger = 0.9; }
    } else if (tg.mode === 'linger') {
      tg.linger -= dt; if (tg.linger <= 0) tg.mode = 'rest';
      if (hover.valid) { _tipT.copy(hover.point); _tipT.y += 0.07; } open = 0.2; rate = 8;
    } else {
      tg.mode = 'rest';
      // カーソルが炉の上にあるあいだは、火ばさみをそちらへ少し持ち上げて構える
      if (!uiHidden && hover.valid && Math.hypot(hover.point.x, hover.point.z) < 0.75 && body.crouch < 0.3) {
        _tipT.lerp(_v2.copy(hover.point).setY(hover.point.y + 0.1), 0.28); open = 0.18;
      }
    }
    if (body.crouch > 0.3 && tg.mode === 'rest') { _tipT.set(body.pos.x + 0.3, body.pos.y - 0.34, body.pos.z - 0.5); }
    tg.tip.lerp(_tipT, 1 - Math.exp(-dt*rate));
    tg.yHint.lerp(_yh, Math.min(1, dt*8)).normalize();
    hands.tongOpenT = open;
    hands.setPoseMix('tongsClose', 'tongsOpen', clamp(open/0.24, 0, 1));
    // 手は視線の右下に置き、火ばさみが画面を斜めに横切って先端へ届くように構える
    _t.copy(tg.tip).sub(_v2.set(body.pos.x + 0.40, body.pos.y - 0.48, body.pos.z - 0.22)).normalize();
    Hands.basis(_hq, _t, tg.yHint);
    _wr.copy(hands.tongTipLocal).applyQuaternion(_hq); _wr.multiplyScalar(-1).add(tg.tip);
    // 手のふるえ・呼吸のゆれ
    _wr.x += 0.004*Math.sin(time*1.7); _wr.y += 0.004*Math.sin(time*1.25 + 1);
    hs.tp.copy(_wr); hs.tq.copy(_hq);
    hands.pole.set(0.55, -0.75, 0.35);
    stiff = tg.mode === 'grip' ? 26 : 16;
  } else if (isPiece(hs.impl) && held) {
    // ── 薪を持つ ──
    heldPose();
    const disp = _v3.copy(hs.off).sub(hs.tp).multiplyScalar(1 - k);   // 手と一緒に画面の外から運ばれてくる
    if (held.kind === 'tinder') {
      _gp.copy(_c); _gp.y += 0.018;
      Hands.basis(_hq, _v.set(-0.12, -0.5, -1), _up);
      _wr.set(0, -0.05, 0.062).applyQuaternion(_hq).multiplyScalar(-1).add(_gp);
      hands.setPose(hs.phase === 'release' && hs.t > 0.06 ? 'open' : 'claw');
    } else {
      // 手前の端を握る
      const sgn = _v.copy(_S).sub(_c).dot(_dir) >= 0 ? 1 : -1;
      const inset = held.kind === 'log' ? 0.085 : 0.055;
      _gp.copy(_c).addScaledVector(_dir, sgn*(held.L*0.5 - inset));
      _yh.copy(body.pos).sub(_gp).normalize().multiplyScalar(0.45).addScaledVector(_up, 0.8);
      _g.copy(_dir);
      Hands.basisGrip(_hq, _g, _yh);
      // 指先が体の反対側（薪の向こう）を向くように軸の向きを選ぶ
      if (_v.set(0, 0, 1).applyQuaternion(_hq).dot(_v2.copy(_gp).sub(_S)) < 0) { _g.negate(); Hands.basisGrip(_hq, _g, _yh); }
      _wr.set(0, -(0.017 + Math.min(held.r, 0.05)), 0.05).applyQuaternion(_hq).multiplyScalar(-1).add(_gp);
      hands.setPose(hs.phase === 'release' && hs.t > 0.07 ? 'open' : held.kind === 'log' ? 'log' : 'stick');
      hands.pole.copy(_v.set(0, 0, -1).applyQuaternion(_hq)).multiplyScalar(0.7).add(_v2.set(0.4, -0.6, 0.3));
    }
    // 置く瞬間は、そっと前へ送り出す
    if (hs.phase === 'release') { const pu = Math.min(1, hs.t/0.1); _wr.addScaledVector(_v.copy(_c).sub(_wr).normalize(), 0.022*pu); }
    hs.tp.copy(_wr); hs.tq.copy(_hq);
    held.mesh.position.copy(_c).add(disp);
    _q.setFromUnitVectors(_x, _dir); _q2.setFromAxisAngle(_x, held.roll);
    held.mesh.quaternion.copy(_q).multiply(_q2);
    held.mesh.visible = hs.k > 0.02;
  } else if (hs.impl === 'match') {
    // ── マッチ ──
    match.t += dt;
    const md = _t.set(-0.42, -0.16, -0.89).normalize();     // 頭をやや下げて持つ（炎が軸をのぼって燃えつづける）
    let head = _gp;
    if (match.state === 'ready' || match.state === 'strike') {
      // 画面の下で、箱の側薬にこすりつけて一気に引く
      const sw = match.state === 'strike' ? ease(Math.min(1, match.t/0.17)) : 0;
      head.set(body.pos.x - 0.10 + 0.19*sw, body.pos.y - 0.40 + 0.03*sw, body.pos.z - 0.52);
      if (match.state === 'strike' && match.t > 0.19) { match.state = 'lit'; match.t = 0; flash = 0.6; }
      stiff = 30;
    } else if (match.state === 'lit') {
      head.copy(hover.point); head.y += 0.024;
      if (!hover.valid) head.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 0.8);
      if (match.t > 11 || (blow.amount > 0.6 && Math.random() < dt*3)) { match.state = 'shake'; match.t = 0; sound.matchOut(); }
    } else if (match.state === 'shake') {
      head.copy(match.pos); head.x += 0.035*Math.sin(match.t*52); head.y += 0.05*Math.min(1, match.t/0.2);
      stiff = 40;
      if (match.t > 0.26) { endMatch(); setTool('hand'); }
    }
    Hands.basis(_hq, _v.set(-0.25, -0.35, -0.9), _yh.set(0.45, 0.85, 0.2));
    // つまむ点（親指と人差し指の先）にマッチの軸の端がくる
    _wr.set(0.026, -0.036, 0.098).applyQuaternion(_hq).multiplyScalar(-1).add(_v.copy(head).addScaledVector(md, -0.04));
    hs.tp.copy(_wr); hs.tq.copy(_hq);
    hands.setPose('pinch');
    hands.pole.set(0.5, -0.8, 0.3);
  } else {
    hands.setPose('relax');
  }

  // 画面の外 ⇄ 構え
  _v.copy(hs.off).lerp(hs.tp, k);
  hands.setTarget(_v, hs.tq);
  hands.update(dt, _S, stiff);

  // マッチ棒は実際の手の位置に付ける（手の遅れごと付いてくる）
  if (hs.impl === 'match' && match.state !== 'none') {
    const md = _t.set(-0.42, -0.16, -0.89).normalize();
    _v.set(0.026, -0.036, 0.098).applyQuaternion(hands.quat).add(hands.wrist).addScaledVector(md, 0.04);
    match.pos.copy(_v);
    match.mesh.position.copy(_v);
    match.mesh.quaternion.setFromUnitVectors(_x, md);
    match.mesh.visible = hs.k > 0.05;
    if (match.state === 'lit') {
      hearth.match.lit = true; hearth.match.pos.copy(match.pos);
      const burn = match.t/11;
      match.mesh.userData.stick.material.color.setRGB(0.85 - 0.8*burn, 0.76 - 0.72*burn, 0.6 - 0.57*burn);
      env.matchLight.position.copy(match.pos); env.matchLight.position.y += 0.02;
      const mf = 0.85 + 0.12*Math.sin(time*23) + 0.08*Math.sin(time*37.7);
      env.matchLight.intensity = 0.2*mf*(1 + flash*3);
      match.flame.visible = true; match.flame.position.copy(match.pos);
      match.flame.scale.set(0.017*(1 + flash*1.5), 0.04*mf*(1 + flash*1.2)*(1 - 0.35*burn), 1);
    } else { hearth.match.lit = false; match.flame.visible = false; env.matchLight.intensity *= Math.exp(-dt*20); }
  }
}

// ───────── 1フレーム ─────────
const emitters = [];
const _camPos = new V3(), _p = new V3();
let fpsAcc = 0, fpsN = 0, slowStrikes = 0, uiTick = 0, lightFl = 0, lightFl2 = 0, flash = 0, scrape = 0;

function update(dt) {
  time += dt;
  // 風：ゆるやかな流れに、ときどき突風
  gust += (Math.random() - 0.5)*dt*1.6; gust *= Math.exp(-dt*0.35);
  wind = clamp(0.28*Math.sin(time*0.043) + 0.18*Math.sin(time*0.11 + 2) + gust, -1, 1);
  hearth.wind = wind;

  updateBreath(dt);
  updateBody(dt);
  updateHover();
  if (started) updateHand(dt);
  if (match.smokeT > 0) match.smokeT -= dt;
  flash *= Math.exp(-dt*5);

  // 火ばさみでつかんだ薪を動かす
  if (drag && drag.attached) {
    ray.setFromCamera(_ndc.set(mouse.nx, mouse.ny), camera);
    if (ray.ray.intersectPlane(drag.plane, _p)) {
      _p.y = Math.max(_p.y, 0.02);
      const r = Math.hypot(_p.x, _p.z); if (r > 1.0) { _p.x *= 1.0/r; _p.z *= 1.0/r; }
      drag.piece.grab.target.copy(_p);
    }
  }
  scrape += (((drag && drag.attached && drag.piece.contact) ? Math.min(1, (drag.piece.speed || 0)*1.2) : 0) - scrape)*Math.min(1, dt*10);

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
    const pan = panOf(e);
    if (e.type === 'crackle') {
      sound.crackle(e.power, pan);
      if (e.power > 0.72) { sparks.emit(e.x, e.y, e.z, 1 + Math.floor(e.power*e.power*6), e.power); lightFl2 += e.power*0.25; }
    } else if (e.type === 'spark') {
      sparks.emit(e.x, e.y, e.z, 1 + Math.floor(Math.random()*3), 0.7);
      if (Math.random() < 0.3) sound.crackle(0.1, pan);
    } else if (e.type === 'crumble') {
      sound.crumble(e.power, pan);
      sparks.emit(e.x, e.y, e.z, Math.floor(8 + 26*e.power), 0.9);
      if (e.kind !== 'tinder') chunks.spawn(e.x, e.y, e.z, e.kind === 'log' ? 0.02 + 0.016*e.power : 0.007, hearth, e.kind === 'log' ? 0 : 1);
    } else if (e.type === 'knock') {
      sound.knock(e.power, e.kind, pan);
      if (e.hot) sparks.emit(e.x, e.y, e.z, Math.floor(4 + 14*e.power), 0.8);
    } else if (e.type === 'poke') {
      sound.poke(e.hot, pan);
      chunks.kick(e.x, e.z, 0.09);
      if (e.hot) { sparks.emit(e.x, e.y + 0.01, e.z, 10 + Math.floor(Math.random()*14), 0.8); lightFl2 += 0.2; }
    }
  }
  if (drag && drag.attached && drag.piece.maxT > 400 && Math.random() < dt*6) sparks.emit(tg.tip.x, tg.tip.y, tg.tip.z, 2, 0.6);
  const I = hearth.intensity, G = hearth.glowPower;
  if (I > 0.05 && Math.random() < I*dt*0.7) sparks.emit(hearth.centroid.x + (Math.random() - 0.5)*0.2, hearth.centroid.y, hearth.centroid.z + (Math.random() - 0.5)*0.2, 1, 0.4);
  if (blow.amount > 0.4 && hearth.bed.E > 0.3 && Math.random() < dt*10*blow.amount) sparks.emit(blow.pos.x + (Math.random() - 0.5)*0.15, hearth.bedHeight() + 0.01, blow.pos.z + (Math.random() - 0.5)*0.15, 1, 0.6);

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

  for (const m of [fireBack, fireFront]) {
    const u = m.material.uniforms;
    u.uDye.value = fluid.texture; u.uTime.value = time; u.uCam.value.copy(_camPos);
    u.uSmokeLit.value.setRGB(0.55*Math.min(1.5, I + G*0.4), 0.2*Math.min(1.5, I + G*0.3), 0.05*Math.min(1.5, I));
  }

  // 火の明かり：炎の量に合わせて明滅し、影が踊る（同じ揺れを音にも使う）
  lightFl += (Math.random() - 0.5)*dt*14; lightFl *= Math.exp(-dt*7);
  lightFl2 *= Math.exp(-dt*9);
  const fl = Math.max(0.35, 1 + lightFl*0.55 + 0.07*Math.sin(time*11.3) + 0.05*Math.sin(time*23.7) + lightFl2);
  const Ivis = Math.pow(Math.min(2.2, I), 0.8);
  env.fireLight.intensity = 2.6*Ivis*fl + flash*0.2;
  const hgt = 0.14 + 0.3*Math.sqrt(Math.min(2, I));
  env.fireLight.position.set(hearth.centroid.x + lightFl*0.05 + 0.02*Math.sin(time*9.1), hearth.centroid.y + hgt + 0.03*Math.sin(time*13.3), hearth.centroid.z + 0.03*Math.sin(time*7.7));
  env.fireLight.color.setRGB(1.0, 0.40 + 0.09*Math.min(1, I), 0.105 + 0.06*Math.min(1, I));
  env.fireLight.castShadow = env.fireLight.intensity > 0.02;
  env.emberLight.intensity = 0.55*Math.min(2, G)*(0.9 + 0.1*Math.sin(time*2.3));
  env.emberLight.position.y = hearth.bedHeight() + 0.09;

  // 熾床と熾の塊
  const bu = bed.userData.u;
  bu.uBedH.value = hearth.bedHeight(); bu.uBedE.value += (hearth.bed.E - bu.uBedE.value)*Math.min(1, dt*3);
  bu.uCoal.value = hearth.bed.coal; bu.uAsh.value = hearth.bed.ash; bu.uBlow.value = blow.amount;
  chunks.update(dt, hearth, blow.amount);

  sparks.update(dt, wind, hearth.centroid.y + 0.3 + 0.5*Math.min(1.5, I));
  env.update(time, dt);

  // 眼の順応：火が強いと周りは闇に沈み、熾だけになると星が見えてくる
  const lum = Ivis + 0.8*Math.min(1.5, G) + (match.state === 'lit' ? 0.05 : 0);
  const prox = clamp(1.9/Math.max(0.5, _camPos.distanceTo(_p.set(hearth.centroid.x, 0.2, hearth.centroid.z))), 0.85, 2.3);
  const target = clamp(1.25/(0.42 + 1.45*lum*(0.75 + 0.25*prox)), 0.42, 3.0);
  exposure += (target - exposure)*Math.min(1, dt*(target < exposure ? 1.6 : 0.22));
  const pu = post.u;
  pu.uExposure.value = exposure; pu.uTime.value = time;
  pu.uHaze.value = 0.0045*Math.min(1.4, I + G*0.25);
  pu.uWarm.value = Math.min(2.2, I*prox);      // 近づくほど、顔に熱を感じる
  _p.set(hearth.centroid.x, 0.12, 0).project(camera); pu.uFireA.value.set(_p.x*0.5 + 0.5, _p.y*0.5 + 0.5, 0.075*(1.9/Math.max(0.6, _camPos.z)));
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

  sound.update(dt, { intensity: I, glow: G, hiss: hearth.hiss, wind, blow: blow.amount, inhale: blow.inhale, flick: fl, prox, move: body.move + hands.speed*0.5, scrape });
}

function render() { post.render(scene, camera); }

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - last)/1000; last = now;
  const dt = Math.min(0.05, raw);
  if (document.hidden) return;
  update(dt); render();
  // 重い環境では解像度を下げる（検証用の手動コマ送りで止まっていた時間は数えない）
  if (raw < 0.25) { fpsAcc += raw; fpsN++; }
  if (fpsAcc > 3) {
    const ms = fpsAcc/fpsN*1000; fpsAcc = 0; fpsN = 0;
    if (ms > 27 && pixelRatio > 0.75) { if (++slowStrikes >= 2) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); fluid.pressureIters = 14; resize(); slowStrikes = 0; } } else slowStrikes = 0;
  }
}

// ───────── 起動 ─────────
resize();
update(1/60); render();
$('title').classList.add('ready');
$('title').addEventListener('click', () => {
  if (started) return;
  started = true;
  sound.start();
  hands.setVisible(true);
  $('title').classList.add('gone');
  document.body.classList.add('playing');
  setTimeout(() => { $('title').style.display = 'none'; }, 2600);
  wakeUI();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.suspend(); else if (started) sound.resume(); last = performance.now(); });
requestAnimationFrame(loop);

// 検証用（Browserペインが隠れていて rAF が止まるときは、ここから手動でコマ送りする）
window.__dbg = {
  hearth, fluid, camera, cam, env, post, sparks, sound, scene, renderer, hands, chunks, body, hs, tg,
  get exposure() { return exposure; }, set exposure(v) { exposure = v; },
  get tool() { return tool; }, get held() { return held; },
  step(n = 1, dt = 1/60) { for (let i = 0; i < n; i++) update(dt); render(); },
  sim(sec) { const dt = 1/60; for (let t = 0; t < sec; t += dt) { hearth.update(dt); for (const e of hearth.events) if (e.type === 'crumble' && e.kind !== 'tinder') chunks.spawn(e.x, e.y, e.z, e.kind === 'log' ? 0.02 + 0.016*e.power : 0.007, hearth, e.kind === 'log' ? 0 : 1); } },
  start() { $('title').click(); },
  setTool, hover, mouse, blow, match,
  // 合成のポインタ操作（nx, ny は -1..1 の画面座標）
  ptr(type, nx, ny, button = 0) {
    const x = (nx*0.5 + 0.5)*window.innerWidth, y = (-ny*0.5 + 0.5)*window.innerHeight;
    canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button, pointerId: 77, bubbles: true }));
  },
  ndcOf(v) { const p = new V3(v.x, v.y, v.z).project(camera); return [p.x, p.y]; },
  // すぐ燃えている状態を作る
  quick(logs = 3) {
    const V = (x, y, z) => new V3(x, y, z);
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
