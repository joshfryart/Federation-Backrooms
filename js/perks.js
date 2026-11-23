// Perk synergies + career milestones: pure logic over js/data.js (no DOM, no three.js), shared by js/main.js and the title-screen career panel.
import { PERKS, SYNERGIES, META_UNLOCKS } from './data.js';

const lvl = (perks, id) => (perks && perks[id]) | 0;
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
export const synergyActive = (s, perks) => Object.entries(s.needs).every(([id, n]) => lvl(perks, id) >= n);
export const activeSynergies = (perks) => SYNERGIES.filter(s => synergyActive(s, perks));
// levels of each perk a synergy still wants: { id: missing levels }
export const synergyMissing = (s, perks) => { const o = {}; for (const [id, n] of Object.entries(s.needs)) if (lvl(perks, id) < n) o[id] = n - lvl(perks, id); return o; };
// synergies that taking one more level of perk `id` would newly activate (for the perk-screen cards)
export const completes = (perks, id) => { const after = { ...perks, [id]: lvl(perks, id) + 1 }; return SYNERGIES.filter(s => !synergyActive(s, perks) && synergyActive(s, after)); };

const NEUTRAL = { stepNoise: 1, stunBonus: 0, lifeScanR: 18, staminaRegen: 1, knockMul: 1, tearBonus: 0, lureMul: 1 };
const MULT = ['stepNoise', 'staminaRegen', 'knockMul', 'lureMul'], ADD = ['stunBonus', 'tearBonus'];
// combined effect values of every active synergy (multipliers multiply, bonuses add, lifeScanR takes the largest)
export function synergyFx(perks) {
  const o = { ...NEUTRAL };
  for (const s of activeSynergies(perks)) for (const [k, v] of Object.entries(s.fx)) { if (MULT.includes(k)) o[k] *= v; else if (ADD.includes(k)) o[k] += v; else o[k] = Math.max(o[k], v); }
  return o;
}

// career: starting perks unlocked by the fb_meta counters M ({ runs, bestDeck, kills, wins })
export const metaUnlocked = (M) => META_UNLOCKS.filter(u => ((M && M[u.key]) | 0) >= u.need);
export function careerSummary(M, best) {
  M = M || {};
  return { runs: M.runs | 0, kills: M.kills | 0, wins: M.wins | 0, bestDeck: Math.max(M.bestDeck | 0, best | 0),
    milestones: META_UNLOCKS.map(u => ({ ...u, perkName: PERKS.find(p => p.id === u.perk)?.name || u.perk, have: Math.min(u.need, M[u.key] | 0), done: (M[u.key] | 0) >= u.need })) };
}
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function careerHTML(M, best) {
  const c = careerSummary(M, best);
  return `<div class="cr-stats"><span>Shifts <b>${c.runs}</b></span><span>Best deck <b>${c.bestDeck || '-'}</b></span><span>Hostiles downed <b>${c.kills}</b></span><span>Ships escaped <b>${c.wins}</b></span></div>`
    + `<ul class="cr-ms">${c.milestones.map(m => `<li class="${m.done ? 'done' : ''}"><b>${esc(m.perkName)}</b> <i>${esc(m.why)}</i> <span>${m.done ? 'Unlocked: starts each madness run' : m.have + ' / ' + m.need}</span></li>`).join('')}</ul>`
    + `<div class="cr-syn"><div class="eyebrow">Perk synergies (madness mode)</div>${SYNERGIES.map(s => `<span title="${esc(s.desc)}"><b>${esc(s.name)}</b> ${Object.entries(s.needs).map(([id, n]) => (n > 1 ? n + '× ' : '') + (PERKS.find(p => p.id === id)?.name || id)).join(' + ')}</span>`).join('')}</div>`;
}
