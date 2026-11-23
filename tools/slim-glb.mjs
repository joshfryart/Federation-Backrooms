// Lossless GLB JSON slimming:  node tools/slim-glb.mjs [--check] [files...]   (default: assets/models/*.glb)
// Drops properties that equal the glTF 2.0 spec default (accessor.normalized false, accessor / bufferView byteOffset 0,
// sampler interpolation "LINEAR", material doubleSided false / alphaMode "OPAQUE" / alphaCutoff 0.5, node identity TRS)
// and re-serialises the JSON chunk compactly. The BIN chunk is copied byte for byte, so geometry, animation and images are unchanged.
// human_anims.glb is mostly JSON (5,000 accessors for 20 clips): 1.09 MB -> ~0.9 MB on the wire where .glb is not gzipped.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), CHECK = argv.includes('--check');
const files = argv.filter(a => !a.startsWith('--')); if (!files.length) for (const f of readdirSync(join(ROOT, 'assets/models'))) if (f.endsWith('.glb')) files.push(join(ROOT, 'assets/models', f));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function slim(j) {
  for (const a of j.accessors || []) { if (a.normalized === false) delete a.normalized; if (a.byteOffset === 0) delete a.byteOffset; }
  for (const v of j.bufferViews || []) if (v.byteOffset === 0) delete v.byteOffset;
  for (const an of j.animations || []) for (const s of an.samplers || []) if (s.interpolation === 'LINEAR') delete s.interpolation;
  for (const m of j.materials || []) { if (m.doubleSided === false) delete m.doubleSided; if (m.alphaMode === 'OPAQUE') delete m.alphaMode; if (m.alphaCutoff === 0.5) delete m.alphaCutoff; }
  for (const n of j.nodes || []) { if (n.translation && same(n.translation, [0, 0, 0])) delete n.translation; if (n.rotation && same(n.rotation, [0, 0, 0, 1])) delete n.rotation; if (n.scale && same(n.scale, [1, 1, 1])) delete n.scale; }
  return j;
}
let total = 0, stale = 0;
for (const f of files) {
  const b = readFileSync(f); if (b.readUInt32LE(0) !== 0x46546C67) continue;
  const jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), rest = b.subarray(20 + jl);
  let s = Buffer.from(JSON.stringify(slim(json)), 'utf8'); const pad = (4 - (s.length % 4)) % 4; s = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + s.length + rest.length, 8); head.writeUInt32LE(s.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
  const out = Buffer.concat([head, s, rest]); if (out.length === b.length && out.equals(b)) continue;
  stale++; total += b.length - out.length; console.log(`${f.replace(ROOT + '/', '')}: ${b.length} -> ${out.length}`);
  if (!CHECK) writeFileSync(f, out);
}
console.log(CHECK ? (stale ? `${stale} file(s) would shrink` : 'all slim') : `saved ${total} bytes`);
