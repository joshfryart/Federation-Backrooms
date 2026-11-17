// LCARS-style button system: the few behaviours css/lcars-buttons.css cannot do on its own (specimen: docs/buttons.html).
//   - Calm visuals (pause menu #calm, saved in fb_cfg) adds body.lc-calm, which stops button glow animations and transitions
//   - range sliders get --lc-v (filled share of the track) so the track fills up to the thumb
//   - small <select>s in the pause menu (#qsel, #vsel) are mirrored as a segmented control; the select stays in the DOM
//     (visually hidden, same id, value and change event), so main.js and the tests keep using it unchanged
//   - a soft two-tone blip on button clicks through the game's own sound system (window.__game.sound); silent before audio starts
// Standalone: imports nothing, touches no game state, and every step is a no-op when its element is missing.

const $ = (id) => document.getElementById(id);
const CLICKABLE = 'button, .btn, .act, #nv-map .dk, #nv-map .find span, #liftui .lr, #bd-menu .o, #perkscreen .card, .lc-btn, .lc-tab, .lc-tile, .lc-row, .settings input[type=checkbox], .lc-toggle';

function calm() {
  let on = false; try { on = !!JSON.parse(localStorage.getItem('fb_cfg') || '{}').calm; } catch { /* no storage */ }
  const box = $('calm'); if (box) on = box.checked || on;
  document.body.classList.toggle('lc-calm', on);
  box?.addEventListener('change', () => document.body.classList.toggle('lc-calm', box.checked));
}

const fill = (r) => { const lo = +r.min || 0, hi = +r.max || 100, v = Math.max(0, Math.min(1, ((+r.value) - lo) / ((hi - lo) || 1))); r.style.setProperty('--lc-v', (v * 100).toFixed(1) + '%'); };
function ranges() {
  const all = () => document.querySelectorAll('.settings input[type=range], input.lc-range');
  all().forEach((r) => { fill(r); r.addEventListener('input', () => fill(r)); r.addEventListener('change', () => fill(r)); });
  return () => all().forEach(fill);
}

// <select> -> segmented control. Short labels drop a trailing "(...)"; the full option text is the tooltip.
function mirror(sel) {
  if (!sel || sel.dataset.lcSeg) return null; sel.dataset.lcSeg = '1';
  const seg = document.createElement('div'); seg.className = 'lc-seg lc-mini'; seg.setAttribute('role', 'group');
  const lab = sel.closest('label'); if (lab) seg.setAttribute('aria-label', lab.firstChild?.textContent?.trim() || sel.id);
  for (const o of sel.options) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.v = o.value; b.title = o.textContent; b.textContent = o.textContent.replace(/\s*\(.*\)\s*$/, '');
    b.addEventListener('click', (e) => { e.preventDefault(); if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } sync(); });
    seg.appendChild(b);
  }
  const sync = () => seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === sel.value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  sel.classList.add('lc-sr'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true'); sel.after(seg); sel.addEventListener('change', sync); sync();
  return sync;
}

function blip() {
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest(CLICKABLE) : null; if (!t || t.disabled || t.classList.contains('off')) return;
    const s = window.__game?.sound; if (!s?.tone) return;
    try { s.tone(1568, 0.045, 'sine', 0.05); s.tone(2093, 0.05, 'sine', 0.035, 0, 0.04); } catch { /* audio not ready */ }
  }, true);
}

function init() {
  calm(); const refill = ranges(); const syncs = [mirror($('qsel')), mirror($('vsel'))].filter(Boolean); blip();
  // main.js sets the saved values (and setQuality may change #qsel) without firing events: resync whenever the pause screen opens
  const pause = $('pause'); const resync = () => { refill(); syncs.forEach((f) => f()); };
  if (pause) new MutationObserver(resync).observe(pause, { attributes: true, attributeFilter: ['class'] });
  setTimeout(resync, 0); window.addEventListener('load', resync);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
export { mirror, fill };
