// Ceiling Crawler latch feedback: tear-off progress bar, mash pips that pulse per E press, a vignette that closes in as the timer
// runs down, and a clean reset when the player dies / changes deck / the latch ends. Self-contained: main.js calls
// on(max) / mash() / tick(left) / end(torn) / reset(P). The bar lives inside the existing #clung layer.
export class ClingModel {
  constructor() { this.reset(); }
  reset() { this.max = 0; this.left = 0; this.mashes = 0; this.active = false; this.mashT = 99; }
  on(max) { this.max = max; this.left = max; this.mashes = 0; this.active = true; this.mashT = 99; }
  mash() { if (this.active) { this.mashes++; this.mashT = 0; } }
  tick(left, dt = 0) { if (!this.active) return; this.left = Math.max(0, left); this.mashT += dt; }
  get progress() { return this.max > 0 ? 1 - this.left / this.max : 0; }
  get label() { const p = this.progress; return p > 0.8 ? 'ALMOST OFF' : p > 0.45 ? 'KEEP MASHING' : 'MASH [E]'; }
  /** vignette radius in %: 70 when it just landed, 28 near the end of the timer */
  get vignette() { return 70 - 42 * this.progress; }
}
const CSS = `#cling-bar{position:absolute;left:50%;bottom:16%;width:min(360px,70vw);height:10px;transform:translateX(-50%);border:1px solid rgba(255,120,100,.7);background:rgba(0,0,0,.55)}
#cling-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c33,#ff8a6a);transition:width .08s}
#cling-pip{position:absolute;left:50%;bottom:calc(16% + 22px);transform:translateX(-50%) scale(1);font:700 22px var(--f-m,monospace);color:#ffd0c8;border:2px solid #ff8a6a;padding:0 10px;border-radius:4px;transition:transform .09s,background .09s}
#cling-pip.hit{transform:translateX(-50%) scale(1.35);background:rgba(255,106,90,.45)}
@media (prefers-reduced-motion:reduce){#cling-pip{transition:none}}`;
export class ClingHud {
  constructor(doc = (typeof document !== 'undefined' ? document : null), host = null) {
    this.m = new ClingModel(); this.doc = doc; this.host = host || doc?.getElementById('clung'); this.shake = 1;
    if (!this.host) return;
    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    this.bar = doc.createElement('div'); this.bar.id = 'cling-bar'; this.fill = doc.createElement('i'); this.bar.appendChild(this.fill);
    this.pip = doc.createElement('div'); this.pip.id = 'cling-pip'; this.pip.textContent = 'E';
    this.host.append(this.bar, this.pip); this.text = this.host.querySelector('div');
  }
  on(max) { this.m.on(max); this.paint(); }
  mash() { this.m.mash(); if (this.pip) { this.pip.classList.add('hit'); clearTimeout(this._t); this._t = setTimeout(() => this.pip.classList.remove('hit'), 90); } }
  tick(left, dt) { this.m.tick(left, dt); this.paint(); }
  end() { this.m.reset(); this.paint(); if (this.host) { this.host.style.opacity = 0; this.host.style.transform = ''; } }
  reset(P) { if (P) { P.clung = 0; P.clungMax = 0; } this.end(); }
  paint() {
    if (!this.host) return; const m = this.m;
    if (this.fill) this.fill.style.width = (m.active ? m.progress * 100 : 0) + '%';
    if (this.text && m.active) this.text.textContent = m.label;
    if (m.active) this.host.style.background = `radial-gradient(ellipse at 50% 55%,rgba(8,2,4,.96) 15%,rgba(40,6,10,.85) ${m.vignette * 0.64}%,rgba(0,0,0,.25) 100%)`;
  }
}
