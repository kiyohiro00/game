// HDR描画 → ブルーム（眼やレンズのにじみ）→ 陽炎 → 露出・トーンマップ・粒状感
import * as THREE from '../lib/three.module.js';

const VERT = /* glsl */`
in vec3 position; out vec2 vUv;
void main(){ vUv = position.xy*0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const HEAD = /* glsl */`
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
`;
// デュアルフィルタ（Kawase）による縮小・拡大ぼかし
const DOWN = HEAD + /* glsl */`
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst;
void main(){
  vec3 c = texture(uTex, vUv).rgb*4.0;
  c += texture(uTex, vUv + uTexel*vec2( 1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2(-1.0, -1.0)).rgb;
  c /= 8.0;
  if (uFirst > 0.5) c = min(c, vec3(60.0));   // 火の粉などの極端な値でちらつかないように
  outColor = vec4(c, 1.0);
}
`;
const UP = HEAD + /* glsl */`
uniform sampler2D uTex, uAdd; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + uTexel*vec2(-2.0, 0.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2( 2.0, 0.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2(0.0, -2.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2(0.0,  2.0)).rgb;
  c += texture(uTex, vUv + uTexel*vec2(-1.0,  1.0)).rgb*2.0;
  c += texture(uTex, vUv + uTexel*vec2( 1.0,  1.0)).rgb*2.0;
  c += texture(uTex, vUv + uTexel*vec2(-1.0, -1.0)).rgb*2.0;
  c += texture(uTex, vUv + uTexel*vec2( 1.0, -1.0)).rgb*2.0;
  c /= 12.0;
  outColor = vec4(mix(texture(uAdd, vUv).rgb, c, uMix), 1.0);
}
`;
const FINAL = HEAD + /* glsl */`
uniform sampler2D uScene, uBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloomAmt, uHaze, uWarm, uFade, uGrain;
uniform vec3 uFireA, uFireB;   // 画面上の火の根元(xy)・陽炎の幅(z) / 上端(xy)
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec3 aces(vec3 x){
  // Narkowicz 近似の前に、わずかに色を混ぜて強い橙が黄白へ抜けるようにする
  x = mat3(0.90, 0.07, 0.03,  0.08, 0.88, 0.04,  0.03, 0.07, 0.90)*x;
  return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0);
}
void main(){
  vec2 uv = vUv;
  float asp = uRes.x/uRes.y;
  // 陽炎：火の上の熱い空気で景色がゆらぐ
  vec2 ba = uFireB.xy - uFireA.xy;
  vec2 pa = uv - uFireA.xy;
  float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-5), 0.0, 1.0);
  vec2 dd = pa - ba*h; dd.x *= asp;
  float wid = uFireA.z*(0.6 + 1.3*h);
  float mask = exp(-dot(dd, dd)/(wid*wid))*(1.0 - 0.75*h)*smoothstep(-0.02, 0.05, dot(pa, ba)/max(length(ba), 1e-4));
  vec2 q = vec2(uv.x*asp*26.0, uv.y*20.0 - uTime*2.6);
  vec2 warp = vec2(n2(q) - 0.5, n2(q + 17.0) - 0.5) + 0.5*vec2(n2(q*2.3 + 5.0) - 0.5, n2(q*2.3 + 31.0) - 0.5);
  uv += warp*mask*uHaze*vec2(1.0/asp, 1.0);
  vec3 col = texture(uScene, uv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  col = mix(col, bloom, uBloomAmt);
  col *= uExposure;
  // 周辺減光。火が大きいほど頬に熱を感じるように、ふちをほんのり暖色に
  vec2 vc = vUv - 0.5;
  float vig = 1.0 - smoothstep(0.25, 0.95, length(vc*vec2(1.0, 0.85))*1.25);
  col *= mix(0.42, 1.0, vig);
  col += vec3(0.020, 0.007, 0.001)*uWarm*(1.0 - vig);
  col = aces(col);
  col = pow(col, vec3(1.0/2.2));
  float g = h12(floor(vUv*uRes) + floor(fract(uTime*7.31)*977.0)) - 0.5;
  col += g*uGrain*(0.6 + 0.4*(1.0 - dot(col, vec3(0.33))));
  col *= uFade;
  outColor = vec4(col, 1.0);
}
`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, null); this.quad.frustumCulled = false; this.scene.add(this.quad);
    const mat = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mDown = mat(DOWN, { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.mUp = mat(UP, { uTex: { value: null }, uAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.6 } });
    this.mFinal = mat(FINAL, {
      uScene: { value: null }, uBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uExposure: { value: 1 }, uBloomAmt: { value: 0.11 }, uHaze: { value: 0 }, uWarm: { value: 0 },
      uFade: { value: 1 }, uGrain: { value: 0.028 },
      uFireA: { value: new THREE.Vector3(0.5, 0.4, 0.05) }, uFireB: { value: new THREE.Vector3(0.5, 0.9, 0) },
    });
    this.levels = 6;
    this.down = []; this.up = [];
    this.hdr = null;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    if (this.hdr) { this.hdr.dispose(); this.down.forEach(t => t.dispose()); this.up.forEach(t => t.dispose()); }
    this.hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, samples: 4 });
    this.down = []; this.up = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1);
      const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.down.push(new THREE.WebGLRenderTarget(cw, ch, o));
      this.up.push(new THREE.WebGLRenderTarget(cw, ch, o));
    }
    this.mFinal.uniforms.uRes.value.set(w, h);
  }
  _pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.hdr);
    r.clear();
    r.render(scene, camera);
    // 縮小
    let src = this.hdr;
    for (let i = 0; i < this.levels; i++) {
      const u = this.mDown.uniforms;
      u.uTex.value = src.texture; u.uTexel.value.set(1/src.width, 1/src.height); u.uFirst.value = i === 0 ? 1 : 0;
      this._pass(this.mDown, this.down[i]); src = this.down[i];
    }
    // 拡大しながら各段を重ねる
    let acc = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      const u = this.mUp.uniforms;
      u.uTex.value = acc.texture; u.uAdd.value = this.down[i].texture; u.uTexel.value.set(1/acc.width, 1/acc.height);
      this._pass(this.mUp, this.up[i]); acc = this.up[i];
    }
    const f = this.mFinal.uniforms;
    f.uScene.value = this.hdr.texture; f.uBloom.value = acc.texture;
    this._pass(this.mFinal, null);
  }
  get u() { return this.mFinal.uniforms; }
}
