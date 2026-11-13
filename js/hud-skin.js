// HUD skin helpers (pure presentation, no game logic): numeric readouts for the vitals bars, the "quiet when fine" fade, the ship-time
// readout in the identity plate, and a few state classes on <body> that css/hud-skin.css styles (hp-low, st-low). Reads the DOM the game
// already writes (#hpbar / #stbar widths) and the public __game handle; never writes game state. See docs/hud-review.md.
const $ = (id) => document.getElementById(id);
const pct = (el) => { const w = parseFloat(el?.style.width); return Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : 100; };
let lastChange = 0, hp = 100, st = 100;

function readVitals() {
  const a = pct($('hpbar')), b = pct($('stbar')), now = performance.now();
  if (Math.abs(a - hp) > 0.4 || Math.abs(b - st) > 0.4) lastChange = now;
  hp = a; st = b;
  const hn = $('hpnum'), sn = $('stnum'); if (hn) hn.textContent = Math.round(a); if (sn) sn.textContent = Math.round(b);
  document.body.classList.toggle('hp-low', a < 35); document.body.classList.toggle('st-low', b < 25);
  $('bars')?.classList.toggle('calm', a > 99 && b > 99 && now - lastChange > 4000);
}
function readClock() {
  try { const h = window.__game?.clock?.hour, el = $('shiptime'); if (h == null || !el) return; const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60); el.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); } catch { }
}
/** one UI scale for the whole HUD: 1 at 1280x720, up to 1.5 on 1080p and beyond, down to .8 on small windows (css/hud-skin.css: --z, rem units, zoom on panels) */
function scale() { const z = Math.max(0.8, Math.min(1.5, Math.min(innerWidth / 1280, innerHeight / 720))); document.documentElement.style.setProperty('--z', z.toFixed(3)); }
function mount() {
  scale(); addEventListener('resize', scale);
  const obs = new MutationObserver(readVitals);
  for (const id of ['hpbar', 'stbar']) { const e = $(id); if (e) obs.observe(e, { attributes: true, attributeFilter: ['style'] }); }
  readVitals(); readClock();
  setInterval(() => { readClock(); readVitals(); }, 500);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount(); }
