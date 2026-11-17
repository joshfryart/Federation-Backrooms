// Loading overlay (#boot in index.html): one full-screen layer used twice — at page start (models, textures, lighting, crew files, uniform prewarm) and when a run
// starts (ship / crew / deck 1 generation, shader compile, every crew portrait for the radio / duty menus). The overlay's markup is static HTML and its motion is pure CSS,
// so it is on screen and animating before any module runs and keeps moving while the main thread is busy; the bar and status line are updated between chunks of work.
//   Loading.show(title, sub)       show the overlay with a fresh bar
//   Loading.set(frac, status)      0..1 bar + status text (never goes backwards within one show())
//   Loading.ready(label, onGo)     bar full: show an "enter" button; onGo() runs on click (a user gesture, so pointer lock works), then the overlay hides
//   Loading.hide(instant)          hide now (instant = no fade; tests)
//   paint()                        resolves after the browser has had a chance to paint (rAF + a timeout fallback so a hidden tab cannot stall it)
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
export const paint = () => new Promise((res) => { let done = false; const go = () => { if (!done) { done = true; res(); } }; if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 80); });
let high = 0;
export const Loading = {
  show(title = 'Loading', sub = '') {
    const el = $('boot'); if (!el) return; high = 0;
    $('boot-title').textContent = title; $('boot-sub').textContent = sub; $('boot-fill').style.transform = 'scaleX(0)'; $('boot-pct').textContent = '0%'; $('boot-status').textContent = '';
    $('boot-go').style.display = 'none'; el.classList.remove('instant'); el.classList.add('show');
  },
  set(frac, status) {
    const el = $('boot'); if (!el) return; high = Math.max(high, Math.max(0, Math.min(1, frac)));
    $('boot-fill').style.transform = `scaleX(${high.toFixed(4)})`; $('boot-pct').textContent = Math.round(high * 100) + '%'; if (status !== undefined) $('boot-status').textContent = status;
  },
  ready(label, onGo) {
    const el = $('boot'), b = $('boot-go'); if (!el || !b) { onGo?.(); return; }
    Loading.set(1, 'Ready'); b.textContent = label; b.style.display = 'inline-block'; b.focus?.();
    b.onclick = (e) => { e.stopPropagation(); b.onclick = null; Loading.hide(); onGo?.(); };
  },
  hide(instant = false) { const el = $('boot'); if (!el) return; if (instant) el.classList.add('instant'); el.classList.remove('show'); },
  get visible() { return !!$('boot')?.classList.contains('show'); },
};
