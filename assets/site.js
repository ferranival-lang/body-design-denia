// Body Design Dénia · web 10K
// Portada: el vídeo avanza y retrocede con el scroll (estándar de scrub-pipeline.md).
const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
(() => {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rng = (seed) => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

  /* ---------- Partir titulares en palabras y letras (una vez, con semilla fija) ---------- */
  document.querySelectorAll('[data-split]').forEach((el, n) => {
    const text = el.textContent.trim();
    const mode = el.dataset.split;
    const r = rng(1234 + n * 77);
    const sr = document.createElement('span'); sr.className = 'vh-text'; sr.textContent = text;
    sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const words = text.split(' ');
    const total = text.replace(/ /g, '').length;
    let ci = 0;
    words.forEach((word, wi) => {
      const w = document.createElement('span'); w.className = 'w';
      w.style.setProperty('--th', (wi / Math.max(1, words.length) * 0.55).toFixed(3));
      if (mode === 'chars') {
        [...word].forEach((ch) => {
          const c = document.createElement('span'); c.className = 'c'; c.textContent = ch;
          c.style.setProperty('--th', (ci / total * 0.6 + r() * 0.05).toFixed(3));
          c.style.setProperty('--jx', ((r() - 0.5) * 18).toFixed(1) + 'px');
          w.appendChild(c); ci++;
        });
      } else w.textContent = word;
      vis.appendChild(w);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    el.textContent = ''; el.append(sr, vis);
  });

  /* ---------- Menú sólido al salir de la portada ---------- */
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');

  /* ---------- Portada con scrub ---------- */
  const stage = document.querySelector('.stage');
  const video = document.getElementById('hero-video');
  const posterLayer = document.querySelector('.poster');
  const ring = document.querySelector('.ring');
  const cue = document.querySelector('.cue');
  const word = stage.querySelector('.settle-word');
  const cut = stage.querySelector('.settle-cut');
  const A = (f) => new URL(f, SCRIPT_URL).href;   // rutas relativas a assets/, valgan desde / o desde /en/
  const VIDEO_URL = A('hero-scrub.mp4');
  const POSTER_URL = A('hero-poster.jpg');
  const VIDEO_BYTES = 4119482;

  const bands = [...stage.querySelectorAll('.band')].map((el, i, all) => ({
    el, a: +el.dataset.a, b: +el.dataset.b, ramp: +el.dataset.ramp || 0,
    first: i === 0, last: i === all.length - 1, op: -1, k: -1, ks: -1, kb: -1, on: null,
  }));

  const heroProgress = () => {
    const range = hero.offsetHeight - innerHeight;
    if (range <= 0) return 0;
    return clamp(-hero.getBoundingClientRect().top / range, 0, 1);
  };

  let loadK = 0;            // rampa de entrada de la banda 1 al cargar
  let last = { wo: -1, wk: -1, co: -1, cue: -1 };

  function setVar(el, name, v, cacheObj, key) {
    if (Math.abs(cacheObj[key] - v) < 0.008 && !(v === 0 || v === 1) ) return;
    if (cacheObj[key] === v) return;
    cacheObj[key] = v; el.style.setProperty(name, v.toFixed(3));
  }

  function updateCaptions(p) {
    for (const b of bands) {
      const f = Math.min(0.02, (b.b - b.a) / 3);
      const inn = b.first ? 1 : smoothstep(p, b.a, b.a + f);
      const out = b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      const op = (p < b.a && !b.first) || (p > b.b && !b.last) ? 0 : inn * out;
      let k = clamp((p - b.a) / (b.ramp || Math.min(0.025, (b.b - b.a) * 0.35)), 0, 1);
      if (b.first) k = Math.max(k, loadK);
      if (b.last) k = clamp((p - b.a) / 0.12, 0, 1); // la llegada se saborea más
      if (Math.abs(b.op - op) > 0.004 || (op === 0 && b.op !== 0) || (op === 1 && b.op !== 1)) { b.op = op; b.el.style.opacity = op.toFixed(3); }
      setVar(b.el, '--k', k, b, 'k');
      if (b.last) {
        setVar(b.el, '--ks', clamp((k - 0.66) * 4, 0, 1), b, 'ks');
        setVar(b.el, '--kb', clamp((k - 0.78) * 5, 0, 1), b, 'kb');
      }
      const on = op > 0.5;
      if (on !== b.on) { b.on = on; b.el.classList.toggle('is-on', on); b.el.toggleAttribute('inert', !on); }
    }
    // La palabra gigante y el chaleco recortado delante: solo en la llegada, cuando el vídeo ya casi no se mueve
    setVar(word, '--wo', smoothstep(p, 0.80, 0.93), last, 'wo');
    setVar(word, '--wk', smoothstep(p, 0.80, 1), last, 'wk');
    setVar(cut, '--co', smoothstep(p, 0.86, 0.95), last, 'co');
    setVar(cue, '--cue', 1 - smoothstep(p, 0.02, 0.06), last, 'cue');
  }

  /* Saltos del vídeo de uno en uno, sin bloqueos */
  let seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video.duration) return;
    t = clamp(t, 0, video.duration - 0.04);
    if (seekBusy) { pendingTime = t; return; }
    if (Math.abs(video.currentTime - t) < 0.01) return;
    seekBusy = true; video.currentTime = t;
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', () => { seekBusy = false; pendingTime = null; failVideo(); });

  /* Interpolación del tiempo mostrado, independiente de los Hz de la pantalla, y que descansa */
  let target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true;
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now)); lastTick = now;
    const k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    requestSeek(shown * (video.duration || 0));
    updateCaptions(shown);
  }
  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver((es) => { heroOnScreen = es[0].isIntersecting; if (heroOnScreen) onScroll(); }).observe(hero);

  /* Carga: primero el póster, luego el vídeo como Blob con anillo de progreso */
  let heroInited = false;
  function initHeroOnce() {
    if (heroInited) return; heroInited = true;
    posterLayer.style.backgroundImage = `url('${POSTER_URL}')`;
    if (cut.dataset.src) cut.src = cut.dataset.src;
    let started = false;
    const start = () => { if (started) return; started = true; loadHeroBlob().catch(failVideo); };
    const img = new Image(); img.onload = start; img.onerror = start; img.src = POSTER_URL;
    setTimeout(start, 4000);
    // banda 1 se monta sola al aparecer la página
    const t0 = performance.now();
    const ramp = (now) => { loadK = clamp((now - t0) / 1100, 0, 1); loadK = 1 - Math.pow(1 - loadK, 3); updateCaptions(shown); if (loadK < 1) requestAnimationFrame(ramp); };
    requestAnimationFrame(ramp);
  }
  async function loadHeroBlob() {
    if (location.protocol === 'file:') throw new Error('file');
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('http');
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = []; let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value); got += value.length;
      const frac = Math.min(1, got / total), now = performance.now();
      if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      requestSeek(heroProgress() * video.duration);
      stage.classList.add('video-ready');
    }, { once: true });
  }
  function failVideo() {
    stage.classList.add('video-failed');
    video.style.display = 'none';           // el póster sigue debajo; la web está completa sin vídeo
    posterLayer.style.backgroundImage = `url('${A('hero-ending.jpg')}')`;
  }

  /* Las cinco condiciones de portada fija: idénticas a las del CSS, y vivas */
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)',
  ];
  let scrubOn = false;
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach((b) => { b.op = -1; b.k = -1; b.ks = -1; b.kb = -1; b.on = null; });
    last = { wo: -1, wk: -1, co: -1, cue: -1 };
    unpinFinalStates();
    shown = target = heroProgress();
    updateCaptions(shown);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() { GATES.some((q) => matchMedia(q).matches) ? disableScrub() : enableScrub(); }
  const MQLS = GATES.map((q) => matchMedia(q));
  MQLS.forEach((m) => m.addEventListener('change', applyHeroMode));

  /* ---------- El pulso entre secciones: se dibuja con el scroll ---------- */
  const pulses = [...document.querySelectorAll('.pulse')].map((el) => ({ el, d: -1 }));
  let pulseRaf = null;
  function drawPulses() {
    pulseRaf = null;
    for (const p of pulses) {
      const r = p.el.getBoundingClientRect();
      const t = clamp((innerHeight - r.top) / (innerHeight * 0.7), 0, 1);
      const d = +(1 - t).toFixed(3);
      if (d !== p.d) { p.d = d; p.el.style.setProperty('--draw', d); }
    }
  }
  const onPulseScroll = () => { if (pulseRaf === null) pulseRaf = requestAnimationFrame(drawPulses); };

  /* ---------- Entradas de secciones, con escalonado que luego se retira ---------- */
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el);
      el.classList.add('in');
      setTimeout(() => el.classList.add('settled'), 900);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  const groups = new Map();
  document.querySelectorAll('[data-in]').forEach((el) => {
    const key = el.parentElement; const i = groups.get(key) || 0; groups.set(key, i + 1);
    el.style.setProperty('--d', Math.min(i * 90, 360) + 'ms');
    io.observe(el);
  });

  /* ---------- El momento interactivo: mantener pulsado para activar el chaleco ---------- */
  const vest = document.getElementById('chaleco');
  const hold = vest.querySelector('[data-hold]');
  const zones = [...vest.querySelectorAll('.z')];
  const legend = [...vest.querySelectorAll('.vest__legend li')];
  const HOLD_MS = 1600;
  let hp = 0, holding = false, done = false, holdRaf = null, holdLast = 0;
  function renderHold() {
    vest.style.setProperty('--hp', hp.toFixed(3));
    const lit = done ? zones.length : Math.floor(hp * zones.length + 0.0001);
    zones.forEach((z, i) => z.classList.toggle('on', i < lit));
    legend.forEach((l, i) => l.classList.toggle('on', i < lit));
  }
  function holdTick(now) {
    const dt = Math.min(64, now - (holdLast || now)); holdLast = now;
    if (holding) hp = Math.min(1, hp + dt / HOLD_MS);
    else hp = Math.max(0, hp - (dt / 500) * Math.max(hp, 0.15)); // al soltar baja despacio, nunca de golpe
    if (hp >= 1 && !done) finishHold();
    renderHold();
    if (!done && (holding || hp > 0)) holdRaf = requestAnimationFrame(holdTick);
    else { holdRaf = null; holdLast = 0; }
  }
  function finishHold() {
    done = true; holding = false; hp = 1;
    vest.classList.add('is-done');
    hold.querySelector('.hold__label').textContent = hold.dataset.doneLabel || 'Chaleco activado';
    hold.setAttribute('aria-pressed', 'true');
    renderHold();
  }
  function startHold(e) {
    if (done) return;
    if (e && e.pointerId !== undefined) hold.setPointerCapture?.(e.pointerId);
    holding = true;
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdTick);
  }
  function endHold() { holding = false; if (holdRaf === null && !done && hp > 0) holdRaf = requestAnimationFrame(holdTick); }
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); startHold(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => hold.addEventListener(t, endHold));
  hold.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } });
  hold.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') endHold(); });
  hold.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Movimiento reducido en vivo, en los dos sentidos ---------- */
  function pinToFinalStates() {
    pulses.forEach((p) => { p.d = 0; p.el.style.setProperty('--draw', 0); });
    removeEventListener('scroll', onPulseScroll);
    if (!done) finishHold();
    document.querySelectorAll('[data-in]').forEach((el) => el.classList.add('in', 'settled'));
  }
  function unpinFinalStates() {
    addEventListener('scroll', onPulseScroll, { passive: true });
    drawPulses();
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  reduce.addEventListener('change', (e) => { if (e.matches) pinToFinalStates(); });

  /* ---------- Menú, pestaña oculta ---------- */
  const onNav = () => nav.classList.toggle('is-solid', scrollY > hero.offsetHeight - innerHeight + 40);
  addEventListener('scroll', onNav, { passive: true });
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  /* ---------- Formulario → WhatsApp ---------- */
  document.querySelectorAll('form[data-wa]').forEach((form) => {
    const v = (id) => (form.querySelector('#' + id)?.value || '').trim();
    const fill = (tpl, key, val) => tpl.replace('{' + key + '}', val);
    const status = form.querySelector('[data-status]');
    const checks = [['t-name', 't-name-err'], ['t-service', 't-service-err']];
    form.addEventListener('submit', (e) => {
      let bad = 0;
      checks.forEach(([id, err]) => {
        const ok = v(id) !== '';
        form.querySelector('#' + id).setAttribute('aria-invalid', String(!ok));
        form.querySelector('#' + err).hidden = ok;
        if (!ok) bad++;
      });
      if (bad) { e.preventDefault(); status.textContent = form.dataset.msgFix || 'Revisa los campos marcados.'; form.querySelector('[aria-invalid="true"]').focus(); return; }
      const d = form.dataset, service = v('t-service');
      const parts = [fill(d.msgHello, 'name', v('t-name'))];
      parts.push(service && service !== '?' ? fill(d.msgService, 'service', service) : d.msgGeneric);
      if (v('t-goal')) parts.push(fill(d.msgGoal, 'goal', v('t-goal')));
      if (v('t-time')) parts.push(fill(d.msgTime, 'time', v('t-time')));
      form.querySelector('input[name="text"]').value = parts.join(' ');
      status.textContent = form.dataset.msgOk || 'Se abre WhatsApp con tu mensaje listo. Solo tienes que pulsar enviar.';
    });
  });

  /* ---------- Arranque ---------- */
  if (reduce.matches) pinToFinalStates(); else unpinFinalStates();
  applyHeroMode();
  if (!scrubOn) updateCaptions(1);
  onNav();
})();
