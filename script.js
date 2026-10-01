'use strict';

/* ==========================================================
   >>> PUT YOUR TELEGRAM CHANNEL URL HERE (the ONLY place) <<<
   Example: "https://t.me/mychannel"
   ========================================================== */
const TELEGRAM_CHANNEL_URL = "https://t.me/SehnsuchtDUCK";

(() => {
  /* ---------- Loading sequence config ---------- */
  const LOADING_SEQUENCE = [
    { text: 'Damn.',  ms: 760 },
    { text: 'Damn..', ms: 540 },
    { text: 'Damn...',  ms: 460 },
    { text: 'Damn.', ms: 640 },
    { text: 'Damn..',  ms: 980 },
    { text: 'Damn...',  ms: 760 },
    { text: 'Damn.', ms: 540 },
    { text: 'Damn..',  ms: 460 },
    { text: 'Damn...', ms: 640 },
    { text: 'Damn.',  ms: 980 }
  ];
  const MAX_WAIT_MS = 10000;   // failsafe: never keep the visitor waiting forever
  const FADE_MS = 1400;        // must match .loader transition in style.css

  /* ---------- Elements ---------- */
  const body = document.body;
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loader-text');
  const duck = document.getElementById('duck');
  const cta = document.getElementById('cta');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene-canvas');
  const ctx = canvas.getContext('2d');
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (a, n) => ((a % n) + n) % n;

  // Smooth pseudo-noise in [-1, 1]: three sines with irrational ratios,
  // so the motion never visibly repeats.
  const wave = (t, f, p) =>
    (Math.sin(t * f + p) + 0.6 * Math.sin(t * f * 1.618 + p * 2.3) + 0.35 * Math.sin(t * f * 2.414 + p * 3.7)) / 1.95;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ==========================================================
     Scene data
     ========================================================== */
  function makeSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)');
    gr.addColorStop(0.4, 'rgba(' + rgb + ',0.42)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  const sprites = [
    makeSprite('122,58,190'),
    makeSprite('88,38,150'),
    makeSprite('156,96,224')
  ];

  const rnd = mulberry32(7);                                  // mist: fixed composition
  const rndS = mulberry32((Math.random() * 1e9) | 0);          // stars + dust: new sky every visit

  // Mist: 3 big faint haze layers first, then 18 aurora blobs on 3 depth layers.
  // Mobile draws only the first 12 entries.
  const LAYER_DEPTH = [0.1, 0.22, 0.4];   // mouse parallax (very small)
  const LAYER_WIND = [10, 60, 49];          // px/s drift, far layers slower
  const blobs = [];
  for (let i = 0; i < 3; i++) {
    blobs.push({
      nx: rnd(), ny: 0.3 + rnd() * 0.4, size: 0.85 + rnd() * 0.25, asp: 0.55 + rnd() * 0.25,
      a: 0.12 + rnd() * 0.05, s: 1, depth: 0.05, wind: 2 + rnd() * 2,
      f: 0.012 + rnd() * 0.012, ph: rnd() * TAU, amp: 0.05
    });
  }
  for (let i = 0; i < 18; i++) {
    const layer = i % 3;
    blobs.push({
      nx: rnd(), ny: 0.18 + rnd() * 0.55, size: 0.2 + rnd() * 0.24, asp: 0.8 + rnd() * 1.2,
      a: 0.28 + rnd() * 0.24, s: layer === 2 ? 2 : (rnd() < 0.5 ? 0 : 1),
      depth: LAYER_DEPTH[layer], wind: LAYER_WIND[layer] * (0.7 + rnd() * 0.6),
      f: 0.018 + rnd() * 0.03, ph: rnd() * TAU, amp: 0.08
    });
  }

  // Stars: tiny square pixels. Every star has its own drift, wander, twinkle
  // rhythm, "off" depth and (for some) rare flares, so nothing moves in sync.
  const STAR_MAX = 340;
  const stars = [];
  for (let i = 0; i < STAR_MAX; i++) {
    const r = rndS();
    let size, d, base, lo, pw;
    if (r < 0.76)      { size = 1; d = 0.25 + rndS() * 0.35; base = 0.7 + rndS() * 0.3;  lo = 0.08 + rndS() * 0.3;  pw = 1.1 + rndS() * 1.3; }
    else if (r < 0.94) { size = 2; d = 0.6 + rndS() * 0.35;  base = 0.8 + rndS() * 0.2;  lo = 0.15 + rndS() * 0.35; pw = 1.0 + rndS() * 0.9; }
    else               { size = rndS() < 0.35 ? 4 : 3; d = 1 + rndS() * 0.5; base = 1;   lo = 0.5 + rndS() * 0.25;  pw = 1.0; }
    const flares = rndS() < 0.4;
    stars.push({
      nx: rndS(), ny: rndS(), size: size, d: d, base: base, lo: lo, pw: pw,
      fill: rndS() < 0.35 ? 'rgb(205,170,255)' : 'rgb(255,255,255)',
      // twinkle: two independent waves (higher number = faster blink)
      f1: 0.2 + rndS() * 4, f2: 0.1 + rndS() * 3,
      p1: rndS() * TAU, p2: rndS() * TAU,
      // drift (px/s, scaled by depth) + gentle wander around the drifting position
      vx: 0.4 + (rndS() - 0.5) * 2.4, vy: (rndS() - 0.5) * 1.4,
      wa: 2 + rndS() * 6, wf: 0.05 + rndS() * 0.15, wp: rndS() * TAU,
      // rare flare: now and then a star briefly glows brighter
      fl: flares, next: flares ? rndS() * 60 : Infinity, fd: 1.4 + rndS() * 2
    });
  }

  // Dust: a few tiny motes drifting almost imperceptibly (foreground depth)
  const DUST_MAX = 16;
  const dust = [];
  for (let i = 0; i < DUST_MAX; i++) {
    dust.push({
      nx: rndS(), ny: rndS(), d: 1.2 + rndS() * 0.7, size: rndS() < 0.8 ? 1 : 2,
      vx: 1.5 + rndS() * 3, vy: -(1 + rndS() * 2.5),
      f: 0.15 + rndS() * 0.25, p: rndS() * TAU
    });
  }

  /* ==========================================================
     Canvas setup (mist is rendered small, then scaled up)
     ========================================================== */
  const mist = document.createElement('canvas');
  const mctx = mist.getContext('2d');

  let W = 0, H = 0, dpr = 1, ms = 0.4, mobile = false;
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    mobile = coarseQuery.matches || W < 700;
    ms = mobile ? 0.3 : 0.4;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    mist.width = Math.max(1, Math.ceil(W * ms));
    mist.height = Math.max(1, Math.ceil(H * ms));
    if (!running) draw(0);
  }

  /* ==========================================================
     Drawing
     ========================================================== */
  function draw(t) {
    const A = Math.min(W, H) * 0.02 + 4;           // mouse parallax: secondary, subtle
    const ox = -cur.x * A;
    const oy = -cur.y * A * 0.7;
    const S = Math.max(W, H * 0.8);
    const breathe = 0.92 + 0.08 * wave(t, 0.05, 1.3);   // whole-atmosphere intensity

    /* --- Mist (low-res offscreen) --- */
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mist.width, mist.height);
    mctx.globalCompositeOperation = 'lighter';

    // Soft distant glow behind the centre
    {
      const gw = S * 0.9;
      const gh = gw * (0.62 + 0.06 * wave(t, 0.03, 4.1));
      mctx.setTransform(ms, 0, 0, ms, (W * 0.5 + ox * 0.05) * ms, (H * 0.48 + oy * 0.05) * ms);
      mctx.globalAlpha = clamp(0.26 * breathe * (0.85 + 0.15 * wave(t, 0.04, 2.2)), 0, 1);
      mctx.drawImage(sprites[1], -gw / 2, -gh / 2, gw, gh);
    }

    const n = mobile ? 12 : blobs.length;
    for (let i = 0; i < n; i++) {
      const b = blobs[i];
      const w0 = S * b.size * 2;                   // generous wrap margin (fully off-screen at the seam)
      const span = W + w0;
      const wx = wave(t, b.f, b.ph) * S * b.amp;
      const wy = wave(t, b.f * 0.9, b.ph + 2.1) * H * b.amp;
      const bx = -w0 / 2 + mod(b.nx * span + t * b.wind + wx, span) + ox * b.depth;
      const by = b.ny * H + wy + oy * b.depth;
      const w = S * b.size * (1 + 0.2 * wave(t, b.f * 1.3, b.ph + 4.2));
      const h = S * b.size * b.asp * (1 + 0.2 * wave(t, b.f * 1.1, b.ph + 7.7));
      const rot = wave(t, b.f * 0.7, b.ph + 0.9) * 0.35;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      mctx.setTransform(cs * ms, sn * ms, -sn * ms, cs * ms, bx * ms, by * ms);
      mctx.globalAlpha = clamp(b.a * breathe * (0.65 + 0.35 * wave(t, b.f * 1.1, b.ph + 5.5)), 0, 1);
      mctx.drawImage(sprites[b.s], -w / 2, -h / 2, w, h);
    }
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = 'source-over';

    /* --- Main canvas: mist scaled up, then crisp stars --- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(mist, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = mobile
      ? clamp(Math.round((W * H) / 4700), 60, 110)
      : clamp(Math.round((W * H) / 3400), 90, STAR_MAX);
    const pad = A * 1.6 + 24;                        // wrap seam stays off-screen (parallax + wander)
    const ww = W + pad * 2;
    const hh = H + pad * 2;
    for (let i = 0; i < count; i++) {
      const s = stars[i];
      const x = Math.round(-pad + mod(s.nx * ww + t * s.vx * s.d, ww) + Math.sin(t * s.wf + s.wp) * s.wa + ox * s.d);
      const y = Math.round(-pad + mod(s.ny * hh + t * s.vy * s.d, hh) + Math.cos(t * s.wf * 0.83 + s.wp * 1.9) * s.wa + oy * s.d);
      if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
      const u = (Math.sin(t * s.f1 + s.p1) + Math.sin(t * s.f2 + s.p2)) * 0.25 + 0.5;  // 0..1
      let alpha = s.base * (s.lo + (1 - s.lo) * Math.pow(u, s.pw));
      if (s.fl) {                                    // occasional soft flare
        const e = t - s.next;
        if (e >= s.fd) s.next = t + 15 + Math.random() * 60;
        else if (e > 0) alpha = Math.min(1, alpha + 0.6 * Math.sin((e / s.fd) * Math.PI));
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.fill;
      ctx.fillRect(x, y, s.size, s.size);
    }

    const dn = mobile ? 8 : DUST_MAX;
    const pad2 = A * 2.2 + 4;
    const dw = W + pad2 * 2;
    const dh = H + pad2 * 2;
    ctx.fillStyle = 'rgb(200,160,255)';
    for (let i = 0; i < dn; i++) {
      const p = dust[i];
      const x = Math.round(-pad2 + mod(p.nx * dw + t * p.vx, dw) + ox * p.d);
      const y = Math.round(-pad2 + mod(p.ny * dh + t * p.vy, dh) + oy * p.d);
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
      const u = 0.5 + 0.5 * Math.sin(t * p.f + p.p);
      ctx.globalAlpha = 0.5 * u * u;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Button floats very slightly with the view
    stage.style.transform = 'translate3d(' + (-cur.x * 3).toFixed(2) + 'px,' + (-cur.y * 2).toFixed(2) + 'px,0)';
  }

  /* ---------- Animation loop (runs during loading too) ---------- */
  let running = false;
  let rafId = 0;
  let last = 0;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (mobile && now - last < 28) return;       // ~30fps on phones
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const k = 1 - Math.exp(-dt * 2.2);           // frame-rate independent easing
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    draw(now / 1000);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function applyMotionPreference() {
    if (reduceQuery.matches) {
      stop();
      target.x = target.y = cur.x = cur.y = 0;
      draw(0);                                   // single static frame
    } else {
      start();
    }
  }

  /* ---------- Pointer / touch input (secondary) ---------- */
  window.addEventListener('pointermove', function (e) {
    if (reduceQuery.matches) return;
    target.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    target.y = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
  }, { passive: true });

  document.documentElement.addEventListener('mouseleave', function () {
    target.x = 0;
    target.y = 0;
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', applyMotionPreference);
  }

  /* ==========================================================
     Button -> Telegram
     ========================================================== */
  cta.addEventListener('click', function () {
    const w = window.open(TELEGRAM_CHANNEL_URL, '_blank');
    if (w) {
      w.opener = null;                           // safety without breaking the popup check
    } else {
      window.location.href = TELEGRAM_CHANNEL_URL; // popup blocked -> same tab
    }
  });

  /* ==========================================================
     Loading sequence
     ========================================================== */
  const startTime = performance.now();

  const pageLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(function (res) { window.addEventListener('load', res, { once: true }); });

  const duckReady = new Promise(function (res) {
    if (!duck || duck.complete) { res(); return; }
    duck.addEventListener('load', res, { once: true });
    duck.addEventListener('error', res, { once: true });
  });

  let ready = false;
  Promise.all([pageLoaded, duckReady]).then(function () { ready = true; });

  function finishLoading() {
    loader.classList.add('is-done');             // fades duck + text out
    body.classList.remove('is-loading');
    body.classList.add('is-ready');              // scene brightens gradually, button fades in
    setTimeout(function () { loader.remove(); }, FADE_MS + 100); // gone for good
  }

  function runLoader() {
    let i = 0;
    function step() {
      const item = LOADING_SEQUENCE[i];
      loaderText.textContent = item.text;
      const wait = item.ms * (0.8 + Math.random() * 0.5);   // slightly irregular timing
      setTimeout(function () {
        i++;
        if (i >= LOADING_SEQUENCE.length) {
          if (ready || performance.now() - startTime > MAX_WAIT_MS) {
            finishLoading();
            return;
          }
          i = 0;                                  // not ready yet: repeat the sequence
        }
        step();
      }, wait);
    }
    step();
  }

  /* ---------- Init ---------- */
  resize();
  applyMotionPreference();
  runLoader();
})();