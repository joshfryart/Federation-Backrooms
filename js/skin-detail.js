// Skin detail for the crew `body` material (stream C2), patched into the ONE skin program made by humans.js skinShader (no new program, no new
// define: every term below is uniform-driven, so a clean-shaven freckle-free face runs the same code as a stubbled, freckled, sun-spotted one).
//   face frame  per body kind, from the rest pose: eye centres (eye mesh), mouth (teeth box), nose tip / ears / chin (body vertices). The body
//               vertex `position` is mapped into a face space in metres (origin between the eyes, y up, z forward), so every mask is an ellipsoid
//               there and sticks to the skin through animation and the face morphs (the masks read the unmorphed bind position).
//   detail      micro-normal pores (nose / cheeks deepest), melanin variation, blush (cheeks, nose tip), lip and ear redness, under-eye shadow,
//               stubble (follicle dots + shadow, men only), freckles, age spots, oily T-zone (lower roughness, more specular), drier cheeks.
//   anti-alias  every pattern finer than a pixel fades to its mean tone by its pixel footprint (fwidth of the face position), so far bodies, the
//               crowd LODs and the portrait atlas see smooth averages and the talk close-up sees the pattern; nothing sparkles.
// Per person (uSkinD: stubble, freckles, age, oil) from the person's skin seed and body kind, hashed here so makeHuman's random stream is untouched.
import * as THREE from 'three';

const faces = {};
const FAR = { m: new THREE.Matrix4().makeTranslation(0, 100, 0), a: new THREE.Vector4(0.031, -0.068, 0.012, 0.03), b: new THREE.Vector4(0.072, -0.02, -0.075, -0.115) };   // no face found: masks out of reach
// restMesh(kind, matName) is humans.js's rest-pose probe ({ W: world positions, n, box, toMesh })
export function skinFaceOf(kind, restMesh) {
  if (faces[kind]) return faces[kind];
  const out = { m: FAR.m.clone(), a: FAR.a.clone(), b: FAR.b.clone() }; faces[kind] = out;
  try {
    const eyes = restMesh(kind, 'eyes'), body = restMesh(kind, 'body'); if (!eyes || !body) return out;
    // eye centres: split the eye mesh at its middle in world x
    const midX = (eyes.box.min.x + eyes.box.max.x) / 2, eb = [new THREE.Box3(), new THREE.Box3()], v = new THREE.Vector3();
    for (let i = 0; i < eyes.n; i++) { v.fromArray(eyes.W, i * 3); eb[v.x < midX ? 0 : 1].expandByPoint(v); }
    const c0 = eb[0].getCenter(new THREE.Vector3()), c1 = eb[1].getCenter(new THREE.Vector3()), E = c0.clone().add(c1).multiplyScalar(0.5);
    // the source bodies come in different scales: face space is normalised to a 62 mm interpupillary distance, so every mask below is in ~metres
    const k = 0.031 / Math.max(c0.distanceTo(c1) / 2, 1e-4), eh = 0.031;
    const teeth = restMesh(kind, 'teeth'), mY = teeth ? ((teeth.box.min.y + teeth.box.max.y) / 2 - E.y) * k : -0.068, mZ = teeth ? (teeth.box.max.z - E.z) * k + 0.006 : 0.012;
    let noseZ = -1, noseY = -0.04, earX = 0, earZ = -0.075, chinY = 0;
    const W = body.W;
    for (let i = 0; i < body.n; i++) {
      const x = (W[i * 3] - E.x) * k, y = (W[i * 3 + 1] - E.y) * k, z = (W[i * 3 + 2] - E.z) * k, ax = Math.abs(x);
      if (ax < 0.008 && y < -0.005 && y > mY + 0.012 && z > noseZ) { noseZ = z; noseY = y; }
      if (y < 0.0 && y > mY - 0.005 && z < -0.04 && z > -0.14 && ax < 0.11 && ax > earX) { earX = ax; earZ = z; }
      if (ax < 0.01 && y < mY - 0.01 && y > mY - 0.08 && z > mZ - 0.04 && y < chinY) chinY = y;   // lowest point of the chin's front
    }
    if (noseZ < 0) noseZ = 0.03; if (!chinY) chinY = mY - 0.045;
    if (!earX) earX = 0.072;
    // mesh -> world (the inverse of restMesh's toMesh), then shift to the face origin
    const o = body.toMesh(new THREE.Vector3()), ax = body.toMesh(new THREE.Vector3(1, 0, 0)).sub(o), ay = body.toMesh(new THREE.Vector3(0, 1, 0)).sub(o), az = body.toMesh(new THREE.Vector3(0, 0, 1)).sub(o);
    const worldToMesh = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(o);
    out.m.copy(new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-E.x, -E.y, -E.z)).multiply(worldToMesh.clone().invert()));
    out.a.set(eh, mY, mZ, noseZ); out.b.set(earX, noseY, earZ, chinY);
  } catch (e) { console.warn('skin face frame', kind, e.message); }
  return out;
}

const hash = (s, i) => { const x = Math.sin(s * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
// per-person detail amounts: x stubble (men), y freckles (fairer skin more often), z age (spots), w oil (T-zone shine)
export function skinDetailFor(kind, seed, color) {
  const L = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b, male = kind === 'crew_m' || kind === 'crew_heavy';
  const stubble = male && hash(seed, 1) < 0.7 ? 0.35 + 0.65 * hash(seed, 2) : 0;
  const fp = L > 0.2 ? 0.45 : L > 0.1 ? 0.2 : 0.08, freck = hash(seed, 3) < fp ? 0.35 + 0.65 * hash(seed, 4) : 0;
  const age = 0.1 + 0.9 * hash(seed, 5) ** 2, oil = 0.35 + 0.65 * hash(seed, 6);
  return new THREE.Vector4(stubble, freck, age, oil);
}

const PARS = `
varying vec3 vFace; uniform vec4 uFaceA, uFaceB, uSkinD;
float sd_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// 2D value noise on the face's own plane (x, y, with z folded in so the sides of the head still vary): half the hashes of the 3D one
float sd_h2(vec2 p){ p = fract(p * 0.3183099 + 0.1) * 17.0; return fract(p.x * p.y * (p.x + p.y)); }
float sd_n2(vec3 q){ vec2 x = q.xy + q.z * vec2(0.71, -0.53), i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sd_h2(i), sd_h2(i + vec2(1.0, 0.0)), f.x), mix(sd_h2(i + vec2(0.0, 1.0)), sd_h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float sd_blob(vec3 p, vec3 c, vec3 r){ return 1.0 - smoothstep(0.35, 1.0, length((p - c) / r)); }
// a dot pattern of cell size 1/freq: each cell holds one round dot of random size at a random spot (cellular, so dots stay round and apart)
float sd_dots(vec3 p, float thr){ vec3 i = floor(p), f = fract(p) - 0.5; vec3 o = vec3(sd_h(i), sd_h(i + 17.3), sd_h(i + 41.9)) - 0.5;
  return step(thr, sd_h(i + 5.7)) * (1.0 - smoothstep(0.18, 0.34, length(f - o * 0.45))); }
float sdH = 0.0, sdOil = 0.0, sdLip = 0.0, sdCav = 0.0, sdBeard = 0.0;
`;
const COLOR = `
  { gH *= 0.4;   // the older whole-body relief (skinShader: mottle + vObj pores) read as orange peel in a close-up; the face-space pores below take over
    vec3 f = vFace; float ax = abs(f.x); vec3 fs = vec3(ax, f.y, f.z);
    float eh = uFaceA.x, mY = uFaceA.y, mZ = uFaceA.z, nZ = uFaceA.w, earX = uFaceB.x, nY = uFaceB.y, earZ = uFaceB.z, chY = uFaceB.w;
    float px = max(length(fwidth(f)), 1e-6);                                   // metres per pixel here (taken outside every branch: derivatives)
    #define SD_FADE(freq) (1.0 - smoothstep(0.22, 0.6, px * (freq)))   // 0 = the pattern is below a pixel: use its mean and skip the noise
    float head = sd_blob(f, vec3(0.0, -0.03, -0.035), vec3(0.12, 0.16, 0.14));
    float L = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.01);
    // ---- melanin: low-frequency variation (sun-exposed face / forearms a touch deeper), as a darker AND more saturated shift ----
    // shared noise samples (SwiftShader compile time grows with every inlined noise call: one sample serves several terms)
    float nLo = sd_n2(f * 22.0 + 3.1), nMid = sd_n2(f * 130.0 + 1.0);
    float mel = (nLo - 0.5) * 0.5;
    float fore = 0.0, nose = 0.0, cheek = 0.0;
    // the face terms are skipped off the head (most of the body's pixels; software GL runs every term for every pixel otherwise)
    if (head > 0.0) {
      float frontF = smoothstep(earZ - 0.005, earZ + 0.035, f.z);             // the face, not the back of the head
      // ---- region masks (face space, metres) ----
      fore = sd_blob(f, vec3(0.0, 0.045, 0.0), vec3(0.04, 0.032, 0.05)) * frontF;
      nose = sd_blob(f, vec3(0.0, nY * 0.6, nZ - 0.016), vec3(0.015, abs(nY) * 0.75 + 0.008, 0.03));
      float chin = sd_blob(f, vec3(0.0, chY + 0.016, mZ - 0.008), vec3(0.022, 0.018, 0.035));
      float tz = max(max(fore, nose), chin * 0.6);
      cheek = sd_blob(fs, vec3(eh * 1.15, -0.034, -0.008), vec3(0.026, 0.022, 0.04)) * frontF;
      float lipD = length((f - vec3(0.0, mY + 0.001, mZ)) / vec3(0.025, 0.0115, 0.022));
      float lip = (1.0 - smoothstep(0.78, 1.0, lipD)) * (1.0 - smoothstep(0.85, 1.0, ax / 0.026));
      float noseTip = sd_blob(f, vec3(0.0, nY, nZ), vec3(0.012, 0.012, 0.016));
      float ear = sd_blob(fs, vec3(earX - 0.01, -0.02, earZ + 0.005), vec3(0.022, 0.04, 0.035));
      float under = sd_blob(fs, vec3(eh, -0.018, -0.006), vec3(0.018, 0.008, 0.03)) * (1.0 - lip);
      mel += 0.2 * fore + 0.12 * nose;
      // ---- hemoglobin: cheeks, nose tip, ears (multiplicative, so it reads on every skin tone in proportion) ----
      float hb = cheek * 0.55 + noseTip * 0.45 + ear * 0.75 + chin * 0.15;
      hb *= mix(1.0, 0.75 + 0.5 * nMid, SD_FADE(130.0));   // broken-capillary mottling inside the flush
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.8, 0.8), clamp(hb, 0.0, 1.0));
      // lips: redder, a little darker, with vertical fine lines
      float fLl = SD_FADE(900.0), lipLines = lip > 0.0 && fLl > 0.0 ? mix(0.5, sd_n2(vec3(f.x * 900.0, f.y * 60.0, 0.0)), fLl) : 0.5;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.88, 0.58, 0.6) * (0.96 + 0.08 * lipLines), lip);
      sdLip = lip;
      // under-eye: thin skin over the orbicularis, a cool purple-brown shadow
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.82, 0.9), under * 0.8);
      // stubble (men only): below a line from the sideburn down to the mouth corner and up under the nose; fades down the neck; never on the lips.
      // Follicle dots + a shadow tone (the dots average into it with distance), cool grey-brown, darker than any skin.
      float fFine = SD_FADE(1300.0), dotsFine = fFine > 0.0 ? sd_dots(f * 1300.0 + 0.7, 0.2) : 0.0;   // pores off the beard, follicles in it
      float fol = 0.0;
      if (uSkinD.x > 0.0) {
        float yCheek = mix(mY + 0.012, -0.03, smoothstep(0.03, earX - 0.012, ax));    // cheek line: mouth corner up to the sideburn
        float yTop = mix(nY - 0.009, yCheek, smoothstep(0.014, 0.03, ax));             // moustache under the nose
        float beard = smoothstep(yTop + 0.005, yTop - 0.012, f.y) * smoothstep(chY - 0.045, chY - 0.012, f.y) * smoothstep(earZ + 0.012, earZ + 0.03, f.z)
                    * smoothstep(0.85, 1.25, lipD) * step(ax, earX + 0.01) * uSkinD.x;
        fol = mix(0.45, dotsFine, fFine);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.02, 0.022), beard * (0.42 + 0.55 * fol));
        sdBeard = beard; fol *= beard;
      }
      // skin grain: 2-4 mm albedo mottling (the fine structure that keeps a face from reading as plastic once the pores are below a pixel)
      float fGr = SD_FADE(330.0), grain = (nMid - 0.5) * 0.6 + (fGr > 0.0 ? (sd_n2(f * 330.0 + 5.0) - 0.5) * fGr : 0.0);
      diffuseColor.rgb *= 1.0 + 0.09 * grain * head;
      // ---- micro relief (metres, applied as a derivative bump after the normal maps): pores, deepest on the nose and cheeks ----
      float poreAmt = 0.35 + 0.65 * max(max(nose, cheek), fore * 0.8);
      float pores = dotsFine * fFine * (1.0 - sdBeard);
      sdCav = pores * poreAmt * head;
      sdH = (-0.00006 * pores * poreAmt + 0.00002 * grain) * head + 0.00003 * fol - 0.00004 * lipLines * lip;
      sdOil = tz * uSkinD.w * head;
    }
    diffuseColor.rgb = max(mix(vec3(L), diffuseColor.rgb, 1.0 + 0.3 * mel), 0.0) * (1.0 - 0.09 * mel);   // deeper and more saturated where mel > 0 (linear: no pow)
    // freckles: sparse round dots, densest over the nose bridge and cheeks, some on the forehead and the shoulders / arms
    if (uSkinD.y > 0.0) {
      float fdens = (max(cheek, nose * 0.9) + fore * 0.45 + (1.0 - head) * 0.35) * smoothstep(0.42, 0.62, nLo + 0.25 * cheek);
      float fFr = SD_FADE(320.0), fr = (fFr > 0.0 ? mix(0.16, sd_dots(f * 320.0, 0.42), fFr) : 0.16) * fdens * uSkinD.y;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.7, 0.56, 0.47), clamp(fr * 1.6, 0.0, 1.0));
    }
    // age spots: few, larger, soft-edged; forehead, temples, cheeks, backs of the hands
    float aspot = sd_dots(f * 110.0 + 2.3, 0.94) * uSkinD.z;
    if (aspot > 0.0) diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.74, 0.62), aspot * 0.45 * smoothstep(0.35, 0.6, nLo) * (0.4 + 0.6 * max(fore, cheek)));
  }`;
const ROUGH = `
  roughnessFactor = mix(roughnessFactor * (1.06 + 0.06 * sdCav), 0.4, sdOil * 0.75);   // dry cheeks, oily T-zone
  roughnessFactor = mix(roughnessFactor, 0.46, sdLip * 0.8);
  roughnessFactor = mix(roughnessFactor, min(roughnessFactor + 0.18, 1.0), sdBeard);
`;
const BUMP = `
  { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(sdH), hy = dFdy(sdH);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - grad); }`;
const SPEC = `
  { float sdS = mix(0.72, 1.3, sdOil) * (1.0 - 0.45 * sdCav) * (1.0 - 0.5 * sdBeard) * (1.0 + 0.25 * sdLip);   // skin F0 ~0.028 off the T-zone, pores hold no sheen
    material.specularColor *= sdS; material.specularColorBlended *= sdS; }`;

// patch the skin program (call from skinShader's onBeforeCompile, after its own edits); adds the uniforms to sh
export function skinDetailPatch(sh, face, detail) {
  Object.assign(sh.uniforms, { uFaceM: { value: face.m }, uFaceA: { value: face.a }, uFaceB: { value: face.b }, uSkinD: { value: detail } });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uFaceM; varying vec3 vFace;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = (uFaceM * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS)
    .replace('#include <metalnessmap_fragment>', COLOR + '\n' + ROUGH + '\n#include <metalnessmap_fragment>')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP)
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + SPEC);
}
