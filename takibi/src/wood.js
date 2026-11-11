// 薪の物理と燃焼モデル（描画に依存しない純粋な計算）
// ・薪は「太さのある棒」。両端の点を位置ベース力学(PBD)で解き、棒どうし・石・地面と接触・摩擦する。
// ・1本の薪を長さ方向に5つの節に分け、節ごとに 温度・水分・揮発分・炭の残り を持つ。
//   加熱 → 乾燥 → 熱分解ガス → 着火 → 炎 → 熾（おき）→ 崩れて熾床へ、という順に進む。
import * as THREE from '../lib/three.module.js';

export const NODES = 5;
export const TA = 8;            // 外気温 ℃
export const PIT_R = 0.50;      // 炉（石の輪）の半径
export const MAX_PIECES = 38;

const V3 = THREE.Vector3;
const GRAV = 9.8;
const D0 = 0.055;               // 熱が届く距離の目安
const AREF = 0.04*0.09;         // 基準となる薪の節の表面積（比）
const KH = 0.0047;              // 加熱の速さ
const KV = 1.06e-4;             // 揮発分が抜ける速さ
const KC = 1.46e-4;             // 炭が燃え尽きる速さ
const KM = 0.0014;              // 熾床が減る速さ

let _id = 1;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

function resample(arr, ta, tb) {
  const out = new Float32Array(NODES);
  for (let k = 0; k < NODES; k++) {
    const t = ta + (tb - ta)*k/(NODES - 1);
    const f = t*(NODES - 1);
    const i0 = Math.min(NODES - 2, Math.floor(f));
    const u = f - i0;
    out[k] = arr[i0]*(1 - u) + arr[i0 + 1]*u;
  }
  return out;
}

export class Piece {
  constructor(kind, center, dir, L, r, thick, w0, rng) {
    this.id = _id++;
    this.kind = kind;
    this.L = L; this.L0 = L;
    this.r0 = r;
    this.thick = thick;
    this.p0 = new V3().copy(center).addScaledVector(dir, -L/2);
    this.p1 = new V3().copy(center).addScaledVector(dir, L/2);
    this.q0 = this.p0.clone(); this.q1 = this.p1.clone();
    this.w = 1/Math.max(0.02, r*r*L*2500);   // 逆質量
    if (kind === 'tinder') this.w = 30;
    this.rc = r;                             // 当たり半径
    this.roll = rng()*Math.PI*2;
    this.seed = rng()*1000;
    this.shape = Math.floor(rng()*1e6);      // 形の種（割れても同じ見た目を保つ）
    this.texOff = 0;                         // 木目の連続性のためのずらし量
    this.w0 = w0;
    this.T = new Float32Array(NODES).fill(TA);
    this.wet = new Float32Array(NODES).fill(w0);
    this.vol = new Float32Array(NODES).fill(1);
    this.c = new Float32Array(NODES).fill(1);
    this.lit = new Uint8Array(NODES);
    this.flame = new Float32Array(NODES);
    this.glow = new Float32Array(NODES);
    this.charVis = new Float32Array(NODES);
    this.ash = new Float32Array(NODES);
    this.rad = new Float32Array(NODES).fill(r);
    this.smolder = new Float32Array(NODES);
    this.grab = null;
    this.contact = false; this.hadContact = false;
    this.knockCd = 0;
    this.age = 0;
  }
  nodePos(i, out) { return out.lerpVectors(this.p0, this.p1, i/(NODES - 1)); }
  get burning() { for (let i = 0; i < NODES; i++) if (this.flame[i] > 0.02) return true; return false; }
  get maxT() { let m = 0; for (let i = 0; i < NODES; i++) m = Math.max(m, this.T[i]); return m; }
}

// 線分どうしの最近点（Ericson）
let _s = 0, _t = 0;
function segSeg(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x*d1x + d1y*d1y + d1z*d1z, e = d2x*d2x + d2y*d2y + d2z*d2z;
  const f = d2x*rx + d2y*ry + d2z*rz;
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f/e, 0, 1); }
  else {
    const c = d1x*rx + d1y*ry + d1z*rz;
    if (e <= EPS) { t = 0; s = clamp(-c/a, 0, 1); }
    else {
      const b = d1x*d2x + d1y*d2y + d1z*d2z;
      const den = a*e - b*b;
      s = den > 1e-10 ? clamp((b*f - c*e)/den, 0, 1) : 0.5;
      t = (b*s + f)/e;
      if (t < 0) { t = 0; s = clamp(-c/a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c)/a, 0, 1); }
    }
  }
  _s = s; _t = t;
}
function pointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const l2 = dx*dx + dy*dy + dz*dz;
  if (l2 < 1e-12) return 0;
  return clamp(((p.x - a.x)*dx + (p.y - a.y)*dy + (p.z - a.z)*dz)/l2, 0, 1);
}

export class Hearth {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.pieces = [];
    this.stones = [];                 // {x,y,z,R}
    this.events = [];                 // 1フレーム分の出来事（音・火の粉に使う）
    this.bed = { coal: 0, T: TA, ash: 0, E: 0, burn: 0 };
    this.match = { lit: false, pos: new V3() };
    this.blow = { amount: 0, pos: new V3(0, 0.12, 0) };
    this.wind = 0;
    this.pace = 1;                    // 燃え進む速さの倍率
    this.fireAcc = 0;
    this.time = 0;
    this.intensity = 0;               // 炎の総量（3〜4本がよく燃えていて 1 くらい）
    this.glowPower = 0;
    this.hiss = 0;
    this.smoke = 0;
    this.centroid = new V3(0, 0.15, 0);
    this.version = 0;                 // 薪の増減があるたびに増える
    this.everLit = false;
  }

  bedHeight() { return 0.006 + 0.05*Math.min(1.6, this.bed.coal*0.8 + this.bed.ash*0.5); }
  groundY(x, z) { const r2 = x*x + z*z; return this.bedHeight()*Math.exp(-r2/0.075); }

  // 薪を追加する。center: 中心, dir: 向き（単位ベクトル）
  addPiece(kind, center, dir, opts = {}) {
    if (this.pieces.length >= MAX_PIECES) return null;
    const R = this.rng;
    let L, r, thick, w0;
    if (kind === 'tinder') { L = 0.10; r = 0.042; thick = 0.003; w0 = 0.01; }
    else if (kind === 'kindling') { L = 0.24 + R()*0.10; r = 0.007 + R()*0.004; thick = r*0.8; w0 = 0.04; }
    else { L = 0.36 + R()*0.08; r = 0.040 + R()*0.018; thick = r*0.9; w0 = R() < 0.12 ? 0.42 : 0.10 + R()*0.1; }
    if (opts.L) L = opts.L; if (opts.r) { r = opts.r; if (kind !== 'tinder') thick = r*(kind === 'log' ? 0.9 : 0.8); }
    if (opts.w0 !== undefined) w0 = opts.w0;
    const p = new Piece(kind, center, dir, L, r, thick, w0, R);
    if (opts.shape !== undefined) p.shape = opts.shape;
    this.pieces.push(p);
    this.version++;
    return p;
  }

  removePiece(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) { this.pieces.splice(i, 1); this.version++; }
  }

  // 火ばさみで熾をつつく：灰が落ちて空気が入り、いっとき赤く熾る
  poke(x, y, z, power = 1) {
    const b = this.bed, r2 = x*x + z*z;
    const hot = b.E > 0.08 || b.T > 300;
    if (r2 < 0.16 && b.coal > 0.02) {
      b.T = Math.min(1000, b.T + (hot ? 70 : 0)*power);
      b.stir = Math.min(1.5, (b.stir || 0) + 0.7*power);
    }
    for (const p of this.pieces) {
      const t = Math.max(0, Math.min(1, ((x - p.p0.x)*(p.p1.x - p.p0.x) + (y - p.p0.y)*(p.p1.y - p.p0.y) + (z - p.p0.z)*(p.p1.z - p.p0.z))/(p.L*p.L)));
      const cx = p.p0.x + (p.p1.x - p.p0.x)*t, cy = p.p0.y + (p.p1.y - p.p0.y)*t, cz = p.p0.z + (p.p1.z - p.p0.z)*t;
      const d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > p.rc + 0.05) continue;
      // 小さく突き動かす
      const k = 0.004*power*Math.min(1, p.w*0.6), nx = (cx - x)/(d + 1e-4), nz = (cz - z)/(d + 1e-4);
      p.p0.x += nx*k*(1 - t); p.p0.z += nz*k*(1 - t); p.p1.x += nx*k*t; p.p1.z += nz*k*t;
      for (let i = 0; i < NODES; i++) if (p.glow[i] > 0.1) { p.T[i] = Math.min(1050, p.T[i] + 40); p.ash[i] *= 0.5; }
    }
    this.events.push({ type: 'poke', x, y, z, power, hot: hot && b.coal > 0.02 });
  }

  // ───────── 物理 ─────────
  stepPhysics(dt) {
    const SUB = 4, h = Math.min(dt, 1/30)/SUB;
    const gh2 = GRAV*h*h;
    const P = this.pieces;
    for (let sub = 0; sub < SUB; sub++) {
      for (const p of P) {
        const damp = 0.992;
        let vx = (p.p0.x - p.q0.x)*damp, vy = (p.p0.y - p.q0.y)*damp, vz = (p.p0.z - p.q0.z)*damp;
        p.q0.copy(p.p0); p.p0.x += vx; p.p0.y += vy - gh2; p.p0.z += vz;
        vx = (p.p1.x - p.q1.x)*damp; vy = (p.p1.y - p.q1.y)*damp; vz = (p.p1.z - p.q1.z)*damp;
        p.q1.copy(p.p1); p.p1.x += vx; p.p1.y += vy - gh2; p.p1.z += vz;
        p.hadContact = p.contact; p.contact = false;
        p.speed = Math.hypot(vx, vy, vz)/h;
      }
      for (let it = 0; it < 3; it++) {
        for (const p of P) {
          this._length(p);
          if (p.grab) this._drag(p);
          this._ground(p, p.p0, p.q0);
          this._ground(p, p.p1, p.q1);
          for (const s of this.stones) this._stone(p, s);
        }
        for (let i = 0; i < P.length; i++) {
          const A = P[i];
          for (let j = i + 1; j < P.length; j++) {
            const B = P[j];
            // 大まかな除外
            const cx = (A.p0.x + A.p1.x - B.p0.x - B.p1.x)*0.5, cy = (A.p0.y + A.p1.y - B.p0.y - B.p1.y)*0.5, cz = (A.p0.z + A.p1.z - B.p0.z - B.p1.z)*0.5;
            const reach = (A.L + B.L)*0.5 + A.rc + B.rc;
            if (cx*cx + cy*cy + cz*cz > reach*reach) continue;
            segSeg(A.p0, A.p1, B.p0, B.p1);
            this._contact(A, _s, B, _t);
            // 平行に重なった薪が安定するよう、端点でも接触をとる
            this._contact(A, 0, B, pointSeg(A.p0, B.p0, B.p1));
            this._contact(A, 1, B, pointSeg(A.p1, B.p0, B.p1));
            this._contact(A, pointSeg(B.p0, A.p0, A.p1), B, 0);
            this._contact(A, pointSeg(B.p1, A.p0, A.p1), B, 1);
          }
        }
      }
      for (const p of P) {
        this._length(p);
        if (p.contact) {
          // 静止摩擦：ごく小さな動きは止める（積んだ薪がじわじわ滑らないように）
          const thr = 0.00011;
          if (!p.grab && p.p0.distanceToSquared(p.q0) < thr*thr && p.p1.distanceToSquared(p.q1) < thr*thr) {
            p.p0.copy(p.q0); p.p1.copy(p.q1);
          }
          if (!p.hadContact && p.speed > 0.45 && p.knockCd <= 0) {
            this.events.push({ type: 'knock', x: (p.p0.x + p.p1.x)/2, y: (p.p0.y + p.p1.y)/2, z: (p.p0.z + p.p1.z)/2, power: Math.min(1, p.speed/2.5), kind: p.kind, hot: p.maxT > 350 });
            p.knockCd = 0.18;
          }
        }
        p.knockCd -= h;
        // 場外へ飛ばない保険
        for (const e of [p.p0, p.p1]) {
          if (!(e.x === e.x) || !(e.y === e.y)) { e.set(0, 0.3, 0); }
          const r = Math.hypot(e.x, e.z);
          if (r > 1.6) { e.x *= 1.6/r; e.z *= 1.6/r; }
        }
      }
    }
  }

  _length(p) {
    const dx = p.p1.x - p.p0.x, dy = p.p1.y - p.p0.y, dz = p.p1.z - p.p0.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const k = 0.5*(d - p.L)/d;
    p.p0.x += dx*k; p.p0.y += dy*k; p.p0.z += dz*k;
    p.p1.x -= dx*k; p.p1.y -= dy*k; p.p1.z -= dz*k;
  }

  _drag(p) {
    const s = p.grab.s, tg = p.grab.target;
    const ax = p.p0.x + (p.p1.x - p.p0.x)*s, ay = p.p0.y + (p.p1.y - p.p0.y)*s, az = p.p0.z + (p.p1.z - p.p0.z)*s;
    const k = 0.22/((1 - s)*(1 - s) + s*s);
    const dx = (tg.x - ax)*k, dy = (tg.y - ay)*k, dz = (tg.z - az)*k;
    p.p0.x += dx*(1 - s); p.p0.y += dy*(1 - s); p.p0.z += dz*(1 - s);
    p.p1.x += dx*s; p.p1.y += dy*s; p.p1.z += dz*s;
  }

  _ground(p, e, q) {
    const gy = this.groundY(e.x, e.z) + p.rc;
    if (e.y < gy) {
      const pen = gy - e.y;
      e.y = gy;
      const dx = e.x - q.x, dz = e.z - q.z;
      const lt = Math.hypot(dx, dz);
      if (lt > 1e-9) {
        const maxF = 0.85*pen;
        const k = lt <= maxF ? 1 : maxF/lt;
        e.x -= dx*k; e.z -= dz*k;
      }
      p.contact = true;
    }
  }

  _stone(p, s) {
    const t = pointSeg(s, p.p0, p.p1);
    const ax = p.p0.x + (p.p1.x - p.p0.x)*t, ay = p.p0.y + (p.p1.y - p.p0.y)*t, az = p.p0.z + (p.p1.z - p.p0.z)*t;
    let nx = ax - s.x, ny = ay - s.y, nz = az - s.z;
    const d = Math.hypot(nx, ny, nz);
    const R = s.R + p.rc;
    if (d >= R) return;
    if (d < 1e-6) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    const pen = R - d;
    const k = pen/((1 - t)*(1 - t) + t*t);
    p.p0.x += nx*k*(1 - t); p.p0.y += ny*k*(1 - t); p.p0.z += nz*k*(1 - t);
    p.p1.x += nx*k*t; p.p1.y += ny*k*t; p.p1.z += nz*k*t;
    // 摩擦
    let rx = (1 - t)*(p.p0.x - p.q0.x) + t*(p.p1.x - p.q1.x);
    let ry = (1 - t)*(p.p0.y - p.q0.y) + t*(p.p1.y - p.q1.y);
    let rz = (1 - t)*(p.p0.z - p.q0.z) + t*(p.p1.z - p.q1.z);
    const rn = rx*nx + ry*ny + rz*nz;
    rx -= rn*nx; ry -= rn*ny; rz -= rn*nz;
    const lt = Math.hypot(rx, ry, rz);
    if (lt > 1e-9) {
      const maxF = 0.6*pen;
      const kk = (lt <= maxF ? 1 : maxF/lt)/((1 - t)*(1 - t) + t*t);
      p.p0.x -= rx*kk*(1 - t); p.p0.y -= ry*kk*(1 - t); p.p0.z -= rz*kk*(1 - t);
      p.p1.x -= rx*kk*t; p.p1.y -= ry*kk*t; p.p1.z -= rz*kk*t;
    }
    p.contact = true;
  }

  _contact(A, s, B, t) {
    const ax = A.p0.x + (A.p1.x - A.p0.x)*s, ay = A.p0.y + (A.p1.y - A.p0.y)*s, az = A.p0.z + (A.p1.z - A.p0.z)*s;
    const bx = B.p0.x + (B.p1.x - B.p0.x)*t, by = B.p0.y + (B.p1.y - B.p0.y)*t, bz = B.p0.z + (B.p1.z - B.p0.z)*t;
    let nx = ax - bx, ny = ay - by, nz = az - bz;
    const d = Math.hypot(nx, ny, nz);
    const R = A.rc + B.rc;
    if (d >= R) return;
    if (d < 1e-6) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    const pen = R - d;
    const s0 = 1 - s, t0 = 1 - t;
    const wa = A.w*(s0*s0 + s*s), wb = B.w*(t0*t0 + t*t);
    const lam = pen/(wa + wb);
    const la = lam*A.w, lb = lam*B.w;
    A.p0.x += nx*la*s0; A.p0.y += ny*la*s0; A.p0.z += nz*la*s0;
    A.p1.x += nx*la*s; A.p1.y += ny*la*s; A.p1.z += nz*la*s;
    B.p0.x -= nx*lb*t0; B.p0.y -= ny*lb*t0; B.p0.z -= nz*lb*t0;
    B.p1.x -= nx*lb*t; B.p1.y -= ny*lb*t; B.p1.z -= nz*lb*t;
    // 摩擦：接点の相対すべりを打ち消す
    let rx = s0*(A.p0.x - A.q0.x) + s*(A.p1.x - A.q1.x) - t0*(B.p0.x - B.q0.x) - t*(B.p1.x - B.q1.x);
    let ry = s0*(A.p0.y - A.q0.y) + s*(A.p1.y - A.q1.y) - t0*(B.p0.y - B.q0.y) - t*(B.p1.y - B.q1.y);
    let rz = s0*(A.p0.z - A.q0.z) + s*(A.p1.z - A.q1.z) - t0*(B.p0.z - B.q0.z) - t*(B.p1.z - B.q1.z);
    const rn = rx*nx + ry*ny + rz*nz;
    rx -= rn*nx; ry -= rn*ny; rz -= rn*nz;
    const lt = Math.hypot(rx, ry, rz);
    if (lt > 1e-9) {
      const maxF = 0.65*pen;
      const k = (lt <= maxF ? 1 : maxF/lt)/(wa + wb);
      const ka = k*A.w, kb = k*B.w;
      A.p0.x -= rx*ka*s0; A.p0.y -= ry*ka*s0; A.p0.z -= rz*ka*s0;
      A.p1.x -= rx*ka*s; A.p1.y -= ry*ka*s; A.p1.z -= rz*ka*s;
      B.p0.x += rx*kb*t0; B.p0.y += ry*kb*t0; B.p0.z += rz*kb*t0;
      B.p1.x += rx*kb*t; B.p1.y += ry*kb*t; B.p1.z += rz*kb*t;
    }
    A.contact = true; B.contact = true;
  }

  // ───────── 燃焼 ─────────
  update(dt) {
    this.events.length = 0;
    this.time += dt;
    this.stepPhysics(dt);
    this.fireAcc += dt;
    let n = 0;
    while (this.fireAcc >= 0.05 && n < 4) { this.stepFire(0.05); this.fireAcc -= 0.05; n++; }
    if (n === 4) this.fireAcc = 0;
  }

  stepFire(dt) {
    const P = this.pieces, R = this.rng;
    const bed = this.bed, pace = this.pace;
    // 節を平らな配列に集める
    const n = P.length*NODES;
    if (!this._buf || this._buf.length < n*6) this._buf = new Float32Array(Math.max(n, 64)*6);
    const B = this._buf;
    let k = 0;
    for (const p of P) {
      const seg = p.L/(NODES - 1);
      for (let i = 0; i < NODES; i++, k++) {
        const t = i/(NODES - 1);
        const area = p.rad[i]*seg*(i === 0 || i === NODES - 1 ? 0.75 : 1)/AREF;
        B[k*6] = p.p0.x + (p.p1.x - p.p0.x)*t;
        B[k*6 + 1] = p.p0.y + (p.p1.y - p.p0.y)*t;
        B[k*6 + 2] = p.p0.z + (p.p1.z - p.p0.z)*t;
        B[k*6 + 3] = (p.flame[i] + 0.9*p.glow[i])*area;   // 放つ熱
        B[k*6 + 4] = p.flame[i]*area;                      // うち炎の分
        B[k*6 + 5] = p.rad[i];
      }
    }
    const bedTop = this.bedHeight();
    const blowAmt = this.blow.amount, bp = this.blow.pos;
    const blowBed = blowAmt*Math.exp(-(bp.x*bp.x + bp.z*bp.z)/0.12);
    const windA = Math.abs(this.wind);
    let totFlame = 0, totGlow = 0, hiss = 0, smoke = 0, cxs = 0, cys = 0, czs = 0, cw = 0;
    const crumble = [];

    let a = 0;
    for (let pi = 0; pi < P.length; pi++) {
      const p = P[pi];
      p.age += dt;
      const seg = p.L/(NODES - 1);
      const I = Math.pow(p.thick, 0.8);
      const selfK = 0.6*0.012/(p.thick + 0.012);
      for (let i = 0; i < NODES; i++, a++) {
        const x = B[a*6], y = B[a*6 + 1], z = B[a*6 + 2], ra = B[a*6 + 5];
        let q = 0, qFlame = 0;
        for (let b = 0; b < n; b++) {
          const E = B[b*6 + 3];
          if (E < 1e-3 || b === a) continue;
          const dx = x - B[b*6], dy = y - B[b*6 + 1], dz = z - B[b*6 + 2];
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
          let G;
          if (((b/NODES) | 0) === pi) {
            G = 0.25/(1 + (d/D0)*(d/D0));
          } else {
            if (d > 0.6) continue;
            const de = Math.max(0, d - ra - B[b*6 + 5]);
            G = 1/(1 + (de/D0)*(de/D0));
            const u = dy/Math.max(d, 0.01);
            G *= u > 0 ? 1 + 1.2*u : 1 + 0.5*u;   // 炎は上を強く熱する
          }
          q += E*G; qFlame += B[b*6 + 4]*G;
        }
        // 熾床からの熱
        const hgt = Math.max(0, y - ra - bedTop);
        const rho2 = x*x + z*z;
        const nearBed = Math.exp(-hgt/0.07)*Math.exp(-rho2/0.09);
        q += bed.E*0.9*nearBed;
        // マッチ
        let pilot = qFlame > 0.1 || (bed.E > 0.5 && nearBed > 0.4);
        if (this.match.lit) {
          const m = this.match.pos;
          const dm2 = (x - m.x)*(x - m.x) + (y - m.y)*(y - m.y) + (z - m.z)*(z - m.z);
          const lim = Math.max(0.045, ra + 0.02);
          const qm = 2.4*Math.exp(-dm2/(lim*lim));
          q += qm;
          if (qm > 0.3) pilot = true;
        }
        const bl = blowAmt*Math.exp(-((x - bp.x)*(x - bp.x) + (y - bp.y)*(y - bp.y) + (z - bp.z)*(z - bp.z))/0.08);
        // 自分自身の炎・熾からの戻り
        q += p.flame[i]*selfK*(1 + 0.6*bl) + 0.5*p.glow[i];
        const hLoss = 1 + 0.55*bl + 0.15*windA;
        let dT = dt*KH/I*(q*900 - hLoss*(p.T[i] - TA));
        // 乾燥：水が残るあいだは熱が蒸発に食われる
        if (p.wet[i] > 0 && p.T[i] > 95 && dT > 0) {
          p.wet[i] -= dT*0.7/600;
          hiss += dT*0.7*(p.w0 > 0.3 ? 1 : 0.15)*Math.min(1, p.thick/0.03);
          smoke += dT*0.02*(p.w0 > 0.3 ? 3 : 1);
          dT *= 0.3;
          if (p.wet[i] < 0) p.wet[i] = 0;
        }
        let T = p.T[i] + dT;
        // 長さ方向の熱伝導
        const Tl = i > 0 ? p.T[i - 1] : p.T[i], Tr = i < NODES - 1 ? p.T[i + 1] : p.T[i];
        T += dt*0.02*(Tl + Tr - 2*p.T[i])/Math.max(0.3, seg/0.08);
        T = clamp(T, TA, 1050);
        p.T[i] = T;

        // 熱分解ガスと着火
        const vol = p.vol[i];
        const pyro = vol > 0 ? sstep(240, 420, T)*Math.sqrt(Math.min(1, vol*4)) : 0;
        if (!p.lit[i]) { if (pyro > 0.25 && (pilot || T > 480)) { p.lit[i] = 1; this.everLit = true; } }
        else if (pyro < 0.08) p.lit[i] = 0;
        const fl = p.lit[i] ? pyro*(0.65 + 0.35*Math.min(1, q))*(1 + 0.35*bl) : 0;
        p.flame[i] += (fl - p.flame[i])*Math.min(1, dt*4);
        p.smolder[i] = p.lit[i] ? 0 : pyro;
        p.vol[i] = Math.max(0, vol - dt*pace*(p.lit[i] ? pyro : pyro*0.3)*KV/p.thick);
        // 熾（炭の表面燃焼）
        const ox = 1 + 1.6*bl + 0.2*windA;
        const cf = (1 - p.vol[i]);
        const g = cf*cf*sstep(380, 620, T)*ox;
        p.glow[i] += (g - p.glow[i])*Math.min(1, dt*3);
        p.c[i] -= dt*pace*g*KC/p.thick;
        // 見た目
        p.charVis[i] = Math.max(p.charVis[i], Math.min(1, cf*2.5), sstep(230, 340, T)*0.7);
        if (p.charVis[i] > 0.5 && T < 260) p.ash[i] = Math.min(1, p.ash[i] + dt*0.03);
        else if (T > 500) p.ash[i] = Math.max(0, p.ash[i] - dt*0.05);
        p.rad[i] = p.r0*(0.62 + 0.38*p.vol[i])*Math.sqrt(clamp(p.c[i], 0, 1));

        const area = ra*seg/AREF;
        const fp = p.flame[i]*area;
        totFlame += fp; totGlow += p.glow[i]*area;
        smoke += p.smolder[i]*area;
        if (fp > 0) { cxs += x*fp; cys += y*fp; czs += z*fp; cw += fp; }
        // はぜる音
        if (p.flame[i] > 0.1) {
          const rate = p.flame[i]*(p.kind === 'log' ? 0.9 : 0.5)*(1 + 7*Math.min(1, p.wet[i]/0.1))*(0.4 + Math.min(1.5, area));
          if (R() < rate*dt) this.events.push({ type: 'crackle', x, y, z, power: Math.pow(R(), 2.5) });
        } else if (p.glow[i] > 0.3 && R() < 0.06*dt) {
          this.events.push({ type: 'crackle', x, y, z, power: 0.15*R() });
        }
        if (p.c[i] < 0.3) crumble.push(p, i);
      }
      let m = 0; for (let i = 0; i < NODES; i++) m += p.rad[i];
      p.rc = Math.max(0.004, m/NODES);
    }

    // 熾床
    {
      const Meff = Math.min(1, bed.coal/0.3);
      bed.stir = Math.max(0, (bed.stir || 0) - dt*0.5);
      const ox = 0.75 + 1.5*blowBed + 0.2*windA + 0.6*bed.stir;
      bed.burn = Meff*sstep(380, 620, bed.T)*ox;
      const qin = 1.3*bed.burn*Meff + Math.min(0.7, 0.3*totFlame);
      bed.T += dt/40*(1 + 5*blowBed)*(qin*900 - (1 + 0.3*blowBed)*(bed.T - TA));   // 息を吹くと反応が速まる
      bed.T = clamp(bed.T, TA, 1000);
      const used = dt*pace*bed.burn*KM;
      bed.coal = Math.max(0, bed.coal - used);
      bed.ash += used*0.6;
      bed.E = Meff*sstep(350, 700, bed.T)*(1 + 0.8*blowBed + 0.5*bed.stir);
      if (bed.E > 0.2 && R() < bed.E*(0.25 + 2.5*blowBed)*dt) {
        const an = R()*Math.PI*2, rr = Math.sqrt(R())*0.22;
        this.events.push({ type: blowBed > 0.3 ? 'spark' : 'crackle', x: Math.cos(an)*rr, y: bedTop + 0.01, z: Math.sin(an)*rr, power: 0.2 + 0.3*R() });
      }
    }

    // 崩れた節の処理（端なら短くなり、途中なら二つに割れる）
    if (crumble.length) this._crumble(crumble);

    this.intensity += (totFlame/11 - this.intensity)*0.35;
    this.glowPower = totGlow/11 + bed.E*0.5;
    this.hiss += (Math.min(1, hiss*0.5) - this.hiss)*0.2;
    this.smoke = smoke;
    if (cw > 0) this.centroid.lerp(_v.set(cxs/cw, cys/cw, czs/cw), 0.2);
  }

  _crumble(list) {
    const done = new Set();
    for (let k = 0; k < list.length; k += 2) {
      const p = list[k], i = list[k + 1];
      if (done.has(p)) continue;
      done.add(p);
      const seg = p.L/(NODES - 1);
      const pos = p.nodePos(i, new V3());
      // 崩れた分は熾床へ
      this.bed.coal += 0.07*(p.r0/0.04)*(p.r0/0.04)*(seg/0.09)*(p.kind === 'tinder' ? 0.1 : 1);
      this.bed.T = Math.max(this.bed.T, Math.min(700, p.T[i]*0.8));
      this.events.push({ type: 'crumble', x: pos.x, y: pos.y, z: pos.z, power: Math.min(1, p.r0/0.04), kind: p.kind });
      const parts = [];
      const step = 1/(NODES - 1);
      if (i === 0) parts.push([step, 1]);
      else if (i === NODES - 1) parts.push([0, 1 - step]);
      else { parts.push([0, (i - 0.5)*step]); parts.push([(i + 0.5)*step, 1]); }
      const minL = p.kind === 'log' ? 0.07 : 0.045;
      this.removePiece(p);
      for (const [ta, tb] of parts) {
        const L = (tb - ta)*p.L;
        if (L < minL) {
          this.bed.coal += 0.07*(p.r0/0.04)*(p.r0/0.04)*(L/0.09)*0.5;
          continue;
        }
        const a = new V3().lerpVectors(p.p0, p.p1, ta), b = new V3().lerpVectors(p.p0, p.p1, tb);
        const c = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
        const np = new Piece(p.kind, c, dir, L, p.r0, p.thick, p.w0, this.rng);
        np.q0.copy(np.p0).addScaledVector(p.q0.clone().sub(p.p0), 1);
        np.q1.copy(np.p1).addScaledVector(p.q1.clone().sub(p.p1), 1);
        np.q0.copy(np.p0); np.q1.copy(np.p1);
        np.w = p.w*p.L/L; np.roll = p.roll; np.seed = p.seed; np.shape = p.shape; np.L0 = p.L0;
        np.texOff = p.texOff + ta*p.L;
        for (const key of ['T', 'wet', 'vol', 'c', 'flame', 'glow', 'charVis', 'ash', 'rad', 'smolder']) np[key] = resample(p[key], ta, tb);
        for (let j = 0; j < NODES; j++) {
          np.lit[j] = p.lit[Math.round((ta + (tb - ta)*j/(NODES - 1))*(NODES - 1))];
          if (np.c[j] < 0.34) np.c[j] = 0.34;   // 補間でしきい値を割った節がすぐ連鎖しないように
        }
        np.rc = p.rc; np.age = p.age;
        this.pieces.push(np);
      }
      this.version++;
    }
  }

  // 流体シミュレーションへ渡す発生源（ワールド座標）
  collectEmitters(out) {
    out.length = 0;
    for (const p of this.pieces) {
      const seg = p.L/(NODES - 1);
      for (let i = 0; i < NODES; i++) {
        const f = p.flame[i], g = p.glow[i], sm = p.smolder[i];
        if (f < 0.02 && g < 0.05 && sm < 0.05) continue;
        const t = i/(NODES - 1);
        const area = Math.pow(Math.max(1e-4, p.rad[i]*seg/AREF), 0.8);
        out.push({
          x: p.p0.x + (p.p1.x - p.p0.x)*t, y: p.p0.y + (p.p1.y - p.p0.y)*t + p.rad[i]*0.7, z: p.p0.z + (p.p1.z - p.p0.z)*t,
          r: clamp(seg*0.55, 0.022, 0.055),
          fuel: f*(0.25 + 1.6*area), heat: f*1.1 + g*area*0.5 + sm*0.4, smoke: sm*area*2.2 + (p.wet[i] > 0 && p.T[i] > 95 ? 0.6*area : 0),
          pri: f*area + g*0.1 + sm*0.1,
        });
      }
    }
    const b = this.bed;
    if (b.E > 0.03) {
      const top = this.bedHeight();
      for (let j = 0; j < 3; j++) {
        const an = this.time*0.21 + j*2.1, rr = 0.07 + 0.05*Math.sin(this.time*0.13 + j);
        out.push({ x: Math.cos(an)*rr, y: top + 0.01, z: Math.sin(an)*rr*0.6, r: 0.07, fuel: b.E*0.10*(1 + 2*this.blow.amount), heat: b.E*1.0, smoke: 0, pri: b.E*0.2 });
      }
    }
    out.sort((u, v) => v.pri - u.pri);
    return out;
  }
}

const _v = new V3();
