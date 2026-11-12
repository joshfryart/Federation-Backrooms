// Glue: builds the whole bridge-comms stack for one run (alerts, ship clock, comm bus, bridge, crew simulation, HUD).
// No three.js. main.js creates one per nominal run and ticks it from the game loop.
import { AlertState, ALERT_IDS } from './alerts.js';
import { ShipClock } from './clock.js';
import { CommBus, CommsSim } from './comms.js';
import { Bridge } from './bridge.js';
import { CommsHUD } from './hud-comms.js';

let DATA = null;
export const commsData = () => DATA || { billets: {} };
export async function loadCommsData(url = './assets/data/comms.json') {
  if (DATA) return DATA;
  try { DATA = await (await fetch(url)).json(); } catch (e) { console.warn('comms data not loaded', e); DATA = { billets: {} }; }
  return DATA;
}
export function setCommsData(d) { DATA = d; }

// opts: { roster, shipState, seed, data, mission, sound, G, onLighting, hud (default true if a document exists), startHour, urlAlert }
export function createShipComms(o) {
  const data = o.data || commsData(), seed = o.seed ?? 1;
  const alerts = new AlertState(), clock = new ShipClock({ seed, startHour: o.startHour ?? null }), bus = new CommBus();
  clock.assign(o.roster);
  const bridge = new Bridge({ roster: o.roster, clock, data, seed });
  const sim = new CommsSim({ bus, alerts, bridge, clock, data, roster: o.roster, shipState: o.shipState || null, seed, mission: o.mission || 'quiet_watch', player: o.player || null });
  const hud = (o.hud ?? (typeof document !== 'undefined')) ? new CommsHUD({ alerts, bus, sim, clock, sound: o.sound, G: o.G, onLighting: o.onLighting }) : null;
  const api = {
    alerts, clock, bus, bridge, sim, hud, data,
    tick(dt) { if (o.G) sim.deck = o.G.shipDeck; sim.tick(dt); hud?.update(dt); },
    raise(id, opt = {}) { return alerts.raise(id, { source: 'debug', ...opt }); },
    destroy() { hud?.destroy(); },
  };
  const ua = o.urlAlert; if (ua && ALERT_IDS.includes(ua)) alerts.raise(ua, { source: 'debug', reason: 'URL parameter ?alert=' + ua });
  return api;
}
