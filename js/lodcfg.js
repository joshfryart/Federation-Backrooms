// Person-LOD distances and switches (no three.js import so tools/test.mjs can drive them in node).  See js/humanlod.js.
export const LOD1_FAR = 8, LOD2_FAR = 22, HYST = 0.12, MIN_TRIS = 600;       // metres (xz distance to the camera / player); HYST = fractional hysteresis
export const lodCfg = { on: true, scale: 1 };                                   // on = master switch (probes / tests); scale < 1 brings every LOD distance in (the perf governor does that on its lower rungs)
export const TARGETS = [1, 0.3, 0.1];                                        // triangle ratio aimed at per level (0 = full); meshes under MIN_TRIS are left alone

// target level for a distance with hysteresis around the current level
export function levelFor(cur, d) {
  if (!lodCfg.on) return 0; const k = lodCfg.scale, up1 = LOD1_FAR * k * (cur >= 1 ? 1 - HYST : 1 + HYST), up2 = LOD2_FAR * k * (cur >= 2 ? 1 - HYST : 1 + HYST);
  return d > up2 ? 2 : d > up1 ? 1 : 0;
}
