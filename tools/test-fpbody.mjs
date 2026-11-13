// Node unit tests: first-person body poses, landing-roll camera, audio cues.  node tools/test-fpbody.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export async function fpbodyTests(fail) {
  const { fpPose, fpCam, fpCues, FPBody } = await import(pathToFileURL(join(ROOT, 'js/fpbody.js')).href);
  const ck = (c, m) => { if (!c) fail('fpbody: ' + m); };
  const base = { crouch: false, low: false, sprint: false, speed: 0, bob: 0, sinceLand: 9, vyLast: 0 };
  for (const mode of ['mantle', 'slide', 'wallrun', 'grapple', 'ladder']) {
    const p = fpPose({ ...base, mode, mantK: 0.5, wallSide: -1, grapT: 1 }); ck(p.tag === mode, 'tag ' + mode); ck(p.L.show > 0 || p.R.show > 0, 'hands shown ' + mode);
    for (const h of [p.L, p.R]) for (const v of Object.values(h)) ck(Number.isFinite(v), 'finite ' + mode);
  }
  ck(fpPose({ ...base, mode: 'ground' }).tag === 'idle' && fpPose({ ...base, mode: 'ground' }).L.show === 0, 'idle hides hands');
  ck(fpPose({ ...base, mode: 'ground', crouch: true, low: true, speed: 1 }).tag === 'crawl', 'crawl');
  ck(fpPose({ ...base, mode: 'grapple', grapT: 1 }).L.show === 1 && fpPose({ ...base, mode: 'grapple', grapT: 1 }).R.show === 0, 'grapple is left hand only');
  ck(fpPose({ ...base, mode: 'wallrun', wallSide: -1 }).L.show === 1 && fpPose({ ...base, mode: 'wallrun', wallSide: 1 }).R.show === 1, 'wall-run hand on wall side');
  ck(fpPose({ ...base, mode: 'ground', sinceLand: 0.1, vyLast: -12 }).tag === 'landing', 'landing brace');
  const c0 = fpCam({ rollT: -1, tag: 'idle' }), c1 = fpCam({ rollT: 0.25, rollPow: 1, rollSide: 1, tag: 'idle' }), c2 = fpCam({ rollT: 0.7, rollPow: 1, rollSide: 1, tag: 'idle' });
  ck(c0.pitch === 0 && c0.y === 0, 'no roll at rest'); ck(c1.pitch < -0.1 && c1.y < 0, 'roll tucks'); ck(c2.pitch === 0, 'roll ends');
  ck(fpCues('land', { impact: 14 }).includes('roll') && fpCues('land', { impact: 2 }).length === 0, 'land cues'); ck(fpCues('mantle').includes('palm') && fpCues('slide').includes('scrape') && fpCues('grapple').includes('launcher'), 'move cues');
  const fp = new FPBody({ P: { vx: 0, vz: 0, bob: 0, mode: 'ground' }, sound: null }); fp.onEvent('land', { impact: 14 }); ck(fp.rollT === 0 && fp.rollPow > 0.3, 'event starts roll'); const pose = fp.update(0.1); ck(pose.tag === 'landing' && fp.cam.pitch < 0, 'update drives cam');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; await fpbodyTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'fpbody OK'); process.exit(errs.length ? 1 : 0); }
