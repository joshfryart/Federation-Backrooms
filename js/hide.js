// Hiding in lockers + a distraction item (noisemaker). Self-contained; main.js glue is five one-liners (see bottom of file).
// Hiding (E near a locker bank, Madness mode only): you stay where you stand (no teleport, so no collision surprises), movement is frozen,
// P.hidden = true => enemies' seesPlayer() is false and your noise is 0. You cannot hide while a hunter in CHASE has line of sight within
// HIDE.chaseR. A hunter that searches within HIDE.findR of you for HIDE.findT seconds finds you: you are ejected and hit. Phantom and
// Ceiling Crawlers ignore lockers in logic terms (the hologram has no eyes; crawlers cannot reach a hidden head: canBeAttacked is false).
// Distraction (Z): throws a noisemaker ~HIDE.throwD m ahead; hunters not chasing within HIDE.noiseR walk to it. DECOYS_PER_DECK per deck.
export const HIDE = { reach: 1.9, chaseR: 11, findR: 2.2, findT: 3.5, noiseR: 28, throwD: 10, decoyCd: 1.5, decoysPerDeck: 2, hitDmg: 12, cooldown: 2.5 };
const HUNTERS = new Set(['gronk', 'crazed', 'slimeling', 'drone']);
export class Hiding {
  /** env: { world, P, sound, game (G), enemies: () => Enemy[], S (enemy states), kinds? } */
  constructor(env) { this.e = env; this.on = false; this.findT = 0; this.cd = 0; this.decoys = HIDE.decoysPerDeck; this.dcd = 0; this.ov = null; this.mkOverlay(); }
  resetDeck() { this.leave(true); this.decoys = HIDE.decoysPerDeck; this.cd = 0; }
  spots() { const w = this.e.world; return (w?.d?.props || []).filter(p => p.kind === 'lockers').map(p => { const [x, z] = w.center(p.tx, p.ty); return { x, z }; }); }
  nearSpot() { const P = this.e.P; let best = null, bd = HIDE.reach; for (const s of this.spots()) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best; }
  hunters() { return (this.e.enemies() || []).filter(g => !g.dead && HUNTERS.has(g.kind) && g.state !== this.e.S.DORMANT); }
  /** reason string if hiding is refused, else '' */
  refuse() {
    const { P, world, S } = this.e;
    for (const g of this.hunters()) if (g.state === S.CHASE && Math.hypot(g.x - P.x, g.z - P.z) < HIDE.chaseR && world.los(g.x, g.z, P.x, P.z)) return 'It is watching you — too late to hide';
    if (this.cd > 0) return 'Wait a moment';
    return '';
  }
  prompt() { if (this.on) return '[E] Leave locker'; if (!this.e.game.hideEnabled?.() || !this.nearSpot()) return ''; return '[E] Hide in locker'; }
  /** E pressed: true if consumed */
  toggle() {
    if (this.on) { this.leave(); return true; }
    if (!this.e.game.hideEnabled?.() || !this.nearSpot()) return false;
    const why = this.refuse(); if (why) { this.e.game.say(why, 'warn'); return true; }
    this.on = true; this.findT = 0; this.e.P.hidden = true; this.e.P.vx = this.e.P.vz = 0; this.show(true); this.e.sound?.pickup?.(); this.e.game.say('You squeeze into the locker. Stay quiet.', ''); return true;
  }
  leave(silent = false) { if (!this.on && !this.e.P.hidden) return; this.on = false; this.e.P.hidden = false; this.cd = HIDE.cooldown; this.show(false); if (!silent) this.e.sound?.pickup?.(); }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt); this.dcd = Math.max(0, this.dcd - dt);
    if (!this.on) return;
    const { P, game, S } = this.e;
    if (game.phase !== 'play') { this.leave(true); return; }
    let close = null; for (const g of this.hunters()) if (g.state !== S.STUNNED && Math.hypot(g.x - P.x, g.z - P.z) < HIDE.findR) { close = g; break; }
    this.findT = close ? this.findT + dt : Math.max(0, this.findT - dt * 2);
    if (close && this.findT > HIDE.findT) { this.leave(true); this.findT = 0; game.say('The locker door is ripped open!', 'warn'); game.hitPlayer?.(close, HIDE.hitDmg); close.state = S.CHASE; close.timer = 5; }
  }
  /** Z: throw a noisemaker. Returns true if thrown. */
  decoy() {
    const { P, world, S, sound, game } = this.e; if (this.on || this.dcd > 0 || game.phase !== 'play' || !game.hideEnabled?.()) return false;
    if (this.decoys <= 0) { game.say('No noisemakers left', 'warn'); return false; }
    this.decoys--; this.dcd = HIDE.decoyCd;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let d = 0; while (d < HIDE.throwD && !world.solidAt(P.x + fx * (d + 0.5), P.z + fz * (d + 0.5))) d += 0.5;
    const x = P.x + fx * d, z = P.z + fz * d, [tx, ty] = world.tile(x, z); let n = 0;
    for (const g of this.hunters()) if (g.state !== S.CHASE && g.state !== S.STUNNED && Math.hypot(g.x - x, g.z - z) < HIDE.noiseR) { g.state = S.INVESTIGATE; g.timer = 9; g.setTarget(tx, ty); n++; }
    sound?.thud?.(0.3); setTimeout(() => sound?.thud?.(0.25), 250);
    game.say(`Noisemaker thrown (${this.decoys} left)${n ? '' : ' — nothing heard it'}`, ''); return true;
  }
  mkOverlay() {
    if (typeof document === 'undefined') return;
    const el = this.ov = document.createElement('div'); el.id = 'hide-ov';
    el.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;transition:opacity .25s;background:linear-gradient(#000 0 38%,transparent 38% 52%,#000 52% 100%)';
    document.body.appendChild(el);
  }
  show(v) { if (this.ov) this.ov.style.opacity = v ? 0.93 : 0; }
}
// main.js glue:  G.hide = new Hiding({ world (getter), P, sound, game: G, enemies: () => gorns, S }); G.hideEnabled = () => !NOM() && G.phase === 'play';
//   interact(): if (G.hide?.toggle()) return;   prompt: G.hide?.prompt() ;   per frame: G.hide.update(dt);   keydown KeyZ: G.hide.decoy();
//   P.slow *= P.hidden ? 0 : 1;  noise 0 + Enemy.seesPlayer false while P.hidden;  canBeAttacked false while P.hidden;  loadDeck: G.hide.resetDeck().
