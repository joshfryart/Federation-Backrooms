// Node unit test: js/dynres.js.  node tools/test-dynres.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export async function dynresTests(fail) {
  const { createDynRes } = await import(pathToFileURL(join(ROOT, 'js/dynres.js')).href); const ck = (c, m) => { if (!c) fail('dynres: ' + m); };
  const D = createDynRes(); let changes = [];
  for (let i = 0; i < 100; i++) { const r = D.update(0.016); if (r != null) changes.push(r); } ck(D.scale === 1 && !changes.length, 'steady 60 fps keeps full resolution');
  for (let i = 0; i < 400 && !D.atMin; i++) { const r = D.update(0.05); if (r != null) changes.push(r); }
  ck(D.atMin && D.scale === 0.5 && changes.length === 4 && changes.every((v, i, a) => !i || v < a[i - 1]), 'sustained 50 ms frames step down to the floor: ' + changes);
  for (let i = 0; i < 20; i++) D.update(0.05); ck(D.scale === 0.5, 'never below min');
  changes = []; for (let i = 0; i < 2000; i++) { const r = D.update(0.016); if (r != null) changes.push(r); } ck(D.scale === 1 && changes.length === 4, 'recovers when frames are fast again: ' + changes);
  const E = createDynRes(); for (let i = 0; i < 100; i++) E.update(i % 2 ? 0.05 : 0.016); ck(E.scale === 1, 'a spike now and then does not scale down');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { let bad = false; await dynresTests((m) => { bad = true; console.log('FAIL', m); }); console.log(bad ? 'FAILED' : 'dynres OK'); process.exit(bad ? 1 : 0); }
