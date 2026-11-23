// Node unit tests: role choice (js/role.js). node tools/test-role.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function roleTests(fail) {
  const R = await imp('js/role.js'), D = await imp('js/duty.js');
  const ck = (c, m) => { if (!c) fail('role: ' + m); return !!c; };
  const st = (v) => ({ getItem: () => v }), K = R.BILLET_KEYS;
  ck(K.length === 41 && new Set(K).size === 41, 'BILLET_KEYS is 41 unique ids');
  ck(R.readRole('', null) === 'random', 'default random');
  ck(R.readRole('', st('ce')) === 'ce', 'storage used');
  ck(R.readRole('?role=helm', st('ce')) === 'helm', 'URL beats storage');
  ck(R.readRole('?billet=nav', st('ce')) === 'nav', 'legacy ?billet= beats storage');
  ck(R.readRole('?role=pilot&billet=nav', null) === 'pilot', '?role= beats ?billet=');
  ck(R.readRole('?role=random', st('ce')) === 'random', '?role=random beats storage');
  ck(R.readRole('?role=bogus', st('ce')) === 'ce' && R.readRole('?role=bogus', st('zzz')) === 'random', 'invalid ids fall back');
  ck(R.readRole('', { getItem() { throw new Error('blocked'); } }) === 'random', 'throwing storage ok');
  const mem = {}; R.saveRole('xo', { setItem: (k, v) => { mem[k] = v; } }); ck(mem.fb_role === 'xo', 'saveRole writes fb_role');
  R.saveRole('bogus', { setItem: (k, v) => { mem[k] = v; } }); ck(mem.fb_role === 'random', 'saveRole sanitises');
  ck(R.resolveRole('ce', 5) === 'ce', 'explicit resolves to itself');
  const seen = new Set(); for (let s = 1; s <= 4000; s++) { const a = R.resolveRole('random', s); if (a !== R.resolveRole('random', s)) ck(false, 'random not deterministic'); seen.add(a); }
  ck(seen.size === 41, 'random covers every billet over many seeds (' + seen.size + ')');
  ck(R.resolveRole('bogus', 7) === R.resolveRole('random', 7), 'invalid choice resolves as random');
  ck(R.readMission('?mission=survey') === 'survey' && R.readMission('') === null && R.readMission('?mission=nope') === null && D.MISSION_ORDER.every(m => R.readMission('?mission=' + m) === m), 'readMission');
  ck(/Commanding Officer/.test(R.roleSummary('co', { billets: { co: { loops: [1, 2] } } })) && /2 duty loops/.test(R.roleSummary('co', { billets: { co: { loops: [1, 2] } } })), 'roleSummary');
  console.log('role: ok');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { let bad = 0; await roleTests((m) => { bad++; console.error('FAIL', m); }); process.exit(bad ? 1 : 0); }
