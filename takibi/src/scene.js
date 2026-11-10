// 夜の森のキャンプサイト：地面・石の炉・木立・星空・月・小物
import * as THREE from '../lib/three.module.js';
import { PIT_R } from './wood.js';
import { staticPiece } from './logs.js';

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
}
const h3 = (x, y, z) => { let n = Math.sin(x*127.1 + y*311.7 + z*74.7)*43758.5453; return n - Math.floor(n); };
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf*xf*(3 - 2*xf); yf = yf*yf*(3 - 2*yf); zf = zf*zf*(3 - 2*zf);
  const l = (a, b, t) => a + (b - a)*t;
  return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
           l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf), zf);
}
function fbm3(x, y, z, o = 4) { let a = 0.5, s = 0; for (let i = 0; i < o; i++) { s += a*noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s; }
// 周期 per で繰り返す2次元ノイズ（継ぎ目のないタイル用）
function tnoise(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf*xf*(3 - 2*xf); yf = yf*yf*(3 - 2*yf);
  const w = (v) => ((v % per) + per) % per;
  const a = h3(w(xi), w(yi), seed), b = h3(w(xi + 1), w(yi), seed), c = h3(w(xi), w(yi + 1), seed), d = h3(w(xi + 1), w(yi + 1), seed);
  return a + (b - a)*xf + (c - a)*yf + (a - b - c + d)*xf*yf;
}
function tfbm(x, y, per, seed, o = 5) { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a*tnoise(x*f, y*f, per*f, seed + i*13); f *= 2; a *= 0.5; } return s; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  return t;
}

// ───────── 地面（落ち葉の積もった土） ─────────
function groundTextures() {
  const S = 2048, N = 512, rng = mulberry(77);
  const col = canvas(S, S), hgt = canvas(S, S);
  const cc = col.getContext('2d'), hc = hgt.getContext('2d');
  // 土の下地
  const base = canvas(N, N), bh = canvas(N, N);
  const bc = base.getContext('2d'), bhc = bh.getContext('2d');
  const id = bc.createImageData(N, N), ih = bhc.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = tfbm(x/N*8, y/N*8, 8, 3), m = tfbm(x/N*40, y/N*40, 40, 9, 3);
    const v = 0.55 + 0.7*(n - 0.5) + 0.35*(m - 0.5);
    const i = (y*N + x)*4;
    id.data[i] = 62*v + 8; id.data[i + 1] = 46*v + 6; id.data[i + 2] = 31*v + 4; id.data[i + 3] = 255;
    const hv = 110 + 90*(m - 0.5) + 60*(n - 0.5);
    ih.data[i] = ih.data[i + 1] = ih.data[i + 2] = hv; ih.data[i + 3] = 255;
  }
  bc.putImageData(id, 0, 0); bhc.putImageData(ih, 0, 0);
  cc.drawImage(base, 0, 0, S, S); hc.drawImage(bh, 0, 0, S, S);
  const wrap = (x, y, r, fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -r || x + dx > S + r || y + dy < -r || y + dy > S + r) continue;
      fn(x + dx, y + dy);
    }
  };
  // 小石
  for (let i = 0; i < 260; i++) {
    const x = rng()*S, y = rng()*S, r = 4 + rng()*rng()*20, a = rng()*6.28, g = 60 + rng()*70, sq = 0.6 + rng()*0.4;
    wrap(x, y, r*2, (px, py) => {
      for (const [ctx, isH] of [[cc, 0], [hc, 1]]) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.scale(1, sq);
        const gr = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
        if (isH) { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#888'); }
        else { gr.addColorStop(0, `rgb(${g + 30},${g + 26},${g + 20})`); gr.addColorStop(1, `rgb(${g*0.45},${g*0.43},${g*0.4})`); }
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.29); ctx.fill(); ctx.restore();
      }
    });
  }
  // 松葉・枯れ草
  for (let i = 0; i < 5200; i++) {
    const x = rng()*S, y = rng()*S, l = 14 + rng()*30, a = rng()*6.28, v = 70 + rng()*70;
    wrap(x, y, l, (px, py) => {
      cc.strokeStyle = `rgba(${v + 30},${v*0.72 + 10},${v*0.35},${0.5 + rng()*0.4})`; cc.lineWidth = 0.9 + rng()*0.8;
      cc.beginPath(); cc.moveTo(px, py); cc.quadraticCurveTo(px + Math.cos(a + 0.3)*l*0.5, py + Math.sin(a + 0.3)*l*0.5, px + Math.cos(a)*l, py + Math.sin(a)*l); cc.stroke();
      hc.strokeStyle = 'rgba(200,200,200,0.5)'; hc.lineWidth = 1.2;
      hc.beginPath(); hc.moveTo(px, py); hc.lineTo(px + Math.cos(a)*l, py + Math.sin(a)*l); hc.stroke();
    });
  }
  // 落ち葉
  const leafCols = [[150, 92, 38], [122, 70, 30], [168, 120, 50], [96, 58, 28], [74, 48, 26], [140, 62, 26], [110, 88, 44], [58, 40, 24]];
  for (let i = 0; i < 2100; i++) {
    const x = rng()*S, y = rng()*S, l = 16 + rng()*26, w = l*(0.32 + rng()*0.25), a = rng()*6.28;
    const c = leafCols[Math.floor(rng()*leafCols.length)], sh = 0.55 + rng()*0.6, curl = (rng() - 0.5)*0.5;
    wrap(x, y, l, (px, py) => {
      for (const [ctx, isH] of [[cc, 0], [hc, 1]]) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-l/2, 0);
        ctx.bezierCurveTo(-l*0.2, -w*(1 + curl), l*0.3, -w*(1 - curl), l/2, 0);
        ctx.bezierCurveTo(l*0.3, w*(1 + curl), -l*0.2, w*(1 - curl), -l/2, 0);
        if (isH) {
          const gr = ctx.createLinearGradient(0, -w, 0, w); gr.addColorStop(0, '#d8d8d8'); gr.addColorStop(0.5, '#9a9a9a'); gr.addColorStop(1, '#c4c4c4');
          ctx.fillStyle = gr; ctx.fill();
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
          const gr = ctx.createLinearGradient(0, -w, 0, w);
          gr.addColorStop(0, `rgb(${c[0]*sh},${c[1]*sh},${c[2]*sh})`); gr.addColorStop(1, `rgb(${c[0]*sh*0.7},${c[1]*sh*0.7},${c[2]*sh*0.7})`);
          ctx.fillStyle = gr; ctx.fill(); ctx.shadowColor = 'transparent';
          ctx.strokeStyle = `rgba(${c[0]*0.4},${c[1]*0.4},${c[2]*0.4},0.8)`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-l/2, 0); ctx.lineTo(l/2, 0); ctx.stroke();
          for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k*l*0.15, 0); ctx.lineTo(k*l*0.15 + l*0.12, -w*0.55); ctx.moveTo(k*l*0.15, 0); ctx.lineTo(k*l*0.15 + l*0.12, w*0.55); ctx.stroke(); }
        }
        ctx.restore();
      }
    });
  }
  // 小枝
  for (let i = 0; i < 110; i++) {
    const x = rng()*S, y = rng()*S, l = 40 + rng()*110, a = rng()*6.28, v = 40 + rng()*40;
    wrap(x, y, l, (px, py) => {
      for (const [ctx, isH] of [[cc, 0], [hc, 1]]) {
        ctx.strokeStyle = isH ? '#eee' : `rgb(${v + 22},${v + 8},${v*0.7})`; ctx.lineWidth = 2.5 + rng()*3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.cos(a + 0.2)*l*0.5, py + Math.sin(a + 0.2)*l*0.5, px + Math.cos(a)*l, py + Math.sin(a)*l); ctx.stroke();
      }
    });
  }
  return { map: tex(col), bump: tex(hgt, { data: true }) };
}

function barkTexture() {
  const W = 512, H = 1024, c = canvas(W, H), x = c.getContext('2d'), b = canvas(W, H), bx = b.getContext('2d');
  const id = x.createImageData(W, H), ib = bx.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i/W*24, v = j/H*6;
    const warp = tfbm(u*0.5, v, 6, 4, 3)*3;
    let r = 1 - Math.abs(2*tfbm(u + warp, v*0.6, 24, 21, 4) - 1);
    r = Math.pow(r, 1.8);
    const f = tnoise(i/W*120, j/H*40, 120, 5);
    const val = 0.18 + 0.82*r*(0.7 + 0.3*f);
    const k = (j*W + i)*4;
    id.data[k] = 20 + 96*val; id.data[k + 1] = 15 + 76*val; id.data[k + 2] = 12 + 58*val; id.data[k + 3] = 255;
    ib.data[k] = ib.data[k + 1] = ib.data[k + 2] = 255*val; ib.data[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); bx.putImageData(ib, 0, 0);
  return { map: tex(c), bump: tex(b, { data: true }) };
}

function rockTexture() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), id = x.createImageData(S, S), rng = mulberry(5);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const n = tfbm(i/S*6, j/S*6, 6, 31), m = tfbm(i/S*48, j/S*48, 48, 37, 3);
    const v = 0.5 + 0.8*(n - 0.5) + 0.5*(m - 0.5) + (rng() - 0.5)*0.12;
    const k = (j*S + i)*4;
    id.data[k] = 118*v + 14; id.data[k + 1] = 112*v + 13; id.data[k + 2] = 104*v + 12; id.data[k + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return tex(c);
}

function grassTexture() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d'), rng = mulberry(9);
  for (let i = 0; i < 46; i++) {
    const bx = S*0.5 + (rng() - 0.5)*S*0.5, top = S*(0.05 + rng()*0.5), lean = (rng() - 0.5)*S*0.7, w = 3 + rng()*4;
    const g = 80 + rng()*70;
    x.fillStyle = `rgb(${g + 30},${g + 12},${g*0.42})`;
    x.beginPath(); x.moveTo(bx - w, S); x.quadraticCurveTo(bx + lean*0.3, S*0.55, bx + lean, top); x.quadraticCurveTo(bx + lean*0.4, S*0.6, bx + w, S); x.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function silhouetteTexture() {
  const W = 4096, H = 512, c = canvas(W, H), x = c.getContext('2d'), rng = mulberry(41);
  x.fillStyle = '#000';
  x.fillRect(0, H*0.72, W, H);
  for (let i = 0; i < 230; i++) {
    const cx = rng()*W, h = H*(0.3 + rng()*0.62), w = h*(0.16 + rng()*0.1), top = H - h;
    for (const dx of [-W, 0, W]) {
      x.beginPath(); x.moveTo(cx + dx, top);
      const tiers = 9 + Math.floor(rng()*5);
      for (let k = 1; k <= tiers; k++) { const yy = top + (h*k)/tiers, ww = w*(k/tiers)*(0.75 + rng()*0.5); x.lineTo(cx + dx + ww, yy); x.lineTo(cx + dx + ww*0.45, yy - h/tiers*0.25); }
      x.lineTo(cx + dx, H);
      for (let k = tiers; k >= 1; k--) { const yy = top + (h*k)/tiers, ww = w*(k/tiers)*(0.75 + rng()*0.5); x.lineTo(cx + dx - ww*0.45, yy - h/tiers*0.25); x.lineTo(cx + dx - ww, yy); }
      x.closePath(); x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ───────── 星空 ─────────
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform float uTime, uSidereal, uMoonPhase;
uniform vec3 uMoonDir, uMeteor;   // uMeteor: 進み具合(0..1), 方位, 高さ
float h31(vec3 p){ p = fract(p*vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y)*p.z); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*n3(p); p = p*2.1 + 4.7; a *= 0.5; } return s; }
vec3 stars(vec3 d, float scale, float dens, float gain){
  vec3 p = d*scale, i = floor(p), f = fract(p);
  float h = h31(i);
  if (h > dens) return vec3(0.0);
  vec3 o = vec3(h31(i + 1.3), h31(i + 2.7), h31(i + 3.9))*0.6 + 0.2;
  float mag = pow(h31(i + 5.1), 7.0);
  float r = 0.055 + 0.07*mag;
  float s = smoothstep(r, 0.0, length(f - o));
  float tw = 0.78 + 0.22*sin(uTime*(1.5 + 5.0*h31(i + 6.1)) + h*90.0);
  float tc = h31(i + 8.3);
  vec3 col = mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.84, 1.0), tc);
  return col*s*s*(0.05 + mag*4.0)*tw*gain;
}
void main(){
  vec3 d = normalize(vDir);
  // 北極星まわりに日周運動
  vec3 ax = normalize(vec3(0.0, 0.58, -0.81));
  float ca = cos(uSidereal), sa = sin(uSidereal);
  vec3 r = d*ca + cross(ax, d)*sa + ax*dot(ax, d)*(1.0 - ca);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.0105, 0.014, 0.024), vec3(0.0028, 0.0042, 0.0095), pow(up, 0.55));
  // 天の川
  vec3 mwN = normalize(vec3(0.45, 0.35, 0.82));
  float band = exp(-pow(dot(r, mwN), 2.0)*9.0);
  float cloud = fbm(r*5.0)*fbm(r*11.0 + 3.0);
  col += vec3(0.020, 0.022, 0.032)*band*(0.25 + 3.2*cloud);
  float ext = smoothstep(0.02, 0.35, up);   // 地平近くは大気で暗い
  vec3 st = stars(r, 70.0, 0.20, 2.6) + stars(r, 150.0, 0.30, 1.4) + stars(r, 310.0, 0.35 + 0.35*band, 0.6 + 0.8*band);
  col += st*ext;
  // 月（実際の月齢で満ち欠けする）
  vec3 m = normalize(uMoonDir);
  float md = acos(clamp(dot(d, m), -1.0, 1.0));
  float R = 0.0105;
  vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), m)), my = cross(m, mx);
  vec2 q = vec2(dot(d, mx), dot(d, my))/R;
  float rr = dot(q, q);
  float lit = 0.0;
  if (rr < 1.0){
    vec3 nrm = vec3(q, sqrt(1.0 - rr));
    float pa = uMoonPhase*6.28318;
    vec3 sun = vec3(sin(pa), 0.12, -cos(pa));
    float l = smoothstep(-0.03, 0.12, dot(nrm, normalize(sun)));
    float mare = 0.72 + 0.28*smoothstep(0.35, 0.65, fbm(vec3(q*1.6, 2.0)));
    col = vec3(0.004) + vec3(1.0, 0.96, 0.86)*l*mare*2.2;
    lit = l;
  }
  float illum = 0.5 - 0.5*cos(uMoonPhase*6.28318);
  col += vec3(0.5, 0.6, 0.8)*illum*(0.0009/(md*md + 0.0009) + 0.012*exp(-md*6.0))*(1.0 - lit);
  // 流れ星
  if (uMeteor.x > 0.0){
    float az = uMeteor.y, el = uMeteor.z;
    vec3 a = vec3(cos(el)*sin(az), sin(el), -cos(el)*cos(az));
    vec3 dirm = normalize(cross(a, vec3(0.3, 1.0, 0.2)));
    vec3 head = normalize(a + dirm*0.22*uMeteor.x);
    vec3 tail = normalize(a + dirm*0.22*max(0.0, uMeteor.x - 0.35));
    vec3 pa2 = d - tail, ba = head - tail;
    float hh = clamp(dot(pa2, ba)/dot(ba, ba), 0.0, 1.0);
    float dist = length(pa2 - ba*hh);
    col += vec3(0.9, 0.95, 1.0)*smoothstep(0.0022, 0.0, dist)*hh*hh*sin(uMeteor.x*3.14159)*1.5;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export function moonPhaseNow(date = new Date()) {
  const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((date.getTime() - ref)/86400000/syn) % 1;
  return (p + 1) % 1;
}

export function buildScene(scene) {
  const rng = mulberry(2026);
  const out = { stones: [], pick: [], update: null };

  scene.fog = new THREE.FogExp2(0x02040a, 0.045);

  // 空
  const moonDir = new THREE.Vector3(-0.62, 0.52, -0.58).normalize();
  const phase = moonPhaseNow();
  const skyU = {
    uTime: { value: 0 }, uSidereal: { value: 0 }, uMoonPhase: { value: phase }, uMoonDir: { value: moonDir },
    uMeteor: { value: new THREE.Vector3(0, 0, 0) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }',
    fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // 遠景の木立のシルエット
  const sil = new THREE.Mesh(
    new THREE.CylinderGeometry(60, 60, 26, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: silhouetteTexture(), color: 0x010203, transparent: true, alphaTest: 0.5, side: THREE.BackSide, fog: false })
  );
  sil.position.y = 10.5; sil.material.map.repeat.set(3, 1);
  scene.add(sil);

  // 光
  const illum = 0.5 - 0.5*Math.cos(phase*Math.PI*2);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.10, 0.14, 0.26), new THREE.Color(0.02, 0.02, 0.022), 3.0 + 3.0*illum);   // 星明かり。火が無いときに眼が慣れて見える程度
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(new THREE.Color(0.55, 0.68, 1.0), 0.05 + 1.6*illum);
  moon.position.copy(moonDir).multiplyScalar(30);
  scene.add(moon);
  const fireLight = new THREE.PointLight(new THREE.Color(1.0, 0.47, 0.15), 0, 0, 1.6);   // 眼の順応ぶんだけ、物理より少し遠くまで届かせる
  fireLight.position.set(0, 0.3, 0);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.camera.near = 0.04; fireLight.shadow.camera.far = 16;
  fireLight.shadow.bias = -0.004; fireLight.shadow.normalBias = 0.025; fireLight.shadow.radius = 3;
  scene.add(fireLight);
  const emberLight = new THREE.PointLight(new THREE.Color(1.0, 0.2, 0.03), 0, 0, 2);
  emberLight.position.set(0, 0.1, 0);
  scene.add(emberLight);
  const matchLight = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.25), 0, 0, 2);
  scene.add(matchLight);
  Object.assign(out, { fireLight, emberLight, matchLight, hemi, moon, skyU, moonIllum: illum });

  // 地面
  const gt = groundTextures();
  gt.map.repeat.set(14, 14); gt.bump.repeat.set(14, 14);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(42, 42, 1, 1), new THREE.MeshStandardMaterial({ map: gt.map, bumpMap: gt.bump, bumpScale: 2.2, roughness: 0.96, metalness: 0 }));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
  scene.add(ground);
  out.ground = ground;

  // 炉のまわりの踏み固められた土
  {
    const c = canvas(256, 256), x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(10,8,6,0.92)'); g.addColorStop(0.45, 'rgba(14,11,8,0.7)'); g.addColorStop(1, 'rgba(14,11,8,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI/2; m.position.y = 0.002; m.receiveShadow = true;
    scene.add(m);
  }

  // 石の炉
  const rockTex = rockTexture();
  const nStone = 13;
  for (let i = 0; i < nStone; i++) {
    const a = i/nStone*Math.PI*2 + (rng() - 0.5)*0.12;
    const sx = 0.105 + rng()*0.045, sy = 0.075 + rng()*0.04, sz = 0.095 + rng()*0.04;
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const p = geo.attributes.position, nrm = geo.attributes.normal, col = new Float32Array(p.count*3);
    const sd = rng()*100;
    const dist = PIT_R + 0.085 + (rng() - 0.5)*0.03;
    const cx = Math.cos(a)*dist, cz = Math.sin(a)*dist, yaw = rng()*6.28;
    // 球を凹凸のある角ばった塊へ。法線は近傍2点との差分から滑らかに求める
    const shapeAt = (x, y, z, o) => {
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
      const d = 0.72 + 0.5*fbm3(x*1.3 + sd, y*1.3, z*1.3, 3) + 0.05*fbm3(x*6 + sd, y*6, z*6, 2);
      const f = 1/Math.pow(Math.pow(Math.abs(x), 3) + Math.pow(Math.abs(y), 3) + Math.pow(Math.abs(z), 3), 1/3);
      const s = d*(0.6 + 0.4*f);
      return o.set(x*s*sx, y*s*sy, z*s*sz);
    };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), D = new THREE.Vector3();
    const tintStone = 0.8 + 0.4*rng();
    for (let k = 0; k < p.count; k++) {
      D.set(p.getX(k), p.getY(k), p.getZ(k)).normalize();
      T1.set(-D.z, 0, D.x); if (T1.lengthSq() < 1e-4) T1.set(1, 0, 0); T1.normalize(); T2.crossVectors(D, T1);
      shapeAt(D.x, D.y, D.z, A);
      shapeAt(D.x + T1.x*0.02, D.y + T1.y*0.02, D.z + T1.z*0.02, B);
      shapeAt(D.x + T2.x*0.02, D.y + T2.y*0.02, D.z + T2.z*0.02, C);
      B.sub(A); C.sub(A); B.cross(C).normalize(); if (B.dot(D) < 0) B.negate();
      p.setXYZ(k, A.x, A.y, A.z); nrm.setXYZ(k, B.x, B.y, B.z);
      // 炉の内側を向いた面は煤で黒い
      const wx = cx + A.x*Math.cos(yaw) + A.z*Math.sin(yaw), wz = cz - A.x*Math.sin(yaw) + A.z*Math.cos(yaw);
      const inward = THREE.MathUtils.smoothstep(dist - Math.hypot(wx, wz), -0.03, 0.09);
      const soot = 1 - 0.82*inward*(0.6 + 0.4*fbm3(A.x*30, A.y*30, A.z*30, 2));
      col[k*3] = soot*tintStone; col[k*3 + 1] = soot*tintStone*0.98; col[k*3 + 2] = soot*tintStone*0.95;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rockTex, vertexColors: true, roughness: 0.93, metalness: 0 }));
    m.position.set(cx, sy*0.55, cz); m.rotation.y = yaw;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    out.stones.push({ x: cx, y: sy*0.5, z: cz, R: (sx + sz)*0.5*0.95 });
  }

  // 木立
  const bark = barkTexture();
  bark.map.repeat.set(2, 5); bark.bump.repeat.set(2, 5);
  const barkMat = new THREE.MeshStandardMaterial({ map: bark.map, bumpMap: bark.bump, bumpScale: 4, roughness: 0.95 });
  const barkVariant = (ru, rv, rot) => {
    const m = bark.map.clone(), b = bark.bump.clone();
    for (const t of [m, b]) { t.repeat.set(ru, rv); if (rot) { t.rotation = Math.PI/2; } t.needsUpdate = true; }
    return new THREE.MeshStandardMaterial({ map: m, bumpMap: b, bumpScale: 3, roughness: 0.95 });
  };
  const trunkGeo = new THREE.CylinderGeometry(0.75, 1, 1, 14, 8, true);
  {
    const p = trunkGeo.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.5; const fl = 1 + 0.55*Math.exp(-y*14); p.setX(k, p.getX(k)*fl); p.setZ(k, p.getZ(k)*fl); p.setY(k, y); }
    trunkGeo.computeVertexNormals();
  }
  const trees = [];
  const fixed = [[-3.6, -3.9, 0.27], [3.0, -4.9, 0.33], [-0.7, -7.4, 0.3], [5.6, -1.8, 0.25], [-5.9, -0.5, 0.3], [1.1, -10.0, 0.36], [-4.4, 3.2, 0.26], [5.0, 3.5, 0.28]];
  for (const f of fixed) trees.push({ x: f[0], z: f[1], r: f[2] });
  for (let i = 0; i < 70; i++) {
    const a = rng()*6.28, d = 7 + rng()*17;
    const x = Math.cos(a)*d, z = Math.sin(a)*d;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 2.0)) continue;
    trees.push({ x, z, r: 0.2 + rng()*0.2 });
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const coneGeo = new THREE.ConeGeometry(1, 1, 18, 3, true);
  {
    const p = coneGeo.attributes.position, r2 = mulberry(3);
    for (let k = 0; k < p.count; k++) { const j = 0.85 + 0.3*r2(); p.setX(k, p.getX(k)*j); p.setZ(k, p.getZ(k)*j); p.setY(k, p.getY(k) + (r2() - 0.5)*0.1); }
    coneGeo.computeVertexNormals();
  }
  // 枝ぶり：裾がぎざぎざに垂れ、ところどころ透ける葉むらを抜き型で作る
  const boughTex = (() => {
    const W = 1024, H = 256, c = canvas(W, H), x = c.getContext('2d'), r3 = mulberry(17);
    for (let i = 0; i < 150; i++) {
      const cx = r3()*W, w = 14 + r3()*30, len = H*(0.45 + r3()*0.55), g = 30 + r3()*40;
      for (const dx of [-W, 0, W]) {
        const gr = x.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, `rgb(${g*0.5},${g*0.85},${g*0.5})`); gr.addColorStop(1, `rgb(${g*0.75},${g*1.25},${g*0.7})`);
        x.fillStyle = gr;
        x.beginPath(); x.moveTo(cx + dx - w, 0); x.lineTo(cx + dx + w, 0);
        for (let k = 1; k <= 6; k++) { const yy = len*k/6; x.lineTo(cx + dx + w*(1 - k/6.5)*(0.6 + 0.8*r3()), yy - len/14); x.lineTo(cx + dx + w*(1 - k/6)*0.5, yy); }
        for (let k = 6; k >= 1; k--) { const yy = len*k/6; x.lineTo(cx + dx - w*(1 - k/6)*0.5, yy); x.lineTo(cx + dx - w*(1 - k/6.5)*(0.6 + 0.8*r3()), yy - len/14); }
        x.closePath(); x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.repeat.set(2, 1);
    return t;
  })();
  const leafMat = new THREE.MeshStandardMaterial({ map: boughTex, alphaTest: 0.5, color: new THREE.Color(0.55, 0.62, 0.5), roughness: 1, side: THREE.DoubleSide });
  const TIERS = 10;
  const cones = new THREE.InstancedMesh(coneGeo, leafMat, trees.length*TIERS);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
  trees.forEach((t, i) => {
    const h = 13 + rng()*7;
    Q.setFromEuler(new THREE.Euler((rng() - 0.5)*0.05, rng()*6.28, (rng() - 0.5)*0.05));
    M.compose(Pp.set(t.x, -0.05, t.z), Q, S.set(t.r, h, t.r)); trunks.setMatrixAt(i, M);
    const start = 5.2 + rng()*2.6;
    for (let k = 0; k < TIERS; k++) {
      const u = k/(TIERS - 1), y = start + (h - start + 1.5)*u, w = (1.45 + rng()*0.55)*(1 - u*0.82), hh = (h - start)/TIERS*2.6;
      Q.setFromEuler(new THREE.Euler(0, rng()*6.28, 0));
      M.compose(Pp.set(t.x, y + hh*0.5, t.z), Q, S.set(w, hh, w)); cones.setMatrixAt(i*TIERS + k, M);
    }
  });
  trunks.castShadow = true; trunks.receiveShadow = true; cones.receiveShadow = true;
  scene.add(trunks, cones);

  // 草むら
  {
    const gtex = grassTexture();
    const g1 = new THREE.PlaneGeometry(1, 1); g1.translate(0, 0.5, 0);
    const g2 = g1.clone(); g2.rotateY(Math.PI/2);
    const pos = [...g1.attributes.position.array, ...g2.attributes.position.array];
    const uv = [...g1.attributes.uv.array, ...g2.attributes.uv.array];
    const idx = [...g1.index.array, ...Array.from(g2.index.array, v => v + 4)];
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    gg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
    gg.setIndex(idx);
    const gm = new THREE.MeshStandardMaterial({ map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color(0.2, 0.19, 0.115) });
    const N = 900, inst = new THREE.InstancedMesh(gg, gm, N);
    for (let i = 0; i < N; i++) {
      const a = rng()*6.28, d = 1.45 + Math.pow(rng(), 0.7)*10;
      let x = Math.cos(a)*d, z = Math.sin(a)*d;
      if (z > 0.2 && Math.abs(x) < 1.5 && z < 3.2) { x += Math.sign(x || 1)*1.5; }   // 座っている手前は空ける
      const s = 0.16 + rng()*0.3;
      Q.setFromEuler(new THREE.Euler(0, rng()*6.28, 0));
      M.compose(Pp.set(x, -0.01, z), Q, S.set(s*1.2, s, s*1.2)); inst.setMatrixAt(i, M);
    }
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // 転がる小石
  {
    const pg = new THREE.IcosahedronGeometry(1, 1);
    const p = pg.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 0.8 + 0.4*h3(p.getX(k)*3, p.getY(k)*3, p.getZ(k)*3); p.setXYZ(k, p.getX(k)*s, p.getY(k)*s*0.6, p.getZ(k)*s); }
    pg.computeVertexNormals();
    const N = 150, inst = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, color: 0xb0aca4 }), N);
    for (let i = 0; i < N; i++) {
      const a = rng()*6.28, d = 0.75 + Math.pow(rng(), 1.4)*5, s = 0.012 + rng()*rng()*0.05;
      Q.setFromEuler(new THREE.Euler(rng()*0.4, rng()*6.28, rng()*0.4));
      M.compose(Pp.set(Math.cos(a)*d, s*0.2, Math.sin(a)*d), Q, S.set(s, s, s)); inst.setMatrixAt(i, M);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    scene.add(inst);
  }

  // ───────── 手元の道具（クリックで手に取れる） ─────────
  const addPick = (obj, kind) => { obj.traverse(o => { o.userData.pick = kind; }); out.pick.push(obj); };
  // 薪の山
  {
    const g = new THREE.Group();
    const rows = [[5, 0], [4, 1], [3, 2], [2, 3]];
    for (const [n, lvl] of rows) for (let i = 0; i < n; i++) {
      const L = 0.34 + rng()*0.06, r = 0.04 + rng()*0.012;
      const m = staticPiece('log', Math.floor(rng()*1e6), L, r, rng()*1000);
      m.position.set((rng() - 0.5)*0.03, 0.045 + lvl*0.072, (i - (n - 1)/2)*0.092 + (rng() - 0.5)*0.01);
      m.rotation.set(rng()*6.28, (rng() - 0.5)*0.12, (rng() - 0.5)*0.05, 'YZX');
      g.add(m);
    }
    g.position.set(0.98, 0, 0.5); g.rotation.y = 0.5;
    scene.add(g); addPick(g, 'log');
    out.logPile = g;
  }
  // 細枝の束
  {
    const g = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const L = 0.26 + rng()*0.08, r = 0.006 + rng()*0.003;
      const m = staticPiece('kindling', Math.floor(rng()*1e6), L, r, rng()*1000);
      const lvl = Math.floor(i/9);
      m.position.set((rng() - 0.5)*0.05, 0.01 + lvl*0.014 + rng()*0.006, ((i % 9) - 4)*0.017 + (rng() - 0.5)*0.012);
      m.rotation.set(rng()*6.28, (rng() - 0.5)*0.35, (rng() - 0.5)*0.08, 'YZX');
      g.add(m);
    }
    g.position.set(-0.8, 0, 0.66); g.rotation.y = -0.45;
    scene.add(g); addPick(g, 'kindling');
    out.kindlingPile = g;
  }
  // 切り株と、その上のマッチ箱・火口
  {
    const stump = new THREE.Group();
    const ringC = canvas(256, 256), rx = ringC.getContext('2d');
    rx.fillStyle = '#8a6a44'; rx.fillRect(0, 0, 256, 256);
    for (let r = 124; r > 2; r -= 3 + rng()*3) { rx.strokeStyle = `rgba(${70 + rng()*30},${48 + rng()*20},${26 + rng()*14},${0.5 + rng()*0.4})`; rx.lineWidth = 1 + rng()*1.6; rx.beginPath(); rx.ellipse(128 + rng()*3, 128 + rng()*3, r, r*0.97, 0, 0, 6.29); rx.stroke(); }
    for (let i = 0; i < 9; i++) { const a = rng()*6.28; rx.strokeStyle = 'rgba(30,20,12,0.7)'; rx.lineWidth = 1.5; rx.beginPath(); rx.moveTo(128 + Math.cos(a)*20, 128 + Math.sin(a)*20); rx.lineTo(128 + Math.cos(a)*(70 + rng()*50), 128 + Math.sin(a)*(70 + rng()*50)); rx.stroke(); }
    const topT = new THREE.CanvasTexture(ringC); topT.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.19, 0.27, 20, 1, true), barkVariant(1, 0.12));
    body.position.y = 0.135; body.castShadow = true; body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.165, 20), new THREE.MeshStandardMaterial({ map: topT, roughness: 0.85 }));
    top.rotation.x = -Math.PI/2; top.position.y = 0.27; top.receiveShadow = true;
    stump.add(body, top);
    stump.position.set(-1.02, 0, 0.26);
    scene.add(stump);
    // マッチ箱
    const mc = canvas(256, 128), mx = mc.getContext('2d');
    mx.fillStyle = '#1d2b4a'; mx.fillRect(0, 0, 256, 128);
    mx.fillStyle = '#e9dcc0'; mx.fillRect(14, 14, 228, 100);
    mx.fillStyle = '#b3261e'; mx.beginPath(); mx.arc(128, 64, 30, 0, 6.29); mx.fill();
    mx.fillStyle = '#e9dcc0'; mx.beginPath(); mx.moveTo(128, 40); mx.quadraticCurveTo(146, 62, 128, 86); mx.quadraticCurveTo(112, 64, 128, 40); mx.fill();
    mx.fillStyle = '#1d2b4a'; mx.font = 'bold 15px serif'; mx.textAlign = 'center'; mx.fillText('安全燐寸', 128, 110);
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9 });
    const face = new THREE.MeshStandardMaterial({ map: mt, roughness: 0.75 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.017, 0.037), [side, side, face, face, side, side]);
    box.position.set(-0.97, 0.279, 0.32); box.rotation.y = 0.5; box.castShadow = true;
    scene.add(box); addPick(box, 'match');
    out.matchBox = box;
    const nest = staticPiece('tinder', 1, 0.11, 0.045, 3);
    nest.position.set(-1.07, 0.305, 0.21);
    scene.add(nest); addPick(nest, 'tinder');
    const nest2 = staticPiece('tinder', 2, 0.10, 0.04, 8);
    nest2.position.set(-0.99, 0.3, 0.17); nest2.rotation.y = 1;
    scene.add(nest2); addPick(nest2, 'tinder');
  }
  // 向かいの丸太（腰掛け）
  {
    const g = new THREE.CylinderGeometry(0.17, 0.19, 1.7, 18, 4);
    const m = new THREE.Mesh(g, barkVariant(1, 0.7));
    m.rotation.z = Math.PI/2; m.rotation.y = 0.18; m.position.set(0.25, 0.16, -1.55);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  // 流れ星をときどき流す
  let meteorT = -1, nextMeteor = 40 + Math.random()*90;
  out.update = (t, dt) => {
    skyU.uTime.value = t;
    // 恒星時：実時刻に合わせてゆっくり回る
    const now = new Date();
    skyU.uSidereal.value = ((now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds())/86164)*Math.PI*2 + now.getMonth()*0.52;
    nextMeteor -= dt;
    if (meteorT < 0 && nextMeteor < 0) { meteorT = 0; skyU.uMeteor.value.set(0.001, (Math.random() - 0.5)*2.4, 0.5 + Math.random()*0.7); nextMeteor = 60 + Math.random()*150; }
    if (meteorT >= 0) { meteorT += dt/0.9; skyU.uMeteor.value.x = meteorT; if (meteorT >= 1) { meteorT = -1; skyU.uMeteor.value.x = 0; } }
  };
  return out;
}
