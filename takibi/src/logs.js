// 薪・細枝・火口・熾床の見た目
// 木目・樹皮・年輪・焦げ・亀甲状の割れ・赤熱・灰は すべてシェーダで手続き的に描く。
import * as THREE from '../lib/three.module.js';
import { NODES } from './wood.js';

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
}

// ───────── 形状 ─────────
// 長さ1（x: -0.5〜0.5）、太さ1 の単位形状。mesh.scale で実寸にする。
const geoCache = new Map();

function buildSolid(sides, rng, rings, wobble) {
  // sides: [{pts:[[y,z],...], bark:0|1}]  断面を辺グループごとに持つ（グループ境界は稜線として立つ）
  const pos = [], bark = [], cap = [], uv = [], idx = [];
  const ph = [rng()*6.28, rng()*6.28, rng()*6.28, rng()*6.28];
  const ringT = (j) => {
    const x = j/rings - 0.5;
    const s = 1 + wobble*(Math.sin(x*5.1 + ph[0])*0.6 + Math.sin(x*11.3 + ph[1])*0.4);
    const oy = wobble*0.8*Math.sin(x*3.3 + ph[2]), oz = wobble*0.8*Math.sin(x*4.1 + ph[3]);
    return [x, s, oy, oz];
  };
  let per = 0;
  for (const side of sides) {
    const base = pos.length/3, n = side.pts.length;
    for (let j = 0; j <= rings; j++) {
      const [x, s, oy, oz] = ringT(j);
      for (let k = 0; k < n; k++) {
        pos.push(x, side.pts[k][0]*s + oy, side.pts[k][1]*s + oz);
        bark.push(side.bark); cap.push(0);
        uv.push(per + k/(n - 1), j/rings);
      }
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < n - 1; k++) {
      const a = base + j*n + k, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    per += 1;
  }
  // 木口（両端）
  const loop = [];
  for (const side of sides) for (let k = 0; k < side.pts.length - 1; k++) loop.push(side.pts[k]);
  let cy = 0, cz = 0; for (const p of loop) { cy += p[0]; cz += p[1]; } cy /= loop.length; cz /= loop.length;
  for (const end of [0, rings]) {
    const [x, s, oy, oz] = ringT(end);
    const base = pos.length/3;
    pos.push(x, cy*s + oy, cz*s + oz); bark.push(0); cap.push(1); uv.push(0.5, 0.5);
    for (const p of loop) { pos.push(x, p[0]*s + oy, p[1]*s + oz); bark.push(0); cap.push(1); uv.push(0.5 + p[0]*0.5, 0.5 + p[1]*0.5); }
    for (let k = 0; k < loop.length; k++) {
      const a = base + 1 + k, b = base + 1 + (k + 1) % loop.length;
      if (end === 0) idx.push(base, a, b); else idx.push(base, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(bark, 1));
  g.setAttribute('aCap', new THREE.Float32BufferAttribute(cap, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 面の向きを外向きに揃える（断面の回り方によって裏返ることがあるため）
  const nrm = g.attributes.normal, p3 = g.attributes.position;
  let out = 0;
  for (let i = 0; i < nrm.count; i++) if (cap.length && cap[i] === 0) out += nrm.getY(i)*(p3.getY(i) - cy) + nrm.getZ(i)*(p3.getZ(i) - cz);
  if (out < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  return g;
}

function normalizeSides(sides) {
  // 重心を原点に、最大半径を1に
  let cy = 0, cz = 0, n = 0;
  for (const s of sides) for (const p of s.pts) { cy += p[0]; cz += p[1]; n++; }
  cy /= n; cz /= n;
  let m = 0;
  for (const s of sides) for (const p of s.pts) { p[0] -= cy; p[1] -= cz; m = Math.max(m, Math.hypot(p[0], p[1])); }
  for (const s of sides) for (const p of s.pts) { p[0] /= m; p[1] /= m; }
  return sides;
}

function logGeometry(shape) {
  const rng = mulberry(shape);
  const type = rng();
  let sides;
  const jit = (v) => v*(1 + (rng() - 0.5)*0.12);
  if (type < 0.55) {
    // 四つ割り（くさび形）：樹皮の弧＋2つの割り面
    const th = 1.35 + rng()*0.6;
    const arc = [];
    for (let k = 0; k <= 8; k++) { const a = -th/2 + th*k/8; arc.push([Math.cos(a)*jit(1), Math.sin(a)*jit(1)]); }
    const e0 = arc[0], e1 = arc[arc.length - 1];
    const apex = [(rng() - 0.5)*0.12, (rng() - 0.5)*0.12];
    const mid = (a, b) => [(a[0] + b[0])/2 + (rng() - 0.5)*0.1, (a[1] + b[1])/2 + (rng() - 0.5)*0.1];
    sides = [{ pts: arc, bark: 1 }, { pts: [e1, mid(e1, apex), apex], bark: 0 }, { pts: [apex, mid(apex, e0), e0], bark: 0 }];
  } else if (type < 0.82) {
    // 半割り
    const arc = [];
    for (let k = 0; k <= 10; k++) { const a = -Math.PI/2 + Math.PI*k/10; arc.push([Math.cos(a)*jit(1), Math.sin(a)*jit(1)]); }
    const e0 = arc[0], e1 = arc[arc.length - 1];
    sides = [{ pts: arc, bark: 1 }, { pts: [e1, [(rng() - 0.5)*0.12, 0.33], [(rng() - 0.5)*0.12, -0.33], e0], bark: 0 }];
  } else {
    // 丸太（細めの枝）
    const arc = [];
    const base = [];
    for (let k = 0; k < 12; k++) base.push(jit(1));
    for (let k = 0; k <= 12; k++) { const a = Math.PI*2*k/12; const r = base[k % 12]; arc.push([Math.cos(a)*r, Math.sin(a)*r]); }
    sides = [{ pts: arc, bark: 1 }];
  }
  return buildSolid(normalizeSides(sides), rng, 14, 0.05);
}

function kindlingGeometry(shape) {
  const rng = mulberry(shape);
  const n = 4 + (rng() < 0.4 ? 1 : 0);
  const pts = [];
  for (let k = 0; k < n; k++) { const a = Math.PI*2*k/n + (rng() - 0.5)*0.5; const r = 0.75 + rng()*0.35; pts.push([Math.cos(a)*r, Math.sin(a)*r]); }
  const sides = [];
  for (let k = 0; k < n; k++) sides.push({ pts: [pts[k].slice(), pts[(k + 1) % n].slice()], bark: rng() < 0.2 ? 1 : 0 });
  normalizeSides(sides);
  const flat = 0.5 + rng()*0.3;   // 鉈で割った薄い木っ端
  for (const sd of sides) for (const q of sd.pts) q[1] *= flat;
  return buildSolid(sides, rng, 8, 0.10);
}

function tinderGeometry(shape) {
  // フェザースティックの削り屑：くるりと巻いた薄い木のリボンを丸めたかたまり
  const rng = mulberry(shape);
  const pos = [], nor = [], bark = [], cap = [], uv = [], idx = [];
  const curls = 64;
  const A = new THREE.Vector3(), U = new THREE.Vector3(), W = new THREE.Vector3(), P = new THREE.Vector3(), N = new THREE.Vector3(), C = new THREE.Vector3();
  for (let s = 0; s < curls; s++) {
    const a = rng()*6.283, b = Math.acos(2*rng() - 1), rr = 0.75*Math.pow(rng(), 0.6);
    C.set(Math.cos(b)*0.36*rr, Math.sin(b)*Math.cos(a)*rr*0.62 - 0.08, Math.sin(b)*Math.sin(a)*rr*0.8);
    A.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    U.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(A).normalize(); W.crossVectors(A, U);
    const rad = 0.10 + rng()*0.20, turns = 1.2 + rng()*2.2, pitch = (rng() - 0.3)*0.16, wdt = 0.07 + rng()*0.09;
    const seg = Math.ceil(turns*10), base = pos.length/3, tone = rng();
    for (let k = 0; k <= seg; k++) {
      const t = k/seg, ang = t*turns*6.283, r = rad*(1 - 0.35*t);
      N.copy(U).multiplyScalar(Math.cos(ang)).addScaledVector(W, Math.sin(ang));
      P.copy(C).addScaledVector(N, r).addScaledVector(A, pitch*t*turns);
      P.x *= 0.5;   // 長さ方向（x）は ±0.5 に収める
      for (const sg of [-1, 1]) {
        pos.push(P.x + A.x*wdt*sg*0.5, P.y + A.y*wdt*sg, P.z + A.z*wdt*sg);
        nor.push(N.x, N.y, N.z); bark.push(tone); cap.push(0); uv.push(t, sg*0.5 + 0.5);
      }
    }
    for (let k = 0; k < seg; k++) { const q = base + k*2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(bark, 1));
  g.setAttribute('aCap', new THREE.Float32BufferAttribute(cap, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function pieceGeometry(kind, shape) {
  const key = kind + ':' + (kind === 'tinder' ? shape % 3 : shape % 24);
  let g = geoCache.get(key);
  if (!g) {
    g = kind === 'log' ? logGeometry(shape % 24 + 11) : kind === 'kindling' ? kindlingGeometry(shape % 24 + 101) : tinderGeometry(shape % 3 + 7);
    geoCache.set(key, g);
  }
  return g;
}

// ───────── 材質 ─────────
const GLSL_NOISE = /* glsl */`
float wh31(vec3 p){ p = fract(p*vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y)*p.z); }
float wn3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(wh31(i), wh31(i+vec3(1,0,0)), f.x), mix(wh31(i+vec3(0,1,0)), wh31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(wh31(i+vec3(0,0,1)), wh31(i+vec3(1,0,1)), f.x), mix(wh31(i+vec3(0,1,1)), wh31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float wfbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*wn3(p); p = p*2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return s; }
// 3次元ボロノイ：x=最近点までの距離, y=境界までの近さ, z=セルの乱数
vec3 wvoro(vec3 p, float jit){
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = i + g;
    vec3 o = 0.5 + jit*(vec3(wh31(c), wh31(c + 17.3), wh31(c + 41.7)) - 0.5);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = wh31(c + 7.7); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
`;

const VERT_PARS = /* glsl */`
attribute float aBark;
attribute float aCap;
uniform float uLen, uTexOff, uR0;
uniform float uNodeRad[${NODES}];
varying vec3 vObj;
varying float vT, vBark, vCap;
float nodeLerpV(float arr[${NODES}], float t){
  float f = clamp(t, 0.0, 1.0)*${(NODES - 1).toFixed(1)};
  int i = int(min(floor(f), ${(NODES - 2).toFixed(1)}));
  return mix(arr[i], arr[i+1], f - float(i));
}
`;
const VERT_BEGIN = /* glsl */`
float tt = position.x + 0.5;
transformed.yz *= nodeLerpV(uNodeRad, tt);
vObj = vec3(tt*uLen + uTexOff, position.yz*uR0);
vT = tt; vBark = aBark; vCap = aCap;
`;

const FRAG_PARS = /* glsl */`
uniform float uTime, uSeed, uKind, uR0;
uniform float uNodeChar[${NODES}], uNodeHeat[${NODES}], uNodeAsh[${NODES}];
varying vec3 vObj;
varying float vT, vBark, vCap;
float gRough; vec3 gEmis; float gBump;
${GLSL_NOISE}
float nodeLerp(float arr[${NODES}], float t){
  float f = clamp(t, 0.0, 1.0)*${(NODES - 1).toFixed(1)};
  int i = int(min(floor(f), ${(NODES - 2).toFixed(1)}));
  return mix(arr[i], arr[i+1], f - float(i));
}
`;

const FRAG_COLOR = /* glsl */`
{
  vec3 P = vObj + vec3(uSeed, uSeed*0.37, uSeed*0.71);
  vec3 alb; float rough = 0.86; float bump = 0.0;
  float fiber = wfbm(vec3(P.x*7.0, P.y*210.0, P.z*210.0));
  if (uKind > 1.5) {
    // 火口（麻・枯れ草）
    alb = mix(vec3(0.50, 0.36, 0.19), vec3(0.80, 0.66, 0.44), vBark);
    alb *= 0.8 + 0.4*wn3(P*vec3(60.0, 400.0, 400.0));
    rough = 0.95;
  } else if (vCap > 0.5) {
    // 木口：年輪と放射状の干割れ
    float rr = length(vObj.yz)/uR0;
    float ring = 0.5 + 0.5*sin(rr*34.0 + wn3(P*60.0)*3.0);
    alb = mix(vec3(0.50, 0.33, 0.17), vec3(0.66, 0.49, 0.29), ring);
    float ang = atan(vObj.z, vObj.y);
    float crk = smoothstep(0.86, 1.0, wn3(vec3(ang*5.0, uSeed, 2.0)))*smoothstep(0.15, 0.8, rr);
    alb *= 1.0 - 0.75*crk;
    alb *= 0.85 + 0.3*wn3(P*300.0);
    bump = ring*0.3 - crk;
    rough = 0.92;
  } else if (vBark > 0.5 && uKind < 0.5) {
    // 樹皮：縦に走る深い溝
    float rdg = 1.0 - abs(2.0*wfbm(vec3(P.x*11.0, P.y*52.0, P.z*52.0)) - 1.0);
    rdg = pow(rdg, 2.2);
    float fine = wn3(vec3(P.x*60.0, P.y*260.0, P.z*260.0));
    alb = mix(vec3(0.035, 0.026, 0.02), vec3(0.20, 0.155, 0.115), rdg*(0.6 + 0.4*fine));
    alb = mix(alb, vec3(0.16, 0.18, 0.13), smoothstep(0.62, 0.8, wn3(P*26.0))*0.35);   // 地衣・苔
    bump = rdg*1.6 + fine*0.25;
    rough = 0.96;
  } else {
    // 割り面：繊維の筋
    float streak = wn3(vec3(P.x*3.0, P.y*70.0, P.z*70.0));
    alb = mix(vec3(0.46, 0.30, 0.15), vec3(0.72, 0.56, 0.34), 0.25 + 0.75*fiber);
    alb = mix(alb, vec3(0.40, 0.22, 0.10), smoothstep(0.55, 0.9, streak)*0.45);
    if (uKind > 0.5 && vBark > 0.5) alb *= vec3(0.45, 0.36, 0.3);
    bump = fiber*0.5 + streak*0.2;
    rough = 0.80;
  }
  // 焦げ：ノイズで縁を崩しながら黒くなる
  float ch = nodeLerp(uNodeChar, vT);
  float heat = nodeLerp(uNodeHeat, vT);
  float ash = nodeLerp(uNodeAsh, vT);
  float cn = wfbm(P*vec3(22.0, 60.0, 60.0));
  float toast = smoothstep(0.0, 0.5, ch*1.5 - cn*0.5);
  float black = smoothstep(0.25, 0.75, ch*1.7 - cn*0.75);
  alb = mix(alb, alb*vec3(0.34, 0.2, 0.1), toast);
  alb = mix(alb, vec3(0.034, 0.031, 0.030), black);
  // 亀甲状の割れ（ワニ皮状炭化）
  // 太い薪ほど大きく四角く割れる（実物は2〜3cm角の升目になる）
  float cs = uKind < 0.5 ? 1.0 : 1.9;
  vec3 Pw = P + 0.006*vec3(wn3(P*55.0), wn3(P*55.0 + 11.0), wn3(P*55.0 + 23.0));   // 割れ目をまっすぐにしない
  vec3 vo = wvoro(Pw*vec3(40.0, 64.0, 64.0)*cs, 0.7);
  vec3 vo2 = wvoro(Pw*vec3(95.0, 150.0, 150.0)*cs, 1.0);                              // 升目の中の細かなひび
  float crack = max(1.0 - smoothstep(0.0, 0.15, vo.y), 0.45*(1.0 - smoothstep(0.0, 0.10, vo2.y)));
  float plate = smoothstep(0.0, 0.13, vo.y)*(0.8 + 0.2*smoothstep(0.0, 0.1, vo2.y));  // 升目の上面は平ら
  bump = mix(bump, plate*3.4 + vo.z*0.8, black);
  rough = mix(rough, 0.5 + 0.3*vo.z, black);
  alb *= 1.0 - 0.78*crack*black;
  // 赤熱：割れ目から光り、熾になると面全体が光る
  float pulse = 0.62 + 0.38*wn3(vec3(P.xy*36.0, P.z*36.0 + uTime*0.55)) + 0.12*sin(uTime*7.0 + vo.z*40.0);
  float hc = heat*black;
  float deep = 1.0 - smoothstep(0.0, 0.07, vo.y);    // 赤く見えるのは割れ目の底だけ
  // 炎が上がっているあいだは、熱のこもる所の割れ目だけが赤い。熾になると全体が光る
  float where = smoothstep(0.62 - heat*0.75, 0.86 - heat*0.75, wfbm(P*vec3(7.0, 16.0, 16.0) + 3.0));
  float gl = hc*(deep*1.5*where + plate*smoothstep(0.45, 1.1, heat + vo.z*0.35)*0.9 + 0.03)*pulse;
  if (uKind > 1.5) gl = heat*black*pulse*1.4;
  vec3 hot = mix(vec3(1.0, 0.06, 0.0), vec3(1.0, 0.36, 0.05), smoothstep(0.2, 1.0, gl));
  hot = mix(hot, vec3(1.0, 0.62, 0.22), smoothstep(1.1, 2.2, gl));
  // 灰：冷えた炭の上にうっすら積もる
  float an = wfbm(P*vec3(90.0, 140.0, 140.0));
  float am = ash*black*smoothstep(0.35, 0.75, an + ash*0.35);
  alb = mix(alb, vec3(0.50, 0.49, 0.47), am*0.85);
  rough = mix(rough, 1.0, am);
  gl *= 1.0 - 0.6*am;
  diffuseColor.rgb = alb;
  gRough = rough;
  gBump = bump;
  gEmis = hot*gl*gl*9.0;
}
`;

const FRAG_BUMP = /* glsl */`
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(gBump), dhy = dFdy(gBump);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
  normal = normalize(abs(det)*normal - 0.0011*grad);
}
`;

function patch(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BEGIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmis;');
}

const timeU = { value: 0 };
export function setLogTime(t) { timeU.value = t; }

export function makePieceMaterial(kind, opts = {}) {
  const u = {
    uTime: timeU,
    uSeed: { value: opts.seed || 0 },
    uKind: { value: kind === 'log' ? 0 : kind === 'kindling' ? 1 : 2 },
    uLen: { value: opts.L || 0.36 }, uTexOff: { value: opts.texOff || 0 }, uR0: { value: opts.r0 || 0.04 },
    uNodeRad: { value: new Float32Array(NODES).fill(1) },
    uNodeChar: { value: new Float32Array(NODES) },
    uNodeHeat: { value: new Float32Array(NODES) },
    uNodeAsh: { value: new Float32Array(NODES) },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: kind === 'tinder' ? THREE.DoubleSide : THREE.FrontSide });
  m.userData.u = u;
  m.onBeforeCompile = (shader) => patch(shader, u);
  m.customProgramCacheKey = () => 'takibi-wood';
  return m;
}

// 薪1本ぶんのメッシュ
export class PieceView {
  constructor(piece) {
    this.piece = piece;
    this.mat = makePieceMaterial(piece.kind, { seed: piece.seed, L: piece.L, texOff: piece.texOff, r0: piece.r0 });
    this.mesh = new THREE.Mesh(pieceGeometry(piece.kind, piece.shape), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.piece = piece;
    this.sync();
  }
  sync() {
    const p = this.piece, m = this.mesh, u = this.mat.userData.u;
    m.position.copy(p.p0).add(p.p1).multiplyScalar(0.5);
    _d.copy(p.p1).sub(p.p0).normalize();
    _q.setFromUnitVectors(_x, _d);
    _q2.setFromAxisAngle(_x, p.roll);
    m.quaternion.copy(_q).multiply(_q2);
    let mean = 0; for (let i = 0; i < NODES; i++) mean += p.rad[i]; mean /= NODES;
    m.scale.set(p.L, mean, mean);
    u.uLen.value = p.L;
    for (let i = 0; i < NODES; i++) {
      u.uNodeRad.value[i] = p.rad[i]/mean;
      u.uNodeChar.value[i] = p.charVis[i];
      const hot = Math.max(Math.min(1.6, p.glow[i]), 0.22*Math.min(1, Math.max(0, (p.T[i] - 480)/450)));
      u.uNodeHeat.value[i] += (hot - u.uNodeHeat.value[i])*0.2;
      u.uNodeAsh.value[i] = p.ash[i];
    }
  }
  dispose() { this.mat.dispose(); }
}
const _d = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// 置き場などに飾る、燃えない薪
export function staticPiece(kind, shape, L, r, seed) {
  const mat = makePieceMaterial(kind, { seed, L, r0: r });
  const mesh = new THREE.Mesh(pieceGeometry(kind, shape), mat);
  mesh.scale.set(L, r, r);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ───────── 熾床（おきどこ） ─────────
export function makeEmberBed() {
  const g2 = new THREE.PlaneGeometry(0.96, 0.96, 96, 96);
  g2.rotateX(-Math.PI/2);
  const u = {
    uTime: timeU, uBedH: { value: 0.006 }, uBedE: { value: 0 }, uCoal: { value: 0 }, uAsh: { value: 0 }, uBlow: { value: 0 },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uBedH; varying vec2 vXZ; varying float vH;
        float bh21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        float bn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(bh21(i), bh21(i+vec2(1,0)), f.x), mix(bh21(i+vec2(0,1)), bh21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vXZ = position.xz;
        float r2 = dot(position.xz, position.xz);
        float lump = 0.6 + 0.8*bn2(position.xz*26.0) + 0.3*bn2(position.xz*70.0);
        vH = uBedH*exp(-r2/0.075);
        transformed.y += vH*lump + 0.002;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uBedE, uCoal, uAsh, uBlow; varying vec2 vXZ; varying float vH;
        vec3 bEmis; float bBump;
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float r = length(vXZ);
          float fade = 1.0 - smoothstep(0.36, 0.47, r + 0.04*wn3(vec3(vXZ*14.0, 1.0)));
          vec3 P = vec3(vXZ.x, 0.0, vXZ.y);
          float n = wfbm(P*30.0), n2 = wfbm(P*110.0 + 9.0);
          // 焼けた土 → 灰
          vec3 soil = vec3(0.022, 0.017, 0.013)*(0.6 + 0.9*n);
          vec3 ashc = mix(vec3(0.16, 0.155, 0.15), vec3(0.42, 0.41, 0.39), n2);
          float ashAmt = clamp(uAsh*2.2 + uCoal*0.6, 0.0, 1.0)*exp(-r*r/0.06);
          vec3 alb = mix(soil, ashc, smoothstep(0.2, 0.8, ashAmt + n*0.5 - 0.25));
          // 熾：ボロノイの塊ごとに温度が違う
          // 大小ふた回りの塊。塊ごとに温度が違い、上面は灰をかぶり、すき間が強く光る
          vec3 vo = wvoro(vec3(vXZ*34.0 + 0.6*vec2(wn3(P*60.0), wn3(P*60.0 + 7.0)), 3.0), 1.0);
          vec3 vs = wvoro(vec3(vXZ*88.0, 9.0), 1.0);
          float cov = clamp(uCoal*2.4, 0.0, 1.0)*exp(-r*r/0.05);
          float isCoal = smoothstep(0.35, 0.6, cov + vo.z*0.45 - 0.2);
          float seam = 1.0 - smoothstep(0.0, 0.20, vo.y);
          float seamS = 1.0 - smoothstep(0.0, 0.22, vs.y);
          float pulse = 0.55 + 0.45*wn3(vec3(vXZ*16.0, uTime*0.4)) + 0.16*sin(uTime*(2.0 + vo.z*3.0) + vo.z*50.0);
          float heat = uBedE*(0.25 + 1.05*vo.z*vo.z + 0.25*vs.z)*pulse*(1.0 + uBlow*1.1);
          float ashTop = smoothstep(0.38, 0.72, n2 + 0.25*vs.z - 0.45*heat + 0.25);
          float body = mix(0.55, 0.07, ashTop)*(1.0 - seam);
          float gl = isCoal*heat*(seam*1.25 + seamS*0.35*(1.0 - ashTop) + body);
          alb = mix(alb, vec3(0.012), isCoal);
          alb = mix(alb, vec3(0.36, 0.35, 0.34), isCoal*ashTop*(1.0 - seam)*0.85);
          vec3 hot = mix(vec3(1.0, 0.045, 0.0), vec3(1.0, 0.30, 0.04), smoothstep(0.1, 0.8, gl));
          hot = mix(hot, vec3(1.0, 0.55, 0.16), smoothstep(1.3, 2.6, gl));
          bEmis = hot*gl*gl*4.2;
          bBump = mix(n*0.6, (1.0 - seam)*1.6 + vs.x*0.5, isCoal);
          diffuseColor.rgb = alb;
          diffuseColor.a = fade;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          float dhx = dFdx(bBump), dhy = dFdy(bBump);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          normal = normalize(abs(det)*normal - 0.006*grad);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEmis;');
  };
  const mesh = new THREE.Mesh(g2, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.u = u;
  return mesh;
}

// ───────── 熾の塊 ─────────
// 燃え崩れた薪は、ごろりとした炭の塊になって熾床に残る。奥のすき間ほど強く光り、上面は灰をかぶる。
export class EmberChunks {
  constructor(scene, max = 110) {
    this.max = max;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const h = (x, y, z) => { const v = Math.sin(x*12.9898 + y*78.233 + z*37.719)*43758.5453; return v - Math.floor(v); };
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const s = 0.72 + 0.5*h(Math.round(x*2.2), Math.round(y*2.2), Math.round(z*2.2));   // 面ごとに削いだ、角ばった塊
      p.setXYZ(k, x*s*1.25, y*s*0.8, z*s);
    }
    g.computeVertexNormals();
    // 面の角を残しつつ、丸みのある陰影にする
    const nr = g.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      const l = Math.hypot(p.getX(k), p.getY(k), p.getZ(k)) || 1;
      const nx = nr.getX(k)*0.4 + p.getX(k)/l*0.6, ny = nr.getY(k)*0.4 + p.getY(k)/l*0.6, nz = nr.getZ(k)*0.4 + p.getZ(k)/l*0.6, nl = Math.hypot(nx, ny, nz);
      nr.setXYZ(k, nx/nl, ny/nl, nz/nl);
    }
    this.heat = new Float32Array(max); this.seed = new Float32Array(max);
    g.setAttribute('aHeat', new THREE.InstancedBufferAttribute(this.heat, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aHeat; attribute float aSeed; varying float vHeat; varying float vSeed; varying vec3 vLoc; varying float vUpN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat; vSeed = aSeed; vLoc = position;\n#ifdef USE_INSTANCING\nvUpN = normalize(mat3(instanceMatrix)*normal).y;\n#else\nvUpN = normal.y;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; varying float vHeat; varying float vSeed; varying vec3 vLoc; varying float vUpN; vec3 cEmis;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 P = vLoc*2.4 + vSeed*31.0;
            float n = wfbm(P), n2 = wn3(P*5.0);
            float pulse = 0.6 + 0.4*wn3(vec3(P.xy*0.8, uTime*0.45 + vSeed*7.0));
            // 上面は灰、下や側面のすき間ほど熱がこもって明るい
            float ash = smoothstep(0.1, 0.75, vUpN + 0.5*n - 0.25)*(1.0 - 0.6*smoothstep(0.7, 1.5, vHeat));
            float gl = vHeat*pulse*(0.35 + 0.95*(1.0 - max(vUpN, 0.0)))*(1.0 - 0.72*ash)*(0.6 + 0.8*n);
            vec3 hot = mix(vec3(1.0, 0.045, 0.0), vec3(1.0, 0.30, 0.04), smoothstep(0.1, 0.8, gl));
            hot = mix(hot, vec3(1.0, 0.52, 0.14), smoothstep(1.4, 2.8, gl));
            cEmis = hot*gl*gl*2.3;
            diffuseColor.rgb = mix(vec3(0.03, 0.028, 0.027)*(0.6 + 0.8*n2), vec3(0.085, 0.082, 0.08), ash*0.8);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEmis;');
    };
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  spawn(x, y, z, size, hearth, count = 0) {
    const n = count || 2 + Math.floor(Math.random()*3);
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = Math.random()*6.283, d = Math.random()*0.07;
      const px = x + Math.cos(a)*d, pz = z + Math.sin(a)*d;
      const s = size*(0.55 + Math.random()*0.7);
      this.items.push({ x: px, z: pz, dy: Math.max(0, y - hearth.groundY(px, pz)), s, s0: s, rx: Math.random()*6.283, ry: Math.random()*6.283, rz: Math.random()*6.283, k: 0.6 + Math.random()*0.8, seed: Math.random()*100, heat: 1.2, vy: 0 });
    }
  }
  kick(x, z, r) {   // つつかれた塊は少し転がる
    for (const c of this.items) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r) { c.rx += (Math.random() - 0.5)*1.5; c.rz += (Math.random() - 0.5)*1.5; c.x += (c.x - x)*0.25 + (Math.random() - 0.5)*0.012; c.z += (c.z - z)*0.25 + (Math.random() - 0.5)*0.012; c.heat = Math.min(2, c.heat + 0.5); }
    }
  }
  update(dt, hearth, blow) {
    const E = hearth.bed.E, burn = hearth.bed.burn*hearth.pace;
    let n = 0;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (c.dy > 0) { c.vy += 9.8*dt; c.dy = Math.max(0, c.dy - c.vy*dt); }   // 落ちて熾床にのる
      c.s -= dt*burn*c.s0*0.0045*c.k;                                          // 熾床が燃えているあいだ、少しずつ痩せる
      if (c.s < c.s0*0.3) { this.items.splice(i--, 1); continue; }
      const near = Math.exp(-(c.x*c.x + c.z*c.z)/0.07);
      const tgt = E*(0.45 + 0.75*c.k)*(0.35 + 0.65*near)*(1 + 0.9*blow);
      c.heat += (tgt - c.heat)*Math.min(1, dt*(tgt > c.heat ? 2.5 : 0.25));
      this.heat[n] = c.heat; this.seed[n] = c.seed;
      this._e.set(c.rx, c.ry, c.rz); this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(c.x, hearth.groundY(c.x, c.z) + c.dy + c.s*0.42, c.z), this._q, this._s.set(c.s, c.s, c.s));
      this.mesh.setMatrixAt(n, this._m);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aHeat.needsUpdate = true;
    this.mesh.geometry.attributes.aSeed.needsUpdate = true;
  }
}
