// Touch controls, shown only on touch devices (coarse primary pointer, ?touch=1, or the first real touch):
//   left side  floating virtual stick (move)      rest of the screen  drag to look      buttons: FIRE, GRAPPLE, JUMP, CROUCH (hold), USE (E), LIGHT, SPRINT (toggle),
//   TOOL (V), and in Systems Nominal BOARD (J) / RADIO (H); a MENU button pauses.  Everything goes through synthetic keys / G.act so the keyboard code paths are the only ones.
import { keyDown, keyUp, keyTap, setMove, canSteer, lookBy } from './vkeys.js';

const CSS = `#touch{position:fixed;inset:0;z-index:9;display:none;pointer-events:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none;font-family:var(--f-d,sans-serif)}
#touch.on{display:block}#touch *{-webkit-tap-highlight-color:transparent;touch-action:none}
#touch .tz{position:absolute;pointer-events:auto}#touch .tz-look{inset:0}#touch .tz-move{left:0;bottom:0;width:42%;height:62%}
#touch .stick{position:absolute;width:128px;height:128px;margin:-64px 0 0 -64px;border-radius:50%;border:2px solid rgba(160,200,255,.45);background:rgba(20,30,50,.28);display:none}
#touch .stick.on{display:block}#touch .knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(190,220,255,.55);border:2px solid rgba(220,240,255,.8)}
#touch .tb{position:absolute;pointer-events:auto;display:flex;align-items:center;justify-content:center;border-radius:50%;width:var(--s,58px);height:var(--s,58px);font-size:11px;font-weight:800;letter-spacing:.06em;color:#dfeaff;background:rgba(20,32,54,.55);border:2px solid rgba(160,200,255,.5);text-transform:uppercase}
#touch .tb.dn,#touch .tb.tg{background:rgba(242,160,61,.6);color:#150c00;border-color:#ffd9a0}#touch .tb.fire{--s:84px;right:max(18px,env(safe-area-inset-right));bottom:max(26px,env(safe-area-inset-bottom));border-color:#ff9a8a}
#touch .tb.alt{right:112px;bottom:30px}#touch .tb.jump{right:24px;bottom:122px}#touch .tb.use{right:100px;bottom:104px}#touch .tb.crouch{right:176px;bottom:64px}
#touch .tb.light{--s:46px;right:24px;top:90px}#touch .tb.tool{--s:46px;right:78px;top:90px}#touch .tb.sprint{left:max(18px,env(safe-area-inset-left));bottom:46%}
#touch .tb.board,#touch .tb.radio{--s:46px;display:none;top:90px}#touch .tb.board{right:132px}#touch .tb.radio{right:186px}body.nominal #touch .tb.board,body.nominal #touch .tb.radio{display:flex}
#touch .tb.menu{--s:40px;right:max(12px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top))}
@media (max-height:420px){#touch .tb{--s:48px}#touch .tb.fire{--s:68px}#touch .tb.jump{bottom:100px}#touch .tb.use{bottom:84px;right:84px}#touch .tb.crouch{right:150px}#touch .tb.alt{right:96px}}
body.has-touch #cross{opacity:.7}body.has-touch #ui-resume{display:none!important}`;

/** pure: stick offset (px) -> unit vector with a dead zone; r = radius */
export function stickVec(dx, dy, r = 56, dz = 0.12) { const l = Math.hypot(dx, dy) / r; if (l < dz) return [0, 0]; const k = Math.min(1, (l - dz) / (1 - dz)) / (Math.hypot(dx, dy) / r); return [dx / r * k, dy / r * k]; }
export function isTouchDevice(win = globalThis) {
  try { const q = new URLSearchParams(win.location?.search || ''); if (q.get('touch') === '1') return true; if (q.get('touch') === '0') return false; return !!(win.matchMedia?.('(pointer: coarse)').matches); } catch (e) { return false; }
}

export function initTouch({ G, CFG, act }) {
  const doc = document; let built = false, root, stick, knob, sprintOn = false, shown = false;
  const state = { move: null, look: null };
  const LOOK = 0.0052;
  function build() {
    if (built) return; built = true; document.body.classList.add('has-touch');
    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    root = doc.createElement('div'); root.id = 'touch'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `<div class="tz tz-look"></div><div class="tz tz-move"></div><div class="stick"><div class="knob"></div></div>
      <div class="tb fire" data-a="fire">Fire</div><div class="tb alt" data-a="alt">Hook</div><div class="tb jump" data-k="Space">Jump</div><div class="tb use" data-k="KeyE">Use</div>
      <div class="tb crouch" data-h="KeyC">Crouch</div><div class="tb light" data-k="KeyF">Light</div><div class="tb tool" data-k="KeyV">Tool</div>
      <div class="tb board" data-k="KeyJ">Board</div><div class="tb radio" data-k="KeyH">Radio</div><div class="tb sprint" data-t="sprint">Run</div><div class="tb menu" data-a="pause">| |</div>`;
    doc.body.appendChild(root); stick = root.querySelector('.stick'); knob = root.querySelector('.knob');
    const zl = root.querySelector('.tz-look'), zm = root.querySelector('.tz-move');
    zm.addEventListener('pointerdown', (e) => { if (state.move) return; zm.setPointerCapture?.(e.pointerId); state.move = { id: e.pointerId, x: e.clientX, y: e.clientY }; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on'); knob.style.transform = ''; e.preventDefault(); });
    zm.addEventListener('pointermove', (e) => { const m = state.move; if (!m || m.id !== e.pointerId) return; let dx = e.clientX - m.x, dy = e.clientY - m.y; const l = Math.hypot(dx, dy); if (l > 56) { dx *= 56 / l; dy *= 56 / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; const [vx, vz] = stickVec(dx, dy); setMove(G, 'touch', vx, vz); e.preventDefault(); });
    const endMove = (e) => { const m = state.move; if (!m || m.id !== e.pointerId) return; state.move = null; stick.classList.remove('on'); setMove(G, 'touch', 0, 0); };
    zm.addEventListener('pointerup', endMove); zm.addEventListener('pointercancel', endMove);
    zl.addEventListener('pointerdown', (e) => { if (state.look) return; zl.setPointerCapture?.(e.pointerId); state.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.preventDefault(); });
    zl.addEventListener('pointermove', (e) => { const l = state.look; if (!l || l.id !== e.pointerId) return; if (canSteer(G)) lookBy(G, CFG, (e.clientX - l.x) * LOOK, (e.clientY - l.y) * LOOK); l.x = e.clientX; l.y = e.clientY; e.preventDefault(); });
    const endLook = (e) => { if (state.look?.id === e.pointerId) state.look = null; }; zl.addEventListener('pointerup', endLook); zl.addEventListener('pointercancel', endLook);
    for (const b of root.querySelectorAll('.tb')) {
      const k = b.dataset.k, h = b.dataset.h, a = b.dataset.a, t = b.dataset.t;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); b.classList.add('dn');
        if (k) keyDown(k); else if (h) keyDown(h); else if (a === 'fire') act?.fire(); else if (a === 'alt') act?.alt(); else if (a === 'pause') act?.pause();
        else if (t === 'sprint') { sprintOn = !sprintOn; b.classList.toggle('tg', sprintOn); (sprintOn ? keyDown : keyUp)('ShiftLeft'); } });
      const up = () => { b.classList.remove('dn'); if (k) keyUp(k); else if (h) keyUp(h); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  function releaseAll() { state.move = null; state.look = null; stick?.classList.remove('on'); setMove(G, 'touch', 0, 0); if (sprintOn) { sprintOn = false; root?.querySelector('.sprint')?.classList.remove('tg'); keyUp('ShiftLeft'); } for (const c of ['KeyC']) keyUp(c); }
  function tick() {
    if (!built) return; const on = canSteer(G);
    if (on !== shown) { shown = on; root.classList.toggle('on', on); if (!on) releaseAll(); }
  }
  if (isTouchDevice()) build();
  else addEventListener('touchstart', function once() { removeEventListener('touchstart', once, true); build(); }, { capture: true, passive: true });
  (G.ticks || (G.ticks = [])).push(tick);
  return { build, tick, get on() { return shown; } };
}
