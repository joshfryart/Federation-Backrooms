// Save module (js/save.js, js/save-ui.js): node unit tests + one browser check.  node tools/test-save.mjs   |   node tools/test.mjs --only save
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const fake = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const run = (o = {}) => ({ mode: 'nominal', ship: 'USF Test', seed: 7, decks: 3, time: 600, kills: 0, deaths: 0, proper: 5, rushed: 2, review: 80, cause: 'Watch ended', ...o });

export async function saveTests(fail) {
  const { createSave, migrate, SAVE_VERSION, SAVE_KEY, BOARD_SIZE } = await imp('js/save.js');
  const ck = (c, m) => { if (!c) fail('save: ' + m); return !!c; };
  { // migration from the legacy keys, with the mirrors kept
    const st = fake({ fb_cfg: '{"sens":1.7,"calm":true,"learned":["a"]}', fb_meta: '{"runs":4,"bestDeck":5,"kills":9,"wins":1}', fb_best: '6' }); const S = createSave(st);
    ck(S.cfg().sens === 1.7 && S.cfg().calm && S.cfg().vol === 0.8 && S.cfg().learned[0] === 'a', 'legacy fb_cfg migrated over defaults');
    ck(S.meta().runs === 4 && S.best() === 6, 'legacy meta / best migrated');
    const saved = JSON.parse(st.getItem(SAVE_KEY)); ck(saved.v === SAVE_VERSION && saved.cfg.sens === 1.7, 'canonical key written with the schema version');
    ck(JSON.parse(st.getItem('fb_cfg')).calm === true && st.getItem('fb_best') === '6', 'legacy keys mirrored (lcars-buttons reads fb_cfg)');
    const S2 = createSave(st); ck(S2.meta().runs === 4, 'second load reads fb_save'); }
  { ck(migrate({ v: 99 }) === null && migrate('x') === null && migrate({}).v === SAVE_VERSION, 'migrate: newer refused, junk refused, unversioned upgraded'); }
  { // hostile / broken storage never throws
    const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
    let S; try { S = createSave(bad); S.setCfg({ sens: 2 }); S.recordRun(run()); S.exportJSON(); S.reset(); } catch (e) { fail('save: throws with blocked storage: ' + e.message); }
    ck(S && S.persistent === false && S.cfg().sens === 1, 'blocked storage: stays in memory, flagged not persistent');
    const S0 = createSave(null); ck(S0.best() === 0, 'null storage ok');
    const S1 = createSave(fake({ fb_save: '{not json', fb_cfg: 'garbage' })); ck(S1.cfg().sens === 1, 'corrupt JSON falls back to defaults'); }
  { // runs + boards
    const S = createSave(fake());
    const a = S.recordRun(run({ review: 50 })), b = S.recordRun(run({ review: 90 }));
    ck(a.rank === 1 && b.rank === 1 && S.board('nominal')[0].review === 90 && S.board('nominal')[1].review === 50, 'nominal board sorted by review');
    for (let i = 0; i < 15; i++) S.recordRun(run({ review: i }));
    ck(S.board('nominal').length === BOARD_SIZE && S.recordRun(run({ review: 0, proper: 0 })).rank === 0, 'board capped at 10; a worse run misses it');
    const m = S.recordRun({ mode: 'madness', ship: 'X', decks: 6, kills: 3, time: 90, won: false, cause: 'Gronk' });
    ck(m.rank === 1 && S.board('madness').length === 1 && S.best() === 6 && S.meta().kills === 3 && S.meta().wins === 0, 'madness board separate; best + meta updated');
    S.recordRun({ mode: 'madness', decks: 6, kills: 5, time: 200 }); ck(S.board('madness')[0].kills === 5, 'madness ties on deck broken by kills');
    ck(S.recordRun({ mode: 'bogus' }).entry === null, 'unknown mode rejected');
    const e = S.recordRun(run({ cause: '<img onerror=x>', ship: 'A&B' })).entry; ck(!/[<>&]/.test(e.cause + e.ship), 'markup characters stripped from text fields'); }
  { // export / import round trip + validation
    const st = fake({ fb_pace: '{"preset":"crunch"}', fb_voicemode: 'subs' }); const S = createSave(st); S.setCfg({ ...S.cfg(), vol: 0.3 }); S.recordRun(run());
    const txt = S.exportJSON(); const j = JSON.parse(txt); ck(j.game === 'starfarers-backdecks' && j.v === SAVE_VERSION && j.extra.fb_voicemode === 'subs', 'export has game tag, version, extras');
    const st2 = fake(), T = createSave(st2); const r = T.importJSON(txt);
    ck(r.ok && T.cfg().vol === 0.3 && T.board('nominal').length === 1 && st2.getItem('fb_voicemode') === 'subs' && st2.getItem('fb_pace').includes('crunch'), 'import restores everything, extras back in their own keys');
    const before = JSON.stringify(T.data);
    ck(!T.importJSON('nope').ok && !T.importJSON('{"game":"other"}').ok && !T.importJSON('{"game":"starfarers-backdecks","v":42}').ok && !T.importJSON('[1]').ok, 'bad imports refused');
    ck(JSON.stringify(T.data) === before, 'a refused import changes nothing');
    const evil = T.importJSON(JSON.stringify({ v: 1, cfg: { sens: 1 }, best: 'NaN', board: { nominal: [{ mode: 'nominal', decks: 1e99, review: -5, cause: 'x'.repeat(999) }, 'junk', null] }, runs: 'no' }));
    ck(evil.ok && T.best() === 0 && T.board('nominal')[0].decks === 999 && T.board('nominal')[0].review === 0 && T.board('nominal')[0].cause.length === 80 && T.runs().length === 0, 'import coerces hostile values'); }
  { // reset
    const st = fake(); const S = createSave(st); S.setCfg({ ...S.cfg(), calm: true }); S.recordRun(run()); S.reset();
    ck(S.board('nominal').length === 0 && S.best() === 0 && S.cfg().calm === false && S.meta().runs === 0 && JSON.parse(st.getItem(SAVE_KEY)).board.nominal.length === 0, 'reset clears the blob and the mirrors'); }
}

export async function saveBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, S = g.SAVE, out = {}; S.reset(); g.titleBoard();
    out.emptyTitle = !!document.querySelector('#svtitle.sv-board');
    g.G.mode = 'madness'; g.G.deck = 4; g.G.kills = 2; g.G.time = 123; const rr = g.recordRun({ cause: 'Gronk' }); out.rank = rr.rank;
    g.titleBoard(); out.rows = document.querySelectorAll('#svtitle li').length; out.best = document.getElementById('best').textContent;
    out.ctl = ['sv-export', 'sv-import', 'sv-reset'].map((i) => document.getElementById(i)?.classList.contains('lc-btn'));
    const txt = S.exportJSON(); out.legacy = JSON.parse(localStorage.getItem('fb_meta')).runs;
    document.getElementById('sv-reset').click(); document.getElementById('sv-reset').click(); out.afterReset = S.board('madness').length;
    const f = new File([txt], 'save.json', { type: 'application/json' }), dt = new DataTransfer(); dt.items.add(f); const inp = document.getElementById('sv-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    await new Promise((res) => setTimeout(res, 300)); out.afterImport = S.board('madness').length; out.msg = document.getElementById('sv-msg').textContent;
    S.reset(); g.G.mode = 'nominal'; g.G.kills = 0; g.G.time = 0; g.titleBoard(); return out;
  });
  console.log('save:', JSON.stringify(r));
  if (!(r.emptyTitle && r.rank === 1 && r.rows === 1 && /Deck 4/.test(r.best) && r.ctl.every(Boolean) && r.legacy === 1 && r.afterReset === 0 && r.afterImport === 1 && /imported/.test(r.msg))) fail('save browser');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { let bad = 0; await saveTests((m) => { bad++; console.error('FAIL', m); }); console.log(bad ? 'FAILED' : 'OK'); process.exit(bad ? 1 : 0); }
