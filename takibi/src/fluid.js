// 炎の流体シミュレーション（GPU）
// 焚火を正面から見た鉛直断面で、速度・温度・可燃ガス・煙を解く。
// 可燃ガスは熱いところでだけ燃えて温度を上げ、温度は浮力になる。
// 炎の形・ゆらぎ・ちぎれ方は すべてこの計算から自然に出てくる。
import * as THREE from '../lib/three.module.js';

// シミュレーション領域（ワールド座標・メートル）。z=0 の鉛直面。
export const DOMAIN = { x0: -1.2, y0: -0.06, w: 2.4, h: 3.2 };
export const MAX_EMITTERS = 48;

const VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }
`;

const NOISE = /* glsl */`
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
`;

const HEAD = /* glsl */`
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`;

// 発生源（薪の燃えている節・熾・マッチ）を低解像度テクスチャに描く
const SOURCE_FRAG = HEAD + /* glsl */`
uniform vec4 uEmA[${MAX_EMITTERS}];   // x, y (領域内メートル), 半径, 可燃ガス量
uniform vec4 uEmB[${MAX_EMITTERS}];   // 熱, 煙, 未使用, 未使用
uniform int uCount;
uniform vec2 uSize;
void main(){
  vec2 p = vUv*uSize;
  vec4 acc = vec4(0.0);
  for (int i=0; i<${MAX_EMITTERS}; i++){
    if (i >= uCount) break;
    vec2 d = p - uEmA[i].xy;
    float r = uEmA[i].z;
    float g = exp(-dot(d,d)/(r*r));
    acc += g*vec4(uEmA[i].w, uEmB[i].x, uEmB[i].y, 0.0);
  }
  outColor = acc;
}
`;

const ADVECT_VEL_FRAG = HEAD + NOISE + /* glsl */`
uniform sampler2D uVel, uDye;
uniform vec2 uInvSize, uSize;
uniform float uDt, uDamp, uBuoy, uSmokeW, uWind, uTime, uGround, uTurb;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 prev = vUv - uDt*v*uInvSize;
  vec2 vn = texture(uVel, prev).xy;
  vec4 d = texture(uDye, vUv);
  float y = vUv.y*uSize.y;
  vn *= exp(-uDt*uDamp);
  // 浮力：熱い気体は軽い。煤を含む冷えた煙はわずかに重い
  vn.y += uDt*(uBuoy*d.r - uSmokeW*d.b);
  // 風：地面近くは弱く、上ほど強い
  vn.x += uDt*uWind*smoothstep(0.04, 1.3, y);
  // 小さな乱れ（カールノイズ）。熱いところだけ
  vec2 q = vUv*uSize*9.0 + vec2(0.0, -uTime*1.7);
  float e = 0.05;
  float n1 = vnoise(q+vec2(0.0,e)) - vnoise(q-vec2(0.0,e));
  float n2 = vnoise(q+vec2(e,0.0)) - vnoise(q-vec2(e,0.0));
  vn += uDt*uTurb*vec2(n1,-n2)/(2.0*e)*smoothstep(0.03, 0.5, d.r);
  if (y < uGround) vn = vec2(0.0);
  outColor = vec4(vn, 0.0, 1.0);
}
`;

const CURL_FRAG = HEAD + /* glsl */`
uniform sampler2D uVel;
uniform vec2 uTexel;
void main(){
  float L = texture(uVel, vUv - vec2(uTexel.x,0.0)).y;
  float R = texture(uVel, vUv + vec2(uTexel.x,0.0)).y;
  float B = texture(uVel, vUv - vec2(0.0,uTexel.y)).x;
  float T = texture(uVel, vUv + vec2(0.0,uTexel.y)).x;
  outColor = vec4(0.5*(R - L - T + B), 0.0, 0.0, 1.0);
}
`;

const VORT_FRAG = HEAD + /* glsl */`
uniform sampler2D uVel, uCurl;
uniform vec2 uTexel;
uniform float uDt, uCurlK;
void main(){
  float L = texture(uCurl, vUv - vec2(uTexel.x,0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x,0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0,uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0,uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5*vec2(abs(T)-abs(B), abs(R)-abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlK*C;
  force.y *= -1.0;
  vec2 v = texture(uVel, vUv).xy + force*uDt;
  outColor = vec4(v, 0.0, 1.0);
}
`;

const DIV_FRAG = HEAD + /* glsl */`
uniform sampler2D uVel;
uniform vec2 uTexel, uSize, uBlowPos;
uniform float uBlow, uBlowRad;
void main(){
  float L = texture(uVel, vUv - vec2(uTexel.x,0.0)).x;
  float R = texture(uVel, vUv + vec2(uTexel.x,0.0)).x;
  float B = texture(uVel, vUv - vec2(0.0,uTexel.y)).y;
  float T = texture(uVel, vUv + vec2(0.0,uTexel.y)).y;
  float div = 0.5*(R - L + T - B);
  // 息：画面の奥へ吹き込む空気を「湧き出し」として与える
  vec2 bp = vUv*uSize - uBlowPos;
  div -= uBlow*exp(-dot(bp,bp)/(uBlowRad*uBlowRad));
  outColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_FRAG = HEAD + /* glsl */`
uniform sampler2D uP, uDiv;
uniform vec2 uTexel;
void main(){
  float C = texture(uP, vUv).x;
  float L = (vUv.x - uTexel.x < 0.0) ? 0.0 : texture(uP, vUv - vec2(uTexel.x,0.0)).x;
  float R = (vUv.x + uTexel.x > 1.0) ? 0.0 : texture(uP, vUv + vec2(uTexel.x,0.0)).x;
  float B = (vUv.y - uTexel.y < 0.0) ? C   : texture(uP, vUv - vec2(0.0,uTexel.y)).x;
  float T = (vUv.y + uTexel.y > 1.0) ? 0.0 : texture(uP, vUv + vec2(0.0,uTexel.y)).x;
  float div = texture(uDiv, vUv).x;
  outColor = vec4((L + R + B + T - div)*0.25, 0.0, 0.0, 1.0);
}
`;

const GRAD_FRAG = HEAD + /* glsl */`
uniform sampler2D uP, uVel;
uniform vec2 uTexel, uSize;
uniform float uGround;
void main(){
  float C = texture(uP, vUv).x;
  float L = (vUv.x - uTexel.x < 0.0) ? 0.0 : texture(uP, vUv - vec2(uTexel.x,0.0)).x;
  float R = (vUv.x + uTexel.x > 1.0) ? 0.0 : texture(uP, vUv + vec2(uTexel.x,0.0)).x;
  float B = (vUv.y - uTexel.y < 0.0) ? C   : texture(uP, vUv - vec2(0.0,uTexel.y)).x;
  float T = (vUv.y + uTexel.y > 1.0) ? 0.0 : texture(uP, vUv + vec2(0.0,uTexel.y)).x;
  vec2 v = texture(uVel, vUv).xy - 0.5*vec2(R - L, T - B);
  if (vUv.y*uSize.y < uGround) v = vec2(0.0);
  outColor = vec4(v, 0.0, 1.0);
}
`;

// 温度(R)・可燃ガス(G)・煙(B) の移流と燃焼
const ADVECT_DYE_FRAG = HEAD + NOISE + /* glsl */`
uniform sampler2D uVel, uDye, uSource;
uniform vec2 uInvSize, uSize;
uniform float uDt, uTime, uGround;
uniform float uBurn, uHeat, uSoot, uCoolLin, uCoolCub, uFuelDecay, uSmokeDecay;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 prev = vUv - uDt*v*uInvSize;
  vec4 d = texture(uDye, prev);
  vec4 src = texture(uSource, vUv);
  vec2 p = vUv*uSize;
  // 発生源のむら：ガスの噴き出しは一様ではない
  float fl = 0.45 + 1.1*vnoise(vec2(p.x*34.0 + uTime*2.3, p.y*34.0 - uTime*5.1));
  float T = d.r, F = d.g, S = d.b;
  F += src.r*uDt*fl;
  T += src.g*uDt;
  S += src.b*uDt;
  // 燃焼：発火温度を超えた所で、酸素律速（一定速度）でガスが燃える
  float ign = smoothstep(0.16, 0.34, T);
  float burn = min(F, uBurn*uDt)*ign;
  F -= burn;
  T += burn*uHeat;
  S += burn*uSoot;
  // 放射と混合による冷却。高温ほど急に冷える → 炎の先端がはっきり切れる
  T -= uDt*(uCoolLin*T + uCoolCub*T*T*T);
  T = clamp(T, 0.0, 1.45);
  F *= exp(-uDt*uFuelDecay);
  S *= exp(-uDt*uSmokeDecay);
  float edge = smoothstep(0.0, 0.05, vUv.x)*smoothstep(1.0, 0.95, vUv.x)*smoothstep(1.0, 0.9, vUv.y);
  edge *= smoothstep(uGround - 0.025, uGround, p.y);   // 地面の下には何も溜めない
  outColor = vec4(T*edge, F*edge, S*edge, 1.0);
}
`;

function makeRT(w, h, filter) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: filter, magFilter: filter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

class DoubleRT {
  constructor(w, h, filter) { this.read = makeRT(w, h, filter); this.write = makeRT(w, h, filter); }
  swap() { const t = this.read; this.read = this.write; this.write = t; }
}

export class FireFluid {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    const sw = opts.simW || 128, sh = opts.simH || 176;
    const dw = opts.dyeW || 384, dh = opts.dyeH || 512;
    this.simW = sw; this.simH = sh;
    this.vel = new DoubleRT(sw, sh, THREE.LinearFilter);
    this.dye = new DoubleRT(dw, dh, THREE.LinearFilter);
    this.pressure = new DoubleRT(sw, sh, THREE.NearestFilter);
    this.div = makeRT(sw, sh, THREE.NearestFilter);
    this.curl = makeRT(sw, sh, THREE.NearestFilter);
    this.source = makeRT(96, 128, THREE.LinearFilter);

    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const size = new THREE.Vector2(DOMAIN.w, DOMAIN.h);
    const inv = new THREE.Vector2(1 / DOMAIN.w, 1 / DOMAIN.h);
    const texel = new THREE.Vector2(1 / sw, 1 / sh);
    const ground = -DOMAIN.y0;   // 領域の底からの地面の高さ
    const mat = (frag, uniforms) => new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });

    this.emA = []; this.emB = [];
    for (let i = 0; i < MAX_EMITTERS; i++) { this.emA.push(new THREE.Vector4()); this.emB.push(new THREE.Vector4()); }

    this.mSource = mat(SOURCE_FRAG, {
      uEmA: { value: this.emA }, uEmB: { value: this.emB }, uCount: { value: 0 }, uSize: { value: size },
    });
    this.mAdvVel = mat(ADVECT_VEL_FRAG, {
      uVel: { value: null }, uDye: { value: null }, uInvSize: { value: inv }, uSize: { value: size },
      uDt: { value: 0 }, uDamp: { value: 1.1 }, uBuoy: { value: 7.5 }, uSmokeW: { value: 0.25 },
      uWind: { value: 0 }, uTime: { value: 0 }, uGround: { value: ground }, uTurb: { value: 1.6 },
    });
    this.mCurl = mat(CURL_FRAG, { uVel: { value: null }, uTexel: { value: texel } });
    this.mVort = mat(VORT_FRAG, {
      uVel: { value: null }, uCurl: { value: null }, uTexel: { value: texel },
      uDt: { value: 0 }, uCurlK: { value: 6.0 },
    });
    this.mDiv = mat(DIV_FRAG, {
      uVel: { value: null }, uTexel: { value: texel }, uSize: { value: size },
      uBlowPos: { value: new THREE.Vector2(1.2, 0.3) }, uBlow: { value: 0 }, uBlowRad: { value: 0.13 },
    });
    this.mPressure = mat(PRESSURE_FRAG, { uP: { value: null }, uDiv: { value: null }, uTexel: { value: texel } });
    this.mGrad = mat(GRAD_FRAG, {
      uP: { value: null }, uVel: { value: null }, uTexel: { value: texel }, uSize: { value: size }, uGround: { value: ground },
    });
    this.mAdvDye = mat(ADVECT_DYE_FRAG, {
      uVel: { value: null }, uDye: { value: null }, uSource: { value: null },
      uInvSize: { value: inv }, uSize: { value: size }, uDt: { value: 0 }, uTime: { value: 0 }, uGround: { value: ground },
      uBurn: { value: 2.4 }, uHeat: { value: 3.1 }, uSoot: { value: 0.05 },
      uCoolLin: { value: 0.75 }, uCoolCub: { value: 5.6 }, uFuelDecay: { value: 0.5 }, uSmokeDecay: { value: 0.22 },
    });

    this.time = 0;
    this.acc = 0;
    this.wind = 0;
    this.blow = 0;
    this.blowPos = new THREE.Vector2(DOMAIN.w / 2, 0.3);
    this.pressureIters = opts.pressureIters || 36;
    this.emitCount = 0;
    this.clear();
  }

  clear() {
    const r = this.renderer, prev = r.getRenderTarget();
    const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const rt of [this.vel.read, this.vel.write, this.dye.read, this.dye.write, this.pressure.read, this.pressure.write, this.div, this.curl, this.source]) {
      r.setRenderTarget(rt); r.clear(true, false, false);
    }
    r.setClearColor(cc, ca);
    r.setRenderTarget(prev);
  }

  // 発生源を設定する。list: [{x, y, r, fuel, heat, smoke}]（x,y はワールド座標・z=0 面上）
  setEmitters(list) {
    const n = Math.min(list.length, MAX_EMITTERS);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      this.emA[i].set(e.x - DOMAIN.x0, e.y - DOMAIN.y0, e.r, e.fuel);
      this.emB[i].set(e.heat, e.smoke, 0, 0);
    }
    this.emitCount = n;
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  _step(dt) {
    this.time += dt;
    // 発生源
    this.mSource.uniforms.uCount.value = this.emitCount;
    this._pass(this.mSource, this.source);
    // 速度の移流＋外力
    let u = this.mAdvVel.uniforms;
    u.uVel.value = this.vel.read.texture; u.uDye.value = this.dye.read.texture;
    u.uDt.value = dt; u.uTime.value = this.time; u.uWind.value = this.wind;
    this._pass(this.mAdvVel, this.vel.write); this.vel.swap();
    // 渦度強化
    this.mCurl.uniforms.uVel.value = this.vel.read.texture;
    this._pass(this.mCurl, this.curl);
    u = this.mVort.uniforms;
    u.uVel.value = this.vel.read.texture; u.uCurl.value = this.curl.texture; u.uDt.value = dt;
    this._pass(this.mVort, this.vel.write); this.vel.swap();
    // 圧力投影
    u = this.mDiv.uniforms;
    u.uVel.value = this.vel.read.texture; u.uBlow.value = this.blow; u.uBlowPos.value.copy(this.blowPos);
    this._pass(this.mDiv, this.div);
    u = this.mPressure.uniforms;
    u.uDiv.value = this.div.texture;
    for (let i = 0; i < this.pressureIters; i++) {
      u.uP.value = this.pressure.read.texture;
      this._pass(this.mPressure, this.pressure.write); this.pressure.swap();
    }
    u = this.mGrad.uniforms;
    u.uP.value = this.pressure.read.texture; u.uVel.value = this.vel.read.texture;
    this._pass(this.mGrad, this.vel.write); this.vel.swap();
    // 温度・ガス・煙
    u = this.mAdvDye.uniforms;
    u.uVel.value = this.vel.read.texture; u.uDye.value = this.dye.read.texture; u.uSource.value = this.source.texture;
    u.uDt.value = dt; u.uTime.value = this.time;
    this._pass(this.mAdvDye, this.dye.write); this.dye.swap();
  }

  // 実時間 dt を 60Hz 固定刻みで進める
  update(dt) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const autoClear = r.autoClear;
    r.autoClear = false;
    const h = 1 / 60;
    this.acc += Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= h && n < 3) { this._step(h); this.acc -= h; n++; }
    if (n === 3) this.acc = 0;
    r.autoClear = autoClear;
    r.setRenderTarget(prev);
  }

  get texture() { return this.dye.read.texture; }
}

// ───────── 炎の描画 ─────────
// シミュレーションの温度場を黒体放射の色に写し、細かな筋を重ねて描く。
const FIRE_VERT = /* glsl */`
uniform vec3 uCam;
uniform float uPlaneZ;
varying vec2 vUv;
void main(){
  vUv = uv;
  // z=0 面の板を、カメラから見て同じ位置に重なるよう uPlaneZ の面へ写す
  float s = (uCam.z - uPlaneZ)/max(uCam.z - position.z, 1e-3);
  vec3 p = uCam + (position - uCam)*s;
  gl_Position = projectionMatrix*viewMatrix*vec4(p, 1.0);
}
`;

const FIRE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDye;
uniform float uTime, uGain, uSmokeDensity, uWeight;
uniform vec3 uSmokeLit, uSmokeAmb;
uniform vec2 uSize;
varying vec2 vUv;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.03+vec2(7.1,3.7); a *= 0.5; } return s; }
void main(){
  vec2 p = vUv*uSize;
  // 上へ流れる細かい筋で参照位置をずらし、解像度より細い「舌」を作る
  float n1 = fbm(vec2(p.x*26.0, p.y*11.0 - uTime*3.4));
  float n2 = fbm(vec2(p.x*58.0 + 3.0, p.y*24.0 - uTime*5.2));
  vec2 off = vec2((n1-0.44)*0.020 + (n2-0.44)*0.008, (n2-0.44)*0.012);
  vec4 d0 = texture2D(uDye, vUv);
  float warp = smoothstep(0.1, 0.5, d0.r);
  vec4 d = texture2D(uDye, vUv + off*warp/uSize*2.4);
  float T = d.r;
  // 発光：温度のしきい値から立ち上がる
  float e = smoothstep(0.30, 1.32, T);
  float e2 = e*e*(0.55 + 0.45*e);
  // 黒体放射ふう：暗赤 → 橙 → 黄白
  vec3 c = mix(vec3(1.0, 0.13, 0.012), vec3(1.0, 0.36, 0.055), smoothstep(0.0, 0.42, e));
  c = mix(c, vec3(1.0, 0.57, 0.16), smoothstep(0.38, 0.95, e));
  // 縦に流れる筋と、未燃ガスの濃い芯（根元）は暗い。炎は薄い膜として光る
  float streak = 0.5 + 0.85*n1 + 0.45*(n2 - 0.44);
  float core = 1.0 - 0.72*smoothstep(0.10, 0.75, d.g);
  vec3 emis = c*e2*uGain*streak*core;
  // 根元の青い炎（未燃ガスが多く、煤がまだ光っていない所）
  float blue = smoothstep(0.05, 0.5, d.g)*smoothstep(0.22, 0.6, T)*(1.0 - 0.6*e);
  emis += vec3(0.03, 0.09, 0.30)*blue*uGain*0.10;
  // 煙：火に下から照らされる
  float sm = 1.0 - exp(-d.b*uSmokeDensity*(0.75 + 0.6*n1));
  sm *= 1.0 - smoothstep(0.25, 0.7, e);
  float lit = exp(-max(p.y - 0.1, 0.0)*1.5);
  vec3 smokeCol = uSmokeAmb + uSmokeLit*lit;
  gl_FragColor = vec4(emis + smokeCol*sm, sm)*uWeight;
}
`;

export function makeFireMesh(fluid, planeZ, weight) {
  const geo = new THREE.PlaneGeometry(DOMAIN.w, DOMAIN.h);
  geo.translate(DOMAIN.x0 + DOMAIN.w / 2, DOMAIN.y0 + DOMAIN.h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
    uniforms: {
      uDye: { value: fluid.texture }, uTime: { value: 0 }, uGain: { value: 4.0 },
      uSmokeDensity: { value: 1.1 }, uWeight: { value: weight },
      uSmokeLit: { value: new THREE.Color(0.5, 0.2, 0.06) }, uSmokeAmb: { value: new THREE.Color(0.012, 0.014, 0.02) },
      uSize: { value: new THREE.Vector2(DOMAIN.w, DOMAIN.h) },
      uCam: { value: new THREE.Vector3(0, 1, 2) }, uPlaneZ: { value: planeZ },
    },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
