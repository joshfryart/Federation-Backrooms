// Versioned local save: settings, career meta, best deck, learned tools, run history and a top-10 leaderboard per mode.
//   createSave(storage)   storage = anything with getItem/setItem/removeItem (window.localStorage, or a fake in tests). Never throws:
//                         every storage access is in try/catch and the module keeps working from memory when storage is blocked.
//   save.data             the live blob { v, cfg, meta, best, board:{nominal:[],madness:[]}, runs:[], extra }
//   save.cfg() / setCfg(o)    settings (fb_cfg shape; includes learned tools)      save.meta() / setMeta(o)    career counters
//   save.best() / setBest(n)  best deck                                            save.recordRun(run)         stats + leaderboard, returns { rank, entry }
//   save.board(mode)          top 10 for 'nominal' | 'madness'                     save.exportJSON() / importJSON(text) / reset()
//   save.persistent           false when storage could not be written (private window / blocked)
// Storage layout: one canonical key `fb_save` (schema SAVE_VERSION). The old keys fb_cfg / fb_meta / fb_best are still MIRRORED on every write, because
// other modules (js/lcars-buttons.js) read them directly; fb_pace / fb_voicemode / fb_navtour stay owned by their modules and are only
// snapshotted into the export and restored on import. First load with no fb_save migrates the old keys. Local only: no network, no personal data.
export const SAVE_KEY = 'fb_save', SAVE_VERSION = 1, BOARD_SIZE = 10, RUN_HISTORY = 40, MODES = ['nominal', 'madness'];
const EXTRA_KEYS = ['fb_pace', 'fb_voicemode', 'fb_navtour'];
const DEF_CFG = { sens: 1, vol: 0.8, quality: 'high', calm: false, caps: false, cb: false };
const DEF_META = { runs: 0, bestDeck: 0, kills: 0, wins: 0 };

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const num = (v, d = 0, lo = 0, hi = 1e9) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const str = (v, n = 60) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f<>&]/g, '').slice(0, n);

// ---- migrations: MIGRATE[n] turns a version-n blob into version n+1 (add one per schema change, never edit an old one)
export const MIGRATE = {
  0: (d) => d,   // v0 = a blob with no version; the legacy keys are folded in by fromLegacy(), so nothing to convert here
};
export function migrate(d) {
  if (!isObj(d)) return null;
  let v = Number.isInteger(d.v) ? d.v : 0;
  if (v > SAVE_VERSION) return null;   // written by a newer game: refuse rather than guess
  while (v < SAVE_VERSION) { d = MIGRATE[v] ? MIGRATE[v](d) : d; v++; d.v = v; }
  return d;
}

export function cleanRun(r) {
  if (!isObj(r)) return null;
  const mode = MODES.includes(r.mode) ? r.mode : null; if (!mode) return null;
  return { t: num(r.t, 0, 0, 8.64e15), mode, ship: str(r.ship), seed: num(r.seed, 0, -1e12, 1e12) | 0, decks: num(r.decks, 0, 0, 999) | 0, time: Math.round(num(r.time, 0, 0, 1e7)),
    kills: num(r.kills, 0, 0, 1e6) | 0, deaths: num(r.deaths, 0, 0, 1e6) | 0, proper: num(r.proper, 0, 0, 1e6) | 0, rushed: num(r.rushed, 0, 0, 1e6) | 0,
    review: r.review == null ? null : Math.round(num(r.review, 0, 0, 100)), cause: str(r.cause, 80), won: !!r.won };
}
// leaderboard order: Systems Nominal = best review score, then more jobs done properly, then less time; the roguelike = deepest deck, then kills, then less time
export function better(mode, a, b) {
  if (mode === 'madness') return (b.decks - a.decks) || (b.kills - a.kills) || (a.time - b.time);
  return ((b.review ?? -1) - (a.review ?? -1)) || (b.proper - a.proper) || (a.time - b.time);
}
const sortBoard = (mode, list) => list.slice().sort((a, b) => better(mode, a, b)).slice(0, BOARD_SIZE);

function clean(d) {   // coerce whatever was parsed into a well-formed blob
  const o = { v: SAVE_VERSION, cfg: Object.assign({}, DEF_CFG, isObj(d?.cfg) ? d.cfg : {}), meta: Object.assign({}, DEF_META), best: num(d?.best, 0, 0, 999) | 0, board: { nominal: [], madness: [] }, runs: [], extra: {} };
  if (isObj(d?.meta)) for (const k of Object.keys(DEF_META)) o.meta[k] = num(d.meta[k], 0, 0, 1e9) | 0;
  if (o.cfg.learned !== undefined && !Array.isArray(o.cfg.learned) && !isObj(o.cfg.learned)) delete o.cfg.learned;
  for (const m of MODES) o.board[m] = sortBoard(m, (Array.isArray(d?.board?.[m]) ? d.board[m] : []).map(cleanRun).filter((r) => r && r.mode === m));
  o.runs = (Array.isArray(d?.runs) ? d.runs : []).map(cleanRun).filter(Boolean).slice(-RUN_HISTORY);
  if (isObj(d?.extra)) for (const k of EXTRA_KEYS) if (typeof d.extra[k] === 'string') o.extra[k] = d.extra[k].slice(0, 400);
  return o;
}

export function createSave(storage) {
  let ok = true;
  const rd = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { ok = false; return null; } };
  const wr = (k, v) => { try { if (!storage) { ok = false; return false; } storage.setItem(k, v); return true; } catch (e) { ok = false; return false; } };
  const rm = (k) => { try { storage?.removeItem(k); } catch (e) { ok = false; } };
  const json = (k) => { const s = rd(k); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } };

  const fromLegacy = () => clean({ cfg: json('fb_cfg'), meta: json('fb_meta'), best: +rd('fb_best') || 0 });
  let data;
  { const raw = json(SAVE_KEY), m = raw ? migrate(raw) : null; data = m ? clean(m) : fromLegacy(); }

  function flush() { ok = true; wr(SAVE_KEY, JSON.stringify(data)); wr('fb_cfg', JSON.stringify(data.cfg)); wr('fb_meta', JSON.stringify(data.meta)); wr('fb_best', String(data.best)); return ok; }
  function snapExtras() { for (const k of EXTRA_KEYS) { const v = rd(k); if (v != null) data.extra[k] = String(v).slice(0, 400); else delete data.extra[k]; } }
  flush();   // writes the migrated shape so the next load is a plain read

  return {
    get data() { return data; }, get persistent() { return ok; },
    cfg: () => data.cfg, setCfg(o) { data.cfg = clean({ cfg: o }).cfg; flush(); return data.cfg; },
    meta: () => ({ ...data.meta }), setMeta(o) { data.meta = clean({ meta: o }).meta; flush(); },
    best: () => data.best, setBest(n) { data.best = Math.max(data.best, num(n, 0, 0, 999) | 0); flush(); return data.best; },
    board: (mode) => (data.board[mode] || []).map((r) => ({ ...r })),
    runs: () => data.runs.map((r) => ({ ...r })),
    // record one finished run: update career counters + best deck, append to history, insert into the board. rank = 1-based place on the board or 0 (missed the top 10)
    recordRun(run) {
      const r = cleanRun({ t: Date.now(), ...run }); if (!r) return { rank: 0, entry: null };
      data.meta.runs++; data.meta.bestDeck = Math.max(data.meta.bestDeck, r.decks); data.meta.kills += r.kills; if (r.won) data.meta.wins++;
      data.best = Math.max(data.best, r.decks);
      data.runs = [...data.runs, r].slice(-RUN_HISTORY);
      const list = sortBoard(r.mode, [...data.board[r.mode], r]); data.board[r.mode] = list;
      flush(); return { rank: list.indexOf(r) + 1, entry: r };
    },
    exportJSON() { snapExtras(); flush(); return JSON.stringify({ game: 'starfarers-backdecks', ...data }, null, 1); },
    // returns { ok, error? }. Nothing is changed unless the whole file validates
    importJSON(text) {
      let d; try { d = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not a JSON file' }; }
      if (!isObj(d) || (d.game && d.game !== 'starfarers-backdecks')) return { ok: false, error: 'Not a Starfarers save' };
      const m = migrate(d); if (!m) return { ok: false, error: 'Save is from a newer version of the game' };
      data = clean(m); for (const k of EXTRA_KEYS) { if (data.extra[k] != null) wr(k, data.extra[k]); else rm(k); }
      flush(); return { ok: true };
    },
    reset() { data = clean({}); for (const k of [SAVE_KEY, 'fb_cfg', 'fb_meta', 'fb_best', ...EXTRA_KEYS]) rm(k); flush(); return data; },
  };
}

export const fmtRunTime = (s) => { s = Math.max(0, s | 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
// one board row as plain text parts (cleanRun already stripped markup characters)
export function rowText(mode, r) {
  return mode === 'madness' ? { main: `Deck ${r.decks}`, sub: `${r.ship} · ${r.kills} hostiles · ${fmtRunTime(r.time)}${r.won ? ' · escaped' : ''}` }
    : { main: `${r.review ?? 0}% review`, sub: `${r.ship} · ${r.proper} proper / ${r.rushed} rushed · ${fmtRunTime(r.time)}${r.deaths ? ` · ${r.deaths} lost` : ''}${r.cause ? ' · ' + r.cause : ''}` };
}
