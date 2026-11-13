// NPC speech etiquette (Systems Nominal): when a crew member may greet you, and when a nod has to do. Pure, node-testable.
// A tight ship is not a chatty one (docs/mockups/pacing-npc.md §1). Tiers:
//   T0 'nod'    visual only (nod / small smile / eyebrow / frown through Fidgeter.force), within 3 m, even moving or in corridors
//   T1 'speak'  a spoken greeting: the player stood still facing them within range for the dwell time, after a T0, never in the first
//               60-180 s of a run, never while they walk / work with both hands, never in corridors, with per-person and global cooldowns
//   T3 'urgent' alerts, hazards, injuries: bypass everything (delivered by PA / comm bus, not by walking up to you)
//   barkGate(s, cfg) -> 'urgent' | 'speak' | 'nod' | null      gestureFor({ rank, trust, rival }) -> gesture id
// s: { t, d, speed, facing, los, dwell, npcWalking, npcBusy, corridor, playerBusy, urgent, spokeAt, globalAt, nodAt, nodGlobalAt, nodded }
// cfg: pace.bark { range, dwell, person, global, grace, nodPerson, nodGlobal } (js/pace.js)
export const BARK_DEFAULT = { range: 2.4, dwell: 1.6, person: 300, global: 90, grace: 60, nodPerson: 45, nodGlobal: 8 };
export function attending(s, cfg = BARK_DEFAULT) { return s.d < cfg.range && s.speed < 0.6 && s.facing && s.los; }
export function barkGate(s, cfg = BARK_DEFAULT) {
  if (s.urgent) return 'urgent';
  if (s.playerBusy) return null;
  const t = s.t, ago = (x) => t - (x ?? -1e9);
  if (attending(s, cfg) && s.dwell >= cfg.dwell && s.nodded && !s.npcWalking && !s.npcBusy && !s.corridor && t >= cfg.grace && ago(s.spokeAt) >= cfg.person && ago(s.globalAt) >= cfg.global) return 'speak';
  if (s.d < 3 && s.los && !s.npcBusy && ago(s.nodAt) >= cfg.nodPerson && ago(s.nodGlobalAt) >= cfg.nodGlobal) return 'nod';
  return null;
}
// which T0 gesture: rivals frown (look away), friends smile, juniors nod to seniors, seniors raise an eyebrow at juniors
export function gestureFor({ rank = 0, trust = 0.5, rival = false } = {}) {
  if (rival || trust < 0.3) return 'frown'; if (trust > 0.65) return 'small_smile'; return rank < 0 ? 'eyebrow_raise' : 'nod';
}
