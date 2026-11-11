# Credits & Licenses

**Starfarers: The Backdecks** is a parody/homage project. It is not affiliated with, endorsed by, or connected to any
television or film franchise; all ship, species and technology names are original jokes.

## 3D models (all CC0 1.0 — public domain; credit given with thanks)

| Asset | Used for | Author | Source |
|---|---|---|---|
| `robot_large.glb` | Compliance Drone enemy | **Quaternius** | https://quaternius.com (CC0), via https://poly.pizza/u/Quaternius |
| `zombie.glb` | Space-Madness Crewman enemy | **Quaternius** | https://quaternius.com (CC0) |
| `ghost.glb` | Mr. Grinsworth (rogue hologram) enemy | **Quaternius** | https://quaternius.com (CC0) |
| `alien_big.glb` | Slimeling impostor enemy | **Quaternius** | https://quaternius.com (CC0) |
| `slime_spiky.glb` | (bundled, reserved) | **Quaternius** | https://quaternius.com (CC0) |
| `weapon_gun.glb` | First-person zapper | **Kenney** — Space Kit 2.0 | https://kenney.nl/assets/space-kit (CC0) |
| `desk_chairArms.glb`, `desk_computer.glb`, `barrels.glb` | Props (bundled) | **Kenney** — Space Kit 2.0 | https://kenney.nl/assets/space-kit (CC0) |

The files were obtained from the npm packages `@netforge/asset-library-files` (optimized CC0 copies of Quaternius models) and
`@anabis/kenney-space-kit-mirror` (unofficial mirror of Kenney's Space Kit). Models are tinted / re-materialed at runtime.
License texts: `assets/licenses/`.

## Environment lighting
- HDRI **"Lobby"** — **Poly Haven** (https://polyhaven.com, CC0), resized/converted to EXR by the `@pmndrs/assets` package.

## Code & libraries
- **three.js** (MIT) — https://threejs.org — including addons GLTFLoader, EXRLoader, EffectComposer, UnrealBloomPass, SkeletonUtils, BufferGeometryUtils.
- **meshoptimizer decoder** (MIT) — Arseny Kapoulkine.
- **fflate** (MIT) — 101arrowz.

## Original work
Level generation, the Gronk, crewmen, hologram, furbles, clingers, items, textures (procedural), sound (procedural WebAudio) and game code are original to this project.
