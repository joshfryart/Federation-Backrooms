// Node unit tests: touch + gamepad input (js/vkeys.js, js/touch.js, js/gamepad.js) with a faked window / navigator / document.  node tools/test-input.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function inputTests(fail) {
  const ck = (c, m) => { if (!c) fail('input: ' + m); return !!c; };
  const events = []; globalThis.KeyboardEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
  globalThis.dispatchEvent = (e) => { events.push(e.type + ':' + e.code); return true; };
  let pad = null; Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const bodyCls = new Set(); globalThis.document = { body: { classList: { add: (c) => bodyCls.add(c) } }, querySelectorAll: () => [], getElementById: () => null };
  const V = await imp('js/vkeys.js'), T = await imp('js/touch.js'), P = await imp('js/gamepad.js');

  ck(V.dead(0.1, 0.05)[0] === 0 && V.dead(1, 0)[0] === 1 && V.dead(0.59, 0)[0] > 0 && V.dead(0.59, 0)[0] < 0.6, 'dead zone rescales');
  const [x, z] = T.stickVec(56, 0); ck(x === 1 && z === 0, 'stick at full throw = 1'); ck(T.stickVec(3, 3)[0] === 0, 'stick dead zone'); ck(T.stickVec(200, 0)[0] === 1, 'stick clamps');
  ck(T.isTouchDevice({ location: { search: '?touch=1' } }) && !T.isTouchDevice({ location: { search: '' }, matchMedia: () => ({ matches: false }) }) && T.isTouchDevice({ location: { search: '' }, matchMedia: () => ({ matches: true }) }), 'touch detection');
  const G = { xin: { mx: 0, mz: 0, src: {} } }; V.setMove(G, 'touch', 0.6, 0); V.setMove(G, 'pad', 0.6, 0.8); ck(Math.abs(Math.hypot(G.xin.mx, G.xin.mz) - 1) < 1e-9, 'merged sticks clamp to unit length');
  V.setMove(G, 'touch', 0, 0); V.setMove(G, 'pad', 0, 0); ck(G.xin.mx === 0 && G.xin.mz === 0, 'sticks release');
  const cfg = { sens: 1 }; G.P = { yaw: 0, pitch: 0 }; V.lookBy(G, cfg, 0.5, 9); ck(G.P.yaw === -0.5 && G.P.pitch === -1.45, 'look turns right / clamps pitch');
  ck(V.canSteer({ phase: 'play' }) && !V.canSteer({ phase: 'play', menuPause: true }) && !V.canSteer({ phase: 'paused' }), 'canSteer');

  // gamepad: buttons -> keys / actions, edge triggered
  const acts = []; const G2 = { phase: 'play', xin: { mx: 0, mz: 0, src: {} }, P: { yaw: 0, pitch: 0 }, ticks: [], menus: {} };
  const gp = P.initGamepad({ G: G2, CFG: { sens: 1 }, act: { fire: () => acts.push('fire'), alt: () => acts.push('alt') } });
  const mk = (btn = [], axes = [0, 0, 0, 0]) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: btn.includes(i), value: btn.includes(i) ? 1 : 0 })) });
  pad = mk([], [0, -1, 0.9, 0]); gp.tick(0.1); ck(G2.xin.mz === -1 && G2.P.yaw < 0, 'sticks move + look'); // forward = -z, right stick turns right (yaw decreases)
  events.length = 0; pad = mk([0, 2, 7]); gp.tick(0.016); gp.tick(0.016);
  ck(events.filter(e => e === 'keydown:Space').length === 1 && events.includes('keydown:KeyE') && acts.join() === 'fire', 'A jump, X use, RT fire fire once per press: ' + events + acts);
  events.length = 0; pad = mk([1, 10]); gp.tick(0.016); ck(events.includes('keydown:KeyC') && events.includes('keydown:ShiftLeft'), 'B crouch + L3 sprint held'); pad = mk([]); gp.tick(0.016); ck(events.includes('keyup:KeyC') && events.includes('keyup:ShiftLeft'), 'released');
  G2.menuPause = true; events.length = 0; pad = mk([13]); gp.tick(0.016); ck(events.includes('keydown:ArrowDown'), 'menu open: d-pad sends arrows'); G2.menuPause = false;
  G2.phase = 'perk'; events.length = 0; pad = mk([3]); gp.tick(0.016); ck(events.includes('keydown:Digit2'), 'perk pick via Y');
  pad = null; gp.tick(0.016); ck(G2.xin.mx === 0, 'pad unplugged is neutral');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { let bad = false; await inputTests((m) => { bad = true; console.log('FAIL', m); }); console.log(bad ? 'FAILED' : 'input OK'); process.exit(bad ? 1 : 0); }
