// ============================================================
//  クレーンキャッチャー REAL ARCADE EDITION
//  Three.js + cannon-es  リアル3Dクレーンゲーム
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

// ------------------------------------------------------------
// 定数（単位: メートル）
// ------------------------------------------------------------
const FLOOR_Y = 0.80;            // プレイフィールド床
const CASE_TOP = 1.92;           // ガラスケース上端
const IX = 0.46, IZ = 0.44;      // ケース内側ハーフサイズ
const HOLE = { x0: -0.46, x1: -0.17, z0: 0.15, z1: 0.44 }; // 獲得口
const RAIL_Y = 1.76;
const HEAD_UP_Y = 1.54;
const HEAD_DOWN_Y = 0.975;
const CLAW_MIN_X = -0.315, CLAW_MAX_X = 0.355;
const CLAW_MIN_Z = -0.300, CLAW_MAX_Z = 0.310;
const HOME = { x: -0.310, z: 0.290 };   // ホーム位置（獲得口の真上）
const MOVE_SPEED = 0.135;
const DESCEND_SPEED = 0.42;
const LIFT_SPEED = 0.38;
const RETURN_SPEED = 0.20;

const OPEN_ANGLE = 0.92, CLOSED_ANGLE = 0.10, CARRY_ANGLE = 0.30;

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  credit: $('credit-num'), prize: $('prize-num'), status: $('status'),
  coin: $('coin-btn'), btn1: $('btn1'), btn2: $('btn2'),
  win: $('win-banner'), boot: $('boot'), start: $('start-btn'), mute: $('mute-btn'),
};
function setStatus(t) { ui.status.textContent = t; }

// ------------------------------------------------------------
// サウンドエンジン（WebAudio 合成）
// ------------------------------------------------------------
class SoundEngine {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // モーター音
    this.motorGain = this.ctx.createGain(); this.motorGain.gain.value = 0;
    const mOsc = this.ctx.createOscillator(); mOsc.type = 'sawtooth'; mOsc.frequency.value = 58;
    const mOsc2 = this.ctx.createOscillator(); mOsc2.type = 'square'; mOsc2.frequency.value = 117;
    const mFil = this.ctx.createBiquadFilter(); mFil.type = 'lowpass'; mFil.frequency.value = 320; mFil.Q.value = 4;
    mOsc.connect(mFil); mOsc2.connect(mFil); mFil.connect(this.motorGain); this.motorGain.connect(this.master);
    mOsc.start(); mOsc2.start();
    this.mOsc = mOsc; this.mOsc2 = mOsc2;
    this.startBGM();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  tone(freq, dur = 0.12, type = 'square', vol = 0.16, when = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  coin() { this.tone(1568, 0.08, 'square', 0.2); this.tone(2093, 0.3, 'square', 0.2, 0.08); }
  buttonBeep() { this.tone(880, 0.06, 'square', 0.12); }
  motor(on, pitch = 1) {
    if (!this.ctx) return;
    if (this.mOsc) { this.mOsc.frequency.value = 58 * pitch; this.mOsc2.frequency.value = 117 * pitch; }
    this.motorGain.gain.linearRampToValueAtTime(on ? 0.10 : 0, this.ctx.currentTime + 0.08);
  }
  clawClose() { this.tone(180, 0.1, 'square', 0.12, 0, -110); this.tone(90, 0.14, 'triangle', 0.2, 0.05); }
  clawOpen() { this.tone(140, 0.1, 'square', 0.1, 0, 90); }
  thud() { this.tone(85, 0.22, 'sine', 0.35, 0, -50); }
  win() {
    const seq = [523, 659, 784, 1047, 1319, 1568, 2093];
    seq.forEach((f, i) => this.tone(f, 0.14, 'square', 0.17, i * 0.09));
    seq.forEach((f, i) => this.tone(f * 0.5, 0.14, 'triangle', 0.12, i * 0.09));
    this.tone(2093, 0.5, 'square', 0.15, seq.length * 0.09);
  }
  lose() { this.tone(392, 0.18, 'square', 0.1); this.tone(311, 0.4, 'square', 0.1, 0.18); }
  // ---- BGM（軽快チップチューン・ループ）----
  startBGM() {
    const mel = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 784, 659, 587, 523,
                 523, 659, 784, 880, 1047, 880, 784, 659, 698, 587, 698, 784, 659, 587, 523, 0];
    const bass = [261, 0, 196, 0, 220, 0, 196, 0, 233, 0, 175, 0, 196, 0, 196, 0,
                  261, 0, 196, 0, 220, 0, 175, 0, 233, 0, 196, 0, 261, 0, 196, 0];
    let step = 0, nextT = this.ctx.currentTime + 0.3;
    const spb = 60 / 132 / 2; // 132bpm 8分音符
    this.bgmTimer = setInterval(() => {
      while (nextT < this.ctx.currentTime + 0.35) {
        const m = mel[step % mel.length], b = bass[step % bass.length];
        if (m) this.tone(m, spb * 0.85, 'triangle', 0.045, nextT - this.ctx.currentTime);
        if (b) this.tone(b, spb * 0.9, 'sine', 0.05, nextT - this.ctx.currentTime);
        nextT += spb; step++;
      }
    }, 180);
  }
}
const snd = new SoundEngine();

// ------------------------------------------------------------
// レンダラー / シーン / カメラ
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07040f);
scene.fog = new THREE.FogExp2(0x07040f, 0.14);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 60);
camera.position.set(0, 1.62, 2.85);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.12, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.9;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

// 画面の縦横比に合わせて画角を調整（縦持ちスマホでも筐体の横幅が収まる）
function fitCamera() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  const aspect = w / h;
  const baseTan = Math.tan(THREE.MathUtils.degToRad(21));
  const needTan = 0.29 / aspect;            // 横方向に筐体(幅約1.1m)が入る最低画角
  const fov = THREE.MathUtils.radToDeg(Math.atan(Math.max(baseTan, needTan))) * 2;
  camera.fov = Math.min(fov, 78);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
fitCamera();
addEventListener('resize', fitCamera);
addEventListener('orientationchange', () => setTimeout(fitCamera, 250));
// 長押しメニュー・ダブルタップズーム・ピンチズームを抑止
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ------------------------------------------------------------
// キャンバステクスチャ生成ヘルパー
// ------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// プレイフィールド床マット（継ぎ目が目立たない均一ドット柄）
const floorMatTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#ff4f9e'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.28)';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.beginPath();
    g.arc(x * 32 + (y % 2 ? 16 : 0) + 8, y * 32 + 8, 4.5, 0, 7);
    g.fill();
  }
}, [6, 6]);

// CHANCE デカール
const chanceTex = canvasTex(512, 192, (g) => {
  g.clearRect(0, 0, 512, 192);
  g.font = '900 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = '#fff';
  g.strokeText('CHANCE!', 256, 96);
  g.fillStyle = '#ffe03f'; g.fillText('CHANCE!', 256, 96);
});

// ケース内バックパネル装飾
const backPanelTex = canvasTex(1024, 1024, (g) => {
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#ffd9f0'); grad.addColorStop(0.55, '#ffb3e0'); grad.addColorStop(1, '#ff8fd0');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 1024);
  // 放射光
  g.save(); g.translate(512, 430);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,0)';
    g.beginPath(); g.moveTo(0, 0);
    const a0 = (i / 18) * Math.PI * 2, a1 = ((i + 1) / 18) * Math.PI * 2;
    g.arc(0, 0, 760, a0, a1); g.closePath(); g.fill();
  }
  g.restore();
  // ロゴ
  g.font = '900 120px sans-serif'; g.textAlign = 'center';
  g.lineWidth = 22; g.strokeStyle = '#c2186e';
  g.strokeText('PRIZE', 512, 380); g.fillStyle = '#fff'; g.fillText('PRIZE', 512, 380);
  g.strokeText('GET!!', 512, 520); g.fillStyle = '#ffe03f'; g.fillText('GET!!', 512, 520);
  // 星
  g.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 10 + Math.random() * 20;
    g.save(); g.translate(x, y); g.rotate(Math.random() * 6);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r, a = (k / 10) * Math.PI * 2;
      g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill(); g.restore();
  }
});

// アーケードのカーペット
const carpetTex = canvasTex(512, 512, (g) => {
  g.fillStyle = '#141033'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const cols = ['#ff3fa4', '#3fc1ff', '#ffe03f', '#9d3fff', '#3fff8e'];
    g.strokeStyle = cols[i % 5]; g.globalAlpha = 0.5; g.lineWidth = 3;
    const x = Math.random() * 512, y = Math.random() * 512;
    g.beginPath();
    if (i % 3 === 0) { g.arc(x, y, 4 + Math.random() * 7, 0, Math.PI * 1.4); }
    else { g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30); }
    g.stroke();
  }
  g.globalAlpha = 1;
}, [7, 7]);

// マーキー看板
const marqueeTex = canvasTex(1024, 256, (g) => {
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#3d0a68'); grad.addColorStop(0.5, '#6a0dad'); grad.addColorStop(1, '#3d0a68');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 256);
  g.font = '900 108px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tg = g.createLinearGradient(0, 40, 0, 210);
  tg.addColorStop(0, '#fff'); tg.addColorStop(0.45, '#ffe45f'); tg.addColorStop(1, '#ff9d2d');
  g.lineWidth = 12; g.strokeStyle = '#2a0648';
  g.strokeText('CRANE CATCHER', 512, 118);
  g.fillStyle = tg; g.fillText('CRANE CATCHER', 512, 118);
  g.font = '700 44px sans-serif'; g.fillStyle = '#ffb8f0';
  g.fillText('★ クレーンキャッチャー ★', 512, 205);
});

// サイドの装飾アート
const sideArtTex = canvasTex(512, 768, (g) => {
  const grad = g.createLinearGradient(0, 0, 0, 768);
  grad.addColorStop(0, '#ff6fc4'); grad.addColorStop(0.6, '#ff3fa4'); grad.addColorStop(1, '#d01f7e');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 768);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 768, 8 + Math.random() * 42, 0, 7); g.fill();
  }
  g.font = '900 90px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.9)';
  g.save(); g.translate(256, 400); g.rotate(-Math.PI / 2);
  g.fillText('★ PRIZE ★', 0, 32); g.restore();
});

// 景品箱テクスチャ
function prizeBoxTex(bg, accent, label) {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = accent; g.lineWidth = 16; g.strokeRect(14, 14, 484, 484);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = accent; g.globalAlpha = 0.35;
      g.beginPath(); g.arc(40 + Math.random() * 432, 40 + Math.random() * 432, 10 + Math.random() * 18, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // かわいい顔
    g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 225, 118, 0, 7); g.fill();
    g.fillStyle = '#222';
    g.beginPath(); g.arc(212, 205, 15, 0, 7); g.fill();
    g.beginPath(); g.arc(300, 205, 15, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(256, 245, 38, 0.25, Math.PI - 0.25); g.stroke();
    g.fillStyle = '#ff9d9d';
    g.beginPath(); g.arc(182, 248, 17, 0, 7); g.fill();
    g.beginPath(); g.arc(330, 248, 17, 0, 7); g.fill();
    g.font = '900 64px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 8;
    g.strokeText(label, 256, 440); g.fillText(label, 256, 440);
  });
}

// ------------------------------------------------------------
// マテリアル
// ------------------------------------------------------------
const M = {
  pink: new THREE.MeshPhysicalMaterial({ color: 0xff4fae, roughness: 0.25, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.6 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf4f0f6, roughness: 0.3, metalness: 0.05, clearcoat: 0.6, envMapIntensity: 0.55 }),
  darkTrim: new THREE.MeshStandardMaterial({ color: 0x2a1440, roughness: 0.5, metalness: 0.3 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.18, metalness: 1.0 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8f96a8, roughness: 0.35, metalness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1.0,
    thickness: 0.012, ior: 1.5, transparent: true, opacity: 1,
    clearcoat: 1, envMapIntensity: 1.4, side: THREE.DoubleSide,
  }),
  redAcryl: new THREE.MeshPhysicalMaterial({ color: 0xff2244, roughness: 0.2, clearcoat: 1, emissive: 0x990011, emissiveIntensity: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd257, roughness: 0.25, metalness: 1.0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.6 }),
};

// ------------------------------------------------------------
// アーケード店内
// ------------------------------------------------------------
{
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 後ろの壁
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x160b2e, roughness: 0.9 })
  );
  wall.position.set(0, 2.2, -3.2);
  scene.add(wall);
  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xff3fa4, emissive: 0xff3fa4, emissiveIntensity: 2.2 })
  );
  neon.position.set(0, 2.9, -3.15);
  scene.add(neon);
  const neon2 = neon.clone();
  neon2.material = new THREE.MeshStandardMaterial({ color: 0x3fc1ff, emissive: 0x3fc1ff, emissiveIntensity: 2.2 });
  neon2.position.y = 2.72;
  scene.add(neon2);

  // 隣の筐体（シルエット）
  const neighborMat = new THREE.MeshStandardMaterial({ color: 0x241246, roughness: 0.7 });
  [-1.75, 1.75].forEach((x, i) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.95), neighborMat);
    body.position.set(x, 0.95, -0.35);
    body.rotation.y = i === 0 ? 0.18 : -0.18;
    body.castShadow = true;
    scene.add(body);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.22, 0.02),
      new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x3fc1ff : 0xffe03f,
        emissive: i === 0 ? 0x3fc1ff : 0xffe03f, emissiveIntensity: 1.6,
      })
    );
    glow.position.set(0, 0.88, 0.485);
    body.add(glow);
    const dark = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.85, 0.02),
      new THREE.MeshPhysicalMaterial({ color: 0x0a0a18, roughness: 0.1, metalness: 0.4 })
    );
    dark.position.set(0, 0.28, 0.48);
    body.add(dark);
  });

  // ライティング
  scene.add(new THREE.AmbientLight(0x9080c0, 0.35));
  const key = new THREE.SpotLight(0xfff0e0, 60, 14, 0.5, 0.45, 1.6);
  key.position.set(1.6, 3.6, 2.8);
  key.target.position.set(0, 1.0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const fill = new THREE.SpotLight(0xc0a8ff, 25, 12, 0.6, 0.6, 1.8);
  fill.position.set(-2.4, 3.0, 1.4);
  fill.target.position.set(0, 1.0, 0);
  scene.add(fill, fill.target);
}

// ------------------------------------------------------------
// クレーンゲーム筐体
// ------------------------------------------------------------
const machine = new THREE.Group();
scene.add(machine);
const insideLights = [];
{
  const W = 1.06, D = 1.0;

  // ベースキャビネット
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, FLOOR_Y - 0.02, D), M.pink);
  base.position.y = (FLOOR_Y - 0.02) / 2;
  base.castShadow = base.receiveShadow = true;
  machine.add(base);

  // ベース白帯
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.015, 0.16, D + 0.015), M.white);
  band.position.y = 0.62;
  machine.add(band);

  // サイドアート
  [-1, 1].forEach((s) => {
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(D * 0.86, 0.5),
      new THREE.MeshStandardMaterial({ map: sideArtTex, roughness: 0.4 })
    );
    art.rotation.y = s * Math.PI / 2;
    art.position.set(s * (W / 2 + 0.002), 0.30, 0);
    machine.add(art);
  });

  // 操作パネル（手前・傾斜）
  const cpanel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.05, 0.2), M.white);
  cpanel.position.set(0, 0.74, D / 2 + 0.085);
  cpanel.rotation.x = -0.32;
  cpanel.castShadow = true;
  machine.add(cpanel);
  // 実機ボタン（赤・青）
  [[0.14, 0xff2d55], [0.30, 0x2d7bff]].forEach(([x, col]) => {
    const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.012, 24), M.darkTrim);
    bBase.position.set(x, 0.032, 0);
    bBase.rotation.x = 0;
    cpanel.add(bBase);
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.024, 0.016, 24),
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, clearcoat: 1, emissive: col, emissiveIntensity: 0.25 })
    );
    btn.position.y = 0.012;
    bBase.add(btn);
  });
  // コイン投入口
  const coinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.01), M.chrome);
  coinPlate.position.set(-0.25, 0.02, 0.09);
  cpanel.add(coinPlate);
  const coinSlot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.012), M.black);
  coinSlot.position.set(-0.25, 0.02, 0.095);
  cpanel.add(coinSlot);

  // 獲得口の取り出しドア（正面）
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, 0.02), M.darkTrim);
  door.position.set(-0.315, 0.30, D / 2 + 0.005);
  machine.add(door);
  const doorWin = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.26, 0.015),
    new THREE.MeshPhysicalMaterial({ color: 0x777788, roughness: 0.05, transmission: 0.9, thickness: 0.01, transparent: true })
  );
  doorWin.position.set(-0.315, 0.30, D / 2 + 0.012);
  machine.add(doorWin);
  const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), M.chrome);
  doorHandle.position.set(-0.315, 0.115, D / 2 + 0.02);
  machine.add(doorHandle);
  const doorLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.05),
    new THREE.MeshStandardMaterial({
      map: canvasTex(512, 96, (g) => {
        g.fillStyle = '#ffe45f'; g.fillRect(0, 0, 512, 96);
        g.fillStyle = '#3a2404'; g.font = '900 58px sans-serif'; g.textAlign = 'center';
        g.fillText('景品取り出し口', 256, 68);
      }),
    })
  );
  doorLabel.position.set(-0.315, 0.50, D / 2 + 0.016);
  machine.add(doorLabel);

  // ---- プレイフィールド床 ----
  const pfFloorMat = new THREE.MeshStandardMaterial({ map: floorMatTex, roughness: 0.55, envMapIntensity: 0.4 });
  // 奥側全幅
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(IX * 2, 0.03, HOLE.z0 + IZ), pfFloorMat);
  f1.position.set(0, FLOOR_Y - 0.015, (HOLE.z0 - IZ) / 2);
  f1.receiveShadow = true;
  machine.add(f1);
  // 手前右
  const f2w = IX - (-HOLE.x1);
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(f2w, 0.03, IZ - HOLE.z0), pfFloorMat);
  f2.position.set((HOLE.x1 + IX) / 2, FLOOR_Y - 0.015, (HOLE.z0 + IZ) / 2);
  f2.receiveShadow = true;
  machine.add(f2);
  // CHANCE! デカール（獲得口のよこ）
  const chance = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.09),
    new THREE.MeshBasicMaterial({ map: chanceTex, transparent: true })
  );
  chance.rotation.x = -Math.PI / 2;
  chance.rotation.z = Math.PI / 2;
  chance.position.set(HOLE.x1 + 0.07, FLOOR_Y + 0.002, (HOLE.z0 + HOLE.z1) / 2);
  machine.add(chance);

  // ケース内バックパネル（実機の装飾ボード）
  const backPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(IX * 2 - 0.02, CASE_TOP - FLOOR_Y - 0.1),
    new THREE.MeshStandardMaterial({ map: backPanelTex, emissive: 0xffffff, emissiveMap: backPanelTex, emissiveIntensity: 0.22, roughness: 0.6 })
  );
  backPanel.position.set(0, FLOOR_Y + (CASE_TOP - FLOOR_Y) / 2 - 0.03, -IZ - 0.005);
  machine.add(backPanel);

  // 獲得口の赤アクリル縁
  const lip1 = new THREE.Mesh(new THREE.BoxGeometry(HOLE.x1 - HOLE.x0 + 0.02, 0.05, 0.02), M.redAcryl);
  lip1.position.set((HOLE.x0 + HOLE.x1) / 2, FLOOR_Y + 0.01, HOLE.z0 - 0.01);
  machine.add(lip1);
  const lip2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, HOLE.z1 - HOLE.z0), M.redAcryl);
  lip2.position.set(HOLE.x1 + 0.01, FLOOR_Y + 0.01, (HOLE.z0 + HOLE.z1) / 2);
  machine.add(lip2);
  // 獲得口シャフト（内壁）
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x33203f, roughness: 0.8 });
  const shaftH = FLOOR_Y - 0.30;
  const mkShaft = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shaftMat);
    m.position.set(x, y, z);
    machine.add(m);
  };
  mkShaft(0.02, shaftH, HOLE.z1 - HOLE.z0, HOLE.x1, 0.30 + shaftH / 2, (HOLE.z0 + HOLE.z1) / 2);
  mkShaft(HOLE.x1 - HOLE.x0, shaftH, 0.02, (HOLE.x0 + HOLE.x1) / 2, 0.30 + shaftH / 2, HOLE.z0);

  // ---- ガラスケース ----
  const caseH = CASE_TOP - FLOOR_Y;
  const glassGeoFront = new THREE.PlaneGeometry(W - 0.09, caseH - 0.06);
  const front = new THREE.Mesh(glassGeoFront, M.glass);
  front.position.set(0, FLOOR_Y + caseH / 2, D / 2 - 0.015);
  machine.add(front);
  const back = front.clone();
  back.position.z = -D / 2 + 0.015;
  machine.add(back);
  const glassGeoSide = new THREE.PlaneGeometry(D - 0.09, caseH - 0.06);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(glassGeoSide, M.glass);
    side.rotation.y = Math.PI / 2;
    side.position.set(s * (W / 2 - 0.015), FLOOR_Y + caseH / 2, 0);
    machine.add(side);
  });

  // コーナー支柱
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.05, caseH, 0.05), M.white);
    pil.position.set(sx * (W / 2 - 0.028), FLOOR_Y + caseH / 2, sz * (D / 2 - 0.028));
    pil.castShadow = true;
    machine.add(pil);
  });

  // ケース天板
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.07, D + 0.03), M.pink);
  top.position.y = CASE_TOP + 0.035;
  top.castShadow = true;
  machine.add(top);

  // マーキー看板
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.06, 0.26, 0.09),
    [M.darkTrim, M.darkTrim, M.darkTrim, M.darkTrim,
     new THREE.MeshStandardMaterial({ map: marqueeTex, emissive: 0xffffff, emissiveMap: marqueeTex, emissiveIntensity: 0.9 }),
     M.darkTrim]
  );
  marquee.position.set(0, CASE_TOP + 0.07 + 0.13, 0.12);
  marquee.rotation.x = -0.12;
  machine.add(marquee);

  // LED電飾（天板の縁）
  const ledGeo = new THREE.SphereGeometry(0.014, 10, 8);
  const ledCount = 26;
  for (let i = 0; i < ledCount; i++) {
    const t = i / ledCount;
    let x, z;
    if (t < 0.5) { x = -W / 2 + t * 2 * W; z = D / 2 + 0.02; }
    else { x = -W / 2 + (t - 0.5) * 2 * W; z = -D / 2 - 0.02; }
    const led = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3fa4, emissiveIntensity: 2 }));
    led.position.set(x, CASE_TOP + 0.075, z);
    machine.add(led);
    insideLights.push(led);
  }

  // ケース内照明（蛍光灯風）
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, W - 0.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 3.2 })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0, CASE_TOP - 0.05, -0.15);
  machine.add(tube);
  const caseLight = new THREE.PointLight(0xfff2dd, 3.4, 2.4, 1.7);
  caseLight.position.set(0, CASE_TOP - 0.12, -0.05);
  caseLight.castShadow = !IS_MOBILE;   // 点光源シャドウ(6面)はスマホでは重いのでOFF
  caseLight.shadow.mapSize.set(1024, 1024);
  caseLight.shadow.bias = -0.002;
  machine.add(caseLight);
  const caseLight2 = new THREE.PointLight(0xffe8f4, 1.6, 1.8, 1.7);
  caseLight2.position.set(0, CASE_TOP - 0.2, 0.3);
  machine.add(caseLight2);

  // ---- ガントリー（レール）----
  const railGeo = new THREE.BoxGeometry(0.035, 0.045, D - 0.14);
  [-1, 1].forEach((s) => {
    const rail = new THREE.Mesh(railGeo, M.steel);
    rail.position.set(s * (W / 2 - 0.075), RAIL_Y, 0);
    machine.add(rail);
  });
}

// クロスビーム＆トロリー（可動）
const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.06), M.steel);
crossBeam.position.y = RAIL_Y - 0.012;
crossBeam.castShadow = true;
machine.add(crossBeam);
const trolley = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.11), M.white);
  body.castShadow = true;
  trolley.add(body);
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 14), M.darkTrim);
  winch.rotation.x = Math.PI / 2;
  winch.position.y = -0.02;
  trolley.add(winch);
}
trolley.position.y = RAIL_Y - 0.05;
machine.add(trolley);

// ケーブル
const cableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 8), M.black);
machine.add(cableMesh);

// ------------------------------------------------------------
// クレーンヘッド＆アーム
// ------------------------------------------------------------
const clawHead = new THREE.Group();
machine.add(clawHead);
const armPivots = [];   // shoulder groups
const armTips = [];     // tip meshes（フック判定用）
{
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.085, 20), M.pink);
  housing.castShadow = true;
  clawHead.add(housing);
  const housingCap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.pink);
  housingCap.position.y = 0.042;
  clawHead.add(housingCap);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.018, 20), M.gold);
  collar.position.y = -0.045;
  clawHead.add(collar);

  [-1, 1].forEach((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.045, -0.052, 0);
    clawHead.add(shoulder);
    armPivots.push({ group: shoulder, side: s });

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.034), M.chrome);
    upper.position.y = -0.045;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.09;
    elbow.rotation.z = -s * 0.72;
    shoulder.add(elbow);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.1, 0.03), M.chrome);
    lower.position.y = -0.05;
    lower.castShadow = true;
    elbow.add(lower);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 10), M.chrome);
    tip.position.y = -0.113;
    tip.rotation.z = Math.PI + s * 0.4;
    elbow.add(tip);
    armTips.push(lower);
  });
}

// ---- フック設定用リグ（白ディスク＋ワイヤー＋わっか）----
const hookRig = new THREE.Group();
clawHead.add(hookRig);
{
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.085, 0.045, 28), M.white);
  disc.position.y = -0.062;
  disc.castShadow = true;
  hookRig.add(disc);
  const discRim = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.012, 28), M.darkTrim);
  discRim.position.y = -0.086;
  hookRig.add(discRim);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.085, 8), M.black);
  wire.position.y = -0.135;
  hookRig.add(wire);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.005, 10, 26), M.gold);
  ring.position.y = -0.205;
  ring.rotation.y = Math.PI / 4;
  ring.castShadow = true;
  hookRig.add(ring);
}
hookRig.visible = false;
const RING_LOCAL_Y = -0.205;   // わっか中心（ヘッド基準）

// ------------------------------------------------------------
// 物理ワールド (cannon-es)
// ------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.allowSleep = true;
world.solver.iterations = 12;
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.15;

function staticBox(hx, hy, hz, x, y, z) {
  const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  b.position.set(x, y, z);
  world.addBody(b);
  return b;
}

// 床（獲得口をよけて2枚）
staticBox(IX, 0.02, (HOLE.z0 + IZ) / 2, 0, FLOOR_Y - 0.02, (HOLE.z0 - IZ) / 2);
staticBox((IX - (-HOLE.x1)) / 2, 0.02, (IZ - HOLE.z0) / 2, (HOLE.x1 + IX) / 2, FLOOR_Y - 0.02, (HOLE.z0 + IZ) / 2);
// ガラス壁
staticBox(IX, 0.6, 0.015, 0, FLOOR_Y + 0.6, IZ + 0.015);
staticBox(IX, 0.6, 0.015, 0, FLOOR_Y + 0.6, -IZ - 0.015);
staticBox(0.015, 0.6, IZ, IX + 0.015, FLOOR_Y + 0.6, 0);
staticBox(0.015, 0.6, IZ, -IX - 0.015, FLOOR_Y + 0.6, 0);
// 獲得口シャフト壁＆回収ボックス底
staticBox(0.012, 0.3, (HOLE.z1 - HOLE.z0) / 2, HOLE.x1 + 0.012, FLOOR_Y - 0.28, (HOLE.z0 + HOLE.z1) / 2);
staticBox((HOLE.x1 - HOLE.x0) / 2, 0.3, 0.012, (HOLE.x0 + HOLE.x1) / 2, FLOOR_Y - 0.28, HOLE.z0 - 0.012);
staticBox(0.012, 0.3, (HOLE.z1 - HOLE.z0) / 2, HOLE.x0 - 0.012, FLOOR_Y - 0.28, (HOLE.z0 + HOLE.z1) / 2);
staticBox((HOLE.x1 - HOLE.x0) / 2, 0.3, 0.012, (HOLE.x0 + HOLE.x1) / 2, FLOOR_Y - 0.28, HOLE.z1 + 0.012);
staticBox((HOLE.x1 - HOLE.x0) / 2, 0.02, (HOLE.z1 - HOLE.z0) / 2, (HOLE.x0 + HOLE.x1) / 2, 0.30, (HOLE.z0 + HOLE.z1) / 2);

// クローの物理体（キネマティック）
const headBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(0.03) });
world.addBody(headBody);
const armBodies = armTips.map(() => {
  const b = new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(0.011, 0.052, 0.017)) });
  world.addBody(b);
  return b;
});

// ------------------------------------------------------------
// 景品
// ------------------------------------------------------------
const prizes = [];   // { mesh, body, kind, grabFactor, hasRing, ringMesh, scored }

function addPrize(mesh, body, opts) {
  mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  machine.add(mesh);
  body.allowSleep = true;
  body.sleepSpeedLimit = 0.12;
  body.sleepTimeLimit = 0.5;
  body.linearDamping = 0.15;
  body.angularDamping = 0.3;
  world.addBody(body);
  const p = { mesh, body, scored: false, hasRing: false, ...opts };
  if (opts.hasRing) {
    // フックリング（景品の上に密着して立つ）
    const ringR = opts.ringR || 0.03;
    const ringGroup = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.006, 10, 28), M.gold);
    ring.position.y = ringR + 0.008;
    ring.castShadow = true;
    ringGroup.add(ring);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, 0.008), M.gold);
    tab.position.y = -0.004;
    ringGroup.add(tab);
    machine.add(ringGroup);
    p.ringMesh = ringGroup;
    p.ringR = ringR;
    p.ringCenterLocal = (opts.ringOffset || 0) + ringR + 0.008;
  }
  prizes.push(p);
  return p;
}

function makeBoxPrize(x, z, bg, accent, label, hasRing, opts = {}) {
  const size = opts.size || [0.15, 0.115, 0.115];
  const tex = prizeBoxTex(bg, accent, label);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
  );
  const body = new CANNON.Body({
    mass: 0.34,
    shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
  });
  if (opts.shelfY) {
    body.position.set(x, opts.shelfY, z);
    body.angularDamping = 0.8;
  } else {
    body.position.set(x, FLOOR_Y + (opts.upright ? 0.08 : 0.2), z);
    const yaw = opts.upright ? Math.random() * 0.5 - 0.25 : Math.random() * 1.2 - 0.6;
    body.quaternion.setFromEuler(0, yaw, 0);
    if (opts.upright) body.angularDamping = 0.75;
  }
  return addPrize(mesh, body, { kind: 'box', grabFactor: 0.8, ringOffset: size[1] / 2 + 0.007, hasRing: !!hasRing, ringR: opts.ringR, topOffset: size[1] / 2 + 0.001 });
}

function makePlush(x, z, color, big) {
  const r = big ? 0.095 : 0.066;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), bodyMat);
  bodyMesh.scale.set(1, 0.92, 0.96);
  g.add(bodyMesh);
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.36, 14, 10), bodyMat);
    ear.position.set(s * r * 0.62, r * 0.78, 0);
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffc2d8, roughness: 0.9 }));
    inner.position.set(s * r * 0.62, r * 0.78, r * 0.22);
    g.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.3 }));
    eye.position.set(s * r * 0.32, r * 0.12, r * 0.85);
    g.add(eye);
  });
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  muzzle.position.set(0, -r * 0.08, r * 0.88);
  g.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x442222, roughness: 0.4 }));
  nose.position.set(0, -r * 0.04, r * 1.0);
  g.add(nose);
  const body = new CANNON.Body({ mass: big ? 0.62 : 0.24, shape: new CANNON.Sphere(r * 1.02) });
  body.position.set(x, FLOOR_Y + 0.25, z);
  body.angularDamping = 0.85;
  return addPrize(g, body, { kind: big ? 'bigplush' : 'plush', grabFactor: big ? 0.5 : 0.92, ringOffset: r + 0.03, topOffset: r });
}

function makeCapsule(x, z, color) {
  const r = 0.048;
  const g = new THREE.Group();
  const topH = new THREE.Mesh(
    new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transmission: 0.55, thickness: 0.01, transparent: true })
  );
  g.add(topH);
  const botH = new THREE.Mesh(
    new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 1 })
  );
  g.add(botH);
  const body = new CANNON.Body({ mass: 0.11, shape: new CANNON.Sphere(r) });
  body.position.set(x, FLOOR_Y + 0.2, z);
  return addPrize(g, body, { kind: 'capsule', grabFactor: 1.25, ringOffset: r + 0.03, topOffset: r });
}

// ------------------------------------------------------------
// フック設定のギミック（棚・アクリル台・S字フック・ひも）
// ------------------------------------------------------------
const acrylMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.06, transmission: 0.85, thickness: 0.01,
  transparent: true, opacity: 0.9,
});
let hookSetup = null;

function buildHookSetup() {
  clearHookSetup();
  const grp = new THREE.Group();
  machine.add(grp);
  const bodies = [];

  // 棚（獲得口の真上のアクリル板）— ここから景品が落ちてくる
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.37), acrylMat);
  shelf.position.set(-0.385, 1.05, 0.28);
  grp.add(shelf);
  const shelfBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(0.07, 0.006, 0.185)),
  });
  shelfBody.position.set(-0.385, 1.05, 0.28);
  world.addBody(shelfBody);
  bodies.push(shelfBody);
  // 棚の前フチ白ライン（棚下側・すべり落ちは妨げない）
  const shelfEdge = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.37), M.white);
  shelfEdge.position.set(-0.318, 1.037, 0.28);
  grp.add(shelfEdge);
  // 壁付けブラケット
  [0.14, 0.42].forEach((bz) => {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.05), M.white);
    br.position.set(-0.445, 1.02, bz);
    grp.add(br);
  });

  // フックステーション（アクリル台 + S字フック + ひも）
  const stations = [];
  const slots = [
    { sx: -0.04, sz: 0.30, pz: 0.18 },
    { sx: 0.16, sz: 0.04, pz: 0.28 },
    { sx: 0.32, sz: 0.27, pz: 0.38 },   // 前面ガラスの物理壁(z≧0.44)に触れない位置
  ];
  for (const s of slots) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.105, 0.09), acrylMat);
    ped.position.set(s.sx, 0.8525, s.sz);
    grp.add(ped);
    // 天板の白フチ（アクリル台の視認性UP）
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.01, 0.096), M.white);
    rim.position.set(s.sx, 0.909, s.sz);
    grp.add(rim);
    const pedBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(0.048, 0.057, 0.048)),
    });
    pedBody.position.set(s.sx, 0.857, s.sz);
    world.addBody(pedBody);
    bodies.push(pedBody);

    // S字フック（原点＝キャッチ先端）大きめで見やすく
    const hook = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.075, 10), M.chrome);
    rod.position.y = -0.043;
    hook.add(rod);
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 10), M.chrome);
    prong.rotation.z = 0.85;
    prong.position.set(0.013, -0.02, 0);
    hook.add(prong);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 8), M.gold);
    hook.add(tip);
    const tipY = 0.914 + 0.078;
    hook.position.set(s.sx, tipY, s.sz);
    grp.add(hook);

    // ひも（フック → 棚の景品）
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(),
    ]);
    const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xe8e0d0 }));
    grp.add(string);

    stations.push({
      x: s.sx, z: s.sz, pz: s.pz, tipY,
      hook, string, restPos: hook.position.clone(),
      prize: null, triggered: false,
    });
  }
  hookSetup = { grp, bodies, stations };
}

function clearHookSetup() {
  if (!hookSetup) return;
  machine.remove(hookSetup.grp);
  hookSetup.bodies.forEach((b) => world.removeBody(b));
  hookSetup = null;
  game.hookedStation = null;
}

// ---- 景品セットアップ（設定モードごと）----
function clearPrizes() {
  for (const p of prizes) {
    machine.remove(p.mesh);
    if (p.ringMesh) machine.remove(p.ringMesh);
    world.removeBody(p.body);
  }
  prizes.length = 0;
}

// スマホ軽量化：透過(transmission)マテリアルは追加の描画パスが要るので単純な半透明に置き換える
function applyMobileLite() {
  if (!IS_MOBILE) return;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.transmission > 0) {
        const t = m.transmission;
        m.transmission = 0;
        m.transparent = true;
        m.opacity = t >= 0.99 ? 0.13 : t >= 0.8 ? 0.3 : 0.6;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
    }
  });
}

function setupPrizes(mode) {
  if (game.grabbed) releaseGrab(true);
  clearPrizes();
  setTimeout(applyMobileLite, 0);
  // クレーンの見た目切替：フック設定では爪を格納してわっかリグを出す
  armPivots.forEach(({ group }) => { group.visible = mode !== 'hook'; });
  hookRig.visible = mode === 'hook';
  // フック設定中はアーム/ヘッドの当たり判定を無効化（わっか専用機）
  const mask = mode === 'hook' ? 0 : -1;
  armBodies.forEach((b) => { b.collisionFilterMask = mask; });
  headBody.collisionFilterMask = mask;
  if (mode === 'hook') {
    // ★フック設定★（参照動画方式）
    // クレーンのわっかをフックにひっかける → ひもで繋がった棚の景品が引き落とされる！
    buildHookSetup();
    const chocoDefs = [
      ['#6b3e1e', '#ffd15f', 'CHOCO'],
      ['#3e2412', '#ff8f5f', 'CACAO'],
      ['#8a5a2a', '#fff0c0', 'CRUNCH'],
    ];
    hookSetup.stations.forEach((st, i) => {
      const [bg, ac, label] = chocoDefs[i % chocoDefs.length];
      const p = makeBoxPrize(-0.385, st.pz, bg, ac, label, false, {
        shelfY: 1.112, size: [0.12, 0.10, 0.09],   // お菓子箱サイズ（隣と密着しない）
      });
      p.homePos = { x: -0.385, y: 1.112, z: st.pz };
      p.station = st;
      st.prize = p;
    });
    // 床の飾り景品（フック設定では取れないディスプレイ）
    makePlush(-0.25, -0.30, 0xff8fb3);
    makePlush(0.05, -0.32, 0x9fd8ff);
    makePlush(0.30, -0.32, 0xffb066);
    makeCapsule(-0.35, -0.12, 0xffa502);
  } else {
    clearHookSetup();
    // 通常設定（獲得口ちかくに狙い目、奥にストック）
    makeBoxPrize(-0.30, 0.10, '#ff6f9d', '#ffd15f', 'PRIZE', true); // リング付き・穴のフチでリーチ状態！
    makeBoxPrize(0.14, 0.06, '#5fd2ff', '#ffffff', 'HERO');
    makeBoxPrize(0.33, 0.26, '#b98cff', '#ffe45f', 'STAR');
    makeBoxPrize(-0.02, 0.28, '#2ed573', '#ffffff', 'LUCK');
    makePlush(-0.28, -0.14, 0xffb066);
    makePlush(0.02, -0.22, 0xff8fb3, false);
    makePlush(0.30, -0.14, 0x9fd8ff);
    makePlush(-0.10, -0.32, 0xfff3a0);
    makePlush(0.16, -0.34, 0x9effc2);
    makePlush(0.12, 0.30, 0xc9b7ff, true);   // 大物ぬいぐるみ
    makeCapsule(-0.12, 0.04, 0xff4757);
    makeCapsule(0.24, -0.30, 0x2ed573);
    makeCapsule(-0.32, -0.32, 0xffa502);
    makeCapsule(0.40, 0.02, 0x3fc1ff);
  }
}

// ------------------------------------------------------------
// 紙吹雪
// ------------------------------------------------------------
const confetti = [];
const confettiGeo = new THREE.PlaneGeometry(0.018, 0.03);
function burstConfetti(px, py, pz) {
  const cols = [0xff3fa4, 0xffe03f, 0x3fc1ff, 0x3fff8e, 0xb98cff];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(confettiGeo,
      new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
    m.position.set(px, py, pz);
    scene.add(m);
    confetti.push({
      m, life: 2.2,
      v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.6, (Math.random() - 0.3) * 1.6),
      spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
    });
  }
}
function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    c.v.y -= 3.2 * dt;
    c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
    c.m.material.opacity = Math.min(1, c.life);
    if (c.life <= 0) { scene.remove(c.m); c.m.material.dispose(); confetti.splice(i, 1); }
  }
}

// ------------------------------------------------------------
// ゲーム状態
// ------------------------------------------------------------
const game = {
  state: 'boot',        // boot idle ready moveX pauseX moveZ pauseZ descend closing grab lift return open settle
  mode: 'normal',       // 'normal' | 'hook'（フック設定）
  credits: 0,
  prizesWon: 0,
  clawX: HOME.x,
  clawZ: HOME.z,
  headY: HEAD_UP_Y,
  clawAngle: OPEN_ANGLE,
  targetAngle: OPEN_ANGLE,
  timer: 0,
  btn1Held: false,
  btn2Held: false,
  grabbed: null,        // { prize, constraint, grip }
  hookedStation: null,  // フック設定：わっかが掛かったステーション
  wonThisPlay: false,
  sway: { x: 0, z: 0, vx: 0, vz: 0 },
  prevVX: 0, prevVZ: 0,
};

function updateHUD() {
  ui.credit.textContent = game.credits;
  ui.prize.textContent = game.prizesWon;
  ui.btn1.disabled = !(game.state === 'ready' || game.state === 'moveX');
  ui.btn2.disabled = !(game.state === 'pauseX' || game.state === 'moveZ');
}

function insertCoin() {
  if (game.credits >= 9) return;
  snd.init();
  snd.coin();
  game.credits++;
  if (game.state === 'idle') {
    game.state = 'ready';
    setStatus('①ボタン長押しでヨコ移動！');
  } else if (game.state === 'boot') {
    // まだ開始前
  } else {
    setStatus(`クレジット ${game.credits} — プレイ中`);
  }
  updateHUD();
}

// ---- 状態遷移 ----
function startMoveX() {
  if (game.state !== 'ready') return;
  game.credits--;
  game.wonThisPlay = false;
  game.state = 'moveX';
  snd.buttonBeep();
  snd.motor(true, 1);
  setStatus('ヨコ移動中… はなすと止まるよ');
  updateHUD();
}
function stopMoveX() {
  if (game.state !== 'moveX') return;
  game.state = 'pauseX';
  snd.motor(false);
  setStatus('②ボタン長押しでタテ（奥）移動！');
  updateHUD();
}
function startMoveZ() {
  if (game.state !== 'pauseX') return;
  game.state = 'moveZ';
  snd.buttonBeep();
  snd.motor(true, 1.15);
  setStatus('タテ移動中… はなすと止まるよ');
  updateHUD();
}
function stopMoveZ() {
  if (game.state !== 'moveZ') return;
  game.state = 'pauseZ';
  game.timer = 0.45;
  snd.motor(false);
  setStatus('ねらいセット！アーム降下！');
  updateHUD();
}

// リング（輪）の中心のワールド座標
function ringCenterWorld(p) {
  const up = p.body.quaternion.vmult(new CANNON.Vec3(0, p.ringCenterLocal, 0));
  return new THREE.Vector3(p.body.position.x + up.x, p.body.position.y + up.y, p.body.position.z + up.z);
}

// フック判定：爪（下アーム〜先端）がリングの輪をかすめたら引っ掛かる
function tryHook() {
  for (const p of prizes) {
    if (p.scored || !p.hasRing) continue;
    const rc = ringCenterWorld(p);
    for (let i = 0; i < armTips.length; i++) {
      // 下アームに沿って6点サンプリング（付け根寄り〜爪先の先まで）
      for (const off of [0, -0.02, -0.04, -0.06, -0.08, -0.10]) {
        const tp = armTips[i].localToWorld(new THREE.Vector3(0, off, 0));
        if (tp.distanceTo(rc) < p.ringR + 0.03) {
          p.body.wakeUp();
          const hp = clawHead.position;
          const pivotA = new CANNON.Vec3(tp.x - hp.x, tp.y - hp.y, tp.z - hp.z);
          const localB = p.body.pointToLocalFrame(new CANNON.Vec3(rc.x, rc.y, rc.z));
          const c = new CANNON.PointToPointConstraint(
            headBody, pivotA, p.body, localB,
            p.body.mass * 9.82 * 14   // フックはガッチリ＝ほぼ外れない
          );
          world.addConstraint(c);
          game.grabbed = { prize: p, constraint: c, grip: 2, hooked: true };
          setStatus('フックにひっかかった！！');
          return true;
        }
      }
    }
  }
  return false;
}

// つかみ判定
function tryGrab() {
  const cx = game.clawX + game.sway.x;
  const cz = game.clawZ + game.sway.z;

  if (tryHook()) return true;

  // ---- 本体づかみ ----
  const gripY = game.headY - 0.19;
  let best = null, bestGrip = 0;
  for (const p of prizes) {
    if (p.scored) continue;
    const bp = p.body.position;
    const d = Math.hypot(bp.x - cx, bp.z - cz);
    const vOK = bp.y > gripY - 0.09 && bp.y < game.headY;
    if (!vOK) continue;
    let grip = Math.max(0, 1.15 - d / 0.078) * p.grabFactor;
    if (game.mode === 'hook') grip *= 0.22;   // フック設定はアームの握力が激弱
    grip *= 0.85 + Math.random() * 0.3;
    if (grip > bestGrip) { bestGrip = grip; best = p; }
  }

  if (best && bestGrip > 0.15) {
    const p = best;
    p.body.wakeUp();
    const grabWorld = new CANNON.Vec3(cx, Math.min(p.body.position.y + 0.02, gripY), cz);
    const localB = p.body.pointToLocalFrame(grabWorld);
    const c = new CANNON.PointToPointConstraint(
      headBody, new CANNON.Vec3(0, -0.19, 0),
      p.body, localB,
      p.body.mass * 9.82 * (0.55 + bestGrip * 2.4)
    );
    world.addConstraint(c);
    game.grabbed = { prize: p, constraint: c, grip: bestGrip, hooked: false };
    // 握力が弱いと持ち上げの途中でアームが開いてズルッと落ちる
    if (bestGrip < 0.55) {
      game.grabbed.slipTimer = 0.3 + bestGrip * 1.5 * Math.random() + Math.random() * 0.4;
    }
    return true;
  }
  return false;
}

// 弱づかみのスリップ進行（lift/return中に呼ぶ）
function updateSlipTimer(dt) {
  const gb = game.grabbed;
  if (!gb || gb.hooked || gb.slipTimer === undefined) return;
  gb.slipTimer -= dt;
  if (gb.slipTimer <= 0) {
    releaseGrab();
    game.targetAngle = 0.55;   // アームが力負けして開く
    setStatus('あーっ！アームが力負けして落ちた！！');
  }
}

function releaseGrab(silent) {
  if (!game.grabbed) return;
  world.removeConstraint(game.grabbed.constraint);
  game.grabbed.prize.body.wakeUp();
  game.grabbed = null;
  if (!silent) snd.thud();
}

// つかんだ景品がすべり落ちてないかチェック
function checkSlip() {
  if (!game.grabbed) return;
  const g = game.grabbed;
  const pa = g.constraint.pivotA;
  const anchor = new THREE.Vector3(
    headBody.position.x + pa.x, headBody.position.y + pa.y, headBody.position.z + pa.z
  );
  const wp = g.constraint.bodyB.pointToWorldFrame(g.constraint.pivotB);
  const dist = anchor.distanceTo(new THREE.Vector3(wp.x, wp.y, wp.z));
  const limit = g.hooked ? 0.17 : 0.11;
  if (dist > limit) {
    releaseGrab();
    setStatus(g.hooked ? 'あーっ！リングから外れた！！' : 'あーっ！すべり落ちた！！');
  }
}

// 獲得チェック（獲得口に落ちた景品）
function checkWins() {
  for (const p of prizes) {
    if (p.scored) continue;
    const bp = p.body.position;
    const inHole = bp.x > HOLE.x0 && bp.x < HOLE.x1 && bp.z > HOLE.z0 && bp.z < HOLE.z1;
    if (inHole && bp.y < FLOOR_Y - 0.18) {
      p.scored = true;
      game.prizesWon++;
      game.wonThisPlay = true;
      if (game.grabbed && game.grabbed.prize === p) releaseGrab(true);
      snd.win();
      burstConfetti(-0.31, 1.0, 0.62);
      ui.win.classList.add('show');
      setStatus('🎉 やったー！獲得！！ 🎉');
      setTimeout(() => ui.win.classList.remove('show'), 2600);
      setTimeout(() => respawnPrize(p), 3000);
      updateHUD();
    }
  }
}

function respawnPrize(p) {
  if (!prizes.includes(p)) return;   // 設定切替で入れ替わった景品は復活させない
  p.scored = false;
  p.body.velocity.setZero();
  p.body.angularVelocity.setZero();
  if (p.homePos) {
    // フック設定：棚の定位置にもどして再セット
    p.body.position.set(p.homePos.x, p.homePos.y, p.homePos.z);
    p.body.quaternion.set(0, 0, 0, 1);
    if (p.station) p.station.triggered = false;
  } else {
    p.body.position.set(-0.05 + Math.random() * 0.4, FLOOR_Y + 0.45, -0.32 + Math.random() * 0.25);
    p.body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);
  }
  p.body.wakeUp();
}

// ---- メイン状態マシン更新 ----
function updateGame(dt) {
  const g = game;
  switch (g.state) {
    case 'moveX':
      if (g.btn1Held) g.clawX = Math.min(CLAW_MAX_X, g.clawX + MOVE_SPEED * dt);
      if (g.clawX >= CLAW_MAX_X) stopMoveX();
      break;
    case 'moveZ':
      if (g.btn2Held) g.clawZ = Math.max(CLAW_MIN_Z, g.clawZ - MOVE_SPEED * dt);
      if (g.clawZ <= CLAW_MIN_Z) stopMoveZ();
      break;
    case 'pauseZ':
      g.timer -= dt;
      if (g.timer <= 0) {
        g.state = 'descend';
        g.targetAngle = OPEN_ANGLE;
        snd.motor(true, 0.75);
        // 近くの景品を起こす
        prizes.forEach((p) => {
          if (Math.hypot(p.body.position.x - g.clawX, p.body.position.z - g.clawZ) < 0.35) p.body.wakeUp();
        });
      }
      break;
    case 'descend': {
      g.headY -= DESCEND_SPEED * dt;
      const hcx = g.clawX + g.sway.x, hcz = g.clawZ + g.sway.z;

      if (g.mode === 'hook') {
        // ★フック設定★ わっかがフック先端の高さまで降りる
        let stopY = 1.035;   // なにもない所ではわっかが床すれすれまで
        let near = null;
        for (const st of hookSetup.stations) {
          if (Math.hypot(st.x - hcx, st.z - hcz) < 0.055) near = st;
        }
        if (near) stopY = near.tipY - RING_LOCAL_Y - 0.03;
        if (hcx < -0.27 && hcz > 0.06) stopY = Math.max(stopY, 1.30);  // 棚の上はぶつからない高さで停止
        if (g.headY <= stopY) {
          g.headY = stopY;
          snd.motor(false);
          if (near && Math.hypot(near.x - hcx, near.z - hcz) < 0.05 && !near.triggered) {
            g.hookedStation = near;
            snd.tone(1350, 0.12, 'square', 0.15);   // 金属のチン！
            snd.tone(1800, 0.2, 'square', 0.1, 0.06);
            setStatus('わっかがフックにかかった！！');
          } else {
            setStatus('スカッ…フックにかからなかった…');
          }
          g.state = 'grab';
          g.timer = 0.5;
        }
        break;
      }

      // 実機の接地センサー：真下に景品があればその上で停止（爪先＝景品の上面の高さ）
      let stopY = HEAD_DOWN_Y;
      for (const p of prizes) {
        if (p.scored) continue;
        const bp = p.body.position;
        if (Math.hypot(bp.x - hcx, bp.z - hcz) < 0.085) {
          stopY = Math.max(stopY, bp.y + (p.topOffset || 0.05) + 0.175);
        }
      }
      if (g.headY <= stopY) {
        g.headY = stopY;
        g.state = 'closing';
        g.timer = 0.25;
        snd.motor(false);
      }
      break;
    }
    case 'closing':
      g.timer -= dt;
      if (g.timer <= 0 && g.targetAngle !== CLOSED_ANGLE) {
        g.targetAngle = CLOSED_ANGLE;
        snd.clawClose();
      }
      // 閉じる途中でも爪先がリングを通ったら即フック！
      if (g.targetAngle === CLOSED_ANGLE && !game.grabbed && tryHook()) {
        g.targetAngle = 0.16;
        g.state = 'grab';
        g.timer = 0.4;
        break;
      }
      if (Math.abs(g.clawAngle - CLOSED_ANGLE) < 0.03) {
        const got = tryGrab();
        if (got) {
          if (game.grabbed.hooked) {
            g.targetAngle = 0.16;   // フック中は爪を閉じたままキープ
          } else {
            g.targetAngle = CARRY_ANGLE;
            setStatus(game.grabbed.grip > 1 ? 'ガッチリつかんだ！'
              : game.mode === 'hook' ? 'つかんだ…けど握力が激弱！！' : 'つかんだ…！たえてくれ～');
          }
        } else {
          setStatus(game.mode === 'hook' ? 'スカッ…！フック設定はリング狙いが正解だ' : 'うーん、つかめなかった…');
        }
        g.state = 'grab';
        g.timer = 0.4;
      }
      break;
    case 'grab':
      g.timer -= dt;
      if (g.timer <= 0) { g.state = 'lift'; snd.motor(true, 0.85); }
      break;
    case 'lift':
      g.headY += LIFT_SPEED * dt;
      checkSlip();
      updateSlipTimer(dt);
      // ★フック設定★ フックを引き上げるとひもが張って棚の景品が落ちる！
      if (g.hookedStation && !g.hookedStation.triggered && g.headY > g.hookedStation.tipY - RING_LOCAL_Y + 0.07) {
        const st = g.hookedStation;
        st.triggered = true;
        if (st.prize && !st.prize.scored) {
          const pb = st.prize.body;
          pb.wakeUp();
          // ひもがフック方向へグイッと引く（棚のフチを越えて獲得口へ落下）
          // ひもは上方のフックへ向かって強くヤンク → 景品が棚から飛び出す
          // （わずかに浮かせて棚との接触を切り、初速が接触ソルバーに食われないようにする）
          pb.position.y += 0.025;
          const dz = THREE.MathUtils.clamp(st.z - pb.position.z, -0.05, 0.05);
          pb.velocity.set(0.42, 1.05, dz);
          pb.angularVelocity.set(0, 0, -1.2);
          st.yankEnded = false;
        }
        snd.thud();
        setStatus('フックが引けた！景品が落ちるぞ！！');
      }
      if (g.headY >= HEAD_UP_Y) {
        g.headY = HEAD_UP_Y;
        g.state = 'return';
        snd.motor(true, 1);
      }
      break;
    case 'return': {
      const dx = HOME.x - g.clawX, dz = HOME.z - g.clawZ;
      const dist = Math.hypot(dx, dz);
      checkSlip();
      updateSlipTimer(dt);
      if (dist < 0.005) {
        g.clawX = HOME.x; g.clawZ = HOME.z;
        g.state = 'open';
        g.timer = 0.5;
        snd.motor(false);
      } else {
        const step = Math.min(RETURN_SPEED * dt, dist);
        g.clawX += (dx / dist) * step;
        g.clawZ += (dz / dist) * step;
      }
      break;
    }
    case 'open':
      g.timer -= dt;
      if (g.timer <= 0) {
        g.targetAngle = OPEN_ANGLE;
        snd.clawOpen();
        if (game.grabbed) releaseGrab(true);
        // ★フック設定★ わっかからフックが外れて台にもどる
        if (g.hookedStation) {
          g.hookedStation.hook.position.copy(g.hookedStation.restPos);
          g.hookedStation = null;
        }
        g.state = 'settle';
        g.timer = 1.6;
      }
      break;
    case 'settle':
      g.timer -= dt;
      if (g.timer <= 0) {
        if (!g.wonThisPlay) { snd.lose(); setStatus(g.credits > 0 ? 'ざんねん！①ボタンでもう一回！' : 'ざんねん…コインを入れてね'); }
        else setStatus(g.credits > 0 ? '①ボタンで次のプレイ！' : 'コインを入れてもう一勝負！');
        g.state = g.credits > 0 ? 'ready' : 'idle';
        updateHUD();
      }
      break;
  }
}

// ------------------------------------------------------------
// 入力
// ------------------------------------------------------------
function bindHold(el, down, up) {
  const d = (e) => {
    e.preventDefault();
    // 指が少しズレても長押しが切れないようポインタをキャプチャ
    try { if (e.pointerId !== undefined) el.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add('pressed'); down();
  };
  const u = (e) => { e.preventDefault(); el.classList.remove('pressed'); up(); };
  el.addEventListener('pointerdown', d);
  el.addEventListener('pointerup', u);
  el.addEventListener('pointercancel', u);
  el.addEventListener('lostpointercapture', u);
  el.addEventListener('pointerleave', (e) => { if (!el.hasPointerCapture || !el.hasPointerCapture(e.pointerId)) u(e); });
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
}
bindHold(ui.btn1, () => { game.btn1Held = true; startMoveX(); }, () => { game.btn1Held = false; stopMoveX(); });
bindHold(ui.btn2, () => { game.btn2Held = true; startMoveZ(); }, () => { game.btn2Held = false; stopMoveZ(); });
ui.coin.addEventListener('click', insertCoin);

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyC') insertCoin();
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    if (game.state === 'ready') { game.btn1Held = true; ui.btn1.classList.add('pressed'); startMoveX(); }
    else if (game.state === 'pauseX' && (e.code === 'Space')) { game.btn2Held = true; ui.btn2.classList.add('pressed'); startMoveZ(); }
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    if (game.state === 'pauseX') { game.btn2Held = true; ui.btn2.classList.add('pressed'); startMoveZ(); }
  }
  if (e.code === 'Space' && game.state === 'pauseX') { game.btn2Held = true; ui.btn2.classList.add('pressed'); startMoveZ(); }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    game.btn1Held = false; ui.btn1.classList.remove('pressed'); stopMoveX();
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    game.btn2Held = false; ui.btn2.classList.remove('pressed'); stopMoveZ();
  }
});

// カメラプリセット
function tweenCam(pos, tgt) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...tgt);
  let t = 0;
  const step = () => {
    t = Math.min(1, t + 0.045);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(p0, p1, e);
    controls.target.lerpVectors(t0, t1, e);
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}
$('cam-front').addEventListener('click', () => tweenCam([0, 1.62, 2.85], [0, 1.12, 0]));
$('cam-side').addEventListener('click', () => tweenCam([2.3, 1.5, 1.1], [0, 1.1, 0]));
$('cam-top').addEventListener('click', () => tweenCam([0.7, 2.6, 1.7], [-0.1, 0.95, 0]));
ui.mute.addEventListener('click', () => {
  snd.setMuted(!snd.muted);
  ui.mute.textContent = snd.muted ? '🔇 ミュート中' : '🔊 サウンド';
});

// 設定切替（通常 ⇄ フック設定）
const modeBtn = $('mode-btn');
modeBtn.addEventListener('click', () => {
  if (!['idle', 'ready', 'boot'].includes(game.state)) {
    setStatus('プレイ中は設定を変えられないよ！');
    return;
  }
  game.mode = game.mode === 'normal' ? 'hook' : 'normal';
  setupPrizes(game.mode);
  if (snd.ctx) snd.buttonBeep();
  if (game.mode === 'hook') {
    modeBtn.textContent = '⚙ フック設定 ▸ 通常設定へ';
    setStatus('★フック設定★ クレーンのわっかをフックに引っかけろ！景品が落ちてくるぞ！');
  } else {
    modeBtn.textContent = '⚙ 通常設定 ▸ フック設定へ';
    setStatus('通常設定にもどしたよ！');
  }
});

ui.start.addEventListener('click', () => {
  snd.init();
  ui.boot.style.opacity = 0;
  setTimeout(() => ui.boot.remove(), 650);
  game.state = 'idle';
  setStatus(IS_MOBILE ? 'コインを入れてスタート！（¥100ボタン）' : 'コインを入れてスタート！ [C]キー or ¥100ボタン');
  updateHUD();
});

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
const clock = new THREE.Clock();
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
let ledPhase = 0;

function tick(dt) {
  const g = game;

  if (g.state !== 'boot') updateGame(dt);

  // ---- スイング（振り子）----
  const vx = (g.clawX - (g._px ?? g.clawX)) / Math.max(dt, 1e-4);
  const vz = (g.clawZ - (g._pz ?? g.clawZ)) / Math.max(dt, 1e-4);
  g._px = g.clawX; g._pz = g.clawZ;
  const ax = (vx - g.prevVX) / Math.max(dt, 1e-4);
  const az = (vz - g.prevVZ) / Math.max(dt, 1e-4);
  g.prevVX = vx; g.prevVZ = vz;
  // 降下〜キャッチ中は実機同様ダンパーで揺れを止める
  const C = (g.state === 'pauseZ' || g.state === 'descend' || g.state === 'closing') ? 7 : 1.6;
  const K = 26;
  g.sway.vx += (-K * g.sway.x - C * g.sway.vx - ax * 0.05) * dt;
  g.sway.vz += (-K * g.sway.z - C * g.sway.vz - az * 0.05) * dt;
  g.sway.x = THREE.MathUtils.clamp(g.sway.x + g.sway.vx * dt, -0.05, 0.05);
  g.sway.z = THREE.MathUtils.clamp(g.sway.z + g.sway.vz * dt, -0.05, 0.05);

  // ---- クロー開閉 ----
  const angDiff = g.targetAngle - g.clawAngle;
  const angStep = Math.sign(angDiff) * Math.min(Math.abs(angDiff), 2.6 * dt);
  g.clawAngle += angStep;
  armPivots.forEach(({ group, side }) => { group.rotation.z = side * g.clawAngle; });

  // ---- ガントリー/ヘッドの配置 ----
  crossBeam.position.z = g.clawZ;
  trolley.position.set(g.clawX, RAIL_Y - 0.05, g.clawZ);
  const hx = g.clawX + g.sway.x, hz = g.clawZ + g.sway.z;
  clawHead.position.set(hx, g.headY, hz);
  clawHead.rotation.z = -g.sway.x * 2.2;
  clawHead.rotation.x = g.sway.z * 2.2;

  // ケーブル
  const topP = _v1.set(g.clawX, RAIL_Y - 0.09, g.clawZ);
  const botP = new THREE.Vector3(hx, g.headY + 0.05, hz);
  const mid = topP.clone().add(botP).multiplyScalar(0.5);
  const len = topP.distanceTo(botP);
  cableMesh.position.copy(mid);
  cableMesh.scale.set(1, len, 1);
  cableMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), botP.clone().sub(topP).normalize());

  // ---- 物理体をメッシュに同期（キネマティック側）----
  headBody.position.set(hx, g.headY, hz);
  armTips.forEach((tipMesh, i) => {
    tipMesh.updateWorldMatrix(true, false);
    tipMesh.matrixWorld.decompose(_v1, _q1, new THREE.Vector3());
    const b = armBodies[i];
    b.position.set(_v1.x, _v1.y, _v1.z);
    b.quaternion.set(_q1.x, _q1.y, _q1.z, _q1.w);
  });

  // ---- 物理ステップ ----
  world.step(1 / 120, dt, 4);

  // ---- 景品メッシュ同期 ----
  for (const p of prizes) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
    if (p.ringMesh) {
      const up = p.body.quaternion.vmult(new CANNON.Vec3(0, p.ringOffset, 0));
      p.ringMesh.position.set(p.body.position.x + up.x, p.body.position.y + up.y, p.body.position.z + up.z);
      p.ringMesh.quaternion.copy(p.body.quaternion);
    }
  }

  // ---- フック設定ギミックの更新（フック追従＆ひも描画）----
  if (hookSetup) {
    for (const st of hookSetup.stations) {
      if (game.hookedStation === st) {
        // フックはわっかにぶら下がって一緒に上がる
        st.hook.position.set(clawHead.position.x, clawHead.position.y + RING_LOCAL_Y - 0.026, clawHead.position.z);
      }
      // ヤンク後：棚を離れたらひもがたるんで失速 → 真下の獲得口へ落ちる
      if (st.triggered && st.prize && !st.prize.scored) {
        const pb = st.prize.body;
        if (!st.yankEnded && pb.position.x > -0.315) {
          st.yankEnded = true;
          pb.velocity.x *= 0.15;
          pb.velocity.z *= 0.3;
        }
        if (st.yankEnded && pb.position.y < 1.04 && pb.position.y > 0.55) {
          // 残ったひもに引かれて獲得口の真上へ（PDガイド）
          pb.velocity.x += ((-0.30 - pb.position.x) * 8 - pb.velocity.x * 4) * dt;
          const zTarget = THREE.MathUtils.clamp(pb.position.z, 0.20, 0.38);
          pb.velocity.z += ((zTarget - pb.position.z) * 8 - pb.velocity.z * 4) * dt;
        }
      }
      const showString = st.prize && !st.triggered && !st.prize.scored;
      st.string.visible = !!showString;
      if (showString) {
        const pos = st.string.geometry.attributes.position;
        const hp = st.hook.position, bp = st.prize.body.position;
        pos.setXYZ(0, hp.x, hp.y - 0.055, hp.z);
        pos.setXYZ(1, bp.x, bp.y + 0.05, bp.z);
        pos.needsUpdate = true;
      }
    }
  }

  checkWins();
  updateConfetti(dt);

  // ---- LED 電飾アニメ ----
  ledPhase += dt * 4;
  insideLights.forEach((led, i) => {
    const hue = ((i / insideLights.length) + ledPhase * 0.12) % 1;
    led.material.emissive.setHSL(hue, 1, 0.55);
    led.material.emissiveIntensity = 1.4 + Math.sin(ledPhase * 2 + i) * 0.9;
  });

  controls.update();
  if (!document.hidden) renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  tick(Math.min(clock.getDelta(), 0.05));
}
// 非表示タブでも物理・進行が完全停止しないようフォールバック
setInterval(() => {
  if (document.hidden && game.state !== 'boot') {
    clock.getDelta();
    for (let i = 0; i < 4; i++) tick(1 / 60);
  }
}, 100);
// デバッグ用フック
window.__tick = tick;
window.__game = game;
window.__prizes = prizes;
window.__isMobile = IS_MOBILE;
window.__snap = (w = 880) => {
  if (renderer.domElement.width === 0 || renderer.domElement.height === 0) {
    renderer.setSize(1280, 720, false);
    camera.aspect = 1280 / 720;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const h = Math.round(w * src.height / src.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.72);
};
window.__cam = (px, py, pz, tx, ty, tz) => {
  camera.position.set(px, py, pz);
  controls.target.set(tx, ty, tz);
  controls.update();
};

setupPrizes('normal');
updateHUD();
animate();
