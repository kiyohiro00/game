// 右腕・革手袋・火ばさみ
// 手は「手首の位置と向き」「指の曲げ具合」を目標として受け取り、少し遅れてなめらかに追いかける。
// 腕は肩と手首から肘の位置を逆算（2関節IK）して袖を張る。
import * as THREE from '../lib/three.module.js';

const V3 = THREE.Vector3;
const TONG_LEN = 0.40;

function capsuleZ(r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.rotateX(Math.PI/2); g.translate(0, 0, len/2);
  return g;
}

// 手のローカル座標：X=親指側 / Y=手の甲側 / Z=指先方向。原点は手首。
const POSES = {
  //        人差し指〜小指 [付け根, 第2, 第1]            親指 [付け根, 先]  親指の寄せ
  relax: { f: [[0.35, 0.50, 0.30], [0.42, 0.55, 0.32], [0.48, 0.58, 0.34], [0.55, 0.60, 0.35]], t: [0.25, 0.30], ts: 0.2 },
  open:  { f: [[0.10, 0.16, 0.10], [0.08, 0.14, 0.08], [0.10, 0.16, 0.10], [0.16, 0.20, 0.12]], t: [0.05, 0.10], ts: -0.15 },
  log:   { f: [[0.95, 1.05, 0.55], [1.00, 1.08, 0.58], [1.02, 1.08, 0.58], [1.05, 1.05, 0.55]], t: [0.55, 0.50], ts: 0.75 },
  stick: { f: [[1.40, 1.50, 0.85], [1.45, 1.52, 0.88], [1.48, 1.52, 0.88], [1.50, 1.50, 0.85]], t: [0.70, 0.75], ts: 0.95 },
  claw:  { f: [[0.72, 0.70, 0.42], [0.70, 0.72, 0.42], [0.72, 0.70, 0.42], [0.78, 0.68, 0.40]], t: [0.35, 0.40], ts: 0.45 },
  pinch: { f: [[1.02, 0.92, 0.40], [1.30, 1.42, 0.80], [1.38, 1.48, 0.86], [1.42, 1.48, 0.86]], t: [0.50, 0.42], ts: 0.85 },
  tongsOpen:  { f: [[0.62, 0.78, 0.42], [0.66, 0.82, 0.44], [0.70, 0.84, 0.44], [0.76, 0.84, 0.44]], t: [0.30, 0.25], ts: 0.55 },
  tongsClose: { f: [[1.00, 1.12, 0.60], [1.05, 1.16, 0.62], [1.08, 1.16, 0.62], [1.12, 1.14, 0.60]], t: [0.48, 0.42], ts: 0.8 },
};

export class Hands {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    // 布と革の細かな凹凸（のっぺりした筒に見えないように）
    const mkTex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const id = x.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = fn(i, j), k = (j*w + i)*4; id.data[k] = id.data[k + 1] = id.data[k + 2] = v; id.data[k + 3] = 255; } x.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const weave = mkTex(128, 128, (i, j) => 190 + 22*Math.sin(i*1.57)*Math.sin(j*1.57) + 18*Math.sin(j*0.11 + Math.sin(i*0.05)*2) + Math.random()*24);
    weave.repeat.set(9, 3);
    const grain = mkTex(128, 128, (i, j) => 150 + 45*Math.sin(i*0.33 + Math.sin(j*0.21)*2.5) + 35*Math.sin(j*0.47 + i*0.11) + Math.random()*40);
    grain.repeat.set(2, 2);
    const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.40, 0.25, 0.105), roughness: 0.74, metalness: 0, bumpMap: grain, bumpScale: 0.45 });
    const leatherDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.135, 0.058), roughness: 0.82, metalness: 0, bumpMap: grain, bumpScale: 0.45 });
    const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.030, 0.031, 0.030), roughness: 0.97, metalness: 0, map: weave, bumpMap: weave, bumpScale: 0.9 });
    this.mats = { leather, leatherDark, cloth };

    // ── 手袋 ──
    const hand = this.hand = new THREE.Group();
    this.root.add(hand);
    const add = (mesh, parent = hand) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    const palm = add(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), leather));
    palm.scale.set(0.047, 0.019, 0.054); palm.position.set(0, 0, 0.05);
    const heel = add(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), leather));
    heel.scale.set(0.040, 0.021, 0.034); heel.position.set(0.004, -0.004, 0.018);
    const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.041, 0.085, 16, 1, true), leatherDark));
    cuff.rotation.x = Math.PI/2; cuff.position.set(0, 0, -0.036);
    cuff.material = leatherDark.clone(); cuff.material.side = THREE.DoubleSide;
    const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.0365, 0.004, 6, 18), leatherDark));
    band.position.set(0, 0, 0.004);
    // 指
    this.fingers = [];
    const fx = [0.031, 0.0105, -0.0095, -0.029], fz = [0.094, 0.099, 0.095, 0.086];
    const flen = [[0.043, 0.027, 0.023], [0.047, 0.031, 0.024], [0.043, 0.028, 0.023], [0.034, 0.021, 0.020]];
    const frad = [0.0118, 0.0120, 0.0116, 0.0104];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group(); base.position.set(fx[i], -0.002, fz[i]); base.rotation.y = (1.5 - i)*0.07;
      hand.add(base);
      const joints = []; let parent = base;
      for (let j = 0; j < 3; j++) {
        const jt = new THREE.Group(); if (j > 0) jt.position.z = flen[i][j - 1];
        parent.add(jt);
        add(new THREE.Mesh(capsuleZ(frad[i]*(1 - j*0.08), flen[i][j]), leather), jt);
        joints.push(jt); parent = jt;
      }
      this.fingers.push(joints);
    }
    // 親指
    {
      const base = this.thumbBase = new THREE.Group(); base.position.set(0.034, -0.008, 0.03);
      hand.add(base);
      const j0 = new THREE.Group(); base.add(j0);
      add(new THREE.Mesh(capsuleZ(0.0135, 0.038), leather), j0);
      const j1 = new THREE.Group(); j1.position.z = 0.038; j0.add(j1);
      add(new THREE.Mesh(capsuleZ(0.0125, 0.03), leather), j1);
      this.thumb = [j0, j1];
    }
    this.pose = JSON.parse(JSON.stringify(POSES.relax));
    this.poseT = POSES.relax;

    // ── 袖 ──
    const seg = (r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, 1, 14, 1, false); g.rotateX(Math.PI/2); g.translate(0, 0, 0.5); const m = new THREE.Mesh(g, cloth); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m; };
    this.upper = seg(0.054, 0.046);
    this.fore = seg(0.045, 0.034);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), cloth); this.elbow.castShadow = true; this.root.add(this.elbow);
    this.L1 = 0.31; this.L2 = 0.27;

    // ── 火ばさみ ──（要（かなめ）を原点に、先端は +Z）
    const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.34, 0.34, 0.35), roughness: 0.42, metalness: 0.55 });
    const tongs = this.tongs = new THREE.Group();
    hand.add(tongs);
    const mkArm = (sgn) => {
      const pivot = new THREE.Group();
      // わずかに反った薄い鋼板。先へ行くほど細く、先端はぎざぎざの爪
      const n = 10, pos = [], idx = [];
      for (let k = 0; k <= n; k++) {
        const t = k/n, z = t*TONG_LEN, w = 0.011 - 0.0045*t, y = sgn*0.006*Math.sin(t*Math.PI)*0.6;
        pos.push(-w, y, z, w, y, z, -w, y + sgn*0.0034, z, w, y + sgn*0.0034, z);
      }
      for (let k = 0; k < n; k++) { const a = k*4, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const bar = new THREE.Mesh(g, steel); bar.castShadow = true; pivot.add(bar);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.03), steel); claw.position.set(0, -sgn*0.002, TONG_LEN - 0.012); claw.castShadow = true; pivot.add(claw);
      tongs.add(pivot); return pivot;
    };
    this.tongA = mkArm(1); this.tongB = mkArm(-1);
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 12, Math.PI), steel);
    spring.rotation.set(0, Math.PI/2, Math.PI/2); spring.position.z = -0.002; tongs.add(spring);
    tongs.position.set(0.004, -0.024, -0.02);
    tongs.visible = false;
    this.tongOpen = 0.2; this.tongOpenT = 0.2;

    // 状態
    this.wrist = new V3(0.3, 0.3, 1.5); this.quat = new THREE.Quaternion();
    this.wristT = new V3(0.3, 0.3, 1.5); this.quatT = new THREE.Quaternion();
    this.vel = new V3();
    this.shoulder = new V3();
    this.pole = new V3(0.5, -0.8, 0.3);
    this.speed = 0;
    this._a = new V3(); this._b = new V3(); this._c = new V3(); this._e = new V3(); this._m = new THREE.Matrix4();
    this.setPoseNow('relax');
  }

  get tongLen() { return TONG_LEN; }
  // 火ばさみの先端（閉じたときの中点）の、手ローカルでの位置
  get tongTipLocal() { return _tipLocal; }

  setPose(name) { this.poseT = POSES[name] || POSES.relax; }
  setPoseNow(name) { this.poseT = POSES[name] || POSES.relax; this.pose = JSON.parse(JSON.stringify(this.poseT)); this._applyPose(); }
  // 2つの握りのあいだ（開き具合 k: 0..1）
  setPoseMix(a, b, k) {
    const A = POSES[a], B = POSES[b];
    if (!this._mix) this._mix = JSON.parse(JSON.stringify(A));
    const M = this._mix;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) M.f[i][j] = A.f[i][j] + (B.f[i][j] - A.f[i][j])*k;
    M.t[0] = A.t[0] + (B.t[0] - A.t[0])*k; M.t[1] = A.t[1] + (B.t[1] - A.t[1])*k; M.ts = A.ts + (B.ts - A.ts)*k;
    this.poseT = M;
  }

  _applyPose() {
    const P = this.pose;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) this.fingers[i][j].rotation.x = P.f[i][j];
    // 親指：付け根は手のひらの横から出て、寄せ(ts)が大きいほど手のひらの下へ回り込む
    this.thumbBase.rotation.set(0.25 + 0.55*P.ts, 0.95 - 0.35*P.ts, -0.5 - 0.6*P.ts, 'YZX');
    this.thumb[0].rotation.x = P.t[0]; this.thumb[1].rotation.x = P.t[1];
  }

  // 目標の手首位置・向きを与える（手のローカル座標 → ワールド）
  setTarget(pos, quat) { this.wristT.copy(pos); this.quatT.copy(quat); }
  snap() { this.wrist.copy(this.wristT); this.quat.copy(this.quatT); this.vel.set(0, 0, 0); }

  // 基底ベクトルから向きを作る：z=指先方向, yHint=手の甲を向けたい方向
  static basis(out, z, yHint) {
    _z.copy(z).normalize();
    _y.copy(yHint).addScaledVector(_z, -yHint.dot(_z));
    if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
    _y.normalize();
    _x.crossVectors(_y, _z);
    _mm.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_mm);
  }
  // 握った棒の軸（手のX）と手の甲の向きから
  static basisGrip(out, axis, yHint) {
    _x.copy(axis).normalize();
    _y.copy(yHint).addScaledVector(_x, -yHint.dot(_x));
    if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_x, -_x.y);
    _y.normalize();
    _z.crossVectors(_x, _y);
    _mm.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_mm);
  }

  update(dt, shoulder, stiffness = 14) {
    // 手首：ばねで目標へ（少し遅れて、行き過ぎずに追う）
    const k = stiffness*stiffness, c = 2*stiffness*0.92;
    this._a.copy(this.wristT).sub(this.wrist).multiplyScalar(k).addScaledVector(this.vel, -c);
    this.vel.addScaledVector(this._a, dt);
    this.wrist.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    this.quat.slerp(this.quatT, Math.min(1, dt*stiffness*0.85));
    this.hand.position.copy(this.wrist); this.hand.quaternion.copy(this.quat);
    // 指
    const P = this.pose, T = this.poseT, r = Math.min(1, dt*13);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.f[i][j] += (T.f[i][j] - P.f[i][j])*r;
    P.t[0] += (T.t[0] - P.t[0])*r; P.t[1] += (T.t[1] - P.t[1])*r; P.ts += (T.ts - P.ts)*r;
    this._applyPose();
    // 火ばさみの開き
    this.tongOpen += (this.tongOpenT - this.tongOpen)*Math.min(1, dt*24);
    this.tongA.rotation.x = -this.tongOpen*0.25;   // 手のひら側の腕はほぼ動かず
    this.tongB.rotation.x = this.tongOpen*0.75;    // 指で握る側が大きく動く
    // 腕：肩→肘→手首
    const S = this.shoulder.copy(shoulder);
    const W = this._b.set(0, 0, -0.06).applyQuaternion(this.quat).add(this.wrist);   // 袖口の中
    let d = W.distanceTo(S);
    const reach = (this.L1 + this.L2)*0.985;
    const sc = Math.max(1, d/reach);             // 届かないぶんは腕を伸ばす（身を乗り出すぶん）
    const l1 = this.L1*sc, l2 = this.L2*sc;
    d = Math.max(0.05, d);
    const n = this._c.copy(W).sub(S).multiplyScalar(1/d);
    const a = (l1*l1 - l2*l2 + d*d)/(2*d), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
    const pp = this._a.copy(this.pole).addScaledVector(n, -this.pole.dot(n)).normalize();
    const E = this._e.copy(S).addScaledVector(n, a).addScaledVector(pp, h);
    this._bone(this.upper, S, E); this._bone(this.fore, E, W);
    this.elbow.position.copy(E);
  }
  _bone(mesh, A, B) {
    mesh.position.copy(A);
    mesh.lookAt(B);
    mesh.scale.set(1, 1, A.distanceTo(B));
  }
  setVisible(v) { this.root.visible = v; }
}

const _x = new V3(), _y = new V3(), _z = new V3(), _mm = new THREE.Matrix4();
const _tipLocal = new V3(0.004, -0.026, -0.02 + TONG_LEN - 0.012);
