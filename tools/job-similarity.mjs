// Behavioural duplicate detector for job modules (complements the lexical fingerprint check in jobcheck-lib.mjs).
// Each module is REPLAYED with its own hint() on fixed seeds and reduced to a trace: the action token sequence (key class + press/release,
// or room input shape, run-length bucketed), the timing profile (gap histogram, win time / limit), the view() skeleton (paths + value types,
// not values), the draw-op histogram (console) / panel curve (room), and the bad-play shape. Pairs are scored 0..1, then clustered by
// average linkage. Everything is seeded: same tree, same output.
//   node tools/job-similarity.mjs                  summary + worst clusters + worst offenders
//   node tools/job-similarity.mjs --json out.json  machine-readable dump (stats, clusters, offenders)
//   --threshold 0.72   linkage cut     --top 15   clusters listed     --offenders 25
// The weights and the 0.72 cut are judgement calls (no ground truth for "feels like the same game"); see TODO.md.
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { listJobFiles, imp, mockCtx, PAL } from './jobcheck-lib.mjs';

const args = process.argv.slice(2), opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const THRESH = +opt('--threshold', 0.72), TOPN = +opt('--top', 15), OFFN = +opt('--offenders', 25), SEEDS = [1, 2, 3], DT = 1 / 30;

const kc = (code) => /^Digit|^Numpad\d/.test(code) ? 'D' : /^Arrow|^Key[WASD]$/.test(code) ? 'A' : code === 'Space' ? 'S' : /Enter/.test(code) ? 'E' : 'K';
const lb = (n) => n <= 1 ? 0 : n <= 3 ? 1 : n <= 8 ? 2 : n <= 20 ? 3 : 4;   // run-length bucket
const sgn = (v) => v > 0.05 ? '+' : v < -0.05 ? '-' : '0';
function skeleton(v, p = '', out = new Set(), d = 0) {
  if (Array.isArray(v)) { out.add(p + '[' + lb(v.length) + ']'); if (v.length && d < 4) skeleton(v[0], p + '[]', out, d + 1); }
  else if (v && typeof v === 'object') { for (const k of Object.keys(v).sort()) skeleton(v[k], p + '.' + k, out, d + 1); }
  else out.add(p + ':' + typeof v);
  return out;
}
function countingCtx() {
  const ops = {}, base = mockCtx();
  return { ops, ctx: new Proxy({}, { get: (t, k) => k === 'measureText' || k === 'createLinearGradient' || k === 'createRadialGradient' ? base[k] : (...a) => { if (typeof k === 'string') ops[k] = (ops[k] || 0) + 1; }, set: () => true }) };
}
const norm = (h) => { const s = Object.values(h).reduce((a, b) => a + b, 0) || 1; const o = {}; for (const k in h) o[k] = h[k] / s; return o; };
const addInto = (h, o) => { for (const k in o) h[k] = (h[k] || 0) + o[k]; };

function frameToken(mod, g, f) {
  if (mod.host === 'console') {
    const h = g.hint(); if (!h.length) return '';
    return h.map(([c, d]) => kc(c) + (d ? 'v' : '^')).sort().join('');
  }
  const h = g.hint(f) || {}, p = [];
  if (h.hold) p.push('H'); if (h.press) p.push('P'); if (h.swing) p.push('W' + sgn(h.swing)); if (h.turn) p.push('T'); if (h.look !== undefined && Math.abs(h.look) > 0.05) p.push('L' + sgn(h.look));
  return h.at === -1 || h.at === undefined ? (p.length ? 'x' + p.join('') : '') : p.join('') || 'i';
}
function traceRun(mod, seed, how) {
  const g = mod.create(seed, {}), toks = [], draw = {}, panel = [], isC = mod.host === 'console', gaps = [];
  let last = null, run = 0, lastEvT = 0, f = 0;
  const flush = () => { if (last) toks.push(last + lb(run)); };
  const ctx = isC ? countingCtx() : null;
  for (let t = 0; g.state === 'play' && t < 120; t += DT, f++) {
    let tok = '';
    if (how === 'win') tok = frameToken(mod, g, f);
    else if (how === 'bad') { const b = isC ? g.bad() : g.bad(f); tok = isC ? (b ? (Array.isArray(b) ? kc(b[0]) + (b[1] ? 'v' : '^') : kc(b) + 'v') : '') : (b ? 'b' : ''); }
    if (tok !== last) { flush(); last = tok; run = 1; if (tok) { gaps.push(t - lastEvT); lastEvT = t; } } else run++;
    if (isC) {
      if (how === 'win') for (const [c, d] of g.hint()) g.key(c, d); else if (how === 'bad') { const b = g.bad(); if (Array.isArray(b)) g.key(b[0], b[1]); else if (b) g.key(b, true); }
      g.tick(DT);
      if (how === 'win' && f % 10 === 0) { const before = { ...ctx.ops }; g.draw(ctx.ctx, 400, 170, PAL); for (const k in ctx.ops) draw[k] = (draw[k] || 0) + ctx.ops[k] - (before[k] || 0); }
    } else {
      g.step(DT, how === 'win' ? { hasItem: true, ...g.hint(f) } : how === 'bad' ? { hasItem: true, ...(g.bad(f) || { at: -1 }) } : { at: -1 });
      if (how === 'win' && f % 15 === 0) { const at = g.next < 0 ? 0 : g.next; try { const pn = g.panel(at); panel.push(Math.round((pn.bar || 0) * 6) + (pn.band ? 'b' : '')); } catch { /* panel optional mid-run */ } }
    }
  }
  flush(); const r = g.result();
  return { toks: toks.filter(x => x), gaps: gaps.slice(1), draw: norm(draw), panel, ratio: r.t / g.limit, view: skeleton(g.view()) };
}

function buildTrace(mod) {
  const wins = SEEDS.map(s => traceRun(mod, s, 'win')), bads = SEEDS.map(s => traceRun(mod, s, 'bad'));
  const gh = {}; for (const w of wins) for (const gp of w.gaps) { const b = Math.min(7, Math.max(0, Math.round(Math.log2(gp * 30 + 1)))); gh[b] = (gh[b] || 0) + 1; }
  const draw = {}; for (const w of wins) addInto(draw, w.draw); const view = new Set(); for (const w of wins) for (const k of w.view) view.add(k);
  return { host: mod.host, seqs: wins.map(w => w.toks), bad: bads.map(b => b.toks.slice(0, 12)), gh: norm(gh), ratio: wins.reduce((a, w) => a + w.ratio, 0) / 3, draw: norm(draw), view, panel: wins.map(w => w.panel),
    badRatio: bads.reduce((a, b) => a + b.ratio, 0) / 3, limit: mod.limit, maxFaults: mod.maxFaults, input: mod.fingerprint?.input || '' };
}

const lev = (a, b) => { if (!a.length && !b.length) return 1; const m = a.length, n = b.length; let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return 1 - p[n] / Math.max(m, n); };
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (const k in a) { na += a[k] ** 2; if (k in b) d += a[k] * b[k]; } for (const k in b) nb += b[k] ** 2; return !na || !nb ? (na === nb ? 1 : 0) : d / Math.sqrt(na * nb); };
const jac = (a, b) => { if (!a.size && !b.size) return 1; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const bg = (s) => { const o = new Set(s); for (let i = 0; i + 1 < s.length; i++) o.add(s[i] + '>' + s[i + 1]); return o; };
const close = (a, b, s) => Math.max(0, 1 - Math.abs(a - b) / s);
const avg3 = (f) => (f(0) + f(1) + f(2)) / 3;
export const W = { seq: 0.30, grams: 0.10, timing: 0.15, view: 0.15, draw: 0.15, bad: 0.10, scale: 0.05 };
export function similarity(A, B) {
  const seq = avg3(i => lev(A.seqs[i], B.seqs[i])), grams = avg3(i => jac(bg(A.seqs[i]), bg(B.seqs[i])));
  const timing = 0.6 * cos(A.gh, B.gh) + 0.4 * close(A.ratio, B.ratio, 0.5), view = jac(A.view, B.view);
  const draw = A.host !== B.host ? 0 : A.host === 'console' ? cos(A.draw, B.draw) : avg3(i => lev(A.panel[i], B.panel[i]));
  const bad = avg3(i => lev(A.bad[i], B.bad[i])) * 0.7 + 0.3 * close(A.badRatio, B.badRatio, 0.5);
  const scale = (close(A.limit, B.limit, 20) + close(A.maxFaults, B.maxFaults, 3) + (A.input === B.input ? 1 : 0)) / 3;
  const s = W.seq * seq + W.grams * grams + W.timing * timing + W.view * view + W.draw * draw + W.bad * bad + W.scale * scale;
  return A.host !== B.host ? s * 0.6 : s;
}

export async function loadTraces(files = listJobFiles()) {
  const out = [];
  for (const f of files) { try { const mod = (await imp(f)).default; out.push({ file: basename(f), id: mod.id, host: mod.host, title: mod.title, t: buildTrace(mod) }); } catch (e) { console.error('skip', basename(f), String(e.message || e).slice(0, 80)); } }
  return out;
}
export function matrix(items) { const n = items.length, M = Array.from({ length: n }, () => new Float32Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) M[i][j] = M[j][i] = similarity(items[i].t, items[j].t); return M; }
// average-linkage agglomerative clustering; stop when the best merge falls under thresh
export function cluster(M, thresh) {
  const n = M.length, cl = new Map(), S = new Map();
  for (let i = 0; i < n; i++) { cl.set(i, [i]); S.set(i, new Map()); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) S.get(i).set(j, M[i][j]);
  for (;;) {
    let bi = -1, bj = -1, bv = thresh; for (const [i, row] of S) for (const [j, v] of row) if (j > i && v > bv) { bv = v; bi = i; bj = j; }
    if (bi < 0) break;
    const na = cl.get(bi).length, nb = cl.get(bj).length, ri = S.get(bi), rj = S.get(bj);
    for (const [k, v] of ri) { if (k === bj) continue; const nv = (v * na + rj.get(k) * nb) / (na + nb); ri.set(k, nv); S.get(k).set(bi, nv); }
    ri.delete(bj); for (const [, rk] of S) rk.delete(bj); S.delete(bj); cl.set(bi, cl.get(bi).concat(cl.get(bj))); cl.delete(bj);
  }
  return [...cl.values()].filter(c => c.length > 1).map(c => c.slice().sort((x, y) => x - y));
}
export function stats(items, M, clusters) {
  const n = items.length, sizes = clusters.map(c => c.length).sort((a, b) => b - a), pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push(M[i][j]); pairs.sort((a, b) => a - b);
  const q = (p) => +pairs[Math.floor(p * (pairs.length - 1))].toFixed(3), near = (th) => { let c = 0; for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < n; j++) if (i !== j && M[i][j] > m) m = M[i][j]; if (m >= th) c++; } return c; };
  return { modules: n, clusters: clusters.length, inClusters: sizes.reduce((a, b) => a + b, 0), largest: sizes.slice(0, 6), clustersOf4plus: sizes.filter(s => s >= 4).length, p50: q(0.5), p99: q(0.99), p999: q(0.999), max: q(1), withNeighbour90: near(0.90), withNeighbour85: near(0.85), withNeighbour80: near(0.80) };
}
export function offenders(items, M, clusters, k) {
  const rows = [];
  for (const c of clusters) for (const i of c) {
    const others = c.filter(j => j !== i), mean = others.reduce((a, j) => a + M[i][j], 0) / others.length; let mx = 0, mj = -1;
    for (let j = 0; j < items.length; j++) if (j !== i && M[i][j] > mx) { mx = M[i][j]; mj = j; }
    rows.push({ file: items[i].file, cluster: c.length, mean: +mean.toFixed(3), max: +mx.toFixed(3), twin: items[mj].file, score: mean * Math.log2(c.length + 1) + mx });
  }
  return rows.sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : 1)).slice(0, k);
}

if (process.argv[1] && process.argv[1].endsWith('job-similarity.mjs')) {
  const t0 = Date.now(), items = await loadTraces(), M = matrix(items), clusters = cluster(M, THRESH).sort((a, b) => b.length - a.length || a[0] - b[0]), st = stats(items, M, clusters);
  console.log(`traced ${items.length} modules in ${Date.now() - t0} ms; linkage threshold ${THRESH}`); console.log(JSON.stringify(st));
  console.log('\nworst clusters (size, mean pair similarity):');
  for (const c of clusters.slice(0, TOPN)) { let s = 0, n = 0; for (const i of c) for (const j of c) if (i < j) { s += M[i][j]; n++; } console.log(`  ${c.length} modules, mean ${(s / n).toFixed(3)}: ${c.slice(0, 6).map(i => items[i].file.replace(/\.js$/, '')).join(', ')}${c.length > 6 ? ', ...' : ''}`); }
  const off = offenders(items, M, clusters, OFFN); console.log(`\nworst ${OFFN} offenders (mean similarity to cluster mates; closest twin):`);
  for (const o of off) console.log(`  ${o.file}  cluster ${o.cluster}  mean ${o.mean}  max ${o.max}  twin ${o.twin}`);
  const j = opt('--json', ''); if (j) writeFileSync(j, JSON.stringify({ stats: st, clusters: clusters.map(c => c.map(i => items[i].file)), offenders: off }, null, 1));
}
