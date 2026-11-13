// Combat HUD for Systems Nominal hand-to-hand (js/grapple.js). Owns a few STABLE DOM ids / classes that the HUD artist may restyle
// (docs/combat.md lists them); the CSS here is deliberately minimal and neutral. No game logic: update(state) mirrors Melee.hudState().
//   #cb-hud                       container (pointer-events none); body.cb-engaged while a fight / hold / guard is on
//   #cb-stance  .cb-chip          stance chip: data-stance = relaxed | fists | handsup  (hidden when relaxed)
//   #cb-ring    svg .cb-ring-fg   grab / struggle ring around the crosshair: data-state = reach | grabbed | held | grabbed-you; --cb-struggle 0..1
//   #cb-target  .cb-name .cb-bar>i .cb-pips>.cb-pip(.on)   target health bar + 5 stun pips; data-state = ok | hurt | dazed | stunned | out | dead
//   #cb-restrained                'RESTRAINED' marker: on the target panel when they are pinned / detained, full-width when YOU are restrained
//   #cb-hint                      one short control hint line;  #cb-flash  red edge flash when you are hit
const CSS = `
#cb-hud{position:fixed;inset:0;pointer-events:none;z-index:6;font:12px/1.2 system-ui,sans-serif;color:#e8edf2}
#cb-hud .cb-chip{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);padding:2px 8px;border:1px solid rgba(255,255,255,.35);border-radius:3px;background:rgba(10,14,20,.55);letter-spacing:.08em;text-transform:uppercase;display:none}
#cb-hud .cb-chip[data-stance=fists],#cb-hud .cb-chip[data-stance=handsup]{display:block}
#cb-ring{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;display:none}
#cb-ring[data-state]{display:block}#cb-ring circle{fill:none;stroke-width:3}#cb-ring .cb-ring-bg{stroke:rgba(255,255,255,.18)}#cb-ring .cb-ring-fg{stroke:#e8edf2;transform:rotate(-90deg);transform-origin:50% 50%;stroke-dasharray:125.7;stroke-dashoffset:calc(125.7 * (1 - var(--cb-struggle,0)))}
#cb-ring[data-state=grabbed-you] .cb-ring-fg{stroke:#ff8a7a}
#cb-target{position:absolute;left:50%;top:calc(50% - 74px);transform:translateX(-50%);min-width:120px;text-align:center;display:none}
#cb-target.on{display:block}#cb-target .cb-name{opacity:.85;margin-bottom:2px}#cb-target .cb-bar{height:4px;background:rgba(255,255,255,.18)}#cb-target .cb-bar>i{display:block;height:100%;background:#e8edf2;width:100%}
#cb-target .cb-pips{display:flex;gap:3px;justify-content:center;margin-top:3px}#cb-target .cb-pip{width:6px;height:6px;border:1px solid rgba(255,255,255,.5)}#cb-target .cb-pip.on{background:#e8edf2}
#cb-restrained{position:absolute;left:50%;top:calc(50% - 96px);transform:translateX(-50%);letter-spacing:.12em;font-weight:600;display:none}#cb-restrained.on{display:block}#cb-restrained.you{top:30%;font-size:16px}
#cb-hint{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);opacity:.7;white-space:nowrap;display:none}#cb-hint.on{display:block}
#cb-flash{position:absolute;inset:0;box-shadow:inset 0 0 90px rgba(200,20,10,.55);opacity:0;transition:opacity .25s}#cb-flash.on{opacity:1;transition:none}
`;
export class CombatHUD {
  constructor() { this.el = null; this.last = ''; }
  mount() {
    if (this.el || typeof document === 'undefined' || !document.body) return !!this.el;
    const st = document.createElement('style'); st.id = 'cb-style'; st.textContent = CSS; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'cb-hud';
    d.innerHTML = `<div id="cb-stance" class="cb-chip" data-stance="relaxed"></div><svg id="cb-ring" viewBox="0 0 46 46"><circle class="cb-ring-bg" cx="23" cy="23" r="20"/><circle class="cb-ring-fg" cx="23" cy="23" r="20"/></svg>`
      + `<div id="cb-target"><div class="cb-name"></div><div class="cb-bar"><i></i></div><div class="cb-pips">${'<span class="cb-pip"></span>'.repeat(5)}</div></div><div id="cb-restrained">RESTRAINED</div><div id="cb-hint"></div><div id="cb-flash"></div>`;
    document.body.appendChild(d); this.el = d; this.q = (s) => d.querySelector(s); return true;
  }
  update(s) {
    if (!this.mount()) return; const key = JSON.stringify(s); if (key === this.last) return; this.last = key; const q = this.q;
    this.el.style.display = s ? '' : 'none'; document.body.classList.toggle('cb-engaged', !!s?.engaged); if (!s) return;
    const chip = q('#cb-stance'); chip.dataset.stance = s.stance; chip.textContent = s.stance === 'fists' ? (s.guarding ? 'Guard' : 'Fists') : s.stance === 'handsup' ? 'Hands up' : '';
    const ring = q('#cb-ring'), gs = s.grabbedYou ? 'grabbed-you' : s.grab?.state || ''; if (gs) ring.dataset.state = gs; else delete ring.dataset.state; ring.style.setProperty('--cb-struggle', String((s.grabbedYou || s.grab)?.struggle || 0));
    const t = q('#cb-target'), show = !!s.target && (s.engaged || s.target.state !== 'ok' || s.target.hp < 1); t.classList.toggle('on', show);
    if (s.target) { t.dataset.state = s.target.state; q('#cb-target .cb-name').textContent = s.target.name + (s.target.state !== 'ok' ? ' · ' + s.target.state : ''); q('#cb-target .cb-bar>i').style.width = Math.round(s.target.hp * 100) + '%'; const on = Math.round(s.target.stun * 5); this.el.querySelectorAll('.cb-pip').forEach((p, i) => p.classList.toggle('on', i < on)); }
    const r = q('#cb-restrained'); r.classList.toggle('on', !!(s.restrained || (show && s.target?.restrained))); r.classList.toggle('you', !!s.restrained);
    const h = q('#cb-hint'); h.textContent = s.hint || ''; h.classList.toggle('on', !!s.hint); q('#cb-flash').classList.toggle('on', !!s.hit);
  }
}
