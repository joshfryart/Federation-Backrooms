// Accessibility options: reduce flashing / grain / shake, colour-blind palette, captions for audio cues. Persisted in localStorage `fb_access`.
// ACC is a live object other modules read (ACC.flash, ACC.shake, ACC.grain are multipliers 0..1). main.js glue: ACC.shake in the camera
// shake expressions, ACC.flash in flash() and the post glitch value, ACC.grain into the film-grain uniform. Pure parts are node-tested.
export const DEFAULTS = { flash: false, grain: false, shake: false, cb: 'off', cues: false };
export const CB_MODES = [['off', 'Off'], ['deut', 'Red-green (deuteranopia)'], ['prot', 'Red-green (protanopia)'], ['trit', 'Blue-yellow (tritanopia)']];
export const ACC = { ...DEFAULTS, flash: 1, shake: 1, grain: 1, _o: { ...DEFAULTS } };
export function apply(o) {
  const v = { ...DEFAULTS, ...o }; ACC._o = v; ACC.cb = CB_MODES.some(m => m[0] === v.cb) ? v.cb : 'off'; ACC.cues = !!v.cues;
  ACC.flash = v.flash ? 0.2 : 1; ACC.shake = v.shake ? 0.2 : 1; ACC.grain = v.grain ? 0 : 1; return ACC;
}
export function load(storage) { let o = {}; try { o = JSON.parse(storage?.getItem('fb_access') || '{}') || {}; } catch (e) { /* defaults */ } return apply(o); }
export function save(storage) { try { storage?.setItem('fb_access', JSON.stringify(ACC._o)); } catch (e) { /* none */ } }
export function applyBody(doc = typeof document !== 'undefined' ? document : null) {
  const b = doc?.body; if (!b) return; for (const m of CB_MODES) b.classList.toggle('cb-' + m[0], m[0] === ACC.cb && m[0] !== 'off');
  b.classList.toggle('reduce-flash', ACC.flash < 1); b.classList.toggle('reduce-motion', ACC.shake < 1);
}
// ---- audio cue captions ----
export const CUES = { roar: 'Monster roar', growl: 'Growling', mutter: 'Muttering', shriek: 'Screaming', giggle: 'Hologram giggling', skitter: 'Skittering overhead', thud: 'Heavy footsteps',
  klaxon: 'Alarm klaxon', zap: 'Electrical zap', squelch: 'Wet squelch', whir: 'Drone whirring', powerDown: 'Power failing', clang: 'Metal clang', stunned: 'Something stunned' };
export const DIST = { steps: 'Distant footsteps', scrape: 'Distant scraping', door: 'A distant door', whisper: 'Whispers' };
const HOLD = 2.6;
export class Captions {
  constructor(doc = typeof document !== 'undefined' ? document : null, now = () => Date.now()) { this.doc = doc; this.now = now; this.last = {}; this.log = []; this.box = null; }
  show(text, key = text) {
    if (!ACC.cues) return false; const t = this.now(); if (t - (this.last[key] ?? -1e9) < 2500) return false; this.last[key] = t; this.log.push(text); if (this.log.length > 20) this.log.shift();
    const d = this.doc; if (!d) return true;
    if (!this.box) { this.box = d.getElementById('cues') || Object.assign(d.createElement('div'), { id: 'cues' }); if (!this.box.parentNode) d.body.appendChild(this.box); }
    const el = d.createElement('span'); el.textContent = '[' + text + ']'; this.box.appendChild(el);
    while (this.box.children.length > 3) this.box.firstChild.remove();
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 550); }, HOLD * 1000); return true;
  }
  /** wrap Sound instance methods so each cue also prints a caption (only when audible: volume arg >= 0.04 where given) */
  attach(sound) {
    for (const [name, text] of Object.entries(CUES)) { const f = sound[name]; if (typeof f !== 'function') continue; sound[name] = (...a) => { if (typeof a[0] !== 'number' || a[0] >= 0.04) this.show(text, name); return f.apply(sound, a); }; }
    const d = sound.distant; if (typeof d === 'function') sound.distant = (k, ...a) => { this.show(DIST[k] || 'Distant noise', 'dist'); return d.call(sound, k, ...a); };
    return this;
  }
}
// ---- settings UI (appended to the .settings block on the title/pause screens) ----
export function mountUI(doc, storage, onChange = () => {}) {
  const hosts = doc.querySelectorAll('.settings'); const st = doc.createElement('link'); st.rel = 'stylesheet'; st.href = 'css/access.css'; doc.head.appendChild(st);
  for (const host of hosts) {
    const box = doc.createElement('div'); box.className = 'access-box'; box.innerHTML = '<legend>Accessibility</legend>';
    const set = (k, v) => { ACC._o = { ...ACC._o, [k]: v }; apply(ACC._o); save(storage); applyBody(doc); onChange(ACC); syncAll(); };
    for (const [k, label] of [['flash', 'Reduce flashing'], ['grain', 'Reduce film grain'], ['shake', 'Reduce camera shake'], ['cues', 'Captions for sound cues']]) {
      const l = doc.createElement('label'); l.innerHTML = `${label} <input type="checkbox" data-acc="${k}">`; l.querySelector('input').onchange = (e) => set(k, e.target.checked); box.appendChild(l);
    }
    const l = doc.createElement('label'); l.innerHTML = 'Colour-blind palette <select data-acc="cb">' + CB_MODES.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('') + '</select>';
    l.querySelector('select').onchange = (e) => set('cb', e.target.value); box.appendChild(l); host.appendChild(box);
  }
  function syncAll() { for (const el of doc.querySelectorAll('[data-acc]')) { const k = el.dataset.acc; if (el.type === 'checkbox') el.checked = !!ACC._o[k]; else el.value = ACC._o[k]; } }
  syncAll();
}
