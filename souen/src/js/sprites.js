'use strict';
const Spr = (() => {
  const OUT = 'rgba(16,12,20,0.92)';

  function ik(hx, hy, fx, fy, l1, l2, dir) {
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.01;
    if (d > max) { dx *= max / d; dy *= max / d; fx = hx + dx; fy = hy + dy; d = max; }
    const a = Math.atan2(dy, dx);
    const b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ka = a - dir * b;
    return [hx + Math.cos(ka) * l1, hy + Math.sin(ka) * l1, fx, fy];
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  function segPoly(x0, y0, x1, y1, w0, w1, bul) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, wm = (w0 + w1) / 2 * (1 + bul);
    return { p: [x0 + nx * w0 / 2, y0 + ny * w0 / 2, mx + nx * wm / 2, my + ny * wm / 2, x1 + nx * w1 / 2, y1 + ny * w1 / 2, x1 - nx * w1 / 2, y1 - ny * w1 / 2, mx - nx * wm / 2, my - ny * wm / 2, x0 - nx * w0 / 2, y0 - ny * w0 / 2], nx, ny, mx, my, wm };
  }
  function segPath(ctx, s) { const p = s.p; ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[2], p[3], p[4], p[5]); ctx.lineTo(p[6], p[7]); ctx.quadraticCurveTo(p[8], p[9], p[10], p[11]); ctx.closePath(); }
  // tapered, cel-shaded two-segment limb (shoulder/hip -> elbow/knee -> hand/foot)
  function limb(ctx, pts, w, col, hiCol, prof) {
    const P = prof || [1.2, 0.86, 0.72];
    const s1 = segPoly(pts[0], pts[1], pts[2], pts[3], w * P[0], w * P[1], 0.32);
    const s2 = segPoly(pts[2], pts[3], pts[4], pts[5], w * P[1], w * P[2], 0.26);
    ctx.lineJoin = 'round';
    ctx.beginPath(); segPath(ctx, s1); segPath(ctx, s2); ctx.moveTo(pts[2] + w * P[1] / 2, pts[3]); ctx.arc(pts[2], pts[3], w * P[1] / 2, 0, TAU);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    for (const sg of [s1, s2]) {
      const lit = (sg.nx + sg.ny) < 0 ? 1 : -1;
      const g = ctx.createLinearGradient(sg.mx + sg.nx * sg.wm / 2 * lit, sg.my + sg.ny * sg.wm / 2 * lit, sg.mx - sg.nx * sg.wm / 2 * lit, sg.my - sg.ny * sg.wm / 2 * lit);
      g.addColorStop(0, shade(col, 0.32)); g.addColorStop(0.22, shade(col, 0.1)); g.addColorStop(0.5, col); g.addColorStop(0.56, shade(col, -0.3)); g.addColorStop(1, shade(col, -0.45));
      ctx.fillStyle = g; ctx.beginPath(); segPath(ctx, sg); ctx.fill();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pts[2], pts[3], w * P[1] / 2 - 0.1, 0, TAU); ctx.fill();
  }
  function boot(ctx, k, w, col, armor) {
    const [kx, ky, fx, fy] = k;
    const sx = lerp(kx, fx, 0.42), sy = lerp(ky, fy, 0.42);
    const sg = segPoly(sx, sy, fx, fy, w * 0.95, w * 0.82, 0.12);
    ctx.beginPath(); segPath(ctx, sg); fillOut(ctx, lg(ctx, sx - w, sy, sx + w, fy, col, 0.3, -0.4), 1);
    // foot
    ctx.beginPath(); ctx.moveTo(fx - w * 0.45, fy - w * 0.5); ctx.quadraticCurveTo(fx + w * 0.9, fy - w * 0.7, fx + w * 1.05, fy + 0.4); ctx.lineTo(fx - w * 0.5, fy + 0.6); ctx.closePath();
    fillOut(ctx, lg(ctx, fx - w, fy - w, fx + w, fy, col, 0.25, -0.35), 1);
    // cuff
    ctx.strokeStyle = armor ? shade(col, 0.5) : shade(col, 0.35); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(sx + sg.nx * w * 0.5, sy + sg.ny * w * 0.5); ctx.lineTo(sx - sg.nx * w * 0.5, sy - sg.ny * w * 0.5); ctx.stroke();
  }
  function fillOut(ctx, fill, lw = 1.1) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke(); }
  function lg(ctx, x0, y0, x1, y1, col, l = 0.3, d = -0.35) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, shade(col, l)); g.addColorStop(0.3, shade(col, l * 0.35)); g.addColorStop(0.5, col);
    g.addColorStop(0.54, shade(col, d * 0.75)); g.addColorStop(1, shade(col, d));
    return g;
  }
  function metalGrad(ctx, x0, y0, x1, y1, col) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.16, shade(col, 0.75)); g.addColorStop(0.22, shade(col, 0.2)); g.addColorStop(0.46, col);
    g.addColorStop(0.5, shade(col, -0.3)); g.addColorStop(0.8, shade(col, -0.5)); g.addColorStop(1, shade(col, -0.2));
    return g;
  }

  // ---------------- poses ----------------
  const IDLE = {
    sword: { armF: [0.35, 1.3], wa: 2.55 }, lance: { armF: [0.3, 1.35], wa: 2.85 }, axe: { armF: [0.25, 1.2], wa: 2.35 },
    bow: { armF: [0.55, 0.95], wa: 1.05 }, anima: { armF: [0.3, 2.0] }, dark: { armF: [0.3, 2.0] }, staff: { armF: [0.4, 1.05], wa: Math.PI - 0.1 },
  };
  function pose(unit, over) {
    const w = WEAPONS[unit.weapon] || {};
    const id = IDLE[w.type] || IDLE.sword;
    const p = { t: 0, bob: 0, lean: 0.06, crouch: 0, fF: [3.5, 0], fB: [-3.5, 0], armF: id.armF.slice(), armB: [0.12, 0.45], wa: id.wa, cast: 0, draw: 0, gait: 0, gaitAmp: 0, dx: 0, dy: 0, flash: 0 };
    if (unit.shield) p.armB = [0.55, 1.25];
    return Object.assign(p, over || {});
  }
  function idlePose(unit, t) {
    const p = pose(unit, { t });
    const br = Math.sin(t * 2.2);
    p.bob = br * 0.45; p.armF[0] += br * 0.03; p.armB[0] -= br * 0.03;
    if (WEAPONS[unit.weapon] && WEAPONS[unit.weapon].type === 'staff') p.wa += br * 0.02;
    return p;
  }
  function walkPose(unit, t) {
    const p = pose(unit, { t });
    const ph = t * 9;
    p.fF = [Math.sin(ph) * 6, Math.max(0, Math.cos(ph)) * 3.5];
    p.fB = [-Math.sin(ph) * 6, Math.max(0, -Math.cos(ph)) * 3.5];
    p.bob = Math.abs(Math.sin(ph)) * 1.3 - 0.6;
    p.armB[0] += -Math.sin(ph) * 0.35; p.armF[0] += Math.sin(ph) * 0.12;
    p.lean = 0.12; p.gait = t * 7; p.gaitAmp = 1;
    return p;
  }

  // ---------------- weapons ----------------
  function drawWeapon(ctx, wid, x, y, a, p, team) {
    const w = WEAPONS[wid]; if (!w) return;
    ctx.save(); ctx.translate(x, y);
    if (w.type === 'anima' || w.type === 'dark') { drawTome(ctx, w, p); ctx.restore(); return; }
    ctx.rotate(-a);
    const tcol = team === 'enemy' ? '#b8323a' : '#3e74c8';
    if (w.type === 'sword') {
      const long = wid === 'killEdge' ? 24 : wid === 'rapier' ? 24 : wid === 'steelSword' ? 23 : 21;
      const bw = wid === 'rapier' ? 1.2 : 1.8;
      // grip & pommel
      ctx.fillStyle = '#3a2416'; ctx.fillRect(-1, -5, 2, 6.5);
      ctx.fillStyle = '#d6b25a'; ctx.beginPath(); ctx.arc(0, -5.6, 1.4, 0, TAU); ctx.fill();
      // guard
      ctx.fillStyle = wid === 'killEdge' ? '#7a1f2a' : '#d6b25a';
      ctx.beginPath(); ctx.moveTo(-4, 1.2); ctx.lineTo(4, 1.2); ctx.lineTo(3.4, 2.6); ctx.lineTo(-3.4, 2.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = .6; ctx.stroke();
      if (wid === 'rapier') { ctx.strokeStyle = '#e8c870'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(0, 0.5, 3.2, 0.2, Math.PI - 0.2); ctx.stroke(); }
      // blade
      const g = ctx.createLinearGradient(-bw, 0, bw, 0);
      const bc = wid === 'killEdge' ? ['#f4e6ea', '#b8a0a8', '#5a3a44'] : ['#ffffff', '#c6ced9', '#5f6a7a'];
      g.addColorStop(0, bc[0]); g.addColorStop(0.45, bc[1]); g.addColorStop(1, bc[2]);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-bw, 2.6); ctx.lineTo(-bw * 0.9, long); ctx.lineTo(0, long + 3); ctx.lineTo(bw * 0.9, long); ctx.lineTo(bw, 2.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,30,0.7)'; ctx.lineWidth = .5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = .4; ctx.beginPath(); ctx.moveTo(0, 3.5); ctx.lineTo(0, long - 1); ctx.stroke();
      if (p && p.glint) { ctx.fillStyle = `rgba(255,255,255,${p.glint})`; ctx.beginPath(); ctx.arc(0, long * 0.7, 2.5 * p.glint, 0, TAU); ctx.fill(); }
    } else if (w.type === 'lance') {
      const back = wid === 'javelin' ? -8 : -15, len = wid === 'javelin' ? 20 : 27;
      const g = ctx.createLinearGradient(-1, 0, 1, 0); g.addColorStop(0, '#a07850'); g.addColorStop(1, '#4a3018');
      ctx.fillStyle = g; ctx.fillRect(-0.9, back, 1.8, len - back);
      ctx.strokeStyle = OUT; ctx.lineWidth = .5; ctx.strokeRect(-0.9, back, 1.8, len - back);
      ctx.fillStyle = '#c9a45c'; ctx.fillRect(-1.2, len - 1, 2.4, 1.6);
      const hg = ctx.createLinearGradient(-2.4, 0, 2.4, 0); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, '#b8c2cf'); hg.addColorStop(1, '#4f5a6a');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(0, len); ctx.quadraticCurveTo(2.8, len + 4, 0, len + 10); ctx.quadraticCurveTo(-2.8, len + 4, 0, len); ctx.fill(); ctx.stroke();
      if (wid !== 'javelin') {
        const fl = Math.sin((p ? p.t : 0) * 6) * 1.2;
        ctx.fillStyle = tcol; ctx.beginPath(); ctx.moveTo(0.8, len - 4); ctx.lineTo(6 + fl, len - 6); ctx.lineTo(0.8, len - 8.5); ctx.closePath(); ctx.fill();
      }
    } else if (w.type === 'axe') {
      const len = wid === 'handAxe' ? 15 : wid === 'greatAxe' ? 24 : 20;
      const g = ctx.createLinearGradient(-1, 0, 1, 0); g.addColorStop(0, '#8a6038'); g.addColorStop(1, '#3a2410');
      ctx.fillStyle = g; ctx.fillRect(-1, -6, 2, len + 8);
      ctx.strokeStyle = OUT; ctx.lineWidth = .5; ctx.strokeRect(-1, -6, 2, len + 8);
      const big = wid === 'greatAxe' ? 1.45 : wid === 'handAxe' ? 0.8 : 1;
      const hg = ctx.createLinearGradient(0, 0, -10 * big, 0);
      const dark = wid === 'greatAxe';
      hg.addColorStop(0, dark ? '#3a3a46' : '#6d7684'); hg.addColorStop(0.6, dark ? '#6a6a7a' : '#c4ccd6'); hg.addColorStop(1, '#ffffff');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.moveTo(-0.8, len - 6 * big); ctx.lineTo(-6 * big, len - 9 * big); ctx.quadraticCurveTo(-12 * big, len, -6 * big, len + 9 * big); ctx.lineTo(-0.8, len + 5 * big); ctx.closePath(); ctx.fill(); ctx.lineWidth = .7; ctx.stroke();
      if (dark) { ctx.fillStyle = '#9a1a22'; ctx.beginPath(); ctx.arc(-3, len, 1.4, 0, TAU); ctx.fill(); ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(0.8, len - 3); ctx.lineTo(5, len); ctx.lineTo(0.8, len + 3); ctx.fill(); }
    } else if (w.type === 'bow') {
      const dr = p ? p.draw : 0, tip = 17, nock = -5 - dr * 11;
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-tip, -5); ctx.quadraticCurveTo(-9, 4 - dr * 2, 0, 2); ctx.quadraticCurveTo(9, 4 - dr * 2, tip, -5); ctx.stroke();
      ctx.strokeStyle = wid === 'steelBow' ? '#7a8494' : '#7a4e26'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,0.6)'; ctx.lineWidth = .5; ctx.stroke();
      ctx.strokeStyle = 'rgba(240,240,230,0.85)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(-tip, -5); ctx.lineTo(0, nock); ctx.lineTo(tip, -5); ctx.stroke();
      if (p && p.arrow) {
        ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(0, nock); ctx.lineTo(0, 15); ctx.stroke();
        ctx.fillStyle = '#d8dde4'; ctx.beginPath(); ctx.moveTo(-1.6, 14); ctx.lineTo(0, 18); ctx.lineTo(1.6, 14); ctx.fill();
        ctx.fillStyle = '#e8e2d0'; ctx.fillRect(-1.4, nock + 0.5, 1, 4); ctx.fillRect(0.4, nock + 0.5, 1, 4);
      }
      ctx.fillStyle = '#3a2416'; ctx.fillRect(-1.6, -1, 3.2, 3);
    } else if (w.type === 'staff') {
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-0.9, -12, 1.8, 36);
      ctx.strokeStyle = OUT; ctx.lineWidth = .5; ctx.strokeRect(-0.9, -12, 1.8, 36);
      ctx.fillStyle = '#d6b25a'; ctx.fillRect(-1.3, 20, 2.6, 2);
      ctx.strokeStyle = '#e2c26a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 27, 4, 0, TAU); ctx.stroke();
      const glow = 0.5 + (p ? p.cast : 0) * 0.5;
      const gg = ctx.createRadialGradient(0, 27, 0, 0, 27, 6 + glow * 6);
      gg.addColorStop(0, `rgba(200,255,230,${0.9 * glow})`); gg.addColorStop(1, 'rgba(120,255,200,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 27, 6 + glow * 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7fe8c0'; ctx.beginPath(); ctx.arc(0, 27, 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawTome(ctx, w, p) {
    const cover = w.elem === 'fire' ? '#a8321e' : w.elem === 'thunder' ? '#c9a02a' : '#4a1e5a';
    ctx.rotate(-0.25);
    ctx.fillStyle = '#efe6cc'; ctx.fillRect(-4, -3.2, 8, 6);
    const g = ctx.createLinearGradient(-4.5, -4, 4.5, 4); g.addColorStop(0, shade(cover, 0.3)); g.addColorStop(1, shade(cover, -0.4));
    ctx.fillStyle = g; ctx.fillRect(-4.6, -4, 9.2, 1.6); ctx.fillRect(-4.6, 2.4, 9.2, 1.6); ctx.fillRect(-4.6, -4, 1.4, 8);
    ctx.strokeStyle = OUT; ctx.lineWidth = .5; ctx.strokeRect(-4.6, -4, 9.2, 8);
    ctx.fillStyle = '#d6b25a'; ctx.fillRect(-1, -3.8, 2, 1.2);
    if (p && p.cast > 0) {
      const c = w.elem === 'fire' ? '255,140,60' : w.elem === 'thunder' ? '255,240,140' : '200,90,255';
      const r = 8 + p.cast * 10;
      const gg = ctx.createRadialGradient(0, -4, 0, 0, -4, r);
      gg.addColorStop(0, `rgba(${c},${0.85 * p.cast})`); gg.addColorStop(1, `rgba(${c},0)`);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, -4, r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------- head ----------------
  function drawHead(ctx, L, hx, hy, lean, t, team, armor, hs) {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(lean * 0.6); if (hs) ctx.scale(hs, hs);
    const skin = L.skin, hair = L.hair;
    const helm = L.helm;
    // long back hair
    if (L.hairStyle === 'long' && helm !== 'hood' && helm !== 'full') {
      const sw = Math.sin(t * 2) * 0.8;
      ctx.beginPath(); ctx.moveTo(-1, -5); ctx.quadraticCurveTo(-8, 0, -7.5 + sw, 12); ctx.lineTo(-3 + sw, 11); ctx.quadraticCurveTo(-3, 4, 1, 1); ctx.closePath();
      fillOut(ctx, lg(ctx, -6, -4, -2, 12, hair));
    }
    if (helm === 'veil') {
      const sw = Math.sin(t * 1.8) * 0.8;
      ctx.beginPath(); ctx.moveTo(3, -6.5); ctx.quadraticCurveTo(-4, -8, -7, -1); ctx.quadraticCurveTo(-9 + sw, 8, -8 + sw, 13); ctx.lineTo(-1, 12); ctx.quadraticCurveTo(-1.5, 4, 1, 2); ctx.closePath();
      fillOut(ctx, lg(ctx, -6, -6, 0, 12, '#2f5aa6'));
    }
    if (helm === 'hood') {
      ctx.beginPath(); ctx.moveTo(5.5, -3); ctx.quadraticCurveTo(4, -9, -2, -8); ctx.quadraticCurveTo(-8, -6, -7.5, 2); ctx.quadraticCurveTo(-8, 9, -4, 11); ctx.lineTo(2, 7); ctx.closePath();
      fillOut(ctx, lg(ctx, -6, -8, 4, 8, L.cloth2 && team === 'enemy' ? L.cloth : L.cloth));
    }
    const helmeted = helm === 'open' || helm === 'horned' || helm === 'full';
    if (!helmeted && helm !== 'hood' && helm !== 'veil' && L.hairStyle !== 'bald' && L.hairStyle !== 'long') {
      const sw = Math.sin(t * 2.2) * 0.4;
      ctx.beginPath(); ctx.moveTo(1, -7); ctx.quadraticCurveTo(-6, -8.5, -8.8 + sw, -4); ctx.lineTo(-6.6, -3.4); ctx.lineTo(-8.6 + sw, -0.6); ctx.lineTo(-6, -0.2); ctx.lineTo(-6.8 + sw, 2.8); ctx.quadraticCurveTo(-3, 2, -1, 0); ctx.closePath();
      fillOut(ctx, lg(ctx, -8, -8, -1, 2, shade(hair, -0.08)), .8);
    }
    // face (union outline)
    const shapes = () => { ctx.beginPath(); ctx.ellipse(0, -0.6, 5.5, 5.8, 0, 0, TAU); ctx.moveTo(5.6, 2.6); ctx.ellipse(2.6, 2.6, 3, 2.6, 0, 0, TAU); };
    shapes(); ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.stroke();
    const fg = ctx.createRadialGradient(2.5, -2.5, 0.5, 0, 0, 7.5);
    fg.addColorStop(0, shade(skin, 0.2)); fg.addColorStop(0.6, skin); fg.addColorStop(1, shade(skin, -0.3));
    shapes(); ctx.fillStyle = fg; ctx.fill();
    // nose
    ctx.beginPath(); ctx.moveTo(5.2, -0.8); ctx.lineTo(6.6, 1.3); ctx.lineTo(5.2, 1.9); ctx.closePath(); ctx.fillStyle = skin; ctx.fill();
    ctx.strokeStyle = shade(skin, -0.45); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(5.2, -0.8); ctx.lineTo(6.6, 1.3); ctx.lineTo(5.3, 1.9); ctx.stroke();
    // eye
    if (helm !== 'full') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(3.7, -0.4, 1.35, 1.25, 0, 0, TAU); ctx.fill();
      const ig = ctx.createLinearGradient(0, -1.5, 0, 0.8); ig.addColorStop(0, shade(L.eye, -0.55)); ig.addColorStop(1, shade(L.eye, 0.35));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(4.15, -0.35, 0.78, 1.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#120c10'; ctx.beginPath(); ctx.ellipse(4.3, -0.4, 0.38, 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(3.95, -0.95, 0.32, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e1214'; ctx.lineWidth = L.female ? 0.85 : 0.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(2.3, -1.3); ctx.quadraticCurveTo(3.6, -2.2, 5.1, -1.25); ctx.stroke();
      if (L.female) { ctx.beginPath(); ctx.moveTo(5.0, -1.3); ctx.lineTo(5.6, -1.9); ctx.stroke(); }
      ctx.strokeStyle = shade(hair, -0.3); ctx.lineWidth = .8; ctx.beginPath();
      if (team === 'enemy') { ctx.moveTo(2.2, -3); ctx.lineTo(5, -2); } else { ctx.moveTo(2.2, -2.6); ctx.quadraticCurveTo(3.6, -3.2, 5, -2.5); }
      ctx.stroke();
      ctx.strokeStyle = shade(skin, -0.5); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(3.8, 3.3); ctx.lineTo(5.2, 3.1); ctx.stroke();
      // ear
      ctx.fillStyle = shade(skin, -0.12); ctx.beginPath(); ctx.ellipse(-0.9, 0.4, 1.2, 1.8, 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = shade(skin, -0.45); ctx.lineWidth = .4; ctx.stroke();
    }
    if (L.beard) {
      ctx.beginPath(); ctx.moveTo(-1, 1); ctx.quadraticCurveTo(0, 6.5, 3.5, 6.2); ctx.quadraticCurveTo(6, 5.5, 5.8, 3.4); ctx.lineTo(4, 3.8); ctx.quadraticCurveTo(2, 3, 1, 1.5); ctx.closePath();
      fillOut(ctx, lg(ctx, 0, 1, 5, 7, shade(hair, -0.1)), .6);
    }
    // hair
    if (helm !== 'full' && helm !== 'hood' && L.hairStyle !== 'bald') {
      const hg = lg(ctx, -4, -7, 4, 2, hair, 0.35, -0.35);
      ctx.beginPath();
      ctx.moveTo(4.8, -2.2);
      ctx.quadraticCurveTo(5.5, -6, 1.5, -6.8);
      if (helmeted) ctx.quadraticCurveTo(-4.5, -7.6, -6.2, -2.5);
      else if (L.hairStyle === 'spiky') { ctx.lineTo(1.6, -9.6); ctx.lineTo(-0.6, -7.2); ctx.lineTo(-2.6, -9.8); ctx.lineTo(-3.8, -6.6); ctx.lineTo(-7.4, -7.6); ctx.lineTo(-6.2, -4); ctx.lineTo(-9, -2.4); ctx.lineTo(-6.4, -1.4); }
      else if (L.hairStyle !== 'long') { ctx.lineTo(2.2, -8.4); ctx.lineTo(0, -7.3); ctx.lineTo(-1.6, -8.9); ctx.lineTo(-3, -7.2); ctx.lineTo(-5.6, -7.8); ctx.lineTo(-5.4, -5.4); ctx.lineTo(-7.8, -4.4); ctx.lineTo(-6.2, -2.5); }
      ctx.quadraticCurveTo(-6.8, 1.5, -4.2, 3.4);
      ctx.lineTo(-2.4, 1.2); ctx.quadraticCurveTo(-1.5, -1.8, 0.8, -2.8);
      ctx.lineTo(1.3, -1.3); ctx.lineTo(2.3, -3.3); ctx.lineTo(3.1, -2.0); ctx.lineTo(4.1, -3.1); ctx.lineTo(5.3, -2.2); ctx.lineTo(4.8, -2.4);
      ctx.closePath();
      fillOut(ctx, hg, .8);
      ctx.strokeStyle = shade(hair, 0.45, 0.6); ctx.lineWidth = .5; ctx.beginPath(); ctx.arc(-0.5, -1.5, 4.6, -2.4, -1.3); ctx.stroke();
    }
    // helmets
    if (helm === 'circlet') {
      ctx.strokeStyle = '#e2c26a'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(-5.2, -2.6); ctx.quadraticCurveTo(0, -4.6, 5, -3.2); ctx.stroke();
      ctx.fillStyle = '#5ab0ff'; ctx.beginPath(); ctx.arc(4.6, -3.3, 0.8, 0, TAU); ctx.fill();
    } else if (helm === 'open' || helm === 'horned') {
      ctx.beginPath(); ctx.moveTo(-6.4, 1.6); ctx.quadraticCurveTo(-7, -7.5, 0, -7.4); ctx.quadraticCurveTo(6.2, -7.2, 6.2, -2.2); ctx.lineTo(5.4, -1.8); ctx.lineTo(5.2, 0.6); ctx.lineTo(4.3, 0.6); ctx.lineTo(4.2, -2.9); ctx.lineTo(-2.2, -3.0); ctx.lineTo(-2.6, 2.2); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, -5, -7, 3, 1, L.metal), .8);
      ctx.strokeStyle = shade(L.metal, -0.5); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(-6, -3.2); ctx.lineTo(4.4, -3.2); ctx.stroke();
      if (helm === 'horned') {
        for (const [bx, s] of [[-3, 1], [2, 0.8]]) {
          ctx.beginPath(); ctx.moveTo(bx - 1.2, -6.5); ctx.quadraticCurveTo(bx - 1 + s * 2, -13, bx + s * 6, -14 * s); ctx.quadraticCurveTo(bx + 1 + s, -10, bx + 1.4, -6.6); ctx.closePath();
          fillOut(ctx, lg(ctx, bx, -14, bx + 4, -6, '#e8dcc0'), .6);
        }
      }
    } else if (helm === 'full') {
      ctx.beginPath(); ctx.moveTo(-6.4, 3.8); ctx.quadraticCurveTo(-7.2, -7.8, 0, -7.6); ctx.quadraticCurveTo(6.8, -7.4, 6.6, -1); ctx.lineTo(7, 2.2); ctx.quadraticCurveTo(6.4, 5.6, 2, 6); ctx.lineTo(-3.5, 5.6); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, -5, -7, 4, 5, L.metal), .8);
      ctx.fillStyle = '#0c0c12'; ctx.fillRect(1.4, -1.6, 5.4, 1.1);
      if (team === 'enemy') { ctx.fillStyle = '#ff5a3a'; ctx.fillRect(4.2, -1.5, 1.3, 0.9); }
      ctx.strokeStyle = shade(L.metal, 0.5, 0.7); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(-1, -7.3); ctx.lineTo(-1, 5.4); ctx.stroke();
      // plume
      const pc = team === 'enemy' ? '#b82a30' : '#3a6ec8';
      const sw = Math.sin(t * 3) * 0.8;
      ctx.beginPath(); ctx.moveTo(-1, -7.4); ctx.quadraticCurveTo(-5, -12, -11 + sw, -8); ctx.quadraticCurveTo(-6, -9, -2.5, -6.2); ctx.closePath();
      fillOut(ctx, lg(ctx, -10, -11, -2, -6, pc), .6);
    } else if (helm === 'bandana') {
      ctx.fillStyle = L.cloth2 === '#5a4630' ? '#a83a2a' : L.cloth; ctx.beginPath(); ctx.moveTo(-5.8, -2.6); ctx.quadraticCurveTo(0, -6.4, 5.4, -3.2); ctx.lineTo(5.2, -1.6); ctx.quadraticCurveTo(0, -4.4, -5.6, -0.8); ctx.closePath(); fillOut(ctx, '#a83a2a', .6);
      const sw = Math.sin(t * 4) * 1;
      ctx.beginPath(); ctx.moveTo(-5.6, -1.8); ctx.lineTo(-9.5, 0 + sw); ctx.lineTo(-9, 1.6 + sw); ctx.lineTo(-5.2, -0.6); ctx.closePath(); fillOut(ctx, '#8a2a1e', .5);
    } else if (helm === 'hood') {
      ctx.beginPath(); ctx.moveTo(5.8, -2.4); ctx.quadraticCurveTo(4.5, -8.5, -1.5, -8.2); ctx.quadraticCurveTo(-7.4, -7, -7, 0); ctx.quadraticCurveTo(-6.5, 5, -3.6, 5.2); ctx.lineTo(-1.8, 3); ctx.quadraticCurveTo(-2.4, -3, 2, -4.2); ctx.quadraticCurveTo(4.4, -4, 5.8, -2.4); ctx.closePath();
      fillOut(ctx, lg(ctx, -6, -8, 4, 4, L.cloth), .8);
    } else if (helm === 'veil') {
      ctx.beginPath(); ctx.moveTo(5.6, -2.6); ctx.quadraticCurveTo(4.5, -8, -1.5, -7.8); ctx.quadraticCurveTo(-7, -6.8, -6.8, 0); ctx.lineTo(-3.4, 3.6); ctx.lineTo(-1.6, 1.4); ctx.quadraticCurveTo(-2, -3.2, 2, -3.9); ctx.quadraticCurveTo(4.4, -3.8, 5.6, -2.6); ctx.closePath();
      fillOut(ctx, lg(ctx, -6, -8, 4, 4, '#f4f0e6'), .8);
      ctx.strokeStyle = '#d6b25a'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(-1.2, -3.2); ctx.quadraticCurveTo(2, -4.6, 5.4, -2.8); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------- horse ----------------
  function drawHorse(ctx, L, p, team, far) {
    const hc = L.horseCol || '#7a4a2c', mane = shade(hc, -0.65);
    const ph = p.gait, amp = p.gaitAmp, t = p.t;
    const bb = -Math.abs(Math.sin(ph)) * 1.4 * amp + Math.sin(t * 2) * 0.3;
    const legs = [
      { x: 12, y: -30, o: 0.0, front: true, far: true },
      { x: -13, y: -31, o: Math.PI * 0.5, front: false, far: true },
      { x: 13.5, y: -30, o: Math.PI, front: true, far: false },
      { x: -11.5, y: -31, o: Math.PI * 1.5, front: false, far: false },
    ];
    const legDraw = (lgd) => {
      const s = Math.sin(ph + lgd.o) * amp;
      const a1 = s * 0.5 + (p.rear || 0) * (lgd.front ? 0.9 : -0.2);
      const bend = lgd.front ? -Math.max(0, Math.cos(ph + lgd.o)) * 1.1 * amp - (p.rear || 0) * 1.2 : Math.max(0, Math.cos(ph + lgd.o)) * 0.8 * amp;
      const hx = lgd.x, hy = lgd.y + bb;
      const kx = hx + Math.sin(a1) * 12, ky = hy + Math.cos(a1) * 12;
      const fx = kx + Math.sin(a1 + bend) * 12, fy = ky + Math.cos(a1 + bend) * 12;
      const col = lgd.far ? shade(hc, -0.35) : hc;
      limb(ctx, [hx, hy, kx, ky, fx, fy], 3.6, col, null, [1.5, 0.75, 0.6]);
      ctx.fillStyle = lgd.far ? '#1e1814' : '#2c241e'; ctx.beginPath(); ctx.ellipse(fx + 0.6, fy + 0.2, 2.2, 1.3, 0, 0, TAU); ctx.fill();
      if (!lgd.far && team !== 'enemy') { ctx.fillStyle = '#efe8dc'; ctx.beginPath(); ctx.ellipse(fx, fy - 2.2, 1.9, 1.6, 0, 0, TAU); ctx.fill(); }
    };
    ctx.save(); ctx.translate(0, 0);
    // tail
    const ts = Math.sin(t * 2.5) * 1.5 + Math.sin(ph) * 2 * amp;
    ctx.beginPath(); ctx.moveTo(-19, -39 + bb); ctx.quadraticCurveTo(-28, -36 + bb, -27 + ts, -20); ctx.quadraticCurveTo(-24 + ts * 0.5, -26, -19, -34 + bb); ctx.closePath();
    fillOut(ctx, lg(ctx, -28, -38, -20, -20, mane), .8);
    legDraw(legs[0]); legDraw(legs[1]);
    // body
    ctx.beginPath();
    ctx.moveTo(18, -37 + bb);
    ctx.bezierCurveTo(19, -29 + bb, 11, -26 + bb, 4, -26.5 + bb);
    ctx.bezierCurveTo(-4, -26 + bb, -12, -26 + bb, -17, -29 + bb);
    ctx.bezierCurveTo(-23, -32 + bb, -22, -42 + bb, -16, -43.5 + bb);
    ctx.bezierCurveTo(-8, -45 + bb, 4, -43.5 + bb, 10, -44 + bb);
    ctx.bezierCurveTo(14, -44 + bb, 17, -41 + bb, 18, -37 + bb);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, -45 + bb, 0, -26 + bb);
    bg.addColorStop(0, shade(hc, 0.25)); bg.addColorStop(0.55, hc); bg.addColorStop(1, shade(hc, -0.45));
    fillOut(ctx, bg, 1.1);
    // neck & head
    const nb = Math.sin(t * 2) * 0.6 + (p.rear || 0) * -4;
    ctx.beginPath();
    ctx.moveTo(9, -43 + bb); ctx.quadraticCurveTo(15, -52 + bb + nb, 21, -59 + bb + nb);
    ctx.lineTo(25, -61.5 + bb + nb); ctx.quadraticCurveTo(30, -57 + bb + nb, 34, -51 + bb + nb);
    ctx.quadraticCurveTo(35.5, -48 + bb + nb, 33, -46.5 + bb + nb); ctx.lineTo(29.5, -46.5 + bb + nb);
    ctx.quadraticCurveTo(26, -48 + bb + nb, 24, -50.5 + bb + nb);
    ctx.quadraticCurveTo(21, -44 + bb, 18, -37 + bb); ctx.closePath();
    const ng = ctx.createLinearGradient(14, -60 + bb, 26, -42 + bb);
    ng.addColorStop(0, shade(hc, 0.3)); ng.addColorStop(1, shade(hc, -0.3));
    fillOut(ctx, ng, 1.1);
    // ear
    ctx.beginPath(); ctx.moveTo(22.5, -59.5 + bb + nb); ctx.lineTo(22.6, -65 + bb + nb); ctx.lineTo(25.2, -60.5 + bb + nb); ctx.closePath(); fillOut(ctx, shade(hc, -0.15), .7);
    // eye, nostril
    ctx.fillStyle = '#0e0a08'; ctx.beginPath(); ctx.ellipse(26.6, -56 + bb + nb, 1, .8, 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(26.9, -56.3 + bb + nb, .3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(33, -48.6 + bb + nb, .8, .6, 0, 0, TAU); ctx.fill();
    // bridle
    ctx.strokeStyle = '#3a2214'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(24, -58 + bb + nb); ctx.lineTo(31, -48 + bb + nb); ctx.moveTo(23, -54 + bb + nb); ctx.lineTo(32, -51 + bb + nb); ctx.stroke();
    // mane
    ctx.beginPath(); ctx.moveTo(23, -60.5 + bb + nb); ctx.quadraticCurveTo(15, -55 + bb, 9, -45 + bb);
    for (let i = 0; i < 6; i++) { const u = i / 5; ctx.lineTo(lerp(10, 21, u) - 2.5 - Math.sin(t * 3 + i) * 0.6, lerp(-44, -58, u) + bb + 2 + nb * u); }
    ctx.closePath(); fillOut(ctx, lg(ctx, 10, -58, 20, -44, mane), .7);
    // caparison
    const tc = team === 'enemy' ? '#8a1e26' : '#244e9a';
    ctx.beginPath(); ctx.moveTo(-13, -43 + bb); ctx.lineTo(9, -44 + bb); ctx.quadraticCurveTo(11, -37 + bb, 9.5, -31 + bb);
    for (let i = 0; i <= 6; i++) { const x = lerp(9.5, -14, i / 6); ctx.lineTo(x, -31 + bb + (i % 2 ? 1.6 : 0) + Math.sin(t * 3 + i) * 0.4); }
    ctx.quadraticCurveTo(-16, -38 + bb, -13, -43 + bb); ctx.closePath();
    fillOut(ctx, lg(ctx, -10, -44 + bb, 4, -30 + bb, tc), .8);
    ctx.strokeStyle = '#d6b25a'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(9.4, -32.4 + bb); ctx.lineTo(-14, -32.4 + bb); ctx.stroke();
    // saddle
    ctx.beginPath(); ctx.moveTo(-8, -44 + bb); ctx.quadraticCurveTo(-2, -42 + bb, 5, -44.5 + bb); ctx.lineTo(6, -47 + bb); ctx.quadraticCurveTo(-1, -44.5 + bb, -9, -47.5 + bb); ctx.closePath(); fillOut(ctx, '#5a3218', .7);
    legDraw(legs[2]); legDraw(legs[3]);
    ctx.restore();
    return bb;
  }

  // ---------------- full figure ----------------
  function drawFigure(ctx, unit, p) {
    const cls = CLASSES[unit.cls], L = unit.look, team = unit.team;
    const armor = cls.body === 'armor', robe = cls.body === 'robe', mounted = !!cls.mount;
    const t = p.t;
    ctx.save();
    ctx.translate(p.dx, p.dy);
    let hipX = 0, hipY;
    if (mounted) {
      const bb = drawHorse(ctx, L, p, team);
      hipX = -2; hipY = -45 + bb - p.bob * 0.3;
    } else {
      hipY = (p.heroic ? -30 : -26) + p.crouch - p.bob;
    }
    const tw = armor ? 1.3 : 1;
    const lean = p.lean;
    const sl = Math.sin(lean), cl = Math.cos(lean);
    const TL = p.heroic ? 18 : 16, TS = TL / 16, LEG = p.heroic ? 15.5 : 13, UA = p.heroic ? 10.8 : 9.5, FA = p.heroic ? 9.8 : 8.5;
    const shX = hipX + sl * TL, shY = hipY - cl * TL;
    const loc = (x, y) => [hipX + x * cl - y * sl, hipY + x * sl + y * cl];
    const cloth = L.cloth, cloth2 = L.cloth2;
    const legCol = armor ? L.metal : shade(cloth2, -0.25);
    const bootCol = '#3a2a1e';

    // cape behind
    if (L.cape) {
      const wind = Math.sin(t * 2.4) * 1.5 + (p.gaitAmp || 0) * 3 + (p.capeWind || 0);
      const bot = mounted ? hipY + 12 : -1.5;
      ctx.beginPath(); ctx.moveTo(shX - 2, shY + 0.5);
      ctx.quadraticCurveTo(shX - 8 - wind * 0.5, (shY + bot) / 2, hipX - 10 - wind, bot);
      for (let i = 0; i <= 4; i++) ctx.lineTo(hipX - 10 - wind + i * 3, bot + (i % 2 ? -1.6 : 0) + Math.sin(t * 3 + i) * .5);
      ctx.quadraticCurveTo(hipX - 2, (shY + bot) / 2 + 3, shX + 1.5, shY + 1);
      ctx.closePath();
      fillOut(ctx, lg(ctx, shX - 8, shY, hipX, bot, L.cape, 0.2, -0.45), 1);
      ctx.strokeStyle = shade(L.cape, -0.55, 0.7); ctx.lineWidth = 0.7;
      for (const f of [0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(shX - 2 - f * 2, shY + 3); ctx.quadraticCurveTo(lerp(shX, hipX - 10 - wind, f) - 2, (shY + bot) / 2, hipX - 10 - wind + f * 10, bot - 1); ctx.stroke(); }
      ctx.strokeStyle = shade(L.cape, 0.35, 0.5); ctx.beginPath(); ctx.moveTo(shX - 1, shY + 2); ctx.quadraticCurveTo(shX - 5 - wind * 0.4, (shY + bot) / 2, hipX - 7 - wind, bot - 2); ctx.stroke();
    }
    // back arm
    const sbx = shX - 1.4, sby = shY + 1.5;
    const ebx = sbx + Math.sin(p.armB[0]) * UA, eby = sby + Math.cos(p.armB[0]) * UA;
    const hbx = ebx + Math.sin(p.armB[1]) * FA, hby = eby + Math.cos(p.armB[1]) * FA;
    const sleeveB = armor ? shade(L.metal, -0.3) : shade(cloth, -0.35);
    limb(ctx, [sbx, sby, ebx, eby, hbx, hby], armor ? 4.8 : 4.0, sleeveB, null, [1.15, 0.88, 0.78]);
    ctx.fillStyle = armor ? shade(L.metal, -0.35) : shade(L.skin, -0.25); ctx.beginPath(); ctx.arc(hbx, hby, 1.7, 0, TAU); ctx.fill();

    // legs
    if (mounted) {
      // only near leg, seated
      const kx = hipX + 7.5, ky = hipY + 4.5, fx = kx - 0.5, fy = ky + 10;
      limb(ctx, [hipX + 1, hipY, kx, ky, fx, fy], 4, legCol, shade(legCol, 0.3, 0.6));
      ctx.beginPath(); ctx.ellipse(fx + 1.5, fy + 0.5, 3, 1.6, 0, 0, TAU); fillOut(ctx, bootCol, .7);
    } else if (!robe) {
      const legW = armor ? 5.6 : 4.4;
      const fB = [hipX + p.fB[0], -p.fB[1]], fF = [hipX + p.fF[0], -p.fF[1]];
      const kB = ik(hipX - 1, hipY, fB[0], fB[1] - 1.5, LEG, LEG, 1);
      limb(ctx, [hipX - 1, hipY, kB[0], kB[1], kB[2], kB[3]], legW, shade(legCol, -0.3), null, [1.3, 0.85, 0.72]);
      boot(ctx, kB, legW, armor ? shade(L.metal, -0.45) : shade(bootCol, -0.3), armor);
      p._kF = ik(hipX + 1, hipY, fF[0], fF[1] - 1.5, LEG, LEG, 1);
    }
    // torso
    if (robe) {
      const g = p.gait ? Math.sin(p.gait * 1.3) * 1.5 : Math.sin(t * 1.5) * 0.5;
      const [wbx, wby] = loc(-5.2, 0), [wfx, wfy] = loc(4.8, 0);
      ctx.beginPath(); ctx.moveTo(wbx, wby);
      ctx.quadraticCurveTo(hipX - 8, hipY + 12, hipX - 10 - g, -0.5);
      ctx.quadraticCurveTo(hipX, 1.2, hipX + 9 + g * 0.5, -0.6);
      ctx.quadraticCurveTo(hipX + 7, hipY + 12, wfx, wfy); ctx.closePath();
      fillOut(ctx, lg(ctx, hipX - 8, hipY, hipX + 8, 0, cloth, 0.25, -0.4), 1.1);
      ctx.strokeStyle = shade(cloth, -0.45, 0.7); ctx.lineWidth = .6;
      for (const fx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(hipX + fx * 0.6, hipY + 3); ctx.quadraticCurveTo(hipX + fx, hipY + 14, hipX + fx * 1.6 + g * 0.3, -1); ctx.stroke(); }
      ctx.strokeStyle = cloth2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hipX - 9.6 - g, -1.6); ctx.quadraticCurveTo(hipX, 0.2, hipX + 8.6 + g * 0.5, -1.6); ctx.stroke();
      ctx.fillStyle = '#2a1e18'; ctx.beginPath(); ctx.ellipse(hipX + 8 + g, -0.4, 2.4, 1.1, 0, 0, TAU); ctx.fill();
    }
    const torso = armor
      ? [-6, 1, -6.8, -8, -6.2, -15, -4.4, -18, 4.6, -18, 7.2, -12.5, 7, -6, 5.6, 1]
      : [-4.6, 1, -5.2, -8, -4.8, -15, -3.4, -17.5, 3.6, -17.5, 5.8, -12, 5.4, -6.5, 4.2, 1];
    const tp = []; for (let i = 0; i < torso.length; i += 2) { const q = loc(torso[i], torso[i + 1] * TS); tp.push(q[0], q[1]); }
    // tabard / skirt
    if (!robe && !mounted) {
      const sk = armor ? [-6.4, -1, 6, -1, 7, 9, -7.4, 9] : [-5, -1, 4.6, -1, 5.6 + p.fF[0] * 0.15, 9, -6 + p.fB[0] * 0.15, 9];
      const sp = []; for (let i = 0; i < sk.length; i += 2) { const q = loc(sk[i], sk[i + 1]); sp.push(q[0], q[1]); }
      poly(ctx, sp); ctx.closePath(); fillOut(ctx, lg(ctx, sp[0], sp[1], sp[4], sp[5], armor ? cloth : cloth, 0.15, -0.45), 1);
      ctx.strokeStyle = shade(cloth2, 0.1); ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(sp[6], sp[7] - 0.6); ctx.lineTo(sp[4], sp[5] - 0.6); ctx.stroke();
    }
    // front leg
    if (!robe && !mounted && p._kF) {
      const k = p._kF, legW = armor ? 5.4 : 3.8;
      limb(ctx, [hipX + 1, hipY, k[0], k[1], k[2], k[3]], legW, legCol, null, [1.3, 0.85, 0.72]);
      boot(ctx, k, legW, armor ? shade(L.metal, -0.15) : bootCol, armor);
      if (armor) { ctx.beginPath(); ctx.arc(k[0], k[1], 2.4, 0, TAU); fillOut(ctx, metalGrad(ctx, k[0] - 2, k[1] - 2, k[0] + 2, k[1] + 2, L.metal), .6); }
    }
    poly(ctx, tp); ctx.closePath();
    const tg = ctx.createLinearGradient(tp[4], tp[5], tp[14], tp[15]);
    tg.addColorStop(0, shade(cloth, 0.3)); tg.addColorStop(1, shade(cloth, -0.4));
    fillOut(ctx, tg, 1.1);
    // chest armour
    const plate = armor || ['lord', 'cavalier', 'soldier', 'general', 'eknight', 'ecav'].includes(unit.cls);
    if (plate) {
      const pl = armor ? [-1, -0.5, -1.5, -16.5, 4.6, -17.5, 7.2, -12.5, 7, -6, 5.6, -0.5] : [0.2, -2, 0, -16, 3.6, -17, 5.8, -12, 5.4, -6.5, 4.2, -2];
      const pp = []; for (let i = 0; i < pl.length; i += 2) { const q = loc(pl[i], pl[i + 1] * TS); pp.push(q[0], q[1]); }
      poly(ctx, pp); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, pp[2], pp[3], pp[8], pp[9], L.metal), .8);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = .5; ctx.beginPath(); const a1 = loc(2.4, -15), a2 = loc(4.4, -6); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
    }
    if (unit.cls === 'archer' || unit.cls === 'earcher') {
      // quiver on back
      const q1 = loc(-5, -16), q2 = loc(-7, -2);
      ctx.save(); ctx.translate(q1[0], q1[1]); ctx.rotate(Math.atan2(q2[1] - q1[1], q2[0] - q1[0]) - Math.PI / 2);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-1.8, 0, 3.6, 13); ctx.strokeStyle = OUT; ctx.lineWidth = .6; ctx.strokeRect(-1.8, 0, 3.6, 13);
      ctx.fillStyle = '#e8e2d0'; for (let i = 0; i < 3; i++) ctx.fillRect(-1.5 + i * 1.1, -3, 0.8, 3.4);
      ctx.restore();
    }
    // belt
    { const b1 = loc(-5.2, -0.5), b2 = loc(5, -0.5); ctx.strokeStyle = '#2e1e12'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); const bk = loc(3.6, -0.5); ctx.fillStyle = '#d6b25a'; ctx.fillRect(bk[0] - 1, bk[1] - 1, 2, 2); }
    // head
    const hd = loc(1.3, -24 * TS - (p.heroic ? 0.6 : 0));
    const neck = loc(0.8, -18.5 * TS);
    ctx.strokeStyle = shade(L.skin, -0.25); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(neck[0], neck[1]); ctx.lineTo(hd[0] - 0.5, hd[1] + 3); ctx.stroke();
    drawHead(ctx, L, hd[0], hd[1], lean, t, team, armor, p.heroic ? 0.92 : 1);
    // shield on back arm (held forward)
    if (unit.shield) {
      ctx.save(); ctx.translate(hbx + 1, hby - 1);
      const sw = armor ? 7.5 : 5.5, sh = armor ? 13 : 9;
      ctx.beginPath(); ctx.moveTo(-sw * 0.3, -sh); ctx.lineTo(sw * 0.5, -sh); ctx.quadraticCurveTo(sw * 0.7, 0, 0, sh); ctx.quadraticCurveTo(-sw * 0.6, 0, -sw * 0.3, -sh); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, -sw, -sh, sw, sh, team === 'enemy' ? '#7a2a2a' : '#2f5aa6'), 1);
      ctx.strokeStyle = '#d6b25a'; ctx.lineWidth = .8; ctx.stroke();
      ctx.fillStyle = '#d6b25a'; ctx.beginPath(); ctx.arc(0.2, -sh * 0.25, 1.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // front arm + weapon
    const sfx = shX + 0.8, sfy = shY + 1.5;
    const efx = sfx + Math.sin(p.armF[0]) * UA, efy = sfy + Math.cos(p.armF[0]) * UA;
    const hfx = efx + Math.sin(p.armF[1]) * FA, hfy = efy + Math.cos(p.armF[1]) * FA;
    {
      const wt0 = (WEAPONS[unit.weapon] || {}).type;
      const wl = { sword: 25, lance: 36, axe: 22, staff: 28 }[wt0] || 0;
      p._hand = [hfx + p.dx, hfy + p.dy]; p._tip = wl ? [hfx + p.dx + Math.sin(p.wa) * wl, hfy + p.dy + Math.cos(p.wa) * wl] : null;
    }
    const w = WEAPONS[unit.weapon];
    const behindArm = w && (w.type === 'lance');
    if (behindArm) drawWeapon(ctx, unit.weapon, hfx, hfy, p.wa, p, team);
    const sleeve = armor ? L.metal : cloth;
    limb(ctx, [sfx, sfy, efx, efy, hfx, hfy], armor ? 4.8 : 4.0, sleeve, null, [1.15, 0.88, 0.78]);
    { // glove / gauntlet
      const gx = lerp(efx, hfx, 0.45), gy = lerp(efy, hfy, 0.45), gw = armor ? 4.8 : 4.0;
      const gc = armor || plate ? shade(L.metal, -0.05) : '#4a3222';
      const sg = segPoly(gx, gy, hfx, hfy, gw * 0.98, gw * 0.84, 0.1);
      ctx.beginPath(); segPath(ctx, sg); fillOut(ctx, armor || plate ? metalGrad(ctx, gx - 3, gy - 3, hfx + 3, hfy + 3, gc) : lg(ctx, gx - 3, gy - 3, hfx + 3, hfy + 3, gc), .9);
    }
    if (!behindArm) drawWeapon(ctx, unit.weapon, hfx, hfy, p.wa, p, team);
    ctx.beginPath(); ctx.arc(hfx, hfy, 1.8, 0, TAU); fillOut(ctx, armor ? shade(L.metal, -0.1) : L.skin, .6);
    // pauldron
    if (plate || unit.cls === 'mercenary') {
      ctx.beginPath(); ctx.ellipse(sfx - 0.3, sfy - 0.2, armor ? 4.6 : 3.4, armor ? 3.4 : 2.6, lean - 0.3, 0, TAU);
      fillOut(ctx, metalGrad(ctx, sfx - 3, sfy - 3, sfx + 3, sfy + 3, L.metal), .8);
    }
    ctx.restore();
  }

  // ---------------- map sprite cache ----------------
  const cache = new Map();
  let cacheScale = 2;
  const SPR_W = 96, SPR_H = 108, FOOT_Y = 96;
  const MAP_SCALE = 0.86;
  function setCacheScale(s) { s = clamp(Math.round(s * 4) / 4, 1, 2); if (s !== cacheScale) { cacheScale = s; cache.clear(); } }
  function clearUnit(uid) { for (const k of [...cache.keys()]) if (k.startsWith(uid + '|')) cache.delete(k); }
  // kind: 'idle' | 'walk'; frame index
  function mapSprite(unit, kind, fi, grey) {
    const key = unit.uid + '|' + kind + '|' + fi + '|' + (grey ? 1 : 0) + '|' + unit.weapon;
    let c = cache.get(key);
    if (c) return c;
    c = makeCanvas(SPR_W * cacheScale, SPR_H * cacheScale);
    const x = c.getContext('2d');
    x.scale(cacheScale, cacheScale);
    x.translate(SPR_W / 2, FOOT_Y);
    x.scale(MAP_SCALE, MAP_SCALE);
    const p = kind === 'walk' ? walkPose(unit, fi / 6 * (TAU / 9)) : idlePose(unit, fi / 6 * (TAU / 2.2));
    p.t = fi * 0.45;
    drawFigure(x, unit, p);
    if (grey) {
      const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        d[i] = l * 0.72 + 14; d[i + 1] = l * 0.72 + 14; d[i + 2] = l * 0.78 + 22;
      }
      x.putImageData(im, 0, 0);
    }
    cache.set(key, c);
    return c;
  }

  // ---------------- portraits ----------------
  function drawPortrait(ctx, unit, w, h, opts = {}) {
    const L = unit.look, cls = unit.cls, team = unit.team, armor = CLASSES[cls].body === 'armor';
    const s = Math.min(w, h) / 100;
    ctx.save();
    ctx.translate((w - 100 * s) / 2, h - 100 * s);
    ctx.scale(s, s);
    if (opts.flip) { ctx.translate(100, 0); ctx.scale(-1, 1); }
    const skin = L.skin, hair = L.hair, female = !!L.female;
    const helm = L.helm;
    // back hair
    if (L.hairStyle === 'long' && helm !== 'hood' && helm !== 'full') {
      ctx.beginPath(); ctx.moveTo(30, 30); ctx.quadraticCurveTo(18, 60, 22, 96); ctx.lineTo(78, 96); ctx.quadraticCurveTo(84, 60, 70, 30); ctx.closePath();
      fillOut(ctx, lg(ctx, 20, 30, 80, 96, shade(hair, -0.15)), 1.2);
    }
    if (helm === 'veil') {
      ctx.beginPath(); ctx.moveTo(26, 34); ctx.quadraticCurveTo(14, 70, 18, 100); ctx.lineTo(82, 100); ctx.quadraticCurveTo(86, 70, 74, 34); ctx.closePath();
      fillOut(ctx, lg(ctx, 20, 30, 80, 100, '#2f5aa6'), 1.2);
    }
    if (helm === 'hood') {
      ctx.beginPath(); ctx.moveTo(24, 50); ctx.quadraticCurveTo(22, 12, 50, 10); ctx.quadraticCurveTo(80, 12, 77, 50); ctx.quadraticCurveTo(82, 80, 72, 92); ctx.lineTo(28, 92); ctx.quadraticCurveTo(18, 80, 24, 50); ctx.closePath();
      fillOut(ctx, lg(ctx, 20, 10, 80, 90, shade(L.cloth, -0.2)), 1.2);
    }
    // shoulders
    const cloth = L.cloth;
    if (L.cape) { ctx.beginPath(); ctx.moveTo(2, 100); ctx.quadraticCurveTo(6, 80, 26, 76); ctx.lineTo(74, 76); ctx.quadraticCurveTo(94, 80, 98, 100); ctx.closePath(); fillOut(ctx, lg(ctx, 0, 76, 100, 100, L.cape), 1.2); }
    ctx.beginPath(); ctx.moveTo(8, 100); ctx.quadraticCurveTo(10, 84, 32, 78); ctx.lineTo(68, 78); ctx.quadraticCurveTo(90, 84, 92, 100); ctx.closePath();
    fillOut(ctx, lg(ctx, 10, 78, 90, 100, cloth), 1.2);
    const plate = armor || ['lord', 'cavalier', 'soldier', 'general', 'eknight', 'ecav'].includes(cls);
    if (plate) {
      for (const [px, dir] of [[20, -1], [80, 1]]) {
        ctx.beginPath(); ctx.ellipse(px, 88, armor ? 17 : 13, armor ? 11 : 8, dir * 0.25, Math.PI, TAU); ctx.closePath();
        fillOut(ctx, metalGrad(ctx, px - 14, 78, px + 14, 96, L.metal), 1);
      }
      ctx.beginPath(); ctx.moveTo(36, 100); ctx.lineTo(38, 84); ctx.quadraticCurveTo(50, 80, 62, 84); ctx.lineTo(64, 100); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, 36, 82, 64, 100, L.metal), 1);
    }
    // collar
    ctx.beginPath(); ctx.moveTo(36, 80); ctx.quadraticCurveTo(50, 92, 64, 80); ctx.lineTo(62, 76); ctx.quadraticCurveTo(50, 84, 38, 76); ctx.closePath(); fillOut(ctx, L.cloth2, 1);
    if (cls === 'lord') { ctx.fillStyle = '#d6b25a'; ctx.beginPath(); ctx.arc(50, 88, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#5ab0ff'; ctx.beginPath(); ctx.arc(50, 88, 1.6, 0, TAU); ctx.fill(); }
    // neck
    ctx.beginPath(); ctx.moveTo(42, 60); ctx.lineTo(41, 80); ctx.quadraticCurveTo(50, 84, 60, 80); ctx.lineTo(59, 60); ctx.closePath();
    fillOut(ctx, lg(ctx, 42, 60, 60, 80, shade(skin, -0.15)), 1);
    ctx.fillStyle = shade(skin, -0.4, 0.5); ctx.beginPath(); ctx.moveTo(41, 66); ctx.quadraticCurveTo(51, 76, 60, 66); ctx.lineTo(60, 62); ctx.lineTo(41, 62); ctx.closePath(); ctx.fill();
    // ear
    ctx.beginPath(); ctx.ellipse(30.5, 50, 3.6, 6, -0.15, 0, TAU); fillOut(ctx, shade(skin, -0.1), 1);
    // face
    ctx.beginPath(); ctx.moveTo(31, 38); ctx.quadraticCurveTo(30, 58, 38, 68); ctx.quadraticCurveTo(45, 76, 52, 76.5);
    ctx.quadraticCurveTo(61, 74, 66, 66); ctx.quadraticCurveTo(70.5, 57, 70, 40); ctx.quadraticCurveTo(68, 18, 50, 17); ctx.quadraticCurveTo(32, 18, 31, 38); ctx.closePath();
    const fg = ctx.createRadialGradient(44, 44, 4, 50, 48, 32);
    fg.addColorStop(0, shade(skin, 0.18)); fg.addColorStop(0.6, skin); fg.addColorStop(1, shade(skin, -0.28));
    fillOut(ctx, fg, 1.2);
    ctx.fillStyle = shade(skin, -0.35, 0.35); ctx.beginPath(); ctx.moveTo(66, 44); ctx.quadraticCurveTo(70, 58, 64, 68); ctx.quadraticCurveTo(66, 56, 63, 46); ctx.closePath(); ctx.fill();
    if (female || unit.lord) { ctx.fillStyle = 'rgba(240,120,120,0.22)'; ctx.beginPath(); ctx.ellipse(39, 60, 5, 2.6, 0, 0, TAU); ctx.ellipse(62, 60, 3.6, 2.4, 0, 0, TAU); ctx.fill(); }
    // eyes
    const angry = team === 'enemy';
    const eyeW = female ? 1.08 : 1;
    const eye = (x, y, wd, far) => {
      wd *= eyeW;
      const shapeP = () => { ctx.beginPath(); ctx.moveTo(x - wd / 2, y); ctx.quadraticCurveTo(x, y - (female ? 5.4 : 4.4), x + wd / 2, y - 1); ctx.quadraticCurveTo(x + 0.5, y + 3.6, x - wd / 2, y); ctx.closePath(); };
      shapeP(); ctx.fillStyle = '#f8f6f2'; ctx.fill();
      ctx.save(); shapeP(); ctx.clip();
      const ig = ctx.createLinearGradient(0, y - 4, 0, y + 3);
      ig.addColorStop(0, shade(L.eye, -0.6)); ig.addColorStop(1, shade(L.eye, 0.35));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(x + (far ? 0.8 : 0.6), y - 0.4, female ? 3.6 : 3.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0d0a10'; ctx.beginPath(); ctx.arc(x + (far ? 0.8 : 0.6), y - 0.4, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - wd, y - 5, wd * 2, 2.2);
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 0.6, y - 1.8, 1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 1.6, y + 0.8, 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e1416'; ctx.lineWidth = female ? 1.9 : 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - wd / 2 - 0.5, y + 0.2); ctx.quadraticCurveTo(x, y - (female ? 5.6 : 4.6), x + wd / 2 + 0.6, y - 1.4); ctx.stroke();
      if (female) { ctx.beginPath(); ctx.moveTo(x + wd / 2 + 0.4, y - 1.4); ctx.lineTo(x + wd / 2 + 2, y - 2.6); ctx.stroke(); }
      ctx.strokeStyle = shade(skin, -0.4, 0.6); ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x - wd / 2 + 1, y + 1.6); ctx.quadraticCurveTo(x, y + 3, x + wd / 2 - 0.5, y + 0.6); ctx.stroke();
    };
    if (helm !== 'full') { eye(41, 50, 11, false); eye(61.5, 50, 9.5, true); }
    // brows
    ctx.strokeStyle = shade(hair, -0.35); ctx.lineWidth = female ? 1.3 : 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (angry) { ctx.moveTo(35, 41); ctx.lineTo(46, 44.5); ctx.moveTo(57, 44.5); ctx.lineTo(66, 41.5); }
    else { ctx.moveTo(35, 43); ctx.quadraticCurveTo(40, 40, 46.5, 42); ctx.moveTo(57, 42); ctx.quadraticCurveTo(62, 40.4, 66, 42.5); }
    ctx.stroke();
    // nose
    ctx.strokeStyle = shade(skin, -0.4); ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(53, 50); ctx.quadraticCurveTo(55.5, 56, 54.5, 59.5); ctx.stroke();
    ctx.fillStyle = shade(skin, -0.4, 0.6); ctx.beginPath(); ctx.ellipse(52, 60.2, 1.8, 0.8, 0, 0, TAU); ctx.fill();
    // mouth
    ctx.strokeStyle = shade(skin, -0.55); ctx.lineWidth = 1.1; ctx.beginPath();
    if (angry) { ctx.moveTo(45.5, 68); ctx.quadraticCurveTo(51, 66, 56.5, 68.4); }
    else { ctx.moveTo(46.5, 67); ctx.quadraticCurveTo(51, 68.6, 56, 66.6); }
    ctx.stroke();
    if (female) { ctx.fillStyle = 'rgba(210,90,100,0.4)'; ctx.beginPath(); ctx.ellipse(51.2, 68.8, 3.2, 1.2, 0, 0, TAU); ctx.fill(); }
    // beard
    if (L.beard && helm !== 'full') {
      ctx.beginPath(); ctx.moveTo(32, 52); ctx.quadraticCurveTo(33, 72, 44, 80); ctx.quadraticCurveTo(52, 86, 60, 80); ctx.quadraticCurveTo(70, 70, 70, 52);
      ctx.quadraticCurveTo(66, 64, 60, 70); ctx.quadraticCurveTo(56, 64, 51, 64.5); ctx.quadraticCurveTo(46, 64, 42, 70); ctx.quadraticCurveTo(35, 64, 32, 52); ctx.closePath();
      fillOut(ctx, lg(ctx, 32, 52, 70, 84, shade(hair, -0.1)), 1);
      ctx.strokeStyle = shade(hair, 0.3, 0.4); ctx.lineWidth = .5;
      for (let i = 0; i < 8; i++) { const x = 38 + i * 3.4; ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x + 1, 78); ctx.stroke(); }
    }
    // front hair
    if (helm !== 'full' && helm !== 'hood' && L.hairStyle !== 'bald') {
      const hg = ctx.createLinearGradient(30, 10, 70, 50);
      hg.addColorStop(0, shade(hair, 0.35)); hg.addColorStop(0.5, hair); hg.addColorStop(1, shade(hair, -0.4));
      ctx.beginPath();
      ctx.moveTo(28, 52);
      if (L.hairStyle === 'spiky') {
        ctx.lineTo(24, 36); ctx.lineTo(22, 24); ctx.lineTo(30, 26); ctx.lineTo(28, 12); ctx.lineTo(38, 18); ctx.lineTo(42, 4); ctx.lineTo(50, 14);
        ctx.lineTo(60, 4); ctx.lineTo(62, 16); ctx.lineTo(74, 10); ctx.lineTo(71, 24); ctx.lineTo(80, 28); ctx.lineTo(73, 36); ctx.lineTo(73, 50);
      } else {
        ctx.quadraticCurveTo(24, 22, 40, 14); ctx.quadraticCurveTo(56, 8, 68, 18); ctx.quadraticCurveTo(76, 28, 73, 50);
      }
      // bangs along hairline (right to left)
      const bangs = L.hairStyle === 'long' ? [[72, 60], [68, 38], [64, 44], [60, 32], [55, 42], [50, 30], [44, 41], [40, 30], [35, 40], [33, 33], [30, 62]]
        : L.hairStyle === 'spiky' ? [[70, 34], [64, 40], [60, 30], [54, 41], [49, 30], [43, 40], [38, 30], [33, 38], [30, 44]]
          : [[70, 40], [66, 34], [62, 40], [57, 30], [52, 39], [47, 28], [42, 37], [37, 29], [33, 40], [30, 46]];
      for (const [bx, by] of bangs) ctx.lineTo(bx, by);
      ctx.closePath();
      fillOut(ctx, hg, 1.2);
      ctx.strokeStyle = shade(hair, 0.5, 0.55); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(46, 34, 18, -2.5, -1.2); ctx.stroke();
      ctx.strokeStyle = shade(hair, -0.5, 0.45); ctx.lineWidth = .6;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(36 + i * 6, 16 + Math.abs(i - 2.5) * 2); ctx.quadraticCurveTo(38 + i * 6, 26, 36 + i * 6.2, 34); ctx.stroke(); }
    }
    // headgear
    if (helm === 'circlet') {
      ctx.strokeStyle = '#e2c26a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 33); ctx.quadraticCurveTo(50, 25, 71, 31); ctx.stroke();
      ctx.fillStyle = '#d6b25a'; ctx.beginPath(); ctx.moveTo(50, 24); ctx.lineTo(54, 28.5); ctx.lineTo(50, 33); ctx.lineTo(46, 28.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5ab0ff'; ctx.beginPath(); ctx.arc(50, 28.5, 2, 0, TAU); ctx.fill();
    } else if (helm === 'open' || helm === 'horned') {
      ctx.beginPath(); ctx.moveTo(26, 52); ctx.quadraticCurveTo(22, 10, 50, 9); ctx.quadraticCurveTo(78, 10, 75, 52); ctx.lineTo(70, 54); ctx.lineTo(70, 40); ctx.quadraticCurveTo(50, 33, 31, 40); ctx.lineTo(31, 56); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, 26, 9, 75, 56, L.metal), 1.2);
      ctx.beginPath(); ctx.moveTo(48.5, 37); ctx.lineTo(48.8, 55); ctx.lineTo(52.2, 55); ctx.lineTo(52.5, 37); ctx.closePath(); fillOut(ctx, metalGrad(ctx, 48, 37, 53, 55, L.metal), .8);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(46, 32, 20, -2.6, -1.6); ctx.stroke();
      if (helm === 'horned') {
        for (const dir of [-1, 1]) {
          const bx = 50 + dir * 22;
          ctx.beginPath(); ctx.moveTo(bx - dir * 2, 22); ctx.quadraticCurveTo(bx + dir * 18, 16, bx + dir * 20, -4); ctx.quadraticCurveTo(bx + dir * 10, 10, bx + dir * 2, 30); ctx.closePath();
          fillOut(ctx, lg(ctx, bx, -4, bx + dir * 10, 30, '#e8dcc0'), 1);
        }
      }
    } else if (helm === 'full') {
      ctx.beginPath(); ctx.moveTo(26, 56); ctx.quadraticCurveTo(22, 8, 50, 8); ctx.quadraticCurveTo(78, 8, 75, 56); ctx.quadraticCurveTo(72, 78, 52, 80); ctx.quadraticCurveTo(30, 78, 26, 56); ctx.closePath();
      fillOut(ctx, metalGrad(ctx, 26, 8, 75, 80, L.metal), 1.2);
      ctx.fillStyle = '#0a0a10'; ctx.beginPath(); ctx.moveTo(32, 47); ctx.lineTo(70, 47); ctx.lineTo(68, 52); ctx.lineTo(34, 52); ctx.closePath(); ctx.fill();
      if (team === 'enemy') { ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(42, 49.5, 1.6, 0, TAU); ctx.arc(60, 49.5, 1.4, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(120,180,255,0.5)'; ctx.beginPath(); ctx.arc(42, 49.5, 1.2, 0, TAU); ctx.arc(60, 49.5, 1.1, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = OUT; ctx.lineWidth = .8; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(42 + i * 4, 58); ctx.lineTo(42 + i * 4, 66); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(50, 9); ctx.lineTo(50, 46); ctx.stroke();
      const pc = team === 'enemy' ? '#b82a30' : '#3a6ec8';
      ctx.beginPath(); ctx.moveTo(48, 10); ctx.quadraticCurveTo(40, -6, 18, 2); ctx.quadraticCurveTo(34, 2, 44, 14); ctx.closePath(); fillOut(ctx, lg(ctx, 18, 0, 48, 14, pc), 1);
    } else if (helm === 'bandana') {
      ctx.beginPath(); ctx.moveTo(27, 36); ctx.quadraticCurveTo(50, 22, 74, 34); ctx.lineTo(73, 41); ctx.quadraticCurveTo(50, 30, 28, 43); ctx.closePath(); fillOut(ctx, lg(ctx, 27, 24, 74, 42, '#a83a2a'), 1);
      ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(16, 50); ctx.lineTo(20, 54); ctx.lineTo(29, 44); ctx.closePath(); fillOut(ctx, '#8a2a1e', 1);
    } else if (helm === 'hood') {
      ctx.beginPath(); ctx.moveTo(26, 60); ctx.quadraticCurveTo(22, 12, 50, 11); ctx.quadraticCurveTo(79, 12, 75, 60); ctx.lineTo(70, 64); ctx.quadraticCurveTo(72, 30, 50, 27); ctx.quadraticCurveTo(29, 30, 31, 64); ctx.closePath();
      fillOut(ctx, lg(ctx, 22, 11, 78, 64, L.cloth), 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(31, 40); ctx.quadraticCurveTo(50, 26, 70, 40); ctx.quadraticCurveTo(50, 33, 31, 44); ctx.closePath(); ctx.fill();
    } else if (helm === 'veil') {
      ctx.beginPath(); ctx.moveTo(25, 64); ctx.quadraticCurveTo(20, 12, 50, 11); ctx.quadraticCurveTo(80, 12, 76, 64); ctx.lineTo(71, 60); ctx.quadraticCurveTo(72, 33, 50, 30); ctx.quadraticCurveTo(29, 33, 30, 60); ctx.closePath();
      fillOut(ctx, lg(ctx, 22, 11, 78, 64, '#f4f0e6'), 1.2);
      ctx.strokeStyle = '#d6b25a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(30, 36); ctx.quadraticCurveTo(50, 27, 71, 36); ctx.stroke();
      ctx.fillStyle = '#d6b25a'; ctx.fillRect(48.8, 22, 2.4, 9); ctx.fillRect(46.5, 24.5, 7, 2.2);
    }
    ctx.restore();
  }

  return { drawFigure, pose, idlePose, walkPose, mapSprite, setCacheScale, clearUnit, drawPortrait, drawWeapon, SPR_W, SPR_H, FOOT_Y, get cacheScale() { return cacheScale; } };
})();
