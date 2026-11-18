// Shared checks for job modules (js/jobs/<billet>__<slug>.js): shape, source rules, fingerprint distinctness, auto-play.
// Used by tools/check-jobs.mjs (per-file validator) and tools/merge-jobs.mjs (registry builder). docs/procedures.md is the authoring guide.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const JOBDIR = join(ROOT, 'js/jobs');
export const imp = (p) => import(pathToFileURL(p.startsWith('/') ? p : join(ROOT, p)).href);
export const NOT_JOBS = ['kit.js', 'host.js', 'index.js'];
export const listJobFiles = () => readdirSync(JOBDIR).filter(f => f.endsWith('.js') && !NOT_JOBS.includes(f)).sort().map(f => join(JOBDIR, f));

export const DEPTS = ['command', 'flight', 'operations', 'engineering', 'security', 'sciences', 'medical', 'services'];
export const BILLET_DEPT = { co: 'command', xo: 'command', so: 'command', yeoman: 'command', cfo: 'flight', helm: 'flight', nav: 'flight', pilot: 'flight', deck: 'flight', ops: 'operations', comms: 'operations', tchief: 'operations', ttech: 'operations', comp: 'operations',
  ce: 'engineering', ace: 'engineering', reactor: 'engineering', env: 'engineering', eps: 'engineering', dc: 'engineering', cos: 'security', dep: 'security', armory: 'security', sec: 'security', guard: 'security',
  cso: 'sciences', sensor: 'sciences', carto: 'sciences', bot: 'sciences', lab: 'sciences', cmo: 'medical', counsel: 'medical', doc: 'medical', nurse: 'medical', medtech: 'medical', qm: 'services', galley: 'services', cook: 'services', cargo: 'services', rep: 'services', holo: 'services' };
// input tokens: a fingerprint's input is these joined with '+', e.g. 'arrows+enter', 'e-hold+look'
export const INPUT_TOKENS = { console: ['digits', 'arrows', 'arrows-hold', 'enter', 'space', 'space-hold', 'rhythm'], room: ['e-tap', 'e-hold', 'look', 'turn', 'swing', 'rhythm'] };
// the existing mechanics (js/jobgames.js KINDS, js/worksites.js acts): a module's fingerprint must not be a near duplicate of these either
export const BASE = [
  ['sequence', 'key in', 'digits', 'code keyed in symbol by symbol'], ['wires', 'connect', 'arrows+digits', 'every lead wired to its matching terminal'], ['dial', 'bleed', 'space', 'three bleeds while the needle is in the band'],
  ['calibrate', 'track', 'arrows-hold', 'marker held on the drifting reading until the meter fills'], ['vitals', 'spot', 'digits', 'the out of range bed found each round'], ['hypo', 'dose', 'arrows+space', 'dose set to the chart for each patient'],
  ['tray', 'spot', 'digits', 'empty or wrong slot found on the tray'], ['meds', 'count', 'digits', 'drug count keyed'], ['counsel', 'reply', 'digits', 'helpful reply chosen in each conversation'], ['power', 'route', 'arrows+enter', 'every bus matches its demand'],
  ['bench', 'test', 'digits', 'each part passed or rejected against spec'], ['tune', 'tune', 'arrows-hold+space', 'signal locked at full strength'], ['classify', 'classify', 'digits', 'contact class matched in the legend'],
  ['badge', 'admit', 'digits', 'each badge admitted or denied by the rule'], ['doorlog', 'audit', 'digits', 'unauthorised log line found'], ['cook', 'cook', 'digits', 'pans taken off inside the done window'],
  ['nutrient', 'mix', 'arrows+enter', 'feed lines dosed to recipe'], ['fresh', 'rotate', 'digits', 'expired item found'], ['manifest', 'match', 'digits', 'crate code matching the manifest line'], ['loadbal', 'balance', 'arrows', 'crates stowed within trim'],
  ['course', 'plot', 'arrows', 'waypoints reached avoiding hazards'], ['decode', 'decode', 'digits', 'codebook message closest to the pattern'], ['station', 'hold', 'arrows-hold', 'ship held inside the box until the meter fills'],
  ['burn', 'brake', 'space-hold', 'marker reached at a speed in the green band'], ['fix', 'fix', 'digits', 'position where the bearings cross'], ['coords', 'lock', 'arrows+enter', 'lock dialled to drifting target coordinates'],
  ['form', 'fill', 'arrows+enter', 'form fields filled from readings and filed'], ['roster', 'assign', 'digits', 'each post filled with a free qualified person'], ['queue', 'prioritise', 'digits', 'items taken in priority order'],
  ['verify', 'verify', 'digits+enter', 'differing blocks flagged and resent'], ['pa', 'announce', 'digits+space', 'right decks selected and broadcast on clear channel'], ['schedule', 'book', 'arrows+enter', 'blocks booked in free time inside windows'],
  ['sign', 'sign', 'digits', 'complete entries signed and incomplete queried'], ['trend', 'review', 'digits', 'segment where the trace left its limits'], ['brief', 'brief', 'digits', 'items given most urgent first and wrong read back caught'],
  ['decide', 'decide', 'digits', 'best option inside both limits'], ['fly', 'fly', 'arrows-hold', 'heading and speed held until the leg meter fills'], ['post', 'guard', 'digits', 'each person admitted refused or held by the rule'],
  ['assay', 'assay', 'arrows+enter+digits', 'run set to protocol and trace matched to reference'], ['triage', 'triage', 'arrows+digits', 'everyone tagged by the start rule'], ['standby', 'stand by', 'digits', 'own call answered before its lamp times out'],
  ['site:scrub', 'scrub', 'e-hold+look', 'every patch scrubbed clean'], ['site:scan', 'scan', 'e-hold+look', 'reading locked at the peak bearing'], ['site:timing', 'charge', 'e-hold', 'released inside the band'],
  ['site:count', 'count', 'e-tap', 'exact count tapped'], ['site:turn', 'crank', 'e-hold+turn', 'released inside the band'], ['site:carry', 'carry', 'e-tap+e-hold', 'every load set down at its drop'], ['site:read', 'read', 'e-tap+e-hold', 'every gauge called in or out of limits'],
].map(([id, verb, input, win]) => ({ id, verb, input, win, rule: '' }));

const STOP = new Set('the a an and or of to in on at by for with each every its it is be as from into onto than then that this when while until before after your you their them one all any only not no out off up down over under'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
export const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem));
export const jacc = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
export const inputSet = (s) => String(s || '').split('+').map(x => x.trim()).filter(Boolean).sort().join('+');
export const normVerb = (s) => [...toks(s)].sort().join(' ');
// near duplicate: the same input scheme and (the same verb, or a win condition / rule that mostly says the same thing)
export function nearDup(a, b) {
  if (inputSet(a.input) !== inputSet(b.input)) return null;
  if (normVerb(a.verb) && normVerb(a.verb) === normVerb(b.verb)) return 'same verb and input';
  const w = jacc(toks(a.win), toks(b.win)); if (w >= 0.5) return `win condition ${Math.round(w * 100)} % alike`;
  const r = a.rule && b.rule ? jacc(toks(a.rule), toks(b.rule)) : 0; if (r >= 0.55) return `rule ${Math.round(r * 100)} % alike`;
  return null;
}

// ---- duties + item / prop catalogues
let _cat = null;
export async function catalogue() {
  if (_cat) return _cat;
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8')), jobs = new Map();
  for (const [b, d] of Object.entries(duties.billets)) { for (const l of d.loops || []) jobs.set(`${b}|${l.label}|loop`, { ...l, billet: b, type: 'loop' }); for (const [ms, ts] of Object.entries(d.tasks || {})) for (const t of ts) jobs.set(`${b}|${t.task}|task:${ms}`, { ...t, billet: b, label: t.task, type: 'task:' + ms }); }
  const { HANDHELDS } = await imp('js/handhelds.js'), W = await imp('js/worksites.js');
  const props = new Set([...W.SUPPLY, ...Object.values(W.SITE_DEFS).flatMap(d => [...d.props, ...(d.hub || [])]), 'console', 'desk', 'helm', 'navstation', 'opsstation', 'commsstation', 'sensorstation', 'secdesk', 'nursestation', 'captain_chair', 'bunk', 'locker']);
  return (_cat = { duties, jobs, items: new Set(Object.keys(HANDHELDS)), props });
}

// a canvas 2D context that accepts every call (draw() smoke test)
export function mockCtx() { const noop = () => { }; return new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop, set: (t, k, v) => { t[k] = v; return true; } }); }
export const PAL = { wires: ['#ff5a48', '#4fd06a', '#4f9dff', '#ffd23f'], good: '#4fd06a', bad: '#ff5a48' };

// play one game: how 'win' (hint), 'bad' (bad), 'idle'
export function play(mod, g, how, dt = 1 / 30, maxT = 200) {
  let f = 0;
  for (let t = 0; g.state === 'play' && t < maxT; t += dt, f++) {
    if (mod.host === 'console') { if (how === 'win') for (const [code, down] of g.hint()) g.key(code, down); else if (how === 'bad') { const b = g.bad(); if (Array.isArray(b)) g.key(b[0], b[1]); else if (b) g.key(b, true); } g.tick(dt); }
    else g.step(dt, how === 'win' ? { hasItem: true, ...g.hint(f) } : how === 'bad' ? { hasItem: true, ...(g.bad(f) || { at: -1 }) } : { at: -1 });
  }
  return g.result();
}

// every check for one module file -> { errors: [], warnings: [], stats }
export async function checkFile(file, { others = [], seeds = 25 } = {}) {
  const E = [], Wn = [], err = (m) => E.push(m), warn = (m) => Wn.push(m), cat = await catalogue(), K = await imp('js/jobs/kit.js'), src = readFileSync(file, 'utf8');
  const lines = src.split('\n').length; if (lines > 220) err(`${lines} lines: keep a module under 220 (aim for 60-150)`); else if (lines > 160) warn(`${lines} lines (aim for 60-150)`);
  for (const m of src.matchAll(/import\s[^'"]*['"]([^'"]+)['"]/g)) if (m[1] !== './kit.js') err(`imports ${m[1]}: a job module may only import './kit.js'`);
  if (/createGame|createSiteRun|jobgames|worksites|KINDS\b/.test(src)) err('delegates to an existing mechanic (createGame / createSiteRun / KINDS): write your own');
  if (/Math\.random|Date\.now|performance\.now|document\.|window\./.test(src)) err('uses Math.random / clocks / DOM: use m.rnd (seeded) and the dt passed in');
  let mod; try { mod = (await imp(file)).default; } catch (e) { err('does not import: ' + e.message); return { errors: E, warnings: Wn }; }
  if (!mod || typeof mod.create !== 'function' || !mod.job) { err('default export must be define({ job, ..., create })'); return { errors: E, warnings: Wn }; }
  const { billet, label, type } = mod.job, key = `${billet}|${label}|${type}`, job = cat.jobs.get(key);
  if (!job) err(`job ${key} is not in assets/data/duties.json (billet | exact label | 'loop' or 'task:<mission>')`);
  if (basename(file) !== K.fileFor(billet, label, type)) err(`file name must be ${K.fileFor(billet, label, type)}`);
  if (mod.id !== K.jobId(billet, label, type)) err('id mismatch: use define()');
  if (!mod.title || mod.title.length > 48) err('title: 1-48 chars'); if (mod.dept !== BILLET_DEPT[billet]) err(`dept must be '${BILLET_DEPT[billet]}' for billet ${billet}`);
  if (!['console', 'room'].includes(mod.host)) err("host: 'console' or 'room'");
  if (!(mod.how?.length >= 30)) err('how: one sentence (30+ chars) for the instruction card'); if (!(mod.rush?.length >= 10)) err('rush: the corner cut when the job is rushed (10+ chars)');
  if (!Array.isArray(mod.keys) || !mod.keys.length) err('keys: the key labels shown on the card');
  if (!(mod.limit >= K.MIN_LIMIT && mod.limit <= K.MAX_LIMIT)) err(`limit ${mod.limit}: ${K.MIN_LIMIT}-${K.MAX_LIMIT} s`); if (!(mod.maxFaults >= 2 && mod.maxFaults <= 5)) err('maxFaults: 2-5');
  if (mod.host === 'room' && mod.item && !cat.items.has(mod.item)) err(`item ${mod.item} is not a handheld (js/handhelds.js)`);
  const F = mod.fingerprint || {};
  for (const k of ['verb', 'input', 'win', 'fail', 'rule']) if (!F[k]) err(`fingerprint.${k} missing`);
  if (F.verb && F.verb.split(/\s+/).length > 3) err('fingerprint.verb: 1-3 words'); if (F.win?.length < 15) err('fingerprint.win: say what winning means (15+ chars)'); if (F.rule?.length < 40) err('fingerprint.rule: the one-line rule (40+ chars)');
  const toksIn = String(F.input || '').split('+'), okT = INPUT_TOKENS[mod.host] || []; for (const t of toksIn) if (!okT.includes(t)) err(`fingerprint.input token '${t}' (${mod.host}: ${okT.join(' ')})`);
  for (const b of BASE) { const d = nearDup(F, b); if (d) err(`fingerprint is a near duplicate of the existing mechanic ${b.id} (${d})`); }
  for (const o of others) { if (o.id === mod.id) continue; const d = nearDup(F, o.fingerprint || {}); if (d) err(`fingerprint is a near duplicate of ${o.file || o.id} "${o.title}" (${d})`); if (o.title === mod.title) err('title already used by ' + (o.file || o.id)); }
  if (E.length) return { errors: E, warnings: Wn };
  // ---- auto-play
  const stats = { win: 0, bad: 0, idle: 0, maxT: 0 }, t0 = Date.now();
  try {
    for (let s = 1; s <= seeds; s++) for (const calm of [false, true]) {
      const g = mod.create(s, { calm }), r = play(mod, g, 'win'); stats.maxT = Math.max(stats.maxT, r.t / g.limit);
      if (r.state !== 'win' || r.strikes) err(`seed ${s}${calm ? ' calm' : ''}: hinted play must win clean: ${JSON.stringify(r)}`); else stats.win++;
      if (r.t > g.limit * 0.85) err(`seed ${s}${calm ? ' calm' : ''}: hinted play took ${r.t} of ${g.limit} s (must end inside 85 %)`);
      if (E.length > 6) break;
    }
    for (let s = 1; s <= seeds && E.length < 7; s++) {
      const b = mod.create(s, {}), rb = play(mod, b, 'bad'); if (rb.state !== 'fail') err(`seed ${s}: bad play must fail: ${JSON.stringify(rb)}`); else stats.bad++;
      const i = mod.create(s, {}), ri = play(mod, i, 'idle', 0.1, 300); if (ri.state !== 'fail' || ri.t > i.limit + 0.5) err(`seed ${s}: idle must end by itself (fail) within the limit: ${JSON.stringify(ri)}`); else stats.idle++;
    }
    const a = mod.create(9, {}), b = mod.create(9, {}); if (JSON.stringify(a.view()) !== JSON.stringify(b.view())) err('not deterministic: same seed, different view()');
    const views = new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(mod.create(100 + i, {}).view()))); if (views.size < 4) err(`view(): different seeds must give different content (${views.size}/6)`);
    if (mod.create(3, { calm: true }).limit !== Math.round(mod.create(3, {}).limit * 1.5 * 10) / 10) err('calm must give +50 % time');
    const c = mod.create(4, {}); c.cancel(); if (c.state !== 'cancel') err('cancel()'); c.tick?.(50); c.step?.(50, {}); if (c.state !== 'cancel') err('a cancelled game must stay cancelled');
    if (mod.host === 'console') {
      const g = mod.create(5, { cb: true }); for (const k of K.RESERVED) if (g.key(k, true)) err(`key ${k} is reserved by the menus: return false`);
      const bt = g.buttons(); if (!Array.isArray(bt) || !bt.length || bt.some(x => !Array.isArray(x) || typeof x[0] !== 'string')) err('buttons(): [[code, label], ...]');
      const ctx = mockCtx(); for (let f = 0; f < 90; f++) { for (const [code, d] of g.hint()) g.key(code, d); g.tick(1 / 30); g.draw(ctx, 400, 170, PAL); }
    } else {
      const g = mod.create(5, {}); if (!g.sites?.length || g.sites.some(s => !s.name)) err('room: sites [{ name, prop }]');
      for (const s of g.sites) if (s.prop && !cat.props.has(s.prop)) err(`site prop '${s.prop}' is not a known room prop`);
      for (let f = 0; f < 90; f++) { g.step(1 / 30, { hasItem: true, ...g.hint(f) }); const at = g.next < 0 ? 0 : g.next; if (typeof g.prompt(at) !== 'string' || typeof g.panel(at) !== 'object') { err('room: prompt(i) string, panel(i) object'); break; } }
    }
  } catch (e) { err('threw during auto-play: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  stats.ms = Date.now() - t0;
  return { errors: E, warnings: Wn, stats, mod };
}
