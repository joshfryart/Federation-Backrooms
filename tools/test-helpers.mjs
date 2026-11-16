// In-page helpers for the browser sections of tools/test.mjs (plan step 5: no check depends on where a random deck happens to put people or props).
//   await installHelpers(page)   defines window.__T on the page (idempotent); sections then call __T.* inside page.evaluate.
// Every helper is deterministic (no Math.random, no wall clock): a failure replays with the printed replay line.
//   __T.open(x, z, r)            the point is walkable floor with r m of clearance from walls / props (not a tube)
//   __T.standNear(e, d, behind)  puts the player d m from body / point e (in front of it, or behind it) on an open spot in line of sight, facing it; [x, z] or null
//   __T.openSideOf(x, z, d, face) the first open point d m from (x, z) (4 sides, then diagonals) in line of sight of the point `face` m out from (x, z) toward it
//                                (0.55 for a body / clutter; 1.3 for a prop: its whole 2.5 m tile blocks sight): { x, z, yaw } facing (x, z)
//   __T.nearestProp(kinds, x, z, d) nearest prop of those kinds (null / [] = any) that has an open side d m from its centre: { p, x, z, side }
//   __T.farFrom(x, z, min)       the nearest open tile centre at least `min` path steps from (x, z): [x, z]
//   __T.clearSite(x, z, r, keep) every crew body within r m (not lift boarders, not those in keep) stops what it does and is moved to its own spot >= 12 path steps away; returns how many
//   __T.hideEnemies()            no hostiles, no madness turning, no opener (madness page)
//   __T.quiet()                  freezes the systems a section does not test: body sync with the sim (G.simT), cart jobs, phases, faults, crew repairs,
//                                comm chatter; returns restore()
//   __T.arena(minOpen)           an open tile whose 8 neighbours are floor, far from the lift: [x, z] (fights / knock-downs away from corners)
export async function installHelpers(page) {
  await page.evaluate(() => {
    if (window.__T) return;
    const g = () => __game, W = () => __game.world, D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const open = (x, z, r = 0.3) => { const w = W(), [tx, ty] = w.tile(x, z); if (w.solid(tx, ty) || w.isTube(tx, ty) || w.d.grid[ty]?.[tx] !== 0) return false; const q = { x, z, y: 0 }; w.resolve(q, r); return Math.hypot(q.x - x, q.z - z) < 0.02; };
    const inCar = (x, z) => { const c = W().car; if (!c) return false; const [tx, ty] = W().tile(x, z); return tx === c.tx && ty === c.ty; };
    const T = {
      open,
      standNear(e, d = 0.85, behind = false) {
        const w = W(), P = g().P, x0 = e.x, z0 = e.z, y0 = (e.mesh?.rotation.y ?? 0) + (behind ? Math.PI : 0);
        for (const dd of [d, d + 0.2, d - 0.15]) for (let k = 0; k < 21; k++) { const a = y0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3, px = x0 + Math.sin(a) * dd, pz = z0 + Math.cos(a) * dd;
          if (open(px, pz, 0.25) && !inCar(px, pz) && w.los(px, pz, x0, z0)) { P.x = px; P.z = pz; P.vx = P.vz = 0; P.kbx = P.kbz = 0; P.yaw = Math.atan2(-(x0 - px), -(z0 - pz)); return [px, pz]; } }
        return null;
      },
      openSideOf(x, z, d = 1, face = 0.55) { const w = W(); for (const [a, b] of D8) { const L = Math.hypot(a, b), px = x + a / L * d, pz = z + b / L * d; if (open(px, pz, 0.25) && !inCar(px, pz) && w.los(px, pz, x + a / L * face, z + b / L * face)) return { x: px, z: pz, yaw: Math.atan2(-(x - px), -(z - pz)) }; } return null; },
      nearestProp(kinds, x, z, d = 1.2) { const w = W(), ks = kinds && kinds.length ? new Set(kinds) : null;
        const ps = w.d.props.filter(p => !ks || ks.has(p.kind)).map(p => { const [cx, cz] = w.center(p.tx, p.ty); return { p, cx, cz, dd: Math.hypot(cx - x, cz - z) }; }).sort((a, b) => a.dd - b.dd);
        for (const q of ps) { const s = T.openSideOf(q.cx, q.cz, d, 1.3); if (s) return { p: q.p, x: q.cx, z: q.cz, side: s }; } return null; },
      farFrom(x, z, min = 12) { const w = W(), [tx, ty] = w.tile(x, z), f = w.field(tx, ty); let best = null, bv = 1e9;
        for (const [ox, oy] of w.d.openTiles) { const v = f[ox + oy * w.W]; if (v >= min && v < bv && !w.isTube(ox, oy) && !inCar(...w.center(ox, oy))) { bv = v; best = [ox, oy]; } }
        if (!best) for (const [ox, oy] of w.d.openTiles) { const v = f[ox + oy * w.W]; if (v > (best ? f[best[0] + best[1] * w.W] : -1) && !w.isTube(ox, oy)) best = [ox, oy]; }
        return best ? w.center(best[0], best[1]) : null; },
      clearSite(x, z, r = 3.5, keep = []) { const G = g(), w = W(); let n = 0; const used = [];
        for (const e of G.ents) { if (!(e.kind === 'crew' || e.simmed) || !e.mesh || e.board || keep.includes(e) || Math.hypot(e.x - x, e.z - z) >= r) continue;   /* boarders stay: the lift car's own choreography */ if (e.op) G.opEnd(e); e.walk = null; e.haul = null;
          const [fx, fz] = T.farFrom(x, z, 12 + used.length * 2) || [e.x, e.z]; let px = fx, pz = fz; for (const [a, b] of [[0, 0], ...D8]) { px = fx + a * 0.7; pz = fz + b * 0.7; if (open(px, pz, 0.2) && !used.some(([ux, uz]) => Math.hypot(ux - px, uz - pz) < 0.7)) break; }
          used.push([px, pz]); e.x = px; e.z = pz; e.mesh.position.x = px; e.mesh.position.z = pz; n++; }
        return n; },
      hideEnemies() { const G = g(); for (const e of G.gorns) { e.dead = true; e.delay = 1e9; if (e.mesh) e.mesh.visible = false; } G.gorns.length = 0; if (G.G.mad) { G.G.mad.t = 1e9; G.G.mad.pending = null; }
        for (const e of G.ents.filter(e => e.opener)) { G.scene.remove(e.mesh); G.ents.splice(G.ents.indexOf(e), 1); } },
      quiet() { const G = g(), S = G.G, was = { simT: S.simT, haulT: G.haul?.t, ph: G.phases?.enabled, auto: G.shipState?.auto, rep: G.repair?.tick, cs: G.commsSim?.tick };
        S.simT = 1e9; if (G.haul) G.haul.t = 1e9; if (G.phases) G.phases.enabled = false; if (G.shipState) G.shipState.auto = false; if (G.repair) G.repair.tick = () => { }; if (G.commsSim) G.commsSim.tick = () => { };
        return () => { S.simT = was.simT || 0; if (G.haul) G.haul.t = was.haulT; if (G.phases) G.phases.enabled = was.ph; if (G.shipState) G.shipState.auto = was.auto; if (G.repair) delete G.repair.tick; if (G.commsSim) delete G.commsSim.tick; }; },
      arena(x = null, z = null) { const w = W(), c = w.car, [lx, ly] = c ? [c.tx, c.ty] : [-99, -99]; let best = null, bd = -1;
        for (const [tx, ty] of w.d.openTiles) { if (w.isTube(tx, ty) || Math.abs(tx - lx) + Math.abs(ty - ly) < 4) continue; if (!D8.every(([a, b]) => w.d.grid[ty + b]?.[tx + a] === 0 && !w.isTube(tx + a, ty + b))) continue;
          const [cx, cz] = w.center(tx, ty); if (!open(cx, cz, 0.9)) continue; const sc = x == null ? 1 : -Math.hypot(cx - x, cz - z); if (best == null || sc > bd) { bd = sc; best = [cx, cz]; if (x == null) break; } }
        return best; },
    };
    window.__T = T;
  });
}
