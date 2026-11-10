// 火の粉：はぜた瞬間に飛び出し、上昇気流に乗って揺れながら昇り、冷えて消える
import * as THREE from '../lib/three.module.js';

const MAX = 700;

export class Sparks {
  constructor(scene) {
    this.n = 0;
    this.px = new Float32Array(MAX*3); this.vx = new Float32Array(MAX*3);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.heavy = new Uint8Array(MAX); this.seed = new Float32Array(MAX); this.bright = new Float32Array(MAX);
    // 尾（線分）
    this.lpos = new Float32Array(MAX*6); this.lcol = new Float32Array(MAX*6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(this.lcol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 12;
    // 頭（点）
    this.ppos = new Float32Array(MAX*3); this.pcol = new Float32Array(MAX*3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.ppos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pcol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 color; varying vec3 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(uScale*0.0075/-mv.z, 1.6, 7.0); }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(d)); gl_FragColor = vec4(vC*a, 1.0); }`,
      uniforms: { uScale: { value: 1000 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 12;
    scene.add(this.lines, this.points);
    this.time = 0;
  }

  emit(x, y, z, count, power = 1) {
    for (let k = 0; k < count && this.n < MAX; k++) {
      const i = this.n++;
      const a = Math.random()*6.283, u = Math.random();
      const sp = (0.3 + 1.6*Math.random()*Math.random())*(0.6 + power);
      const up = 0.5 + Math.random()*1.6*(0.5 + power*0.6);
      this.px[i*3] = x + (Math.random() - 0.5)*0.03; this.px[i*3 + 1] = y + Math.random()*0.02; this.px[i*3 + 2] = z + (Math.random() - 0.5)*0.03;
      this.vx[i*3] = Math.cos(a)*sp*0.55; this.vx[i*3 + 1] = up; this.vx[i*3 + 2] = Math.sin(a)*sp*0.55;
      this.heavy[i] = u < 0.14 ? 1 : 0;
      this.max[i] = this.heavy[i] ? 1.2 + Math.random()*1.6 : 0.5 + Math.pow(Math.random(), 2.2)*4.2;
      this.life[i] = 0; this.seed[i] = Math.random()*100; this.bright[i] = 0.5 + Math.random()*1.0;
    }
  }

  update(dt, wind, fireH) {
    this.time += dt;
    const t = this.time;
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        // 末尾と入れ替えて詰める
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { this.px[i*3 + k] = this.px[j*3 + k]; this.vx[i*3 + k] = this.vx[j*3 + k]; }
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.heavy[i] = this.heavy[j]; this.seed[i] = this.seed[j]; this.bright[i] = this.bright[j];
        }
        continue;
      }
      const x = this.px[i*3], y = this.px[i*3 + 1], z = this.px[i*3 + 2];
      let vx = this.vx[i*3], vy = this.vx[i*3 + 1], vz = this.vx[i*3 + 2];
      const s = this.seed[i];
      if (this.heavy[i]) {
        vy -= 6.5*dt; vx *= 1 - 0.8*dt; vz *= 1 - 0.8*dt;
        if (y < 0.012 && vy < 0) { vy = 0; vx *= 0.5; vz *= 0.5; this.px[i*3 + 1] = 0.012; }
      } else {
        // 火柱の中心ほど上昇気流が強い
        const r2 = x*x + z*z;
        const core = Math.exp(-r2/0.09)*Math.exp(-Math.max(0, y - fireH)/1.4);
        const tgtY = 0.35 + 2.1*core;
        const sw = 1.1;
        const tx = wind*0.5*Math.min(1, y) + sw*Math.sin(t*2.3 + s + y*3.1)*0.35 + sw*Math.sin(t*5.1 + s*1.7)*0.18;
        const tz = sw*Math.cos(t*1.9 + s*2.3 + y*2.7)*0.35 + sw*Math.sin(t*4.3 + s*0.7)*0.18;
        vx += (tx - vx)*2.2*dt; vy += (tgtY - vy)*2.0*dt; vz += (tz - vz)*2.2*dt;
      }
      this.px[i*3] = x + vx*dt; this.px[i*3 + 1] += vy*dt; this.px[i*3 + 2] = z + vz*dt;
      this.vx[i*3] = vx; this.vx[i*3 + 1] = vy; this.vx[i*3 + 2] = vz;
      i++;
    }
    // 描画用バッファ
    const n = this.n;
    for (let k = 0; k < n; k++) {
      const u = this.life[k]/this.max[k];
      const fl = 0.75 + 0.25*Math.sin(t*31 + this.seed[k]*7);
      const e = Math.pow(1 - u, 1.5)*this.bright[k]*fl;
      // 冷えるにつれ 黄白 → 橙 → 暗赤
      const r = 5.5*e, g = 5.5*e*(0.09 + 0.30*(1 - u)*(1 - u)), b = 5.5*e*0.02*(1 - u)*(1 - u);
      const x = this.px[k*3], y = this.px[k*3 + 1], z = this.px[k*3 + 2];
      const tl = 0.028;
      this.lpos[k*6] = x; this.lpos[k*6 + 1] = y; this.lpos[k*6 + 2] = z;
      this.lpos[k*6 + 3] = x - this.vx[k*3]*tl; this.lpos[k*6 + 4] = y - this.vx[k*3 + 1]*tl; this.lpos[k*6 + 5] = z - this.vx[k*3 + 2]*tl;
      this.lcol[k*6] = r*0.8; this.lcol[k*6 + 1] = g*0.8; this.lcol[k*6 + 2] = b*0.8;
      this.lcol[k*6 + 3] = 0; this.lcol[k*6 + 4] = 0; this.lcol[k*6 + 5] = 0;
      this.ppos[k*3] = x; this.ppos[k*3 + 1] = y; this.ppos[k*3 + 2] = z;
      this.pcol[k*3] = r; this.pcol[k*3 + 1] = g; this.pcol[k*3 + 2] = b;
    }
    this.lines.geometry.setDrawRange(0, n*2); this.points.geometry.setDrawRange(0, n);
    this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}
