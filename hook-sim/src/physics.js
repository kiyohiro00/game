/* フック台シミュレーター：機械の制御と物理（ブラウザと Node で共用）
 *
 * 単位はメートル・キログラム・秒。y が上、x が右、z が手前（プレイヤー側）。
 * 鎖は質点の列（距離拘束＋つなぎ止め）、リングは剛体のトーラス、
 * 板はレールの上を上下だけに動く物体として、小さい刻み（1/1440秒）の
 * 位置ベース法（XPBD）で解く。
 */
(function (global) {
  'use strict';

  const G = 9.81;
  const H = 1 / 1440;            // 1回の刻み
  const EPS = 1e-12;

  // ---------------------------------------------------------------- 台の寸法
  const WORLD = {
    deckY: 0.06,                             // 景品を置く床
    interior: { x0: -0.355, x1: 0.355, z0: -0.275, z1: 0.275, y1: 0.985 },
    headTop: 0.93,                           // 根元のいちばん上
    home: { x: -0.27, z: 0.17 },             // 取り出し口の上
    limit: { x0: -0.27, x1: 0.31, z0: -0.23, z1: 0.17 },
    board: { cx: 0.0, cz: -0.01, hx: 0.22, hz: 0.13, thick: 0.012, top: 0.46 },
    stand: { cx: 0.0, cz: -0.01, hx: 0.17, hz: 0.11, top: 0.165 },
    prize: { w: 0.22, h: 0.135, d: 0.13 },
    chute: { x0: -0.355, x1: -0.19, z0: 0.04, z1: 0.275 },
  };

  // 本の第3章「100円入れる前に見る7つのところ」に合わせた設定の選択肢
  const OPTIONS = {
    ringSize: { small: 0.040, mid: 0.048, big: 0.060 },         // 外径
    ringThick: { thin: 0.0024, mid: 0.0032, thick: 0.0048 },     // 線の半径
    ringWeight: { light: 0.012, mid: 0.025, heavy: 0.05 },
    descent: { edge: 0.006, normal: -0.035, deep: -0.08 },       // 着く高さからの差
    tilt: { none: [0, 0], front: [2.5, 0], back: [-2.5, 0], left: [0, 2.5], right: [0, -2.5] },
    drive: {
      brisk: { accel: 6.0, wave: 0 },      // きびきび：止まる・動くがはっきり（よくゆれる）
      smooth: { accel: 0.28, wave: 0 },    // なめらか：ゆれが育ちにくい
      wavy: { accel: 0.5, wave: 0.2 },     // 波打つ：速さが波のように変わる
    },
  };

  const DEFAULT_SETUP = {
    prizePrice: 1500,
    ringSize: 'mid', ringThick: 'mid', ringWeight: 'mid',
    chainLen: 0.22, rootSwing: false,
    hookType: 'q', hookDir: 'left', hookYaw: 0, hookX: 0.03, hookZ: -0.01,
    tilt: 'none', slippery: false,
    descent: 'normal', descentButton: false,
    drive: 'brisk', speed: 0.12, drift: false,
  };

  // ---------------------------------------------------------------- 小さな数学
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b, o) {
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mulMV(m, v, o) {
    const x = v[0], y = v[1], z = v[2];
    o[0] = m[0] * x + m[1] * y + m[2] * z; o[1] = m[3] * x + m[4] * y + m[5] * z; o[2] = m[6] * x + m[7] * y + m[8] * z; return o;
  }
  function mulMtV(m, v, o) {
    const x = v[0], y = v[1], z = v[2];
    o[0] = m[0] * x + m[3] * y + m[6] * z; o[1] = m[1] * x + m[4] * y + m[7] * z; o[2] = m[2] * x + m[5] * y + m[8] * z; return o;
  }
  function matMul(a, b) {
    const o = new Float64Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  }
  function rotX(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return Float64Array.of(1, 0, 0, 0, c, -s, 0, s, c); }
  function rotY(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return Float64Array.of(c, 0, s, 0, 1, 0, -s, 0, c); }
  function rotZ(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return Float64Array.of(c, -s, 0, s, c, 0, 0, 0, 1); }
  function quatToMat(q, m) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    m[0] = 1 - 2 * (yy + zz); m[1] = 2 * (xy - wz); m[2] = 2 * (xz + wy);
    m[3] = 2 * (xy + wz); m[4] = 1 - 2 * (xx + zz); m[5] = 2 * (yz - wx);
    m[6] = 2 * (xz - wy); m[7] = 2 * (yz + wx); m[8] = 1 - 2 * (xx + yy);
  }
  function quatNormalize(q) {
    const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  }
  // q += 0.5 * [w,0] * q
  function quatRotate(q, wx, wy, wz) {
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += 0.5 * (wx * qw + wy * qz - wz * qy);
    q[1] += 0.5 * (wy * qw + wz * qx - wx * qz);
    q[2] += 0.5 * (wz * qw + wx * qy - wy * qx);
    q[3] += 0.5 * (-wx * qx - wy * qy - wz * qz);
    quatNormalize(q);
  }
  function quatFromAxisAngle(ax, ay, az, a) {
    const s = Math.sin(a / 2); return [ax * s, ay * s, az * s, Math.cos(a / 2)];
  }

  // 線分どうしの最近点（Ericson 5.1.9）
  const SS = { s: 0, t: 0, c1: [0, 0, 0], c2: [0, 0, 0] };
  function segSeg(p1, q1, p2, q2) {
    const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
    const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
    const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (a <= EPS && e <= EPS) { s = 0; t = 0; }
    else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
        s = den > EPS ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    SS.s = s; SS.t = t;
    SS.c1[0] = p1[0] + d1x * s; SS.c1[1] = p1[1] + d1y * s; SS.c1[2] = p1[2] + d1z * s;
    SS.c2[0] = p2[0] + d2x * t; SS.c2[1] = p2[1] + d2y * t; SS.c2[2] = p2[2] + d2z * t;
    return SS;
  }
  // 点と線分の最近点
  const PS = { t: 0, c: [0, 0, 0] };
  function pointSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = l2 > EPS ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    PS.t = t; PS.c[0] = a[0] + dx * t; PS.c[1] = a[1] + dy * t; PS.c[2] = a[2] + dz * t;
    return PS;
  }
  // 球と向きつきの箱。当たっていれば法線（箱→球）と深さを返す
  const SB = { n: [0, 0, 0], d: 0 };
  const _l = [0, 0, 0], _nl = [0, 0, 0];
  function sphereBox(p, r, box, lift, up) {
    _l[0] = p[0] - box.c[0] - up[0] * lift; _l[1] = p[1] - box.c[1] - up[1] * lift; _l[2] = p[2] - box.c[2] - up[2] * lift;
    mulMtV(box.R, _l, _l);
    const hx = box.h[0], hy = box.h[1], hz = box.h[2];
    if (Math.abs(_l[0]) > hx + r || Math.abs(_l[1]) > hy + r || Math.abs(_l[2]) > hz + r) return null;
    const cx = clamp(_l[0], -hx, hx), cy = clamp(_l[1], -hy, hy), cz = clamp(_l[2], -hz, hz);
    let dx = _l[0] - cx, dy = _l[1] - cy, dz = _l[2] - cz;
    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > EPS) {
      if (dist >= r) return null;
      _nl[0] = dx / dist; _nl[1] = dy / dist; _nl[2] = dz / dist; SB.d = r - dist;
    } else {
      // 中心が箱の中：いちばん近い面から押し出す
      const ex = hx - Math.abs(_l[0]), ey = hy - Math.abs(_l[1]), ez = hz - Math.abs(_l[2]);
      _nl[0] = _nl[1] = _nl[2] = 0;
      if (ey <= ex && ey <= ez) { _nl[1] = _l[1] >= 0 ? 1 : -1; SB.d = ey + r; }
      else if (ex <= ez) { _nl[0] = _l[0] >= 0 ? 1 : -1; SB.d = ex + r; }
      else { _nl[2] = _l[2] >= 0 ? 1 : -1; SB.d = ez + r; }
    }
    mulMV(box.R, _nl, SB.n);
    return SB;
  }

  // ---------------------------------------------------------------- フックの形
  // フック自身の座標：原点は板の上面、y が上、開いた側が -x。
  function hookLocal(type, dims) {
    dims = Object.assign({ y0: 0.027, end: 210, Rh: 0.0128 }, dims || {});
    const parts = { wire: [], boxes: [], caps: [], loop: null };
    parts.boxes.push({ c: [0, 0.0075, 0], h: [0.017, 0.0075, 0.012], kind: 'base' });   // 黄色い台形の土台
    parts.caps.push({ a: [0, 0.015, 0], b: [0, 0.021, 0], r: 0.0055, kind: 'collar' }); // グレーの軸受け
    if (type === 'L') {
      const pts = [[0, 0.015, 0], [0, 0.046, 0], [-0.002, 0.0495, 0], [-0.006, 0.0505, 0], [-0.031, 0.0505, 0], [-0.035, 0.053, 0], [-0.037, 0.059, 0]];
      for (let i = 0; i < pts.length - 1; i++) parts.wire.push([pts[i], pts[i + 1]]);
    } else {
      // 「？」の形：軸の上に、左下だけが開いたほぼ丸い輪
      const Rh = dims.Rh, y0 = dims.y0, end = dims.end;
      parts.wire.push([[0, 0.015, 0], [0, y0, 0]]);
      let prev = [0, y0, 0];
      const steps = Math.ceil((end + 90) / 12);
      for (let i = 1; i <= steps; i++) {
        const a = -90 + (end + 90) * i / steps;
        const r = a * Math.PI / 180, p = [Rh * Math.cos(r), y0 + Rh + Rh * Math.sin(r), 0];
        parts.wire.push([prev, p]); prev = p;
      }
      parts.loop = { c: [0, y0 + Rh, 0], Rh };
    }
    return parts;
  }

  // ---------------------------------------------------------------- 本体
  class HookMachine {
    constructor(setup) {
      this.events = [];
      this.credits = 0; this.spent = 0; this.gets = 0; this.playNo = 0;
      this.log = [];
      this.applySetup(setup || {});
    }

    emit(type, data) { this.events.push(Object.assign({ type, t: this.time }, data || {})); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    applySetup(setup) {
      // 遊んでいる途中（ボタンを押す前）なら、そのクレジットのまま台だけ替える
      const keep = this.state === 'ready' ? this.play : null;
      this.setup = Object.assign({}, DEFAULT_SETUP, setup);
      this.jitter = [0, 0];
      this.build();
      this.resetBodies();
      this.state = keep ? 'ready' : 'idle';
      this.play = keep;
      this.stateT = 0;
      this.emit('geometry');
    }

    // 寸法をつくる
    build() {
      const s = this.setup, W = WORLD;
      const P = this.P = {};
      P.D = s.ringD || OPTIONS.ringSize[s.ringSize]; P.rt = OPTIONS.ringThick[s.ringThick];
      P.Rc = P.D / 2 - P.rt; P.M = OPTIONS.ringWeight[s.ringWeight] * (P.D / 0.048);
      P.Iin = 0.5 * P.M * P.Rc * P.Rc;   // 輪の面内の軸
      P.Iax = P.M * P.Rc * P.Rc;         // 輪の中心軸
      P.chainLen = s.chainLen; P.linkLen = 0.014;
      P.N = Math.max(4, Math.round(s.chainLen / P.linkLen));
      P.linkLen = s.chainLen / P.N;
      P.chainR = 0.0016; P.mLink = 0.03 * P.linkLen;
      P.rootLen = s.rootSwing ? 0.028 : 0;
      P.mu = s.slippery ? { s: 0.14, k: 0.09 } : { s: 0.42, k: 0.3 };
      P.muHook = { s: 0.25, k: 0.18 };
      P.drive = OPTIONS.drive[s.drive];
      P.speed = s.speed;
      P.vDown = 0.11; P.vUp = 0.09;
      P.liftWin = 0.02; P.liftMax = 0.05; P.Mb = 0.12;

      // 板
      const t = OPTIONS.tilt[s.tilt];
      const Rb = matMul(rotX(t[0]), rotZ(t[1]));
      const B = W.board;
      const bc = [B.cx, B.top - B.thick / 2, B.cz];
      P.U = mulMV(Rb, [0, 1, 0], [0, 0, 0]);
      P.boardBox = { c: bc, R: Rb, h: [B.hx, B.thick / 2, B.hz] };
      P.boardR = Rb;

      // フック
      const yaw0 = { left: 0, right: 180, back: -90, front: 90 }[s.hookDir] || 0;
      const Rh = matMul(Rb, rotY(yaw0 + s.hookYaw));
      const spots = s.hookType === 'triple' ? [-0.075, 0, 0.075] : [0];
      P.hooks = spots.map((dz) => {
        const hx = s.hookX + this.jitter[0], hz = s.hookZ + dz + this.jitter[1];
        const local = [hx - B.cx, B.thick / 2, hz - B.cz];
        const origin = mulMV(Rb, local, [0, 0, 0]);
        origin[0] += bc[0]; origin[1] += bc[1]; origin[2] += bc[2];
        const lp = hookLocal(s.hookType === 'triple' ? 'q' : s.hookType, s.hookDims);
        const toW = (p) => { const o = mulMV(Rh, p, [0, 0, 0]); o[0] += origin[0]; o[1] += origin[1]; o[2] += origin[2]; return o; };
        const wire = lp.wire.map(([a, b]) => [toW(a), toW(b)]);
        const boxes = lp.boxes.map((bx) => ({ c: toW(bx.c), R: Rh, h: bx.h, kind: bx.kind }));
        const caps = lp.caps.map((c) => ({ a: toW(c.a), b: toW(c.b), r: c.r, kind: c.kind }));
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const [a, b] of wire) for (const p of [a, b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
        for (const bx of boxes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], bx.c[k] - 0.02); hi[k] = Math.max(hi[k], bx.c[k] + 0.02); }
        return {
          origin, R: Rh, wire, boxes, caps, lo, hi, rw: 0.0022, type: s.hookType === 'triple' ? 'q' : s.hookType,
          loop: lp.loop ? { c: toW(lp.loop.c), Rh: lp.loop.Rh } : null,
          open: mulMV(Rh, [-1, 0, 0], [0, 0, 0]),
        };
      });

      // 下降の深さ：つり下がったリングの下端がちょうど板に着く根元の高さを基準にする
      P.touchY = B.top + P.chainLen + P.rootLen + 2 * P.Rc + P.rt;
      P.bottomY = P.touchY + OPTIONS.descent[s.descent];
      P.omega = Math.sqrt(G / (P.chainLen + P.rootLen + P.Rc));
    }

    resetBodies() {
      const P = this.P;
      this.time = 0;
      this.head = [WORLD.home.x, WORLD.headTop, WORLD.home.z];
      this.headV = [0, 0, 0];
      this.drift = [0, 0];
      // 点 0 が根元（ゆれる根元なら本体から短くぶら下がる部品）、点 N がリングの通る最後の輪
      const n = P.N + 1;
      this.np = n;
      this.x = []; this.xp = []; this.v = []; this.w = [];
      for (let i = 0; i < n; i++) {
        this.x.push([this.head[0], WORLD.headTop - P.rootLen - i * P.linkLen, this.head[2]]);
        this.xp.push(this.x[i].slice());
        this.v.push([0, 0, 0]);
        this.w.push(1 / P.mLink);
      }
      this.w[0] = P.rootLen > 0 ? 1 / 0.06 : 0;
      this.w[n - 1] = 1 / (P.mLink * 2);
      this.won = false;
      // リング：鎖の最後の輪に通っていて、面は左右（x 軸まわり）を向いて下がる
      const end = this.x[n - 1];
      const twist = (Math.random() - 0.5) * 0.6;
      const q = quatFromAxisAngle(0, 1, 0, Math.PI / 2 + twist);
      this.ring = {
        c: [end[0], end[1] - P.Rc, end[2]], q, v: [0, 0, 0], w: [0, 0, 0],
        cp: [0, 0, 0], qp: [0, 0, 0, 1], R: new Float64Array(9), Rp: new Float64Array(9),
        vs: [0, 0, 0], ws: [0, 0, 0],
      };
      quatToMat(q, this.ring.R);
      const K = this.K = 24;
      this.samples = [];
      for (let k = 0; k < K; k++) { const a = (k / K) * Math.PI * 2; this.samples.push([P.Rc * Math.cos(a), P.Rc * Math.sin(a), 0]); }
      this.sw = this.samples.map(() => [0, 0, 0]);
      this.board = { b: 0, bp: 0, vb: 0, off: false };
      this.prize = 'on';
      this.contacts = [];
      this.play = null;
      this.peak = { hook: 0, board: 0, chain: 0 };
      this.settle(1.5);
    }

    // しばらく静かに置いて形を落ち着かせる
    settle(sec) {
      const st = this.state; this.state = 'settling';
      for (let t = 0; t < sec; t += H) this.substep(H);
      this.state = st; this.time = 0;
      this.peak = { hook: 0, board: 0, chain: 0 };
      this.events = this.events.filter((e) => e.type === 'geometry');
    }

    // ------------------------------------------------------------ 操作
    insert(yen) {
      const plays = yen === 500 ? 6 : 1;
      this.credits += plays; this.spent += yen;
      this.emit('coin', { yen, plays });
      if (this.state === 'idle') this.enter('ready');
    }
    press(n) {
      if (n === 1 && this.state === 'ready') { this.enter('movex'); this.recPress(1); }
      else if (n === 2 && this.state === 'waitz') { this.enter('movez'); this.recPress(2); }
      else if (n === 3 && this.state === 'waitdown') { this.enter('descend'); }
      else if (n === 3 && this.state === 'descend' && this.setup.descentButton && this.stateT > 0.15) { this.emit('stop-descent'); this.enter('bottom'); }
    }
    release(n) {
      if (n === 1 && this.state === 'movex') { this.recRelease(1); this.enter('waitz'); }
      else if (n === 2 && this.state === 'movez') { this.recRelease(2); this.enter(this.setup.descentButton ? 'waitdown' : 'predesc'); }
    }

    enter(state) {
      this.state = state; this.stateT = 0;
      if (state === 'ready') {
        this.credits -= 1; this.playNo += 1;
        this.play = { no: this.playNo, hold: [0, 0], pressK: [null, null], releaseK: [null, null], landing: null, topHit: false, hookTouch: false, maxLift: 0, result: '' };
      }
      this.emit('state', { state });
    }

    // ゆれ時計：根元から見たリングの位置と速さを、本の①〜⑤の時計にする
    swingClock(axis) {
      const P = this.P, r = this.ring;
      const k = axis === 'z' ? 2 : 0;
      const root = this.x[0];
      const u = r.c[k] - root[k];
      const ud = r.v[k] - (this.x[0][k] - this.xp[0][k]) / H;
      const amp = Math.sqrt(u * u + (ud / P.omega) * (ud / P.omega));
      let phi = Math.atan2(-ud / P.omega, u) * 180 / Math.PI;
      if (phi < 0) phi += 360;
      return { phi, amp, u };
    }
    static clockLabel(phi) {
      const pts = [[0, 1], [45, 2], [90, 3], [180, 4], [225, 5], [360, 1]];
      let best = pts[0], bd = 1e9;
      for (const p of pts) { const d = Math.abs(phi - p[0]); if (d < bd) { bd = d; best = p; } }
      return best[1];
    }
    recPress(n) {
      if (!this.play) return;
      const c = this.swingClock(n === 1 ? 'x' : 'z');
      this.play.pressK[n - 1] = { no: HookMachine.clockLabel(c.phi), phi: c.phi, amp: c.amp };
      this.play.holdStart = this.time;
    }
    recRelease(n) {
      if (!this.play) return;
      const c = this.swingClock(n === 1 ? 'x' : 'z');
      this.play.releaseK[n - 1] = { no: HookMachine.clockLabel(c.phi), phi: c.phi, amp: c.amp };
      this.play.hold[n - 1] = this.time - this.play.holdStart;
    }

    // ------------------------------------------------------------ 時間を進める
    advance(dt) {
      this.acc = (this.acc || 0) + dt;
      let n = 0;
      while (this.acc >= H && n < 200) { this.substep(H); this.acc -= H; n++; }
      if (n >= 200) this.acc = 0;
    }

    updateHead(h) {
      const P = this.P, W = WORLD, st = this.state;
      this.stateT += h; this.time += h;
      let tvx = 0, tvz = 0;
      const sp = P.speed * (1 + P.drive.wave * Math.sin(this.time * 2 * Math.PI * 1.4));
      if (st === 'movex') tvx = sp;
      if (st === 'movez') tvz = -sp;
      if (st === 'return') {
        const dx = W.home.x - this.head[0], dz = W.home.z - this.head[2];
        const ret = 0.14, brake = (v) => Math.sign(v) * Math.min(ret, Math.sqrt(2 * Math.max(P.drive.accel, 0.5) * Math.abs(v) * 0.9));
        tvx = Math.abs(dx) > 0.0005 ? brake(dx) : 0;
        tvz = Math.abs(dz) > 0.0005 ? brake(dz) : 0;
        if (Math.abs(dx) <= 0.0005 && Math.abs(dz) <= 0.0005) { this.head[0] = W.home.x; this.head[2] = W.home.z; this.headV[0] = this.headV[2] = 0; this.finishPlay(); }
      }
      const acc = P.drive.accel * h;
      this.headV[0] += clamp(tvx - this.headV[0], -acc, acc);
      this.headV[2] += clamp(tvz - this.headV[2], -acc, acc);
      this.head[0] += this.headV[0] * h; this.head[2] += this.headV[2] * h;
      const L = W.limit;
      if (this.head[0] > L.x1) { this.head[0] = L.x1; this.headV[0] = 0; }
      if (this.head[0] < L.x0) { this.head[0] = L.x0; this.headV[0] = 0; }
      if (this.head[2] < L.z0) { this.head[2] = L.z0; this.headV[2] = 0; }
      if (this.head[2] > L.z1) { this.head[2] = L.z1; this.headV[2] = 0; }

      // 上下
      if (st === 'predesc' && this.stateT > 0.45) this.enter('descend');
      if (st === 'ready' && this.stateT > 30) { this.recPress(1); this.recRelease(1); this.enter('waitz'); }
      if (st === 'waitz' && this.stateT > 30) { this.enter('predesc'); }
      if (st === 'waitdown' && this.stateT > 10) { this.enter('descend'); }
      if (st === 'descend') {
        this.head[1] -= P.vDown * h;
        if (this.head[1] <= P.bottomY) { this.head[1] = P.bottomY; this.enter('bottom'); }
      }
      if (st === 'bottom' && this.stateT > 0.6) this.enter('ascend');
      if (st === 'ascend') {
        this.head[1] += P.vUp * h;
        if (this.head[1] >= W.headTop) { this.head[1] = W.headTop; this.enter('toppause'); }
      }
      if (st === 'toppause' && this.stateT > 0.35) this.enter('return');

      // 下りると上がるのずれ：ケーブルに引かれて「く」の字に動く
      const depth = clamp((W.headTop - this.head[1]) / Math.max(0.01, W.headTop - P.bottomY), 0, 1);
      if (this.setup.drift) {
        const goingUp = st === 'ascend' || st === 'toppause';
        this.drift[0] = 0.009 * Math.sin(depth * Math.PI / 2);
        this.drift[1] = goingUp ? 0.006 * Math.sin(depth * Math.PI) : 0;
      } else { this.drift[0] = 0; this.drift[1] = 0; }
    }

    finishPlay() {
      const p = this.play;
      if (p) {
        if (this.won) p.result = 'get';
        else if (p.maxLift > 0.003) p.result = 'lift';
        else if (p.topHit) p.result = 'top';
        else if (p.hookTouch) p.result = 'touch';
        else p.result = 'miss';
        this.log.unshift(p);
        this.emit('result', { play: p });
      }
      this.play = null;
      if (this.won) { this.won = false; this.enter('restock'); return; }
      this.enter(this.credits > 0 ? 'ready' : 'idle');
    }

    // 店員さんが景品を補充して、板を置き直す（少しだけずれる）
    restock() {
      this.jitter = [(Math.random() - 0.5) * 0.008, (Math.random() - 0.5) * 0.008];
      this.build(); this.resetBodies();
      this.emit('geometry'); this.emit('restocked');
      this.enter(this.credits > 0 ? 'ready' : 'idle');
    }

    // ------------------------------------------------------------ 1刻み
    substep(h) {
      const P = this.P, r = this.ring, x = this.x, xp = this.xp, v = this.v, w = this.w, np = this.np;
      if (this.state === 'restock') { this.stateT += h; this.time += h; if (this.stateT > 2.2) this.restock(); return; }
      if (this.state !== 'settling') this.updateHead(h);
      const hx = this.head[0] + this.drift[0], hy = this.head[1], hz = this.head[2] + this.drift[1];

      // 予測
      const airC = 1 - 0.6 * h;
      for (let i = 0; i < np; i++) {
        xp[i][0] = x[i][0]; xp[i][1] = x[i][1]; xp[i][2] = x[i][2];
        if (w[i] === 0) continue;
        v[i][1] -= G * h;
        v[i][0] *= airC; v[i][1] *= airC; v[i][2] *= airC;
        x[i][0] += v[i][0] * h; x[i][1] += v[i][1] * h; x[i][2] += v[i][2] * h;
      }
      if (P.rootLen === 0) { x[0][0] = hx; x[0][1] = hy; x[0][2] = hz; }
      r.cp[0] = r.c[0]; r.cp[1] = r.c[1]; r.cp[2] = r.c[2];
      r.qp[0] = r.q[0]; r.qp[1] = r.q[1]; r.qp[2] = r.q[2]; r.qp[3] = r.q[3];
      r.Rp.set(r.R);
      r.vs[0] = r.v[0]; r.vs[1] = r.v[1]; r.vs[2] = r.v[2];
      r.ws[0] = r.w[0]; r.ws[1] = r.w[1]; r.ws[2] = r.w[2];
      r.v[1] -= G * h;
      const lin = 1 - 0.12 * h, ang = 1 - 0.8 * h;
      r.v[0] *= lin; r.v[1] *= lin; r.v[2] *= lin; r.w[0] *= ang; r.w[1] *= ang; r.w[2] *= ang;
      r.c[0] += r.v[0] * h; r.c[1] += r.v[1] * h; r.c[2] += r.v[2] * h;
      quatRotate(r.q, r.w[0] * h, r.w[1] * h, r.w[2] * h);
      quatToMat(r.q, r.R);
      const bd = this.board;
      bd.bp = bd.b; const vbs = bd.vb;
      bd.vb -= G * h; bd.b += bd.vb * h;

      // 鎖
      if (P.rootLen > 0) this.distToFixed(0, hx, hy, hz, P.rootLen);
      for (let i = 0; i < np - 1; i++) this.dist(i, i + 1, P.linkLen);
      this.ringAttach();
      for (let i = np - 2; i >= 0; i--) this.dist(i, i + 1, P.linkLen);
      // つなぎ止め：根元からそれ以上は離れない
      for (let i = 1; i < np; i++) this.tether(i, hx, hy, hz, (P.rootLen + i * P.linkLen) * 1.0005);
      this.ringAttach();

      // 板の上下の範囲
      if (bd.b < 0) { bd.b = 0; }
      if (bd.b > P.liftMax) bd.b = P.liftMax;

      // 当たり
      this.contacts.length = 0;
      this.collideRing(h);
      this.collideChain();
      if (bd.b < 0) bd.b = 0;

      // 速度
      for (let i = 0; i < np; i++) {
        if (w[i] === 0) { v[i][0] = (x[i][0] - xp[i][0]) / h; v[i][1] = (x[i][1] - xp[i][1]) / h; v[i][2] = (x[i][2] - xp[i][2]) / h; continue; }
        v[i][0] = (x[i][0] - xp[i][0]) / h; v[i][1] = (x[i][1] - xp[i][1]) / h; v[i][2] = (x[i][2] - xp[i][2]) / h;
      }
      r.v[0] = (r.c[0] - r.cp[0]) / h; r.v[1] = (r.c[1] - r.cp[1]) / h; r.v[2] = (r.c[2] - r.cp[2]) / h;
      // dq = q * qp^-1
      {
        const ax = r.q[0], ay = r.q[1], az = r.q[2], aw = r.q[3];
        const bx = -r.qp[0], by = -r.qp[1], bz = -r.qp[2], bw = r.qp[3];
        let dx = aw * bx + ax * bw + ay * bz - az * by;
        let dy = aw * by - ax * bz + ay * bw + az * bx;
        let dz = aw * bz + ax * by - ay * bx + az * bw;
        const dw = aw * bw - ax * bx - ay * by - az * bz;
        const sgn = dw >= 0 ? 1 : -1;
        r.w[0] = 2 * dx * sgn / h; r.w[1] = 2 * dy * sgn / h; r.w[2] = 2 * dz * sgn / h;
      }
      bd.vb = (bd.b - bd.bp) / h;
      if (bd.b <= 0 && bd.vb < 0) bd.vb = 0;
      this.restitution(vbs);

      // 景品の判定
      if (this.play && (this.state === 'ascend' || this.state === 'toppause' || this.state === 'return' || this.state === 'bottom')) {
        this.play.maxLift = Math.max(this.play.maxLift, bd.b);
      }
      if (!this.won && bd.b >= P.liftWin && this.play) { this.won = true; this.gets += 1; this.prize = 'falling'; this.emit('win'); }
      // 板が上の止めに当たったら、本体は上がれずに止まる（パワー切れ）。そのあと取り出し口の上へもどる
      if (this.state === 'ascend' && bd.b >= P.liftMax - 0.0015) { this.emit('stall'); this.enter('toppause'); }
      // もどる途中で、たいていリングはフックの開いた側から抜ける。抜けないときは板が傾いて外れたことにする
      if (!bd.off && this.state === 'return' && this.stateT > 1.4 && bd.b > 0.008) { bd.off = true; this.emit('board-release'); }
      if (bd.b > 0.006) bd.raised = true;
      if (bd.raised && bd.b <= 0.0005 && !bd.dropped) { bd.dropped = true; this.emit('board-drop'); }
    }

    // 2点の距離をそろえる
    dist(i, j, L) {
      const a = this.x[i], b = this.x[j], wi = this.w[i], wj = this.w[j];
      const ws = wi + wj; if (ws === 0) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < EPS) return;
      const k = (d - L) / (d * ws);
      a[0] += dx * k * wi; a[1] += dy * k * wi; a[2] += dz * k * wi;
      b[0] -= dx * k * wj; b[1] -= dy * k * wj; b[2] -= dz * k * wj;
    }
    distToFixed(i, fx, fy, fz, L) {
      const a = this.x[i];
      const dx = a[0] - fx, dy = a[1] - fy, dz = a[2] - fz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < EPS) return;
      const k = (d - L) / d;
      a[0] -= dx * k; a[1] -= dy * k; a[2] -= dz * k;
    }
    tether(i, fx, fy, fz, L) {
      const a = this.x[i];
      const dx = a[0] - fx, dy = a[1] - fy, dz = a[2] - fz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= L) return;
      const k = (d - L) / d;
      a[0] -= dx * k; a[1] -= dy * k; a[2] -= dz * k;
    }

    // ---- 剛体（リング）への位置の補正
    invInertiaW(vx, vy, vz, o) {
      // R * Iloc^-1 * R^T * v
      const R = this.ring.R, P = this.P;
      const lx = R[0] * vx + R[3] * vy + R[6] * vz, ly = R[1] * vx + R[4] * vy + R[7] * vz, lz = R[2] * vx + R[5] * vy + R[8] * vz;
      const ix = lx / P.Iin, iy = ly / P.Iin, iz = lz / P.Iax;
      o[0] = R[0] * ix + R[1] * iy + R[2] * iz; o[1] = R[3] * ix + R[4] * iy + R[5] * iz; o[2] = R[6] * ix + R[7] * iy + R[8] * iz;
      return o;
    }
    genInvMass(p, n) {
      const c = this.ring.c;
      const rx = p[0] - c[0], ry = p[1] - c[1], rz = p[2] - c[2];
      const cx = ry * n[2] - rz * n[1], cy = rz * n[0] - rx * n[2], cz = rx * n[1] - ry * n[0];
      const t = this.invInertiaW(cx, cy, cz, _gi);
      return 1 / this.P.M + cx * t[0] + cy * t[1] + cz * t[2];
    }
    applyRing(p, px, py, pz) {
      const r = this.ring, M = this.P.M;
      const rx = p[0] - r.c[0], ry = p[1] - r.c[1], rz = p[2] - r.c[2];
      r.c[0] += px / M; r.c[1] += py / M; r.c[2] += pz / M;
      const cx = ry * pz - rz * py, cy = rz * px - rx * pz, cz = rx * py - ry * px;
      const t = this.invInertiaW(cx, cy, cz, _gi);
      quatRotate(r.q, t[0], t[1], t[2]);
      quatToMat(r.q, r.R);
    }
    ringPoint(k, o) {
      const r = this.ring; mulMV(r.R, this.samples[k], o);
      o[0] += r.c[0]; o[1] += r.c[1]; o[2] += r.c[2]; return o;
    }

    // 鎖のいちばん下の輪にリングが通っている：輪はリングの線の上を自由にすべる
    ringAttach() {
      const P = this.P, r = this.ring, e = this.x[this.np - 1], we = this.w[this.np - 1];
      const R = r.R;
      // リングの面への射影
      const dx = e[0] - r.c[0], dy = e[1] - r.c[1], dz = e[2] - r.c[2];
      const ax = R[2], ay = R[5], az = R[8];
      const an = dx * ax + dy * ay + dz * az;
      let px = dx - ax * an, py = dy - ay * an, pz = dz - az * an;
      let pl = Math.sqrt(px * px + py * py + pz * pz);
      if (pl < EPS) { px = R[1]; py = R[4]; pz = R[7]; pl = 1; }
      const cp = _cp; cp[0] = r.c[0] + px / pl * P.Rc; cp[1] = r.c[1] + py / pl * P.Rc; cp[2] = r.c[2] + pz / pl * P.Rc;
      const gx = e[0] - cp[0], gy = e[1] - cp[1], gz = e[2] - cp[2];
      const d = Math.sqrt(gx * gx + gy * gy + gz * gz);
      const slack = 0.0015;
      if (d <= slack) return;
      const n = _n; n[0] = gx / d; n[1] = gy / d; n[2] = gz / d;
      const wr = this.genInvMass(cp, n);
      const lam = (d - slack) / (we + wr);
      e[0] -= n[0] * lam * we; e[1] -= n[1] * lam * we; e[2] -= n[2] * lam * we;
      this.applyRing(cp, n[0] * lam, n[1] * lam, n[2] * lam);
    }

    // 板が動けるか（上には上限、下にはレール）
    boardFree(dirUp) {
      const b = this.board.b, P = this.P;
      if (dirUp > 0) return b < P.liftMax;
      return b > 1e-7;
    }

    // リングの1点に当たりを返す共通処理
    resolveRing(p, n, d, kind, hookAttached, mu) {
      const P = this.P, r = this.ring, bd = this.board;
      const wr = this.genInvMass(p, n);
      let wb = 0, nu = 0;
      if (hookAttached) {
        nu = n[0] * P.U[0] + n[1] * P.U[1] + n[2] * P.U[2];
        // 板は -n の向きに押される
        if (Math.abs(nu) > 1e-6 && this.boardFree(-nu)) wb = nu * nu / P.Mb;
      }
      // 当たる前の速さ（はね返りと音のため）
      const rx = p[0] - r.c[0], ry = p[1] - r.c[1], rz = p[2] - r.c[2];
      const vpx = r.vs[0] + r.ws[1] * rz - r.ws[2] * ry, vpy = r.vs[1] + r.ws[2] * rx - r.ws[0] * rz, vpz = r.vs[2] + r.ws[0] * ry - r.ws[1] * rx;
      const vbU = hookAttached ? bd.vb : 0;
      const vnPre = vpx * n[0] + vpy * n[1] + vpz * n[2] - vbU * nu;
      const lam = d / (wr + wb);
      this.applyRing(p, n[0] * lam, n[1] * lam, n[2] * lam);
      if (wb > 0) bd.b -= lam * nu / P.Mb;

      // 摩擦：この刻みでの、当たっている点どうしのずれを止める
      const rl = mulMtV(r.R, [p[0] - r.c[0], p[1] - r.c[1], p[2] - r.c[2]], _rl);
      const pc = mulMV(r.R, rl, _pc); pc[0] += r.c[0]; pc[1] += r.c[1]; pc[2] += r.c[2];
      const pp = mulMV(r.Rp, rl, _pp); pp[0] += r.cp[0]; pp[1] += r.cp[1]; pp[2] += r.cp[2];
      const surf = hookAttached || kind === 'board' ? (bd.b - bd.bp) : 0;
      let dx = pc[0] - pp[0] - P.U[0] * surf, dy = pc[1] - pp[1] - P.U[1] * surf, dz = pc[2] - pp[2] - P.U[2] * surf;
      const dn = dx * n[0] + dy * n[1] + dz * n[2];
      dx -= n[0] * dn; dy -= n[1] * dn; dz -= n[2] * dn;
      const dt = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dt > EPS) {
        const t = _t; t[0] = dx / dt; t[1] = dy / dt; t[2] = dz / dt;
        const corr = dt < mu.s * d ? dt : Math.min(dt, mu.k * d);
        const wt = this.genInvMass(pc, t);
        const lt = corr / wt;
        this.applyRing(pc, -t[0] * lt, -t[1] * lt, -t[2] * lt);
      }
      if (this.contacts.length < 12) this.contacts.push({ p: [p[0], p[1], p[2]], n: [n[0], n[1], n[2]], vnPre, kind, hookAttached, nu });
      return vnPre;
    }

    collideRing(h) {
      const P = this.P, r = this.ring, bd = this.board;
      const K = this.K, sw = this.sw;
      for (let k = 0; k < K; k++) this.ringPoint(k, sw[k]);
      const rad = P.Rc + P.rt;
      const st = this.state;

      // 板
      const BB = P.boardBox;
      {
        const l = mulMtV(BB.R, [r.c[0] - BB.c[0] - P.U[0] * bd.b, r.c[1] - BB.c[1] - P.U[1] * bd.b, r.c[2] - BB.c[2] - P.U[2] * bd.b], _l2);
        if (Math.abs(l[0]) < BB.h[0] + rad && Math.abs(l[2]) < BB.h[2] + rad && Math.abs(l[1]) < BB.h[1] + rad) {
          for (let k = 0; k < K; k++) {
            const c = sphereBox(sw[k], P.rt, BB, bd.b, P.U);
            if (c) {
              const vn = this.resolveRing(sw[k], c.n, c.d, 'board', false, P.mu);
              this.peak.board = Math.max(this.peak.board, -vn);
              if (this.play && !this.play.landing && (st === 'descend' || st === 'bottom' || st === 'ascend')) this.recordLanding();
              for (let j = 0; j < K; j++) this.ringPoint(j, sw[j]);
            }
          }
        }
      }

      // フック
      if (!bd.off) {
        for (const hk of P.hooks) {
          const lift = bd.b;
          if (r.c[0] + rad < hk.lo[0] - 0.003 || r.c[0] - rad > hk.hi[0] + 0.003) continue;
          if (r.c[2] + rad < hk.lo[2] - 0.003 || r.c[2] - rad > hk.hi[2] + 0.003) continue;
          if (r.c[1] + rad < hk.lo[1] + lift - 0.003 || r.c[1] - rad > hk.hi[1] + lift + 0.003) continue;
          // 土台と軸受け
          for (const bx of hk.boxes) {
            for (let k = 0; k < K; k++) {
              const c = sphereBox(sw[k], P.rt, bx, lift, P.U);
              if (c) { this.resolveRing(sw[k], c.n, c.d, 'base', true, P.muHook); for (let j = 0; j < K; j++) this.ringPoint(j, sw[j]); }
            }
          }
          for (const cp of hk.caps) {
            const a = _a, b = _b;
            a[0] = cp.a[0] + P.U[0] * lift; a[1] = cp.a[1] + P.U[1] * lift; a[2] = cp.a[2] + P.U[2] * lift;
            b[0] = cp.b[0] + P.U[0] * lift; b[1] = cp.b[1] + P.U[1] * lift; b[2] = cp.b[2] + P.U[2] * lift;
            for (let k = 0; k < K; k++) {
              const s = segSeg(sw[k], sw[(k + 1) % K], a, b);
              this.ringVsCapsule(s, P.rt + cp.r, 'base', h);
            }
          }
          // 針金
          const rr = P.rt + hk.rw;
          for (let k = 0; k < K; k++) {
            const p1 = sw[k], q1 = sw[(k + 1) % K];
            for (let m = 0; m < hk.wire.length; m++) {
              const seg = hk.wire[m];
              const a = _a, b = _b;
              a[0] = seg[0][0] + P.U[0] * lift; a[1] = seg[0][1] + P.U[1] * lift; a[2] = seg[0][2] + P.U[2] * lift;
              b[0] = seg[1][0] + P.U[0] * lift; b[1] = seg[1][1] + P.U[1] * lift; b[2] = seg[1][2] + P.U[2] * lift;
              const s = segSeg(p1, q1, a, b);
              const hit = this.ringVsCapsule(s, rr, 'wire', h);
              if (hit) {
                for (let j = 0; j < K; j++) this.ringPoint(j, sw[j]);
                if (this.play) {
                  this.play.hookTouch = true;
                  // てっぺん：輪の上側に、上から当たった
                  if (hk.loop && st === 'descend') {
                    const yl = s.c2[1] - lift - hk.loop.c[1];
                    if (yl > hk.loop.Rh * 0.45 && hit.vn < -0.02) this.play.topHit = true;
                  }
                  if (!hk.loop && st === 'descend' && hit.vn < -0.02 && m >= 1) this.play.topHit = true;
                }
              }
            }
          }
        }
      }

      // 壁
      const I = WORLD.interior;
      for (let k = 0; k < K; k += 3) {
        const p = sw[k];
        let n = null, d = 0;
        if (p[0] - P.rt < I.x0) { n = [1, 0, 0]; d = I.x0 - (p[0] - P.rt); }
        else if (p[0] + P.rt > I.x1) { n = [-1, 0, 0]; d = p[0] + P.rt - I.x1; }
        else if (p[2] - P.rt < I.z0) { n = [0, 0, 1]; d = I.z0 - (p[2] - P.rt); }
        else if (p[2] + P.rt > I.z1) { n = [0, 0, -1]; d = p[2] + P.rt - I.z1; }
        else if (p[1] - P.rt < WORLD.deckY) { n = [0, 1, 0]; d = WORLD.deckY - (p[1] - P.rt); }
        if (n) { this.resolveRing(p, n, d, 'wall', false, P.mu); for (let j = 0; j < K; j++) this.ringPoint(j, sw[j]); }
      }
    }

    ringVsCapsule(s, rr, kind, h) {
      const dx = s.c1[0] - s.c2[0], dy = s.c1[1] - s.c2[1], dz = s.c1[2] - s.c2[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) return null;
      const d = Math.sqrt(d2);
      const n = _n2;
      if (d > EPS) { n[0] = dx / d; n[1] = dy / d; n[2] = dz / d; }
      else { n[0] = 0; n[1] = 1; n[2] = 0; }
      const p = _hp; p[0] = s.c1[0]; p[1] = s.c1[1]; p[2] = s.c1[2];
      const vn = this.resolveRing(p, n, rr - d, kind, true, this.P.muHook);
      if (kind === 'wire') this.peak.hook = Math.max(this.peak.hook, -vn);
      _hit.vn = vn; return _hit;
    }

    collideChain() {
      const P = this.P, bd = this.board, x = this.x, w = this.w, np = this.np;
      const BB = P.boardBox, rc = P.chainR;
      for (let i = 1; i < np; i++) {
        if (w[i] === 0) continue;
        const p = x[i];
        // 板
        const c = sphereBox(p, rc, BB, bd.b, P.U);
        if (c) { this.pushParticle(i, c.n, c.d, false, P.mu); }
        if (bd.off) continue;
        for (const hk of P.hooks) {
          const lift = bd.b;
          if (p[0] < hk.lo[0] - 0.005 || p[0] > hk.hi[0] + 0.005 || p[2] < hk.lo[2] - 0.005 || p[2] > hk.hi[2] + 0.005) continue;
          if (p[1] < hk.lo[1] + lift - 0.005 || p[1] > hk.hi[1] + lift + 0.005) continue;
          for (const bx of hk.boxes) { const cb = sphereBox(p, rc, bx, lift, P.U); if (cb) this.pushParticle(i, cb.n, cb.d, true, P.muHook); }
          const rr = rc + hk.rw;
          for (const seg of hk.wire) {
            const a = _a, b = _b;
            a[0] = seg[0][0] + P.U[0] * lift; a[1] = seg[0][1] + P.U[1] * lift; a[2] = seg[0][2] + P.U[2] * lift;
            b[0] = seg[1][0] + P.U[0] * lift; b[1] = seg[1][1] + P.U[1] * lift; b[2] = seg[1][2] + P.U[2] * lift;
            const q = pointSeg(p, a, b);
            const dx = p[0] - q.c[0], dy = p[1] - q.c[1], dz = p[2] - q.c[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < rr * rr) {
              const d = Math.sqrt(d2), n = _n3;
              if (d > EPS) { n[0] = dx / d; n[1] = dy / d; n[2] = dz / d; } else { n[0] = 0; n[1] = 1; n[2] = 0; }
              this.pushParticle(i, n, rr - d, true, P.muHook);
              this.peak.chain = Math.max(this.peak.chain, 0.05);
            }
          }
        }
        // 壁
        const I = WORLD.interior;
        if (p[0] < I.x0) p[0] = I.x0; if (p[0] > I.x1) p[0] = I.x1;
        if (p[2] < I.z0) p[2] = I.z0; if (p[2] > I.z1) p[2] = I.z1;
        if (p[1] < WORLD.deckY) p[1] = WORLD.deckY;
      }
    }

    pushParticle(i, n, d, hookAttached, mu) {
      const P = this.P, bd = this.board, p = this.x[i], pp = this.xp[i], wi = this.w[i];
      let wb = 0, nu = 0;
      if (hookAttached) {
        nu = n[0] * P.U[0] + n[1] * P.U[1] + n[2] * P.U[2];
        if (Math.abs(nu) > 1e-6 && this.boardFree(-nu)) wb = nu * nu / P.Mb;
      }
      const lam = d / (wi + wb);
      p[0] += n[0] * lam * wi; p[1] += n[1] * lam * wi; p[2] += n[2] * lam * wi;
      if (wb > 0) bd.b -= lam * nu / P.Mb;
      // 摩擦
      const surf = bd.b - bd.bp;
      let dx = p[0] - pp[0] - P.U[0] * surf, dy = p[1] - pp[1] - P.U[1] * surf, dz = p[2] - pp[2] - P.U[2] * surf;
      const dn = dx * n[0] + dy * n[1] + dz * n[2];
      dx -= n[0] * dn; dy -= n[1] * dn; dz -= n[2] * dn;
      const dt = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dt > EPS) {
        const corr = dt < mu.s * d ? 1 : Math.min(1, mu.k * d / dt);
        p[0] -= dx * corr; p[1] -= dy * corr; p[2] -= dz * corr;
      }
    }

    // はね返り：金属どうしは少しはねる
    restitution(vbs) {
      const r = this.ring, P = this.P;
      for (const c of this.contacts) {
        if (c.vnPre > -0.05) continue;
        const e = c.kind === 'wire' ? 0.35 : c.kind === 'base' ? 0.25 : 0.12;
        const rx = c.p[0] - r.c[0], ry = c.p[1] - r.c[1], rz = c.p[2] - r.c[2];
        const vpx = r.v[0] + r.w[1] * rz - r.w[2] * ry, vpy = r.v[1] + r.w[2] * rx - r.w[0] * rz, vpz = r.v[2] + r.w[0] * ry - r.w[1] * rx;
        const vn = vpx * c.n[0] + vpy * c.n[1] + vpz * c.n[2] - (c.hookAttached ? this.board.vb * c.nu : 0);
        const target = -e * c.vnPre;
        const dv = target - vn;
        if (dv <= 0) continue;
        const wr = this.genInvMass(c.p, c.n);
        const j = dv / wr;
        r.v[0] += c.n[0] * j / P.M; r.v[1] += c.n[1] * j / P.M; r.v[2] += c.n[2] * j / P.M;
        const cx = ry * c.n[2] - rz * c.n[1], cy = rz * c.n[0] - rx * c.n[2], cz = rx * c.n[1] - ry * c.n[0];
        const t = this.invInertiaW(cx * j, cy * j, cz * j, _gi);
        r.w[0] += t[0]; r.w[1] += t[1]; r.w[2] += t[2];
        c.vnPre = 0;
      }
    }

    // 着地：フックから見てどちらに落ちたか
    recordLanding() {
      const P = this.P, r = this.ring;
      let best = null, bd = 1e9;
      for (const hk of P.hooks) {
        const dx = r.c[0] - hk.origin[0], dz = r.c[2] - hk.origin[2];
        const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = hk; }
      }
      const rel = mulMtV(best.R, [r.c[0] - best.origin[0], r.c[1] - best.origin[1], r.c[2] - best.origin[2]], [0, 0, 0]);
      this.play.landing = { open: -rel[0], side: rel[2], t: this.time };
    }

    // 画面の描画用
    snapshot() {
      return {
        head: [this.head[0] + this.drift[0], this.head[1], this.head[2] + this.drift[1]],
        chain: this.x.map((p) => p.slice()),
        ring: { c: this.ring.c.slice(), q: this.ring.q.slice() },
        board: this.board.b, state: this.state, credits: this.credits,
      };
    }
  }

  const _gi = [0, 0, 0], _cp = [0, 0, 0], _n = [0, 0, 0], _n2 = [0, 0, 0], _n3 = [0, 0, 0], _t = [0, 0, 0];
  const _rl = [0, 0, 0], _pc = [0, 0, 0], _pp = [0, 0, 0], _l2 = [0, 0, 0], _a = [0, 0, 0], _b = [0, 0, 0], _hp = [0, 0, 0];
  const _hit = { vn: 0 };

  const api = { HookMachine, WORLD, OPTIONS, DEFAULT_SETUP, hookLocal, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.HookPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
