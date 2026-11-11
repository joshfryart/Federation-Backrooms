// Offline asset pipeline (not needed to run the game). Rebuilds assets/models/{crew_*,suit,human_anims}.glb from upstream CC0 files.
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp meshoptimizer
//   node tools/build-characters.mjs <dramatis3d/samples/out> <gltf-universal-animation-library/glTF> assets/models
// Sources: https://github.com/tonioloewald/dramatis3d (MakeHuman-based CC0 characters), https://github.com/J-Ponzo/gltf-universal-animation-library (Quaternius UAL, CC0)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [, , SRC, UAL, OUT] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// face morph targets worth keeping (the rest are dropped to save space)
const KEEP = ['JawDrop', 'LeftUpperLidClosed', 'RightUpperLidClosed', 'MouthLeftPullUp', 'MouthRightPullUp', 'MouthLeftPullDown', 'MouthRightPullDown', 'LeftBrowDown', 'RightBrowDown', 'LeftInnerBrowUp', 'RightInnerBrowUp', 'UpperLipUp', 'NoseWrinkler', 'LeftUpperLidOpen', 'RightUpperLidOpen'];
const TEX = { garment: 512, hair: 512, brows: 256, teeth: 256, tongue: 64, eyes: 128, shoes: 256, body: 1024 };
// v-split of each garment texture: above = top (kept light, tinted at runtime by division colour), below = trousers (dark)
const SPLIT = { garment_male_casualsuit02: 0.43, garment_female_casualsuit01: 0.44, garment_female_sportsuit01: 0.42, garment_male_worksuit01: 1 };

async function uniformTexture(buf, split, size) {
  const { data, info } = await sharp(buf).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const soft = await sharp(buf).resize(size, size).removeAlpha().blur(size / 40).raw().toBuffer();   // hides printed logos/trim on the top
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3, top = y / info.height < split, d = top ? soft : data;
    const l0 = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
    const l = Math.min(0.42, (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255) + (top ? (l0 % 0.02) : 0);
    // top: lift the cloth luminance to a light neutral so material.color sets the uniform colour; bottom: near-black
    let v = top ? Math.min(1, 0.45 + l * 1.35) : 0.05 + l * 0.16;
    if (top && l < 0.02) v = 0.5; // texture background
    out[i] = out[i + 1] = out[i + 2] = Math.round(Math.min(1, v) * 255);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 82 }).toBuffer();
}

async function buildCharacter(src, dst, { suit = false } = {}) {
  const doc = await io.read(`${SRC}/${src}.glb`); const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  // prune morph targets
  for (const mesh of root.listMeshes()) {
    const names = mesh.getExtras()?.targetNames || []; const keepIdx = names.map((n, i) => KEEP.includes(n) ? i : -1).filter(i => i >= 0);
    if (!names.length) continue;
    const drop = !['body', 'eyelashes', 'brows', 'teeth'].includes(mesh.getName());   // only the face needs them
    for (const prim of mesh.listPrimitives()) { const t = prim.listTargets(); t.forEach((tg, i) => { if (drop || !keepIdx.includes(i)) prim.removeTarget(tg); }); }
    const kept = drop ? [] : keepIdx.map(i => names[i]);
    mesh.setWeights(kept.map(() => 0)); mesh.setExtras({ ...mesh.getExtras(), targetNames: kept });
  }
  for (const n of root.listNodes()) if (n.getMesh() && n.getWeights().length) n.setWeights([]);
  // textures
  for (const mat of root.listMaterials()) {
    const name = mat.getName(); const kind = Object.keys(TEX).find(k => name.startsWith(k)) || 'garment';
    for (const tex of new Set([mat.getBaseColorTexture(), mat.getNormalTexture(), mat.getMetallicRoughnessTexture()].filter(Boolean))) {
      const size = TEX[kind];
      if (SPLIT[name] !== undefined && tex === mat.getBaseColorTexture()) { tex.setImage(await uniformTexture(tex.getImage(), SPLIT[name], size)).setMimeType('image/webp'); continue; }
      const hasAlpha = tex.getMimeType() === 'image/png';
      const img = sharp(tex.getImage()).resize(size, size);
      tex.setImage(await (hasAlpha ? img.webp({ quality: 85, alphaQuality: 90 }) : img.webp({ quality: suit ? 80 : 82 })).toBuffer()).setMimeType('image/webp');
    }
    if (name.startsWith('garment')) mat.setExtras({ uniform: SPLIT[name] !== undefined });
  }
  root.getAsset().extras = { source: `dramatis3d samples/out/${src}.glb (CC0)`, licences: root.getAsset().extras?.dramatis?.licences?.map(l => `${l.title} — ${l.author} — ${l.licence}`) };
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/${dst}.glb`, doc); console.log('wrote', dst);
}

// ---- animation library: same rest pose as the characters, so it is a straight copy with renamed bones ----
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head', 'Death01', 'Sitting_Idle_Loop', 'Fixing_Kneeling', 'Interact', 'Idle_Torch_Loop', 'Spell_Simple_Idle_Loop', 'Dance_Loop', 'Push_Loop'];
const rename = (n) => {
  const m = { 'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03', 'DEF-neck': 'neck_01', 'DEF-head': 'Head' }; if (m[n]) return m[n];
  const r = /^DEF-(.+)\.([LR])$/.exec(n); if (!r) return n; const s = r[2].toLowerCase(); let b = r[1];
  const lim = { shoulder: 'clavicle', upper_arm: 'upperarm', forearm: 'lowerarm', hand: 'hand', thigh: 'thigh', shin: 'calf', foot: 'foot', toe: 'ball' }; if (lim[b]) return `${lim[b]}_${s}`;
  const f = /^(f_)?(index|middle|ring|pinky|thumb)\.0(\d)$/.exec(b); if (f) return `${f[2]}_0${f[3]}_${s}`; return n;
};
async function buildAnims() {
  const doc = await io.read(`${UAL}/AnimationLibrary_Godot_Standard.gltf`); const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (!CLIPS.includes(a.getName())) { a.dispose(); continue; }
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode()?.getName() || '', p = ch.getTargetPath();
      if (p === 'scale' || (p === 'translation' && n !== 'DEF-hips') || !n.startsWith('DEF-') || /f_(middle|ring|pinky)|\.03\./.test(n)) { ch.getSampler()?.dispose(); ch.dispose(); }
    }
  }
  for (const m of root.listMeshes()) m.dispose(); for (const s of root.listSkins()) s.dispose(); for (const m of root.listMaterials()) m.dispose();
  for (const n of root.listNodes()) n.setName(rename(n.getName()));
  root.getAsset().extras = { source: 'Universal Animation Library (Standard) by Quaternius — CC0', hipHeight: 0.917 };
  await doc.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/human_anims.glb`, doc); console.log('wrote human_anims', root.listAnimations().map(a => a.getName()).join(' '));
}

await buildCharacter('clothed-casual', 'crew_m');
await buildCharacter('with-clips', 'crew_f');
await buildCharacter('long-hair', 'crew_f2');
await buildCharacter('extreme-heavy', 'crew_heavy');
await buildCharacter('mesh-kevin-spacesuit', 'suit', { suit: true });
await buildAnims();
