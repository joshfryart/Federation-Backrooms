// Tutorial hints beyond deck 1 (Madness mode). Each hint shows once ever (persisted in localStorage `fb_hints`), at most one per MIN_GAP seconds,
// and only when it is relevant: a threat type is on the deck, a locker is at hand, health is low. Pure rules: tools/test-ui-hints.mjs.
export const MIN_GAP = 14;
export const RULES = [
  { id: 'clinger', deck: 2, t: 8, when: c => c.threats.includes('clinger'), msg: 'Ceiling Crawlers drop on you from above. Look up in dark corridors. If one latches on: tap E repeatedly (holding does nothing).' },
  { id: 'gronk', deck: 2, t: 12, when: c => c.threats.includes('gronk'), msg: 'A Gronk is loose: loud, strong, bad at turning. Break line of sight, crouch (C) to stay quiet, use Jiffy tubes — it cannot follow.' },
  { id: 'drone', deck: 2, t: 12, when: c => c.threats.includes('drone'), msg: 'Compliance Drone: cannot crawl or climb. Stunning it buys a few seconds; standing on crates puts you out of reach.' },
  { id: 'phantom', deck: 3, t: 12, when: c => c.threats.includes('phantom'), msg: 'Mr. Grinsworth only moves when you do not see it, and you cannot see it in the dark. Face it, keep the torch (F) on and back away.' },
  { id: 'slime', deck: 2, t: 20, when: c => c.threats.includes('slimeling'), msg: 'Not every crewman is crew. Slimelings never blink and shimmer faintly; keep your distance if someone seems off.' },
  { id: 'hide', deck: 2, t: 10, when: c => c.nearLocker && c.hostiles > 0, msg: 'Lockers: press E to hide (they cannot see or hear you). Z throws a noisemaker to lure hunters away.' },
  { id: 'lowhp', deck: 2, t: 0, when: c => c.hp < 0.35, msg: 'Low health: batteries and medkits are stashed mid-tube and in storerooms. Hide to recover your nerve.' },
  { id: 'director', deck: 4, t: 40, when: () => true, msg: 'The ship breathes: a quiet stretch usually means something is about to go wrong. Use it to repair, restock and scout.' },
  { id: 'deep', deck: 6, t: 30, when: () => true, msg: 'Deep decks run several hunters at once. Split them with noisemakers; do not fight more than one.' },
];
export class Tutor {
  constructor(storage = null, say = () => {}) { this.say = say; this.cool = 6; this.seen = new Set(); this.st = storage; try { for (const k of JSON.parse(storage?.getItem('fb_hints') || '[]')) this.seen.add(k); } catch (e) { /* none */ } }
  save() { try { this.st?.setItem('fb_hints', JSON.stringify([...this.seen])); } catch (e) { /* none */ } }
  reset() { this.seen.clear(); this.save(); }
  /** ctx: { deck, deckTime, threats[], nearLocker, hostiles, hp (0..1) } returns the rule shown or null */
  tick(dt, ctx) {
    this.cool -= dt; if (this.cool > 0) return null;
    for (const r of RULES) {
      if (this.seen.has(r.id) || ctx.deck < r.deck || ctx.deckTime < r.t || !r.when(ctx)) continue;
      this.seen.add(r.id); this.save(); this.cool = MIN_GAP; this.say(r.msg, 'comp'); return r;
    }
    return null;
  }
}
