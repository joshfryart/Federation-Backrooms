// Eyes (stream C3): the eye program's extra GLSL and the per-person eye rig. Used by eyeShader() in js/humans.js, which keeps ONE program
// for the eyes, the tongue and the shoes (uGlint 0 = the old plain textured path; every eye term below sits behind that uniform), so this
// adds no shader program and nothing new to prewarm.
//
// What the eye program does on the eyeball (uGlint 1):
//  - iris depth: the iris is a disc ~2.6 mm behind the cornea. The view ray is refracted at the cornea (n = 1.376) and walked down to the
//    iris plane; the hit is moved back into the texture's uv with the screen-space uv gradient (cotangent frame), so the iris shifts
//    behind the cornea as the head or camera moves instead of being painted on the ball;
//  - pupil response: the pupil radius follows the light reaching the eye (every scene light evaluated at the eye with the head's forward
//    as normal, no shadow test, so both halves of a pupil always agree), 24% .. 62% of the iris; the painted iris is remapped radially
//    (as the real stroma stretches) rather than a black disc drawn over it;
//  - iris colour per person (eyeLook: brown / hazel / green / blue / grey, biased dark for darker skin), radial fibres, a collarette
//    ring, crypts and a dark limbal ring at the iris edge; fine detail fades out by its own screen-space size, so small eyes do not shimmer;
//  - sclera: a warm off-white with thin red veins that run in from the corners (strength per person, stronger on the bloodied);
//  - lid contact: the head-fixed lid aperture (EYE_LIDS, measured on these meshes) darkens the ball under the upper lid (contact shadow
//    + lash shade) and in the corners; a narrow band of lid-margin colour on the ball reads as the lids' thickness, and a thin wet
//    meniscus just above the lower lid catches the light (tear line). The upper edge follows the UpperLidClosed / UpperLidOpen morphs;
//  - shading: the sclera is lit with the eyeball's sphere normal (it was lit flat, so the ball never darkened toward its sides); the
//    iris takes the light as a flat disc behind the cornea (light refracted by the cornea first).
// Saccades: eyeRig().step(dt) moves both balls together in small, fast jumps (~40 ms) between fixations of 0.3-2.2 s, from a private
// per-person sequence (Math.random is never drawn: the seeded test and golden-shot runs keep their streams), in the vertex shader via
// one 4x4 matrix per eye (rotation about the ball's centre, built in the rest pose's real space so the quantised mesh space does not shear it).
// gaze(yaw, pitch, amp) holds a look direction (nothing calls it yet: talk.js could use it for eye contact). Bodies that are never update()d
// (corpses, portraits after their one pose) keep still eyes. Known: the pupil follows the light at once (no ~0.5 s adaptation), so a
// flickering lamp makes it flicker too; the lower lid edge is fixed (smile / squint morphs do not move it).
import * as THREE from 'three';

// iris in the eye texture (assets eye_basic, the same 128 px map on every body): centre (0.5, 0.5), iris radius 24 / 128, painted pupil 9.6 / 128
export const EYE_IRIS = { r: 0.1875, pupil0: 0.4 };
// lid aperture on the ball, in the head's frame: x = sin of the angle toward the nose (+) or the ear (-), y = sin of the angle up, from the ball's centre.
// Upper lid (where it touches the ball) y = up - upK (x - x0)^2, lower lid y = lo + loK (x - x0)^2. Measured per body by casting rays from each ball's
// centre at the rest-pose face (shots/chars probe, 0.01 steps; both eyes agree): [up, upK, lo, loK, x0].
export const EYE_LIDS = { crew_m: [0.11, 0.4, -0.36, 0.15, -0.15], crew_f: [0.27, 0.52, -0.33, 0.4, -0.05], crew_f2: [0.24, 0.47, -0.33, 0.37, -0.1], crew_heavy: [0.05, 0.42, -0.45, 0.34, 0] };
const LID_DEFAULT = EYE_LIDS.crew_f;

// vertex: rotate the ball (eyeR), sphere normal / forward with the rotation (vEyeN, vEyeF), the head frame without it (vEyeF0, vEyeU0, vEyeX0)
export const EYE_VERT_PARS = `
uniform vec4 uEyeA, uEyeB; uniform float uEyeMid; uniform vec3 uEyeFwd, uEyeUp, uEyeRight; uniform vec2 uEyeNasal; uniform mat4 uEyeRA, uEyeRB;
varying vec3 vEyeN; varying vec3 vEyeF; varying vec3 vEyeF0; varying vec3 vEyeU0; varying vec3 vEyeX0;`;
export const EYE_VERT_ROT = `
  mat4 eyeR = position.x < uEyeMid ? uEyeRA : uEyeRB; vec3 eyeP = ( eyeR * vec4( position, 1.0 ) ).xyz;
  objectNormal = mat3( eyeR ) * objectNormal;`;
export const EYE_VERT_N = `
  { bool eA = position.x < uEyeMid; vec4 ec = eA ? uEyeA : uEyeB; vec3 en = eyeP - ec.xyz, ef = mat3( eyeR ) * uEyeFwd, f0 = uEyeFwd, u0 = uEyeUp, x0 = uEyeRight * ( eA ? uEyeNasal.x : uEyeNasal.y );
    #ifdef USE_SKINNING
      en = ( skinMatrix * vec4( en, 0.0 ) ).xyz; ef = ( skinMatrix * vec4( ef, 0.0 ) ).xyz; f0 = ( skinMatrix * vec4( f0, 0.0 ) ).xyz; u0 = ( skinMatrix * vec4( u0, 0.0 ) ).xyz; x0 = ( skinMatrix * vec4( x0, 0.0 ) ).xyz;
    #endif
    mat3 mv3 = mat3( modelViewMatrix );
    vEyeN = normalize( mv3 * en ); vEyeF = normalize( mv3 * ef ); vEyeF0 = normalize( mv3 * f0 ); vEyeU0 = normalize( mv3 * u0 ); vEyeX0 = normalize( mv3 * x0 ); }`;

export const EYE_FRAG_PARS = `
varying vec3 vEyeN; varying vec3 vEyeF; varying vec3 vEyeF0; varying vec3 vEyeU0; varying vec3 vEyeX0;
uniform float uGlint; uniform vec4 uIris, uIris2, uEyeLid, uEyeLook; uniform vec3 uEyeLidK; uniform vec3 uLidCol; uniform vec2 uEyeK;
float gEyeIris = 0.0, gEyeAO = 1.0, gEyeWet = 0.0, gEyePx = 1.0; vec3 gEyeF = vec3( 0.0, 0.0, 1.0 );
float eh2( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float en2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( eh2( i ), eh2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( eh2( i + vec2( 0.0, 1.0 ) ), eh2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float ef2( vec2 p ) { return 0.5 * en2( p ) + 0.3 * en2( p * 2.1 + 5.3 ) + 0.2 * en2( p * 4.3 + 1.7 ); }`;

// light reaching the eye: every light at this point with the head's forward as normal, no shadows (so the pupil is one size across the iris)
export const EYE_ILLUM = `
float eyeIllum( const in vec3 p, const in vec3 n ) {
  vec3 E = ambientLightColor; IncidentLight L;
  #if NUM_POINT_LIGHTS > 0
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) { getPointLightInfo( pointLights[ i ], p, L ); E += L.color * max( dot( n, L.direction ), 0.0 ); }
  #endif
  #if NUM_SPOT_LIGHTS > 0
    for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) { getSpotLightInfo( spotLights[ i ], p, L ); E += L.color * max( dot( n, L.direction ), 0.0 ); }
  #endif
  #if NUM_DIR_LIGHTS > 0
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) { getDirectionalLightInfo( directionalLights[ i ], L ); E += L.color * max( dot( n, L.direction ), 0.0 ); }
  #endif
  #if NUM_HEMI_LIGHTS > 0
    for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) E += getHemisphereLightIrradiance( hemisphereLights[ i ], n );
  #endif
  return dot( E, vec3( 0.2126, 0.7152, 0.0722 ) );
}`;

// the eyeball's albedo (replaces map_fragment on the eye; uGlint 0 keeps the plain map)
export const EYE_SURFACE = `
  {
    vec3 eN = normalize( vEyeN ), eF = normalize( vEyeF ), F0 = normalize( vEyeF0 ), U0 = normalize( vEyeU0 ), X0 = normalize( vEyeX0 ), V = normalize( vViewPosition );
    gEyeF = eF; gEyePx = length( fwidth( eN ) );   // radians the ball's normal turns per pixel: how big the eye is on screen
    // ---- lid aperture (head frame: does not turn with the ball) ----
    float lx = dot( eN, X0 ), ly = dot( eN, U0 ), lx2 = ( lx - uEyeLidK.z ) * ( lx - uEyeLidK.z );
    float yLo = uEyeLid.z + uEyeLidK.y * lx2, yUp = mix( uEyeLid.x - uEyeLidK.x * lx2, yLo, uEyeLid.y );
    float dUp = yUp - ly, dLo = ly - yLo;                 // > 0 inside the opening (sin units: 0.075 is ~1 mm on this ball)
    // r3: lighter and narrower (0.6 over 0.2 + 0.25 over 0.5, with the lash strip above it it read as a heavy dark liner)
    float shUp = 1.0 - 0.38 * ( 1.0 - smoothstep( 0.0, 0.14, dUp ) ) - 0.14 * ( 1.0 - smoothstep( 0.0, 0.4, dUp ) );   // contact shadow + lash shade under the upper lid
    float shLo = 1.0 - 0.25 * ( 1.0 - smoothstep( 0.0, 0.06, dLo ) );
    float shCorner = 1.0 - 0.45 * smoothstep( 0.22, 0.6, lx ) - 0.4 * smoothstep( 0.36, 0.75, - lx );   // inner (nasal) and outer corners (r3: a little wider)
    gEyeAO = shUp * shLo * shCorner;
    gEyeWet = smoothstep( 0.0, 0.012, dLo ) * ( 1.0 - smoothstep( 0.02, 0.05, dLo ) );
    // ---- iris: refract at the cornea, walk to the iris plane, back to uv ----
    vec2 uv = vMapUv, c = vec2( 0.5 );
    vec3 dp1 = dFdx( - vViewPosition ), dp2 = dFdy( - vViewPosition ); vec2 du1 = dFdx( uv ), du2 = dFdy( uv );
    vec3 gN = cross( dp1, dp2 ); gN *= sign( dot( gN, V ) ) / max( length( gN ), 1e-12 );
    vec3 r1 = cross( dp2, gN ), r2 = cross( gN, dp1 ); float det = dot( dp1, r1 ); det = abs( det ) < 1e-14 ? 1e-14 : det;
    vec3 gu = ( du1.x * r1 + du2.x * r2 ) / det, gv = ( du1.y * r1 + du2.y * r2 ) / det;
    float rr0 = length( uv - c ) / ${'$'}{IRIS_R};
    float irisM = 1.0 - smoothstep( 0.96, 1.04, rr0 );
    float irisView = ${'$'}{IRIS_R} / max( 0.5 * ( length( gu ) + length( gv ) ), 1e-6 );   // iris radius in view units
    vec3 Rd = refract( - V, eN, 0.7267 ); float hgt = uEyeLook.x * irisView * max( 1.0 - rr0 * rr0, 0.0 );
    vec3 off = Rd * ( hgt / max( dot( Rd, - eF ), 0.25 ) );
    vec2 uvI = uv + vec2( dot( gu, off ), dot( gv, off ) ) * irisM;
    vec2 dI = uvI - c; float rr = length( dI ) / ${'$'}{IRIS_R}; vec2 dir = dI / max( length( dI ), 1e-6 );
    // ---- pupil: size from the light at the eye, painted iris stretched to fit ----
    float lux = eyeIllum( - vViewPosition, F0 );
    float pup = mix( 0.62, 0.24, smoothstep( -6.0, 5.0, log2( max( lux, 1e-4 ) ) ) ) * uEyeLook.y;   // a lit deck (~1.8 at the eye in the talk close-up) gives ~0.37
    float p0 = ${'$'}{PUPIL0}, rs = rr < pup ? rr * p0 / pup : mix( p0, 1.0, ( rr - pup ) / max( 1.0 - pup, 1e-3 ) );
    vec2 uvS = rr < 1.0 ? c + dir * rs * ${'$'}{IRIS_R} : uvI;
    vec4 tex = texture2D( map, uvS );
    float aa = clamp( 1.0 - fwidth( rr ) * 9.0, 0.0, 1.0 );   // fine iris / vein detail fades as the eye gets small on screen
    // iris colour: the painted brown's shading (relative), recoloured per person; amber inner ring, fibres, collarette, crypts, limbal ring
    float t = clamp( ( rr - pup ) / max( 1.0 - pup, 1e-3 ), 0.0, 1.0 );
    float ang = atan( dir.y, dir.x );
    float fib = en2( vec2( ang * 9.55 + uEyeLook.z, t * 2.5 ) ) * 0.6 + en2( vec2( ang * 23.9 + uEyeLook.z * 3.0, t * 4.0 ) ) * 0.4;
    float crypt = smoothstep( 0.58, 0.92, en2( vec2( ang * 5.5 + uEyeLook.z * 1.7, t * 3.0 + 2.0 ) ) ) * fib * smoothstep( 0.15, 0.4, t ) * ( 1.0 - smoothstep( 0.7, 0.9, t ) );
    float collar = exp( - pow( ( t - 0.3 - 0.06 * ( en2( vec2( ang * 3.2, 1.0 ) ) - 0.5 ) ) / 0.07, 2.0 ) );
    vec3 iris = mix( uIris.rgb, mix( uIris2.rgb, uIris.rgb, smoothstep( 0.12, 0.5, t ) ), uIris2.a );
    iris *= mix( 1.0, 0.55 + 0.9 * fib, aa * 0.85 ) * ( 1.0 + 0.45 * collar * aa ) * ( 1.0 - 0.45 * crypt * aa );
    iris *= mix( 1.0, clamp( dot( tex.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / 0.03, 0.4, 1.6 ), 0.5 );
    iris *= 1.0 - 0.7 * smoothstep( 0.78, 0.99, rr );                                  // limbal ring
    vec3 pupilC = vec3( 0.004 );
    vec3 alb = mix( pupilC, iris, smoothstep( pup - 0.03, pup + 0.03, rr ) );
    // sclera: off-white, warmer and pinker into the corners (the painted map), veins from the corners in toward the limbus
    // r3: slightly off-white (x0.8 / 0.76 / 0.7 of the map, was 0.88 / 0.85 / 0.8: with the full deck ambient it read paper white next to the face) and
    // shaded as it curves away into the corners (the ball turns from the light and sits deeper in the socket there)
    vec3 scl = tex.rgb * vec3( 0.8, 0.76, 0.7 ) * ( 1.0 - 0.3 * smoothstep( 1.25, 2.7, rr ) );
    float vw = smoothstep( 1.12, 2.2, rr ) * ( 0.4 + 0.6 * abs( dir.x ) );
    float vn = ef2( vec2( ang * 2.2 + uEyeLook.z, rr * 1.4 ) );
    float vein = ( 1.0 - smoothstep( 0.0, 0.035 + 0.05 * ( 1.0 - aa ), abs( ef2( vec2( ang * 5.0 + vn * 2.4 + uEyeLook.z, rr * 2.2 ) ) - 0.5 ) ) ) * vw;
    scl = mix( scl, scl * vec3( 0.86, 0.28, 0.24 ), clamp( vein * uEyeLook.w * mix( 0.35, 1.0, aa ), 0.0, 1.0 ) );
    scl = mix( scl, scl * vec3( 0.97, 0.86, 0.84 ), smoothstep( 1.6, 2.8, rr ) * 0.5 * uEyeLook.w );   // a flush toward the corners
    vec3 ball = mix( scl, alb, smoothstep( 1.06, 0.98, rr ) );
    gEyeIris = smoothstep( 1.02, 0.94, rr );
    // lid margin: a narrow band of the lid's wet inner rim on the ball reads as the lids' thickness
    float rim = ( 1.0 - smoothstep( 0.0, 0.03, dLo ) ) + ( 1.0 - smoothstep( 0.0, 0.025, dUp ) ) * 0.6;
    ball = mix( ball, uLidCol, clamp( rim, 0.0, 1.0 ) * 0.55 );   // (r3: 0.85)
    diffuseColor.rgb *= ball;
  }`;
// diffuse on the iris: a flat disc behind the cornea, lit by light refracted at the cornea (replaces the sphere-normal Lambert there)
export const EYE_DIRECT = `
  if ( uGlint > 0.5 ) {
    vec3 Lr = - refract( - directLight.direction, geometryNormal, 0.7267 );
    float nI = max( dot( gEyeF, Lr ), 0.0 ), nS = max( dot( geometryNormal, directLight.direction ), 0.0 );
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( nI - nS ) * gEyeIris;
    // tear line: the wet meniscus on the lower lid catches the light (its surface faces up and out)
    vec3 mN = normalize( geometryNormal + vEyeU0 * 0.9 ), hW = normalize( directLight.direction + geometryViewDir );
    reflectedLight.directSpecular += directLight.color * max( dot( mN, directLight.direction ), 0.0 ) * pow( max( dot( mN, hW ), 0.0 ), 60.0 ) * 1.5 * gEyeWet;
  }`;
// r3: the eye sits in the orbit, under the brow: the deck's indirect light (hemisphere + GI bounce, which skin weights by its normal, uAmb) reaches it at
// ~70%. The environment reflection (IBL + the GI room probe; roughness 0.08) is held to 45% on the sclera and 22% on the iris: at full strength the
// room's cool grey reflected over the whole cornea and the dark iris (albedo ~0.05) read pale blue-grey in every talk close-up, whatever its colour.
// uEyeK (x: direct diffuse scale) is set by js/talk.js for the speaker while the talk key is boosted for darker skin (keyFor), so the whites are not.
export const EYE_END = `
  if ( uGlint > 0.5 ) {
    reflectedLight.directDiffuse *= gEyeAO * uEyeK.x; reflectedLight.indirectDiffuse *= gEyeAO * 0.7;
    reflectedLight.directSpecular *= mix( 1.0, gEyeAO, 0.6 ); reflectedLight.indirectSpecular *= mix( 1.0, gEyeAO, 0.8 ) * mix( 0.45, 0.22, gEyeIris );
  }`;
export const eyeGlsl = (s) => s.replaceAll('${IRIS_R}', EYE_IRIS.r.toFixed(4)).replaceAll('${PUPIL0}', EYE_IRIS.pupil0.toFixed(3));

// ---- per-person look: iris colour (linear albedo), inner ring, vein strength ----
const IRIS = {
  darkBrown: [[0.03, 0.014, 0.006], null], brown: [[0.065, 0.032, 0.011], null], hazel: [[0.075, 0.07, 0.03], [0.09, 0.045, 0.012]],
  green: [[0.05, 0.085, 0.04], [0.085, 0.055, 0.015]], blue: [[0.055, 0.1, 0.16], [0.07, 0.06, 0.035]], grey: [[0.085, 0.095, 0.105], [0.075, 0.065, 0.04]],
};
function hash32(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; }
function prng(seed) { let s = hash32(seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// key: any integer that is the same every time this person is built; skin: their (albedo) skin colour; bloody 0..1
export function eyeLook(key, skin, bloody = 0) {
  const r = prng(key ^ 0x3e1e5), L = 0.2126 * skin.r + 0.7152 * skin.g + 0.0722 * skin.b, x = r();
  const name = L < 0.12 ? (x < 0.7 ? 'darkBrown' : 'brown') : L < 0.22 ? (x < 0.45 ? 'darkBrown' : x < 0.85 ? 'brown' : 'hazel')
    : (x < 0.3 ? 'brown' : x < 0.45 ? 'hazel' : x < 0.58 ? 'green' : x < 0.88 ? 'blue' : 'grey');
  const [c, inner] = IRIS[name], k = 0.8 + r() * 0.4;
  return { name, iris: new THREE.Vector4(c[0] * k, c[1] * k, c[2] * k, 1), inner: inner ? new THREE.Vector4(inner[0], inner[1], inner[2], 1) : new THREE.Vector4(c[0] * k, c[1] * k, c[2] * k, 0),
    look: new THREE.Vector4(0.42, 0.92 + r() * 0.16, r() * 40, Math.min(1, 0.25 + r() * 0.35 + bloody * 0.8)), seed: hash32(key ^ 0x5acc) };
}

// ---- rig: per-kind rest data (eyes = eyesOf() in humans.js, with M: mesh -> rest world) -> per-person uniforms + saccades ----
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _e = new THREE.Euler();
export function eyeUniforms(eyes, look) {
  const id = new THREE.Matrix4();
  return {
    uEyeA: { value: eyes.a.clone() }, uEyeB: { value: eyes.b.clone() }, uEyeMid: { value: eyes.mid }, uEyeFwd: { value: eyes.fwd.clone() }, uEyeUp: { value: (eyes.up || new THREE.Vector3(0, 1, 0)).clone() },
    uEyeRight: { value: (eyes.right || new THREE.Vector3(1, 0, 0)).clone() }, uEyeNasal: { value: (eyes.nasal || new THREE.Vector2(1, -1)).clone() },
    uEyeRA: { value: id.clone() }, uEyeRB: { value: id.clone() },
    uIris: { value: look ? look.iris.clone() : new THREE.Vector4(0.065, 0.032, 0.011, 1) }, uIris2: { value: look ? look.inner.clone() : new THREE.Vector4() },
    uEyeLook: { value: look ? look.look.clone() : new THREE.Vector4(0.42, 1, 0, 0.3) }, uEyeLid: { value: new THREE.Vector4((eyes.lid || LID_DEFAULT)[0], 0, (eyes.lid || LID_DEFAULT)[2], 0) }, uEyeLidK: { value: new THREE.Vector3((eyes.lid || LID_DEFAULT)[1], (eyes.lid || LID_DEFAULT)[3], (eyes.lid || LID_DEFAULT)[4]) },
    uLidCol: { value: new THREE.Color(0.35, 0.12, 0.1) }, uEyeK: { value: new THREE.Vector2(1, 1) },
  };
}
// u: eyeUniforms(); eyes: per-kind rest data; seed: per person. Returns { step(dt, faceW) }.
export function eyeRig(u, eyes, seed) {
  const r = prng(seed), st = { t: 0, next: 0.2 + r() * 1.2, yaw: 0, pitch: 0, ty: 0, tp: 0, ly: -1, lp: -1, gy: 0, gp: 0, amp: 1 };
  const M = eyes.M, Mi = eyes.Mi, cA = eyes.cwA, cB = eyes.cwB, lidUp = (eyes.lid || LID_DEFAULT)[0];
  const build = (out, c) => { _e.set(-st.pitch, st.yaw, 0, 'YXZ'); _r.makeRotationFromEuler(_e); _t.makeTranslation(c.x, c.y, c.z); _m.makeTranslation(-c.x, -c.y, -c.z);
    out.copy(Mi).multiply(_t).multiply(_r).multiply(_m).multiply(M); };
  return {
    u,
    // gaze: a held direction (rad, + = the person's left / up) the saccades play around; amp scales the saccades (0 = still eyes)
    gaze(yaw = 0, pitch = 0, amp = 1) { st.gy = yaw; st.gp = pitch; st.amp = amp; },
    // hold (integration C3 + C4): an already-smoothed gaze from js/faceanim.js setEyes (talk eye contact, idle darts). Applied at once (no second smoothing), and the
    // random saccades drop to small fixational hops while someone else steers the eyes, so the two rigs never fight over a fixation.
    hold(yaw = 0, pitch = 0) { st.yaw += yaw - st.gy; st.pitch += pitch - st.gp; st.gy = yaw; st.gp = pitch; st.amp = 0.35; },
    step(dt, faceW) {
      st.t += dt;
      if ((st.next -= dt) <= 0) {   // a new fixation: mostly small hops near the centre, now and then a larger look aside, often a return to centre
        const big = r() < 0.18, back = r() < 0.35;
        st.ty = back ? (r() - 0.5) * 0.02 : (r() - 0.5) * (big ? 0.22 : 0.09); st.tp = back ? 0 : (r() - 0.5) * (big ? 0.1 : 0.05);
        st.next = 0.3 + r() * r() * 1.9;
      }
      const k = 1 - Math.exp(-dt * 38); st.yaw += (st.gy + st.ty * st.amp - st.yaw) * k; st.pitch += (st.gp + st.tp * st.amp - st.pitch) * k;
      if (M && (Math.abs(st.yaw - st.ly) > 1e-4 || Math.abs(st.pitch - st.lp) > 1e-4)) { build(u.uEyeRA.value, cA); build(u.uEyeRB.value, cB); st.ly = st.yaw; st.lp = st.pitch; }
      if (faceW) {   // the upper lid follows the lid morphs (x: closed amount; the edge rises a little with UpperLidOpen)
        const cl = Math.max(faceW.LeftUpperLidClosed || 0, faceW.RightUpperLidClosed || 0), op = Math.max(faceW.LeftUpperLidOpen || 0, faceW.RightUpperLidOpen || 0);
        u.uEyeLid.value.y = Math.min(1, cl * 0.92); u.uEyeLid.value.x = lidUp + op * 0.12;
      }
    },
  };
}
