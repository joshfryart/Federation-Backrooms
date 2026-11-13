// Node unit tests: js/save.js (run stats in a fake / broken localStorage).  node tools/test-save.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function saveTests(fail) {
  const { createSave, statsHTML, fmtDuration } = await import(pathToFileURL(join(ROOT, 'js/save.js')).href);
  const ck = (c, m) => { if (!c) fail('save: ' + m); return !!c; };
  const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m }; };
  const st = mem(), S = createSave(st);
  ck(S.stats().runs === 0 && S.best() === 0, 'empty start');
  S.recordRun({ deck: 3, kills: 4, time: 125, furbles: 2, won: false, ship: 'USS Test' });
  S.recordRun({ deck: 8, kills: 1, time: 600, furbles: 0, won: true, ship: '<b>X</b>' });
  const s = S.stats();
  ck(s.runs === 2 && s.wins === 1 && s.deaths === 1 && s.bestDeck === 8 && s.decks === 11 && s.kills === 5 && s.furbles === 2 && s.time === 725 && s.longest === 600, 'totals ' + JSON.stringify(s));
  ck(s.history.length === 2 && s.history[0].won === true, 'history newest first');
  ck(st.getItem('fb_best') === '8', 'fb_best kept in step');
  for (let i = 0; i < 30; i++) S.recordRun({ deck: 1, time: 1 }); ck(S.stats().history.length <= 12, 'history capped');
  ck(!/<b>X/.test(statsHTML(s)), 'ship names escaped'); ck(fmtDuration(3725) === '1h 02m' && fmtDuration(65) === '1:05', 'duration format');
  st.setItem('fb_stats', '{not json'); ck(createSave(st).stats().runs === 0, 'corrupt save falls back');
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, B = createSave(bad);
  ck(B.stats().runs === 0 && B.recordRun({ deck: 2 }).runs === 1, 'blocked storage never throws'); ck(createSave(null).stats().runs === 0, 'no storage');
  const st2 = mem(); st2.setItem('fb_best', '5'); ck(createSave(st2).best() === 5, 'legacy fb_best honoured'); S.reset(); ck(S.stats().runs === 0, 'reset');
}
import { pathToFileURL as p2u } from 'node:url';
if (import.meta.url === p2u(process.argv[1]).href) { let bad = false; await saveTests((m) => { bad = true; console.log('FAIL', m); }); console.log(bad ? 'FAILED' : 'save OK'); process.exit(bad ? 1 : 0); }
