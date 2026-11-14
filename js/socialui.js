// Social generator -> game UI glue (docs/social.md): run-start "crew notes" in the briefing card + the talk menu's rumour option.
// Pure helpers (no three.js); DOM only in briefNotes() and only if the card element is given.
import { TRUST_ATT } from './social.js';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const RUMOUR_TRUST = { open: 0.42, gossip: 0.28, secret: 0.65 };   // trust (incl. TRUST_ATT of their attitude to you) needed for news / for a gossip / for a secret

// short "crew notes" lines for the player's character: [{ kind, id, text }] (empty without a graph)
export function briefLines(graph, player, max = 5) { try { return graph?.playerBrief ? graph.playerBrief(player, max) : []; } catch { return []; } }

// inject a dismissible "Crew notes" block into the briefing card (before the Begin button); returns the lines shown
export function briefNotes(hud, graph, player, max = 5) {
  const L = briefLines(graph, player, max), card = hud?.brief?.querySelector?.('.card'); if (!L.length || !card) return L;
  const box = document.createElement('div'); box.className = 'bd-notes';
  box.innerHTML = `<h4>Crew notes <button type="button" class="bd-x" title="Dismiss" style="margin:0 0 0 8px;padding:0 8px;font:700 12px Arial;letter-spacing:0;background:none;color:inherit;border:1px solid rgba(150,180,210,.4);cursor:pointer">hide</button></h4><ul>${L.map(l => `<li class="n-${l.kind}">${esc(l.text)}</li>`).join('')}</ul>`;
  box.querySelector('.bd-x').onclick = () => box.remove();
  card.insertBefore(box, card.querySelector('#bd-go')); return L;
}

// one rumour p will pass on to the player, or { none: line }. Never repeats (graph._heard), never about p; secrets need high trust.
export function rumourFor(graph, p, player, trust) {
  if (!graph?.rumours) return { none: 'Nothing worth repeating.' };
  const id = p.id, rel = graph.relation?.(id, player.id), eff = trust + (TRUST_ATT[rel?.attitude] || 0), gossip = !!graph.profiles?.[id]?.gossip;
  if (eff < (gossip ? RUMOUR_TRUST.gossip : RUMOUR_TRUST.open)) return { none: gossip ? 'I could tell you things. Not yet.' : 'I do not gossip with people I do not know well.' };
  const heard = graph._heard || (graph._heard = new Set()), all = graph.rumours(p, { n: 99, asker: player }).filter(h => !heard.has(h));
  const h = all.find(x => !x.secret || eff >= RUMOUR_TRUST.secret) || null;
  if (!h) return { none: all.length ? 'There is more, but not for you. Not yet.' : 'Quiet lately. Nothing new.' };
  heard.add(h); return { hook: h, text: h.text };
}
