'use strict';
const T = 64; // world pixels per tile

const Terrain = (() => {
  const NM = 7;
  const HM = [0.02, 0.05, -0.03, 0.42, 0.85, -0.4, 0.0];

  function frame() { return new Promise(r => requestAnimationFrame(() => r())); }

  async function bake(ch, progress) {
    const map = ch.map, rows = map.length, cols = map[0].length;
    const W = cols * T, H = rows * T;
    const nz = makeNoise(ch.seed);
    const mat = new Int8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) mat[y * cols + x] = TERRAIN[map[y][x]].mat;
    const matAt = (x, y) => mat[(y < 0 ? 0 : y >= rows ? rows - 1 : y) * cols + (x < 0 ? 0 : x >= cols ? cols - 1 : x)];

    const hgt = new Float32Array(W * H);
    const col = new Float32Array(W * H * 3);
    const wat = new Float32Array(W * H);
    const w = new Float32Array(NM);
    let maxH = 0;

    // ---- pass 1: material blend, colour, height ----
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const wx = nz.fbm(px * 0.016, py * 0.016, 3) - 0.5;
        const wy = nz.fbm(px * 0.016 + 57.3, py * 0.016 + 21.1, 3) - 0.5;
        const fu = px / T - 0.5 + wx * 0.6, fv = py / T - 0.5 + wy * 0.6;
        const i0 = Math.floor(fu), j0 = Math.floor(fv), tx = fu - i0, ty = fv - j0;
        w.fill(0);
        w[matAt(i0, j0)] += (1 - tx) * (1 - ty); w[matAt(i0 + 1, j0)] += tx * (1 - ty);
        w[matAt(i0, j0 + 1)] += (1 - tx) * ty; w[matAt(i0 + 1, j0 + 1)] += tx * ty;
        let sum = 0;
        for (let m = 0; m < NM; m++) { const v = w[m]; w[m] = v * v * v; sum += w[m]; }
        for (let m = 0; m < NM; m++) w[m] /= sum;

        const nLow = nz.fbm(px * 0.006 + 100, py * 0.006 + 100, 3);
        const nMid = nz.n2(px * 0.05, py * 0.05);
        const fine = nz.hash(px, py) - 0.5;
        let r = 0, g = 0, b = 0, h = 0;

        if (w[0] > .003) { // grass
          const t = clamp(0.2 + nLow * 0.6 + (nMid - 0.5) * 0.45, 0, 1);
          let cr = lerp(50, 112, t), cg = lerp(84, 150, t), cb = lerp(30, 58, t);
          const bl = nz.n2(px * 0.45, py * 0.16);
          const k = bl > 0.62 ? 1.12 : bl < 0.3 ? 0.88 : 1;
          const dry = smoothstep(0.6, 0.78, nz.fbm(px * 0.01 + 300, py * 0.01, 2));
          cr = lerp(cr, 156, dry * 0.55); cg = lerp(cg, 146, dry * 0.4); cb = lerp(cb, 76, dry * 0.5);
          const f = k * (1 + fine * 0.14);
          r += w[0] * cr * f; g += w[0] * cg * f; b += w[0] * cb * f; h += w[0] * (HM[0] + nMid * 0.03);
        }
        if (w[1] > .003) { // forest floor
          const t = clamp(0.3 + (nMid - 0.5) * 0.8 + (nLow - 0.5) * 0.5, 0, 1);
          let cr = lerp(30, 64, t), cg = lerp(52, 86, t), cb = lerp(26, 38, t);
          const lit = smoothstep(0.62, 0.7, nz.n2(px * 0.22, py * 0.22));
          cr = lerp(cr, 96, lit * .6); cg = lerp(cg, 74, lit * .6); cb = lerp(cb, 40, lit * .6);
          const f = 1 + fine * 0.18;
          r += w[1] * cr * f; g += w[1] * cg * f; b += w[1] * cb * f; h += w[1] * (HM[1] + nMid * 0.05);
        }
        if (w[2] > .003) { // dirt
          const t = clamp(0.35 + (nMid - 0.5) * 0.7 + (nLow - 0.5) * 0.6, 0, 1);
          let cr = lerp(112, 168, t), cg = lerp(86, 136, t), cb = lerp(56, 94, t);
          let f = 1 + fine * 0.16;
          const hh = nz.hash(px >> 1, py >> 1);
          if (hh > 0.985) f *= 1.25; else if (hh < 0.012) f *= 0.8;
          r += w[2] * cr * f; g += w[2] * cg * f; b += w[2] * cb * f; h += w[2] * (HM[2] + nMid * 0.02);
        }
        if (w[3] > .003 || w[4] > .003) { // rock & peak
          const rid = nz.ridge(px * 0.02, py * 0.02, 4);
          const t = clamp(nLow * 0.8 + (nMid - 0.5) * 0.4, 0, 1);
          const crack = 0.62 + 0.5 * rid;
          const moss = smoothstep(0.55, 0.7, nz.fbm(px * 0.03 + 50, py * 0.03, 3));
          let cr = lerp(104, 150, t) * crack, cg = lerp(96, 140, t) * crack, cb = lerp(86, 126, t) * crack;
          const f = 1 + fine * 0.12;
          if (w[3] > .003) {
            const mr = lerp(cr, 82, moss * 0.6), mg = lerp(cg, 104, moss * 0.6), mb = lerp(cb, 52, moss * 0.6);
            r += w[3] * mr * f; g += w[3] * mg * f; b += w[3] * mb * f;
            h += w[3] * (HM[3] + rid * 0.38 + nMid * 0.1);
          }
          if (w[4] > .003) {
            r += w[4] * cr * 1.05 * f; g += w[4] * cg * 1.05 * f; b += w[4] * cb * 1.08 * f;
            h += w[4] * (HM[4] + rid * 0.6 + nMid * 0.12);
          }
        }
        if (w[5] > .003) { // water bed
          const d = smoothstep(0.25, 1, w[5]);
          const cr = lerp(96, 22, d), cg = lerp(122, 64, d), cb = lerp(98, 82, d);
          const f = 1 + (nMid - 0.5) * 0.18;
          r += w[5] * cr * f; g += w[5] * cg * f; b += w[5] * cb * f; h += w[5] * HM[5];
        }
        if (w[6] > .003) { // castle ground
          const t = clamp(nLow * 0.6 + nMid * 0.4, 0, 1);
          r += w[6] * lerp(78, 108, t); g += w[6] * lerp(74, 100, t); b += w[6] * lerp(70, 92, t);
        }
        // wet sand on banks
        const ww = w[5];
        if (ww > 0.08 && ww < 0.75) {
          const s = (1 - Math.abs(ww - 0.38) / 0.32) * 0.75;
          if (s > 0) { r = lerp(r, 150, s); g = lerp(g, 132, s); b = lerp(b, 96, s); }
        }
        // snow caps
        if (w[4] > 0.3) {
          const sn = smoothstep(1.0, 1.2, h + (nMid - 0.5) * 0.2) * 0.92;
          r = lerp(r, 236, sn); g = lerp(g, 240, sn); b = lerp(b, 248, sn);
        }
        const i = py * W + px;
        hgt[i] = h; wat[i] = ww;
        if (h > maxH) maxH = h;
        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      }
      if ((py & 31) === 31) { progress && progress(0.1 + 0.55 * py / H); await frame(); }
    }

    // ---- pass 2: lighting + cast shadows ----
    const cv = makeCanvas(W, H), cx = cv.getContext('2d');
    const img = cx.createImageData(W, H), data = img.data;
    let Lx = -0.55, Ly = -0.72, Lz = 0.62;
    const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln;
    const lxy = Math.hypot(Lx, Ly), dxn = Lx / lxy, dyn = Ly / lxy, slope = Lz / lxy;
    const HS = 44;
    const maxHS = maxH * HS;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = py * W + px;
        const hl = hgt[px > 0 ? i - 1 : i], hr = hgt[px < W - 1 ? i + 1 : i];
        const hu = hgt[py > 0 ? i - W : i], hd = hgt[py < H - 1 ? i + W : i];
        const dx = (hr - hl) * HS * 0.5, dy = (hd - hu) * HS * 0.5;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const dot = (-dx * Lx - dy * Ly + Lz) * inv;
        let lit = clamp(1 + (dot - Lz) * 1.7, 0.42, 1.5);
        const ww = wat[i];
        lit = lerp(lit, 1, smoothstep(0.4, 0.8, ww));
        const h0 = hgt[i] * HS;
        let sh = 0;
        if (maxHS - h0 > 3) {
          for (let k = 1; k <= 22; k++) {
            const d = k * 3;
            const sx = (px + dxn * d) | 0, sy = (py + dyn * d) | 0;
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) break;
            const rayH = h0 + d * slope;
            if (rayH > maxHS) break;
            const diff = hgt[sy * W + sx] * HS - rayH;
            if (diff > 0) { sh = Math.max(sh, clamp(diff / 5, 0, 1)); if (sh >= 1) break; }
          }
        }
        const o = i * 4;
        data[o] = col[i * 3] * lit * (1 - 0.5 * sh);
        data[o + 1] = col[i * 3 + 1] * lit * (1 - 0.44 * sh);
        data[o + 2] = col[i * 3 + 2] * lit * (1 - 0.3 * sh);
        data[o + 3] = 255;
      }
      if ((py & 63) === 63) { progress && progress(0.65 + 0.2 * py / H); await frame(); }
    }
    cx.putImageData(img, 0, 0);

    // water mask (half res)
    const mw = W >> 1, mh = H >> 1;
    const mask = makeCanvas(mw, mh), mcx = mask.getContext('2d');
    const mimg = mcx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const a = smoothstep(0.42, 0.72, wat[(y * 2) * W + x * 2]);
      const o = (y * mw + x) * 4;
      mimg.data[o] = mimg.data[o + 1] = mimg.data[o + 2] = 255; mimg.data[o + 3] = a * 255;
    }
    mcx.putImageData(mimg, 0, 0);

    progress && progress(0.88); await frame();
    const out = { canvas: cv, mask, W, H, cols, rows, smokes: [], flags: [], torches: [], nz };
    drawObjects(cx, mcx, ch, out);
    progress && progress(1);
    return out;
  }

  // ======================= object pass =======================
  function drawObjects(ctx, mcx, ch, out) {
    const map = ch.map, rows = map.length, cols = map[0].length;
    const at = (x, y) => (y < 0 || y >= rows || x < 0 || x >= cols) ? null : map[y][x];
    const objs = [];
    const noisePat = makeNoisePattern(out.nz);

    // flat stuff first
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = map[y][x], x0 = x * T, y0 = y * T;
      const rnd = mulberry32(ch.seed * 31 + x * 7919 + y * 104729);
      if (c === '.' || c === 'h') groundDetail(ctx, x0, y0, rnd, c === 'h' ? 3 : 9);
      if (c === 'f') groundDetail(ctx, x0, y0, rnd, 4, true);
      if (c === 'r') roadDetail(ctx, x0, y0, rnd);
      if ('CkTDP'.includes(c)) drawFloor(ctx, x0, y0, rnd, c === 'D', noisePat);
      if (c === 'k' || c === 'T') drawCarpet(ctx, x0, y0, at(x, y - 1) === 'k' || at(x, y - 1) === 'T', at(x, y + 1) === 'k' || at(x, y + 1) === 'T');
      if (c === '=') drawBridge(ctx, mcx, x0, y0, at(x - 1, y) !== '=' && at(x - 1, y) !== '~', at(x + 1, y) !== '=' && at(x + 1, y) !== '~');
    }
    // castle ground AO along walls
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (map[y][x] === 'W' && at(x, y + 1) && at(x, y + 1) !== 'W') {
        const g = ctx.createLinearGradient(0, (y + 1) * T, 0, (y + 1) * T + 16);
        g.addColorStop(0, 'rgba(10,8,12,0.55)'); g.addColorStop(1, 'rgba(10,8,12,0)');
        ctx.fillStyle = g; ctx.fillRect(x * T, (y + 1) * T, T, 16);
      }
    }

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = map[y][x], x0 = x * T, y0 = y * T;
      const rnd = mulberry32(ch.seed * 17 + x * 6271 + y * 3571);
      if (c === 'f') {
        const n = 4 + (rnd() * 3 | 0);
        for (let i = 0; i < n; i++) {
          const bx = x0 + T * (0.16 + rnd() * 0.68), by = y0 + T * (0.38 + rnd() * 0.58);
          const s = T * (0.24 + rnd() * 0.1);
          const conifer = rnd() < 0.38;
          const seed = rnd() * 1e6 | 0;
          objs.push({ k: by, d: () => conifer ? drawConifer(ctx, bx, by, s, mulberry32(seed)) : drawTree(ctx, bx, by, s, mulberry32(seed)) });
        }
      } else if (c === 'm') {
        const n = 1 + (rnd() * 3 | 0);
        for (let i = 0; i < n; i++) {
          const bx = x0 + T * (0.15 + rnd() * 0.7), by = y0 + T * (0.3 + rnd() * 0.65), s = T * (0.08 + rnd() * 0.1);
          const seed = rnd() * 1e6 | 0, bush = rnd() < 0.5;
          objs.push({ k: by, d: () => bush ? drawBush(ctx, bx, by, s, mulberry32(seed)) : drawRock(ctx, bx, by, s, mulberry32(seed)) });
        }
      } else if (c === '.' && rnd() < 0.18) {
        const bx = x0 + T * (0.2 + rnd() * 0.6), by = y0 + T * (0.3 + rnd() * 0.6), s = T * (0.06 + rnd() * 0.06);
        const seed = rnd() * 1e6 | 0, bush = rnd() < 0.6;
        objs.push({ k: by, d: () => bush ? drawBush(ctx, bx, by, s, mulberry32(seed)) : drawRock(ctx, bx, by, s, mulberry32(seed)) });
      } else if (c === 'h') {
        const roof = ['#9b3b2a', '#3f5f8c', '#7a4a2a'][(x + y) % 3];
        objs.push({ k: y0 + T * 0.88, d: () => drawHouse(ctx, x0, y0, roof, rnd) });
        out.smokes.push({ x: x0 + T * 0.72, y: y0 + T * 0.02, key: x + ',' + y });
      } else if (c === 'F') {
        objs.push({ k: y0 + T * 0.95, d: () => drawFort(ctx, x0, y0) });
        out.flags.push({ x: x0 + T * 0.83, y: y0 - T * 0.22 });
      } else if (c === 'W') {
        const below = at(x, y + 1), front = below && below !== 'W';
        objs.push({ k: y0 + T - 0.1, d: () => drawWall(ctx, x0, y0, front, at(x - 1, y) !== 'W', at(x + 1, y) !== 'W', at(x, y - 1) !== 'W' && at(x, y - 1) !== null, rnd, noisePat) });
      } else if (c === 'P') {
        objs.push({ k: y0 + T * 0.9, d: () => drawPillar(ctx, x0, y0) });
      } else if (c === 'T') {
        objs.push({ k: y0 + T * 0.9, d: () => drawThrone(ctx, x0, y0) });
      } else if (c === 'B') {
        objs.push({ k: y0 + T * 0.5, d: () => drawRubble(ctx, x0, y0, rnd) });
      }
    }
    for (const [lx, ly] of ch.lights) {
      const x0 = lx * T, y0 = ly * T;
      objs.push({ k: y0 + T * 0.8, d: () => drawBrazier(ctx, x0 + T / 2, y0 + T * 0.8) });
      out.torches.push({ x: x0 + T / 2, y: y0 + T * 0.8 - 26 });
    }
    objs.sort((a, b) => a.k - b.k);
    for (const o of objs) o.d();
  }

  function makeNoisePattern(nz) {
    const s = 128, c = makeCanvas(s, s), x = c.getContext('2d'), im = x.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const v = nz.seamless(i, j, s, (a, b) => nz.fbm(a * 0.08 + 9, b * 0.08 + 9, 4));
      const f = nz.hash(i + 999, j) * 0.25;
      const g = clamp((v * 0.8 + f) * 255 + 40, 0, 255);
      const o = (j * s + i) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = g; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  // ---------- ground details ----------
  function groundDetail(ctx, x0, y0, rnd, n, forest) {
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * T, y = y0 + rnd() * T, s = 3 + rnd() * 4;
      const blades = 4 + (rnd() * 4 | 0);
      for (let k = 0; k < blades; k++) {
        const a = -Math.PI / 2 + (k - blades / 2) * 0.28 + (rnd() - .5) * 0.3;
        const len = s * (0.7 + rnd() * 0.6);
        ctx.strokeStyle = rnd() < 0.5 ? (forest ? 'rgba(30,52,24,0.85)' : 'rgba(46,78,30,0.8)') : (forest ? 'rgba(92,124,56,0.7)' : 'rgba(150,186,86,0.75)');
        ctx.lineWidth = 0.9 + rnd() * 0.5;
        ctx.beginPath(); ctx.moveTo(x + (k - blades / 2) * 0.8, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
    }
    if (!forest) {
      const nf = rnd() < 0.45 ? (rnd() * 6 | 0) : 0;
      const fc = ['#f4f1e6', '#f2d04b', '#c98ad8', '#e8765a', '#9fc4f0'][rnd() * 5 | 0];
      for (let i = 0; i < nf; i++) {
        const x = x0 + rnd() * T, y = y0 + rnd() * T;
        ctx.fillStyle = 'rgba(30,50,20,0.35)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 0.9, 1.7, 0, TAU); ctx.fill();
        ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(x, y, 0.6, 0, TAU); ctx.fill();
      }
    } else {
      for (let i = 0; i < 4; i++) { // ferns
        const x = x0 + rnd() * T, y = y0 + rnd() * T;
        ctx.strokeStyle = 'rgba(70,110,50,0.75)'; ctx.lineWidth = 1;
        for (let k = 0; k < 5; k++) { const a = -Math.PI * (0.15 + k * 0.17); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 3, x + Math.cos(a) * 7, y + Math.sin(a) * 4 + 2); ctx.stroke(); }
      }
    }
  }
  function roadDetail(ctx, x0, y0, rnd) {
    for (let i = 0; i < 7; i++) {
      const x = x0 + rnd() * T, y = y0 + rnd() * T, r = 0.8 + rnd() * 1.6;
      ctx.fillStyle = 'rgba(40,28,16,0.35)'; ctx.beginPath(); ctx.ellipse(x + .7, y + .8, r, r * .75, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${190 + rnd() * 40 | 0},${170 + rnd() * 30 | 0},${140 + rnd() * 30 | 0},0.85)`; ctx.beginPath(); ctx.ellipse(x, y, r, r * .75, 0, 0, TAU); ctx.fill();
    }
  }

  // ---------- vegetation ----------
  const LEAF = [
    ['#a8cf62', '#5a9234', '#23461c'],
    ['#b9cf5a', '#6f9530', '#2f4a18'],
    ['#8fc06a', '#3f7d36', '#1a3a1e'],
  ];
  function drawTree(ctx, bx, by, s, rnd) {
    const pal = LEAF[rnd() * 3 | 0];
    // ground shadow
    ctx.save();
    const sx = bx + s * 0.75, sy = by - s * 0.05;
    const g0 = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 1.25);
    g0.addColorStop(0, 'rgba(6,18,8,0.5)'); g0.addColorStop(1, 'rgba(6,18,8,0)');
    ctx.fillStyle = g0; ctx.beginPath(); ctx.ellipse(sx, sy, s * 1.3, s * 0.62, -0.45, 0, TAU); ctx.fill();
    ctx.restore();
    // trunk
    const tg = ctx.createLinearGradient(bx - s * .1, 0, bx + s * .1, 0);
    tg.addColorStop(0, '#8a6a46'); tg.addColorStop(1, '#3d2a1a');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.moveTo(bx - s * 0.12, by); ctx.lineTo(bx - s * 0.07, by - s * 0.75); ctx.lineTo(bx + s * 0.07, by - s * 0.75); ctx.lineTo(bx + s * 0.13, by); ctx.closePath(); ctx.fill();
    const cx = bx, cy = by - s * 1.05, R = s * 0.8;
    const blobs = [];
    const n = 7 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = rnd() * R * 0.5;
      blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, R * (0.42 + rnd() * 0.22)]);
    }
    blobs.sort((a, b) => a[1] - b[1]);
    ctx.fillStyle = pal[2];
    for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x + r * 0.12, y + r * 0.18, r * 1.05, 0, TAU); ctx.fill(); }
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x - r * .4, y - r * .45, r * 0.1, x, y, r * 1.05);
      g.addColorStop(0, pal[0]); g.addColorStop(0.5, pal[1]); g.addColorStop(1, pal[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    // leaf speckles
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.95;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
      const lightSide = (Math.cos(a) + Math.sin(a)) < 0;
      ctx.fillStyle = lightSide ? 'rgba(220,240,150,0.45)' : 'rgba(10,30,10,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.3, 0.9, a, 0, TAU); ctx.fill();
    }
  }
  function drawConifer(ctx, bx, by, s, rnd) {
    ctx.save();
    const sx = bx + s * 0.7, sy = by - s * 0.05;
    const g0 = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 1.3);
    g0.addColorStop(0, 'rgba(6,18,8,0.5)'); g0.addColorStop(1, 'rgba(6,18,8,0)');
    ctx.fillStyle = g0; ctx.beginPath(); ctx.ellipse(sx, sy, s * 1.4, s * 0.55, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#4a321e'; ctx.fillRect(bx - s * 0.07, by - s * 0.4, s * 0.14, s * 0.4);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const wdt = s * (0.78 - i * 0.16), ybot = by - s * (0.28 + i * 0.4), ytop = ybot - s * 0.75;
      const g = ctx.createLinearGradient(bx - wdt, 0, bx + wdt, 0);
      g.addColorStop(0, '#6aa451'); g.addColorStop(0.45, '#2f6236'); g.addColorStop(1, '#122a1a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(bx, ytop);
      const teeth = 5;
      ctx.lineTo(bx + wdt, ybot);
      for (let k = teeth; k >= 0; k--) {
        const px = bx - wdt + (2 * wdt) * (k / teeth);
        ctx.lineTo(px, ybot + (k % 2 ? 2.5 : -0.5) + rnd());
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(170,220,130,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx - 1, ytop + 2); ctx.lineTo(bx - wdt + 2, ybot - 1); ctx.stroke();
    }
  }
  function drawBush(ctx, bx, by, s, rnd) {
    ctx.fillStyle = 'rgba(10,25,10,0.35)'; ctx.beginPath(); ctx.ellipse(bx + s * .5, by + 1, s * 1.3, s * .5, 0, 0, TAU); ctx.fill();
    const pal = LEAF[rnd() * 3 | 0];
    for (let i = 0; i < 4; i++) {
      const x = bx + (rnd() - .5) * s * 1.2, y = by - s * 0.5 + (rnd() - .5) * s * 0.5, r = s * (0.5 + rnd() * 0.35);
      const g = ctx.createRadialGradient(x - r * .4, y - r * .4, 0, x, y, r);
      g.addColorStop(0, pal[0]); g.addColorStop(.6, pal[1]); g.addColorStop(1, pal[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  function drawRock(ctx, bx, by, s, rnd) {
    ctx.fillStyle = 'rgba(15,15,20,0.4)'; ctx.beginPath(); ctx.ellipse(bx + s * .5, by + s * .15, s * 1.2, s * .5, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(bx - s, by - s, bx + s, by + s * .4);
    g.addColorStop(0, '#c9c3b6'); g.addColorStop(0.5, '#8d877c'); g.addColorStop(1, '#4b4741');
    ctx.fillStyle = g; ctx.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI; const r = s * (0.8 + rnd() * 0.35); ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.85); }
    ctx.closePath(); ctx.fill();
  }

  // ---------- buildings ----------
  function drawHouse(ctx, x0, y0, roof, rnd) {
    const wL = x0 + T * 0.15, wR = x0 + T * 0.85, eave = y0 + T * 0.46, ground = y0 + T * 0.88, ridge = y0 + T * 0.1;
    // yard fence
    ctx.strokeStyle = '#5a4128'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + 2, ground + 3); ctx.lineTo(x0 + T * 0.12, ground + 3); ctx.moveTo(x0 + T * 0.88, ground + 3); ctx.lineTo(x0 + T - 2, ground + 3); ctx.stroke();
    for (const fx of [x0 + 3, x0 + T * 0.1, x0 + T * 0.9, x0 + T - 3]) { ctx.fillStyle = '#6a4c2e'; ctx.fillRect(fx - 1, ground - 2, 2, 7); }
    // silhouette with soft cast shadow
    ctx.save();
    ctx.shadowColor = 'rgba(8,12,6,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 9; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.moveTo(wL, ground); ctx.lineTo(wR, ground); ctx.lineTo(wR + T * .06, eave); ctx.lineTo(wR, ridge); ctx.lineTo(wL, ridge); ctx.lineTo(wL - T * .06, eave); ctx.closePath(); ctx.fill();
    ctx.restore();
    // walls
    const wg = ctx.createLinearGradient(0, eave, 0, ground);
    wg.addColorStop(0, '#cdbd9c'); wg.addColorStop(1, '#efe3c6');
    ctx.fillStyle = wg; ctx.fillRect(wL, eave, wR - wL, ground - eave);
    ctx.fillStyle = '#7d756a'; ctx.fillRect(wL, ground - 4, wR - wL, 4);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#948b7e' : '#6c645a'; ctx.fillRect(wL + i * (wR - wL) / 9, ground - 4, (wR - wL) / 9 - 0.6, 3.4); }
    ctx.fillStyle = '#4e3520';
    ctx.fillRect(wL, eave, 2.5, ground - eave - 4); ctx.fillRect(wR - 2.5, eave, 2.5, ground - eave - 4); ctx.fillRect((wL + wR) / 2 - 1.2, eave, 2.4, ground - eave - 4);
    ctx.fillRect(wL, eave + (ground - eave) * 0.42, wR - wL, 2);
    ctx.strokeStyle = '#4e3520'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(wL + 2, eave + 2); ctx.lineTo(wL + 10, eave + (ground - eave) * 0.42); ctx.moveTo(wR - 2, eave + 2); ctx.lineTo(wR - 10, eave + (ground - eave) * 0.42); ctx.stroke();
    // door
    const dx = (wL + wR) / 2 + 3, dw = T * 0.15, dh = T * 0.22;
    ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.moveTo(dx, ground - 4); ctx.lineTo(dx, ground - dh); ctx.arc(dx + dw / 2, ground - dh, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw, ground - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4526'; ctx.fillRect(dx + 1.2, ground - dh, dw - 2.4, dh - 4);
    ctx.strokeStyle = 'rgba(30,18,8,0.7)'; ctx.lineWidth = 0.8;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(dx + i * dw / 3, ground - dh); ctx.lineTo(dx + i * dw / 3, ground - 4); ctx.stroke(); }
    ctx.fillStyle = '#d8b25a'; ctx.beginPath(); ctx.arc(dx + dw - 3, ground - dh / 2 - 2, 0.9, 0, TAU); ctx.fill();
    // windows (warm glow)
    for (const wx of [wL + T * 0.08, (wL + wR) / 2 - T * 0.16]) {
      const wy = eave + 4.5, ww = T * 0.11, wh = T * 0.1;
      ctx.fillStyle = '#3a2412'; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      const gg = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, ww);
      gg.addColorStop(0, '#ffe7a3'); gg.addColorStop(1, '#d98a2b');
      ctx.fillStyle = gg; ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = '#3a2412'; ctx.fillRect(wx + ww / 2 - .5, wy, 1, wh); ctx.fillRect(wx, wy + wh / 2 - .5, ww, 1);
    }
    // roof back sliver
    ctx.fillStyle = shade(roof, -0.55);
    ctx.beginPath(); ctx.moveTo(wL + 2, ridge); ctx.lineTo(wR - 2, ridge); ctx.lineTo(wR - 6, ridge - T * 0.05); ctx.lineTo(wL + 6, ridge - T * 0.05); ctx.closePath(); ctx.fill();
    // chimney
    const chx = wR - T * 0.2;
    ctx.fillStyle = '#6e4a3a'; ctx.fillRect(chx, ridge - T * 0.12, T * 0.09, T * 0.2);
    ctx.fillStyle = '#4a3026'; ctx.fillRect(chx + T * 0.06, ridge - T * 0.12, T * 0.03, T * 0.2);
    ctx.fillStyle = '#8a6a58'; ctx.fillRect(chx - 1, ridge - T * 0.13, T * 0.09 + 2, 2.5);
    // roof front slope
    const rg = ctx.createLinearGradient(0, ridge, 0, eave);
    rg.addColorStop(0, shade(roof, 0.28)); rg.addColorStop(0.5, roof); rg.addColorStop(1, shade(roof, -0.35));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.moveTo(wL - T * 0.07, eave + 2); ctx.lineTo(wR + T * 0.07, eave + 2); ctx.lineTo(wR + 1, ridge); ctx.lineTo(wL - 1, ridge); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    const rowsN = 7;
    for (let i = 1; i <= rowsN; i++) {
      const yy = ridge + (eave + 2 - ridge) * i / rowsN;
      ctx.strokeStyle = shade(roof, -0.5, 0.75); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(wL - 10, yy); ctx.lineTo(wR + 10, yy); ctx.stroke();
      for (let xx = wL - 8 + (i % 2) * 3.5; xx < wR + 8; xx += 7) {
        ctx.strokeStyle = shade(roof, -0.4, 0.5); ctx.beginPath(); ctx.moveTo(xx, yy - (eave - ridge) / rowsN); ctx.lineTo(xx, yy); ctx.stroke();
        ctx.fillStyle = shade(roof, 0.35, 0.25); ctx.fillRect(xx + 0.6, yy - (eave - ridge) / rowsN + 0.6, 5.5, 1);
      }
    }
    ctx.restore();
    ctx.strokeStyle = shade(roof, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wL - 1, ridge); ctx.lineTo(wR + 1, ridge); ctx.stroke();
    ctx.strokeStyle = shade(roof, -0.6); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(wL - T * 0.07, eave + 2); ctx.lineTo(wR + T * 0.07, eave + 2); ctx.stroke();
    // barrel
    const bx = wR + 3, by = ground - 2;
    const bg = ctx.createLinearGradient(bx - 4, 0, bx + 4, 0); bg.addColorStop(0, '#9a6a3a'); bg.addColorStop(1, '#4a2e16');
    ctx.fillStyle = bg; ctx.fillRect(bx - 4, by - 8, 8, 9);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(bx - 4, by - 6, 8, 1); ctx.fillRect(bx - 4, by - 1.5, 8, 1);
    ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.ellipse(bx, by - 8, 4, 1.6, 0, 0, TAU); ctx.fill();
  }

  function stoneTop(ctx, x, y, w, h, base) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(base, 0.25)); g.addColorStop(1, shade(base, -0.1));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function stoneFront(ctx, x, y, w, h, base, brick = 7) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, -0.2)); g.addColorStop(1, shade(base, -0.55));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(20,16,12,0.55)'; ctx.lineWidth = 0.8;
    let r = 0;
    for (let yy = y + brick; yy < y + h; yy += brick, r++) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    r = 0;
    for (let yy = y; yy < y + h; yy += brick, r++) for (let xx = x + (r % 2) * brick; xx < x + w; xx += brick * 2) {
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(y + h, yy + brick)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,250,235,0.25)'; ctx.fillRect(x, y, w, 1);
  }
  function drawFort(ctx, x0, y0) {
    const base = '#a49c8e', i = 3, th = 7, fh = 9;
    ctx.save();
    ctx.shadowColor = 'rgba(8,10,6,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#000'; ctx.fillRect(x0 + i, y0 + i - 4, T - 2 * i, T - 2 * i);
    ctx.restore();
    // courtyard
    ctx.fillStyle = '#8d7650'; ctx.fillRect(x0 + i + th, y0 + i + th - 4, T - 2 * (i + th), T - 2 * (i + th));
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 + i + th, y0 + i + th - 4 + fh, T - 2 * (i + th), 5);
    // back wall
    stoneTop(ctx, x0 + i, y0 + i - 4, T - 2 * i, th, base);
    stoneFront(ctx, x0 + i + th, y0 + i - 4 + th, T - 2 * (i + th), fh, base, 4.5);
    // side walls
    stoneTop(ctx, x0 + i, y0 + i - 4, th, T - 2 * i - fh, base);
    stoneTop(ctx, x0 + T - i - th, y0 + i - 4, th, T - 2 * i - fh, base);
    // front wall with gate
    const fy = y0 + T - i - th - fh - 4;
    stoneTop(ctx, x0 + i, fy, T - 2 * i, th, base);
    stoneFront(ctx, x0 + i, fy + th, T - 2 * i, fh, base, 4.5);
    ctx.fillStyle = '#1e140c'; const gx = x0 + T / 2 - 6;
    ctx.beginPath(); ctx.moveTo(gx, fy + th + fh); ctx.lineTo(gx, fy + th + 3); ctx.arc(gx + 6, fy + th + 3, 6, Math.PI, 0); ctx.lineTo(gx + 12, fy + th + fh); ctx.fill();
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 3, fy + th); ctx.lineTo(gx + k * 3, fy + th + fh); ctx.stroke(); }
    // merlons
    for (let k = 0; k < 6; k++) {
      const mx = x0 + i + 1 + k * (T - 2 * i - 4) / 5;
      ctx.fillStyle = shade(base, 0.35); ctx.fillRect(mx, fy - 3, 3.5, 3); ctx.fillStyle = shade(base, -0.35); ctx.fillRect(mx, fy, 3.5, 1.4);
      ctx.fillStyle = shade(base, 0.35); ctx.fillRect(mx, y0 + i - 7, 3.5, 3);
    }
    // corner tower
    const tx = x0 + i + 6, ty = y0 + i + 2;
    const tg = ctx.createLinearGradient(tx - 7, 0, tx + 7, 0); tg.addColorStop(0, shade(base, 0.3)); tg.addColorStop(1, shade(base, -0.45));
    ctx.fillStyle = tg; ctx.fillRect(tx - 7, ty - 14, 14, 16);
    ctx.beginPath(); ctx.ellipse(tx, ty + 2, 7, 2.5, 0, 0, Math.PI); ctx.fill();
    const rg = ctx.createLinearGradient(tx - 9, 0, tx + 9, 0); rg.addColorStop(0, '#4f78b8'); rg.addColorStop(1, '#1b2c50');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(tx - 9, ty - 13); ctx.lineTo(tx, ty - 30); ctx.lineTo(tx + 9, ty - 13); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(tx, ty - 13, 9, 2.8, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#1a120a'; ctx.fillRect(tx - 1.2, ty - 8, 2.4, 5);
    // flag pole
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0 + T * 0.83, y0 + T * 0.32); ctx.lineTo(x0 + T * 0.83, y0 - T * 0.24); ctx.stroke();
    ctx.fillStyle = '#d8b25a'; ctx.beginPath(); ctx.arc(x0 + T * 0.83, y0 - T * 0.25, 1.6, 0, TAU); ctx.fill();
  }

  function drawBridge(ctx, mcx, x0, y0, landL, landR) {
    const top = y0 + T * 0.18, bot = y0 + T * 0.82;
    const xa = x0 - (landL ? 8 : 0), xb = x0 + T + (landR ? 8 : 0);
    // shadow onto water
    const sg = ctx.createLinearGradient(0, bot, 0, bot + 12);
    sg.addColorStop(0, 'rgba(0,10,20,0.6)'); sg.addColorStop(1, 'rgba(0,10,20,0)');
    ctx.fillStyle = sg; ctx.fillRect(xa + 6, bot, xb - xa, 12);
    // planks
    for (let x = xa; x < xb; x += 5) {
      const v = 0.85 + ((x * 13) % 7) / 30;
      ctx.fillStyle = `rgb(${142 * v | 0},${104 * v | 0},${64 * v | 0})`;
      ctx.fillRect(x, top, 4.4, bot - top);
      ctx.fillStyle = 'rgba(255,230,190,0.18)'; ctx.fillRect(x, top, 1, bot - top);
      ctx.fillStyle = 'rgba(30,20,10,0.5)'; ctx.fillRect(x + 4.4, top, 0.6, bot - top);
    }
    // side beams
    const bg = ctx.createLinearGradient(0, top - 4, 0, top + 2); bg.addColorStop(0, '#9c7a4e'); bg.addColorStop(1, '#4a3420');
    ctx.fillStyle = bg; ctx.fillRect(xa, top - 3, xb - xa, 5);
    ctx.fillStyle = '#4a3420'; ctx.fillRect(xa, bot - 2, xb - xa, 5);
    ctx.fillStyle = '#2e2014'; ctx.fillRect(xa, bot + 3, xb - xa, 3);
    // rails
    for (const ry of [top - 3, bot - 2]) {
      for (let x = x0 + 4; x < x0 + T; x += 15) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2, ry + 1, 3, 4);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x, ry - 9, 3, 10);
        ctx.fillStyle = '#a07a4a'; ctx.fillRect(x, ry - 9, 1, 10);
      }
      ctx.fillStyle = '#7a5630'; ctx.fillRect(x0, ry - 10, T, 2.5);
      ctx.fillStyle = '#b48a56'; ctx.fillRect(x0, ry - 10, T, 0.8);
    }
    mcx.save(); mcx.globalCompositeOperation = 'destination-out';
    mcx.fillRect(xa / 2, (top - 14) / 2, (xb - xa) / 2, (bot - top + 26) / 2);
    mcx.restore();
  }

  function drawFloor(ctx, x0, y0, rnd, dark, noisePat) {
    ctx.fillStyle = dark ? '#2e2a26' : '#3c3833'; ctx.fillRect(x0, y0, T, T);
    const s = T / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const sx = x0 + i * s + 1, sy = y0 + j * s + 1, sw = s - 2;
      const v = (dark ? 0.72 : 0.88) + rnd() * 0.2;
      const base = [140 * v, 134 * v, 124 * v];
      const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sw);
      g.addColorStop(0, rgbStr([base[0] * 1.1, base[1] * 1.1, base[2] * 1.1])); g.addColorStop(1, rgbStr([base[0] * 0.86, base[1] * 0.86, base[2] * 0.86]));
      ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sw);
      ctx.fillStyle = 'rgba(255,248,230,0.22)'; ctx.fillRect(sx, sy, sw, 1); ctx.fillRect(sx, sy, 1, sw);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx, sy + sw - 1, sw, 1); ctx.fillRect(sx + sw - 1, sy, 1, sw);
      if (rnd() < 0.25) {
        ctx.strokeStyle = 'rgba(30,26,22,0.55)'; ctx.lineWidth = 0.7; ctx.beginPath();
        let cx = sx + rnd() * sw, cy = sy + rnd() * sw; ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += (rnd() - .5) * 9; cy += (rnd() - .5) * 9; ctx.lineTo(clamp(cx, sx, sx + sw), clamp(cy, sy, sy + sw)); }
        ctx.stroke();
      }
    }
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.45;
    ctx.fillStyle = ctx.createPattern(noisePat, 'repeat'); ctx.fillRect(x0, y0, T, T);
    ctx.restore();
  }
  function drawCarpet(ctx, x0, y0, contUp, contDown) {
    const l = x0 + T * 0.2, r = x0 + T * 0.8, t = y0 + (contUp ? 0 : 6), b = y0 + T - (contDown ? 0 : 6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(l + 2, t + 2, r - l, b - t);
    const g = ctx.createLinearGradient(l, 0, r, 0);
    g.addColorStop(0, '#4e0c14'); g.addColorStop(0.2, '#8a1822'); g.addColorStop(0.5, '#a3202c'); g.addColorStop(0.8, '#8a1822'); g.addColorStop(1, '#4e0c14');
    ctx.fillStyle = g; ctx.fillRect(l, t, r - l, b - t);
    ctx.fillStyle = '#d4ad55'; ctx.fillRect(l + 3, t, 1.6, b - t); ctx.fillRect(r - 4.6, t, 1.6, b - t);
    ctx.fillStyle = 'rgba(240,210,130,0.5)'; ctx.fillRect(l + 6, t, 0.8, b - t); ctx.fillRect(r - 6.8, t, 0.8, b - t);
    const cx = x0 + T / 2, cy = y0 + T / 2;
    ctx.fillStyle = 'rgba(212,173,85,0.8)'; ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx - 7, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a1018'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 4, cy); ctx.closePath(); ctx.fill();
    if (!contUp) { ctx.fillStyle = '#d4ad55'; ctx.fillRect(l, t, r - l, 2); }
    if (!contDown) { ctx.fillStyle = '#d4ad55'; ctx.fillRect(l, b - 2, r - l, 2); for (let x = l + 1; x < r; x += 3) ctx.fillRect(x, b, 1, 3); }
  }
  function drawWall(ctx, x0, y0, front, openL, openR, openU, rnd, noisePat) {
    const Hw = T * 0.34, top = y0 - Hw, base = '#9d978c';
    // top surface
    const g = ctx.createLinearGradient(x0, top, x0 + T, top + T);
    g.addColorStop(0, '#aaa497'); g.addColorStop(1, '#8a8478');
    ctx.fillStyle = g; ctx.fillRect(x0, top, T, T);
    ctx.strokeStyle = 'rgba(40,36,30,0.45)'; ctx.lineWidth = 0.9;
    for (let r = 0; r < 4; r++) {
      const yy = top + r * T / 4;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + T, yy); ctx.stroke();
      for (let xx = x0 + (r % 2) * 10; xx < x0 + T; xx += 20) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + T / 4); ctx.stroke(); }
    }
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5;
    ctx.fillStyle = ctx.createPattern(noisePat, 'repeat'); ctx.fillRect(x0, top, T, T); ctx.restore();
    if (rnd() < 0.5) {
      const mx = x0 + rnd() * T, my = top + rnd() * T;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 12);
      mg.addColorStop(0, 'rgba(70,100,40,0.55)'); mg.addColorStop(1, 'rgba(70,100,40,0)');
      ctx.fillStyle = mg; ctx.fillRect(mx - 12, my - 12, 24, 24);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    if (openL) ctx.fillRect(x0, top, 2, T);
    if (openR) ctx.fillRect(x0 + T - 2, top, 2, T);
    if (openU) { ctx.fillStyle = 'rgba(255,250,235,0.35)'; ctx.fillRect(x0, top, T, 1.5); }
    if (front) {
      // merlons along the front edge
      for (let k = 0; k < 3; k++) {
        const mx = x0 + 4 + k * (T / 3);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(mx + 2, y0 + T - Hw - 8, T / 3 - 8, 6);
        ctx.fillStyle = '#b8b2a5'; ctx.fillRect(mx, y0 + T - Hw - 11, T / 3 - 8, 5);
        ctx.fillStyle = '#7a756c'; ctx.fillRect(mx, y0 + T - Hw - 6, T / 3 - 8, 6);
      }
      stoneFront(ctx, x0, y0 + T - Hw, T, Hw, base, 7);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5;
      ctx.fillStyle = ctx.createPattern(noisePat, 'repeat'); ctx.fillRect(x0, y0 + T - Hw, T, Hw); ctx.restore();
      if (openL) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x0, y0 + T - Hw, 2, Hw); }
      if (openR) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x0 + T - 2, y0 + T - Hw, 2, Hw); }
    }
  }
  function drawPillar(ctx, x0, y0) {
    const cx = x0 + T / 2, l = x0 + T * 0.3, r = x0 + T * 0.7, bot = y0 + T * 0.8, top = y0 - T * 0.5;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 12; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#000'; ctx.fillRect(l, top, r - l, bot - top); ctx.restore();
    // plinth
    stoneTop(ctx, x0 + T * 0.2, y0 + T * 0.66, T * 0.6, T * 0.12, '#a39d90');
    stoneFront(ctx, x0 + T * 0.2, y0 + T * 0.78, T * 0.6, T * 0.12, '#a39d90', 8);
    const g = ctx.createLinearGradient(l, 0, r, 0);
    g.addColorStop(0, '#9c968a'); g.addColorStop(0.25, '#e2dccf'); g.addColorStop(0.55, '#a7a093'); g.addColorStop(1, '#4e4a43');
    ctx.fillStyle = g; ctx.fillRect(l, top + 6, r - l, bot - top - 12);
    ctx.strokeStyle = 'rgba(40,36,30,0.25)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const xx = l + k * (r - l) / 5; ctx.beginPath(); ctx.moveTo(xx, top + 8); ctx.lineTo(xx, bot - 8); ctx.stroke(); }
    stoneTop(ctx, l - 5, top - 2, r - l + 10, 6, '#b5afa2');
    stoneFront(ctx, l - 5, top + 4, r - l + 10, 5, '#b5afa2', 6);
  }
  function drawThrone(ctx, x0, y0) {
    const cx = x0 + T / 2;
    stoneTop(ctx, x0 + 4, y0 + T * 0.52, T - 8, T * 0.18, '#8f877a');
    stoneFront(ctx, x0 + 4, y0 + T * 0.7, T - 8, T * 0.12, '#8f877a', 6);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 9; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#000'; ctx.fillRect(cx - T * 0.25, y0 - T * 0.32, T * 0.5, T * 0.88); ctx.restore();
    const gold = ctx.createLinearGradient(cx - T * 0.28, 0, cx + T * 0.28, 0);
    gold.addColorStop(0, '#8a6a2a'); gold.addColorStop(0.3, '#f2d58a'); gold.addColorStop(0.6, '#c9a14e'); gold.addColorStop(1, '#6a4e1c');
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.moveTo(cx - T * 0.25, y0 + T * 0.5); ctx.lineTo(cx - T * 0.25, y0 - T * 0.2); ctx.quadraticCurveTo(cx, y0 - T * 0.48, cx + T * 0.25, y0 - T * 0.2); ctx.lineTo(cx + T * 0.25, y0 + T * 0.5); ctx.closePath(); ctx.fill();
    const red = ctx.createLinearGradient(0, y0 - T * 0.3, 0, y0 + T * 0.4); red.addColorStop(0, '#b8323c'); red.addColorStop(1, '#5a0e16');
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.moveTo(cx - T * 0.17, y0 + T * 0.36); ctx.lineTo(cx - T * 0.17, y0 - T * 0.15); ctx.quadraticCurveTo(cx, y0 - T * 0.36, cx + T * 0.17, y0 - T * 0.15); ctx.lineTo(cx + T * 0.17, y0 + T * 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8c870'; ctx.beginPath(); ctx.arc(cx, y0 - T * 0.36, 3.5, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * T * 0.25, y0 - T * 0.2, 2.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = gold; ctx.fillRect(cx - T * 0.3, y0 + T * 0.26, T * 0.08, T * 0.26); ctx.fillRect(cx + T * 0.22, y0 + T * 0.26, T * 0.08, T * 0.26);
    ctx.fillStyle = '#9a1e28'; ctx.fillRect(cx - T * 0.2, y0 + T * 0.32, T * 0.4, T * 0.12);
    ctx.fillStyle = 'rgba(255,220,150,0.4)'; ctx.fillRect(cx - T * 0.2, y0 + T * 0.32, T * 0.4, 1.2);
  }
  function drawRubble(ctx, x0, y0, rnd) {
    for (let i = 0; i < 9; i++) {
      const x = x0 + 6 + rnd() * (T - 12), y = y0 + 6 + rnd() * (T - 12), w = 5 + rnd() * 9, h = 4 + rnd() * 6, a = (rnd() - .5) * 0.8;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
      ctx.fillStyle = '#6d675d'; ctx.fillRect(-w / 2, -h / 2 + 2, w, h);
      ctx.fillStyle = '#a59f92'; ctx.fillRect(-w / 2, -h / 2, w, h - 1);
      ctx.fillStyle = 'rgba(255,255,240,0.2)'; ctx.fillRect(-w / 2, -h / 2, w, 1);
      ctx.restore();
    }
  }
  function drawBrazier(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 1, 9, 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 16); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 1); ctx.stroke();
    const g = ctx.createLinearGradient(x - 8, 0, x + 8, 0); g.addColorStop(0, '#6a625a'); g.addColorStop(1, '#1e1a18');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 8, y - 22); ctx.lineTo(x + 8, y - 22); ctx.lineTo(x + 5, y - 15); ctx.lineTo(x - 5, y - 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.ellipse(x, y - 22, 7.5, 2.2, 0, 0, TAU); ctx.fill();
  }

  // ---------- animated layers ----------
  function makeWaveTexture(nz) {
    const s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), im = x.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const v = nz.seamless(i, j, s, (a, b) => nz.fbm(a * 0.03 + 500, b * 0.05 + 500, 3));
      const l = Math.pow(1 - Math.abs(Math.sin(v * 22)), 7);
      const o = (j * s + i) * 4;
      im.data[o] = 200; im.data[o + 1] = 235; im.data[o + 2] = 255; im.data[o + 3] = l * 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  function makeCloudTexture(nz) {
    const s = 512, c = makeCanvas(s, s), x = c.getContext('2d'), im = x.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const v = nz.seamless(i, j, s, (a, b) => nz.fbm(a * 0.006 + 800, b * 0.006 + 800, 4));
      const a = smoothstep(0.5, 0.72, v);
      const o = (j * s + i) * 4;
      im.data[o] = 16; im.data[o + 1] = 24; im.data[o + 2] = 44; im.data[o + 3] = a * 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  return { bake, makeWaveTexture, makeCloudTexture };
})();
