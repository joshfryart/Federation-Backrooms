// Ship systems schematic (Tab in Systems Nominal; replaces the sentence list). One SVG built on open / at 2 Hz, no per-frame work.
// A hull profile split into the four zones (Engineering aft, Services, Habitat, Command fore); one node per system placed in its
// home zone. Node = department badge shape + system glyph; status = solid green / dashed amber + "!" / red crossed (never colour alone).
// Active cascades (crew.js CASCADES) draw as animated dashed arrows from the failing system to its victim, so cause -> effect is visible.
import { ICONS, SHAPES, CATS } from './icons.js';
import { SYSTEMS, CASCADES } from './crew.js';
import { sysIcon } from './nav.js';

const DEPT_CAT = { command: 'command', flight: 'command', operations: 'services', engineering: 'engineering', security: 'security', sciences: 'science', medical: 'medical', services: 'services' };
const ZONES = [['Engineering', 70, 250, 'ENG'], ['Services', 250, 430, 'SRV'], ['Habitat', 430, 610, 'HAB'], ['Command', 610, 760, 'CMD']];
const COL = { nominal: '#4fd18b', degraded: '#ffd23f', offline: '#ff4d3d' };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** node positions: systems of a zone fill a small grid inside its column of the hull */
export function layout() {
  const pos = {};
  for (const [zone, x0, x1] of ZONES) {
    const list = SYSTEMS.filter(s => (s.home || 'Services') === zone), cols = Math.max(1, Math.ceil(list.length / 3)), cw = (x1 - x0) / cols;
    list.forEach((s, i) => { const c = Math.floor(i / 3), r = i % 3; pos[s.id] = [x0 + cw * (c + 0.5), 112 + r * 58 + (c % 2) * 18]; });
  }
  return pos;
}

/** shipState: ShipState (status(id)); here: {sysId: 'junction 03-02 · 14 m'}; returns HTML */
export function schematicHTML(shipState, o = {}) {
  const pos = layout(), st = (id) => shipState.status(id), here = o.here || {};
  let h = `<defs><marker id="nv-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4 0 8z" fill="#ff4d3d"/></marker></defs>`;
  h += `<path d="M30 175 Q20 150 60 110 L520 80 Q690 70 790 170 Q690 270 520 268 L60 245 Q20 225 30 175z" fill="#0a1224" stroke="#3a4a70" stroke-width="1.5"/>`;
  for (const [, x0, , lab] of ZONES) h += `<line x1="${x0}" y1="86" x2="${x0}" y2="262" stroke="rgba(150,180,210,.15)" stroke-dasharray="3 5"/><text x="${x0 + 8}" y="298" fill="#6f8fb8" font-size="12" font-family="Arial Narrow,Arial" letter-spacing="3">${lab}</text>`;
  h += `<text x="770" y="298" fill="#6f8fb8" font-size="12" font-family="Arial Narrow,Arial" text-anchor="end">BOW &#9658;</text>`;
  for (const c of CASCADES) {
    const s = st(c.from); if (s === 'nominal' || !pos[c.from] || !pos[c.to]) continue; const live = s === c.when || s === 'offline';
    const [ax, ay] = pos[c.from], [bx, by] = pos[c.to], L = Math.hypot(bx - ax, by - ay) || 1, k = 24 / L;
    h += `<line class="nv-casc" x1="${ax + (bx - ax) * k}" y1="${ay + (by - ay) * k}" x2="${bx - (bx - ax) * k}" y2="${by - (by - ay) * k}" stroke="${live ? '#ff4d3d' : '#ffd23f'}" stroke-opacity="${live ? 1 : 0.6}" stroke-width="2.2" stroke-dasharray="6 5" marker-end="url(#nv-ar)"><animate attributeName="stroke-dashoffset" from="22" to="0" dur=".8s" repeatCount="indefinite"/><title>${esc(c.why)}</title></line>`;
  }
  for (const s of SYSTEMS) {
    const p = pos[s.id]; if (!p) continue; const k = CATS[DEPT_CAT[s.dept]] || CATS.crew, v = st(s.id), c = COL[v] || COL.nominal, ic = sysIcon(s.id);
    h += `<g class="nv-node ${v}" data-id="${s.id}" transform="translate(${p[0] - 20} ${p[1] - 20}) scale(1.67)"><title>${esc(s.name)} — ${v}${v !== 'nominal' ? ': ' + esc(v === 'offline' ? s.eff.off : s.eff.deg) : ''}${here[s.id] ? ' · ' + esc(here[s.id]) : ''}</title>`
      + `<path d="${SHAPES[k.s]}" fill="${v === 'offline' ? '#3a0c08' : '#0c1424'}" stroke="${c}" stroke-width="${v !== 'nominal' ? 2.6 : 1.6}"${v === 'degraded' ? ' stroke-dasharray="5 2.5"' : ''}/>`
      + `<g transform="translate(5 5.2) scale(.58)" fill="none" stroke="${v === 'offline' ? '#ff9a8c' : '#fff'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[ic] || ICONS.dots}"/></g>`
      + (v === 'offline' ? `<path d="M4 4l16 16M20 4L4 20" stroke="#ff4d3d" stroke-width="2" opacity=".85"/>` : '') + (v === 'degraded' ? `<circle cx="20" cy="4" r="4.4" fill="#ffd23f"/><path d="M20 2v3.2M20 6.6v.1" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>` : '')
      + (here[s.id] && v !== 'nominal' ? `<circle cx="4" cy="20" r="3.6" fill="#8ef3ff"/>` : '') + `</g>`;
  }
  const bad = SYSTEMS.filter(s => st(s.id) !== 'nominal');
  const rows = bad.map(s => { const v = st(s.id); return `<div class="nv-sr ${v}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${COL[v]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[sysIcon(s.id)] || ICONS.dots}"/></svg><b>${esc(s.name)}</b><span>${esc(v === 'offline' ? s.eff.off : s.eff.deg)}</span>${here[s.id] ? `<em>${esc(here[s.id])}</em>` : ''}</div>`; }).join('');
  const leg = ['nominal', 'degraded', 'offline'].map(v => `<span class="nv-chip" style="border-color:${COL[v]};color:${COL[v]}">${{ nominal: 'OK', degraded: '! degraded', offline: '× offline' }[v]}</span>`).join('');
  return `<div class="nv-sch-head">${o.head || ''}<span class="nv-sch-leg">${leg}</span></div><svg class="nv-sch" viewBox="0 0 800 310">${h}</svg><div class="nv-sch-rows">${rows || '<div class="nv-sr nominal"><b>All systems nominal</b></div>'}</div>${o.foot ? `<div class="nv-sch-foot">${o.foot}</div>` : ''}`;
}
export const SCHEMATIC_CSS = `
#shipstatus .nv-sch{width:min(1100px,100%);display:block;margin:4px auto 0;background:#050912;border:1px solid rgba(150,180,210,.26)}
#shipstatus .nv-sch-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font:14px var(--f-d,Arial);letter-spacing:.1em;flex-wrap:wrap}#shipstatus .nv-sch-head b{color:var(--lc1,#f2a03d);font-size:18px}
.nv-chip{display:inline-flex;align-items:center;padding:1px 7px;margin-left:4px;border:1px solid;border-radius:10px;font:700 10px var(--f-m,monospace)}
#shipstatus .nv-sch-rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 12px;margin:8px auto 0;max-width:1100px}
.nv-sr{display:grid;grid-template-columns:20px auto 1fr;gap:2px 8px;align-items:center;padding:3px 8px;background:rgba(13,18,32,.9);border-left:3px solid #4fd18b;font-size:12px}.nv-sr.degraded{border-left-color:#ffd23f}.nv-sr.offline{border-left-color:#ff4d3d}
.nv-sr span{opacity:.75;font-size:11px}.nv-sr em{grid-column:2/4;font-style:normal;color:#8ef3ff;font-size:10px}
#shipstatus .nv-sch-foot{max-width:1100px;margin:6px auto 0;font-size:10px;opacity:.6;font-family:var(--f-m,monospace)}
.nv-node.offline{animation:nvblink 1s steps(2) infinite}@keyframes nvblink{50%{opacity:.55}}`;
