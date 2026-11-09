'use strict';
// ===== タッチ操作（スマホ・タブレット） =====
// 左：フローティングスティック（左右いどう／下でヒップドロップ）　右：ジャンプ・ダッシュ・▼・★
const TouchUI = {
  on: false, el: null, stickId: null, ox: 0, oy: 0, rx: 0, ry: 0, dirs: { left: false, right: false, down: false }, vis: null, fireOn: null, muted: null,
  init() {
    this.on = /[?&]touch=1/.test(location.search) || !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.build();
    addEventListener('touchstart', () => { if (!this.on) { this.on = true; this.apply(); } }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('gesturestart', e => e.preventDefault());
    for (const ev of ['pointerup', 'touchend', 'click']) addEventListener(ev, () => Snd.init(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (Game.state === 'play') Game.state = 'pause'; this.release(); if (Snd.ctx) Snd.ctx.suspend(); }
      else if (Snd.ctx) Snd.ctx.resume();
    });
    // 画面タップ（マウスクリックも）でメニュー操作
    R.canvas.addEventListener('pointerdown', e => {
      Snd.init(); const r = R.canvas.getBoundingClientRect();
      this.tap((e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH);
    });
    this.apply();
  },
  build() {
    const ico = {
      pause: '<svg viewBox="0 0 20 20"><rect x="4" y="3" width="4" height="14" rx="1"/><rect x="12" y="3" width="4" height="14" rx="1"/></svg>',
      mute: '<svg viewBox="0 0 20 20"><path d="M3 7.5h3.5L11 4v12l-4.5-3.5H3z"/><path d="M13.5 7a4 4 0 0 1 0 6M15.5 4.8a7 7 0 0 1 0 10.4" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>',
      full: '<svg viewBox="0 0 20 20"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };
    const el = this.el = document.createElement('div'); el.id = 'tc';
    el.innerHTML = '<div id="tc-stick"><div id="tc-base"><div id="tc-knob"></div></div></div>' +
      '<div id="tc-btns"><div class="tb down" data-a="down">▼</div><div class="tb fire" data-a="fire">★</div><div class="tb dash" data-a="dash">ダッシュ</div><div class="tb jump" data-a="jump">ジャンプ</div></div>' +
      '<div id="tc-sys"><div class="sb" data-s="pause">' + ico.pause + '</div><div class="sb" data-s="mute">' + ico.mute + '</div><div class="sb" data-s="full">' + ico.full + '</div></div>' +
      '<div id="tc-hint">横向きにすると大きな画面で遊べます</div>';
    document.body.appendChild(el);
    this.zone = el.querySelector('#tc-stick'); this.base = el.querySelector('#tc-base'); this.knob = el.querySelector('#tc-knob');
    this.sys = el.querySelector('#tc-sys'); this.hint = el.querySelector('#tc-hint'); this.fireBtn = el.querySelector('.tb.fire'); this.muteBtn = el.querySelector('[data-s=mute]');
    // アクションボタン（同時押し対応）
    el.querySelectorAll('.tb').forEach(b => {
      const a = b.dataset.a;
      const dn = e => { e.preventDefault(); Snd.init(); try { b.setPointerCapture(e.pointerId); } catch (_) { } b.classList.add('on'); Input.touch[a] = true; Input.press(a); };
      const up = () => { b.classList.remove('on'); Input.touch[a] = false; };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
    // スティック
    const z = this.zone;
    z.addEventListener('pointerdown', e => {
      e.preventDefault(); Snd.init(); if (this.stickId !== null) return;
      this.stickId = e.pointerId; try { z.setPointerCapture(e.pointerId); } catch (_) { }
      const r = z.getBoundingClientRect(), R0 = this.rad();
      this.ox = clamp(e.clientX - r.left, R0 * 0.7, Math.max(R0 * 0.7, r.width - R0 * 0.4)); this.oy = clamp(e.clientY - r.top, R0 * 0.5, Math.max(R0 * 0.5, r.height - R0 * 0.5));
      this.setStick(e.clientX - r.left - this.ox, e.clientY - r.top - this.oy, true);
    });
    z.addEventListener('pointermove', e => {
      if (e.pointerId !== this.stickId) return; e.preventDefault();
      const r = z.getBoundingClientRect(), R0 = this.rad(); let dx = e.clientX - r.left - this.ox, dy = e.clientY - r.top - this.oy; const d = Math.hypot(dx, dy);
      if (d > R0 * 1.5) { const k = (d - R0 * 1.5) / d; this.ox += dx * k; this.oy += dy * k; dx -= dx * k; dy -= dy * k; }  // 指についてくる
      this.setStick(dx, dy, true);
    });
    const end = e => { if (e.pointerId !== this.stickId) return; this.stickId = null; this.setStick(0, 0, false); };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
    // システムボタン
    el.querySelectorAll('.sb').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); Snd.init(); const s = b.dataset.s;
      if (s === 'pause') Input.press('pause');
      else if (s === 'mute') Snd.toggleMute();
      else this.fullscreen();
    }));
    const de = document.documentElement;
    if (!(de.requestFullscreen || de.webkitRequestFullscreen)) el.querySelector('[data-s=full]').style.display = 'none';
  },
  fullscreen() {
    const d = document, de = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    try {
      const p = (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      const lock = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (_) { } };
      if (p && p.then) p.then(lock).catch(() => { }); else lock();
    } catch (_) { }
  },
  rad() { return (this.base.offsetWidth || 110) / 2; },
  setStick(dx, dy, active) {
    const R0 = this.rad(), d = Math.hypot(dx, dy), k = d > R0 ? R0 / d : 1;
    if (!active) { this.ox = this.rx; this.oy = this.ry; dx = dy = 0; }
    this.knob.style.transform = 'translate(' + (dx * k).toFixed(1) + 'px,' + (dy * k).toFixed(1) + 'px)';
    this.base.style.left = this.ox + 'px'; this.base.style.top = this.oy + 'px'; this.base.classList.toggle('on', active);
    const nd = { left: dx < -R0 * 0.28, right: dx > R0 * 0.28, down: dy > R0 * 0.7 && dy > Math.abs(dx) };
    for (const a in nd) { if (nd[a] && !this.dirs[a]) Input.press(a); Input.touch[a] = nd[a]; }
    this.dirs = nd;
  },
  release() { Input.touch = {}; this.stickId = null; if (this.base) { this.setStick(0, 0, false); this.el.querySelectorAll('.tb.on').forEach(b => b.classList.remove('on')); } },
  apply() { document.body.classList.toggle('touch', this.on); R.resize(); },
  // キャンバスの大きさに合わせて配置（R.resize から呼ばれる）
  layout() {
    if (!this.el || !this.on) return;
    const r = R.canvas.getBoundingClientRect(), port = document.body.classList.contains('portrait');
    this.zone.style.height = port ? Math.max(140, innerHeight - r.bottom) + 'px' : '72%';
    const zh = this.zone.getBoundingClientRect().height || innerHeight * 0.72, R0 = this.rad();
    this.rx = Math.max(R0 + 14, innerWidth * (port ? 0.25 : 0.12)); this.ry = zh - R0 - (port ? innerHeight * 0.1 : 16);
    if (this.stickId === null) this.setStick(0, 0, false);
    if (port) { this.sys.style.top = (r.bottom + 10) + 'px'; this.sys.style.right = '12px'; this.hint.style.top = (r.bottom + 20) + 'px'; }
    else { this.sys.style.top = (r.top + r.height * 0.165) + 'px'; this.sys.style.right = Math.max(8, innerWidth - r.right + r.width * 0.014) + 'px'; }
  },
  // 毎フレーム：ゲームの状態に合わせて表示を切りかえ
  update() {
    if (!this.on || !this.el) return;
    const st = Game.state, play = st === 'play' || st === 'dead' || st === 'intro';
    if (play !== this.vis) { this.vis = play; this.el.classList.toggle('play', play); this.release(); if (play) this.layout(); }
    const f = !!(Game.player && Game.player.fire); if (f !== this.fireOn) { this.fireOn = f; this.fireBtn.classList.toggle('ready', f); }
    if (Snd.muted !== this.muted) { this.muted = Snd.muted; this.muteBtn.classList.toggle('off', Snd.muted); }
  },
  // (x,y) は 960x540 のゲーム画面座標
  tap(x, y) {
    const st = Game.state, mid = VW / 2;
    if (st === 'title') {
      if (y > 258 && y < 338 && Math.abs(x - (mid - 180)) < 56) Input.press('left');
      else if (y > 258 && y < 338 && Math.abs(x - (mid + 180)) < 56) Input.press('right');
      else Input.press('start');
    } else if (st === 'pause') { if (this.on && this.hit(x, y, 1, VH / 2 + 46)) Input.press('fire'); else Input.press('start'); }
    else if (st === 'gameover') { if (this.on && this.hit(x, y, 1, VH / 2 + 96)) Input.press('pause'); else Input.press('start'); }
    else if (st === 'clear' || st === 'ending') Input.press('start');
  },
  // 2つ並びボタン（0=左 / 1=右）の当たり判定。描画は Game.touchBtns と同じ配置
  hit(x, y, i, cy) { const bx = VW / 2 + (i ? 20 : -230); return x > bx && x < bx + 210 && y > cy - 30 && y < cy + 30; }
};
