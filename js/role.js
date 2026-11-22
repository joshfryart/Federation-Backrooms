// Role choice (Systems Nominal): a role = one of the BILLETS (js/crew.js; duty data in assets/data/duties.json billets.<id>). Pure logic + a guarded DOM control.
//   readRole(search, storage)  URL ?role=<id>|random > legacy ?billet=<id> > localStorage fb_role > 'random'   (invalid ids fall through)
//   saveRole(choice, storage)  resolveRole(choice, seed) -> billet id ('random' = uniform over BILLET_KEYS, fixed by the seed)
//   readMission(search)        ?mission=<m> if it is in MISSION_ORDER, else null (the caller falls back to pickMission(seed))
//   mountRoleControl(doc, cur, onChange, duties)   title-screen <select id="roleselect"> in #rolesel + #rolesum (title, loop count)
import { BILLETS, DEPARTMENTS } from './crew.js';
import { MISSION_ORDER } from './duty.js';
import { hash } from './clock.js';

export const BILLET_KEYS = BILLETS.map(b => b.key);
const isChoice = (v) => v === 'random' || BILLET_KEYS.includes(v);

export function readRole(search = '', storage = null) {
  const q = new URLSearchParams(search);
  for (const k of ['role', 'billet']) { const v = q.get(k); if (isChoice(v)) return v; }
  try { const s = storage?.getItem('fb_role'); if (isChoice(s)) return s; } catch (e) { /* private window / blocked storage */ }
  return 'random';
}
export function saveRole(choice, storage = null) { try { storage?.setItem('fb_role', isChoice(choice) ? choice : 'random'); } catch (e) { /* ignore */ } }
export const resolveRole = (choice, seed) => BILLET_KEYS.includes(choice) ? choice : BILLET_KEYS[hash('role', seed) % BILLET_KEYS.length];
export function readMission(search = '') { const m = new URLSearchParams(search).get('mission'); return MISSION_ORDER.includes(m) ? m : null; }

export function roleSummary(choice, duties = null) {
  if (!BILLET_KEYS.includes(choice)) return 'Random role: dealt from all 41 billets by the shift seed';
  const b = BILLETS.find(x => x.key === choice), n = duties?.billets?.[choice]?.loops?.length;
  return `${b.title}${n != null ? ` · ${n} duty loop${n === 1 ? '' : 's'}` : ''}`;
}
export function mountRoleControl(doc, cur = 'random', onChange = () => {}, duties = null) {
  const box = doc?.getElementById?.('rolesel'), sum = doc?.getElementById?.('rolesum'); if (!box) return null;
  let sel = box.querySelector('select');
  if (!sel) {
    sel = doc.createElement('select'); sel.id = 'roleselect'; sel.setAttribute('aria-label', 'Role');
    sel.add(new Option('Random', 'random'));
    for (const d of DEPARTMENTS) { const g = doc.createElement('optgroup'); g.label = d.name; for (const b of BILLETS.filter(x => x.dept === d.id)) g.append(new Option(b.title, b.key)); if (g.children.length) sel.append(g); }
    box.append(sel);
  }
  const paint = (c) => { sel.value = c; if (sum) sum.textContent = roleSummary(c, duties); };
  sel.addEventListener('change', () => { paint(sel.value); onChange(sel.value); });
  paint(cur); return { paint, setDuties(d) { duties = d; paint(sel.value); } };
}
