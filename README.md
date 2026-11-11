# 3d-word-kids

Cheap, voice-free 3D kids videos: vehicles (car, plane, train, bike…) overcoming obstacles.
Three.js scene → Playwright frame-by-frame capture → ffmpeg MP4 (+ optional music).

## Use
```bash
npm install
npm run dev                                   # preview: http://localhost:5173/?scenario=carJump&vehicle=car-kit/taxi&live
npm run capture -- carJump 30 --vehicle=train-kit/train-diesel-a   # -> out/carJump-train_kit_train_diesel_a.mp4
npm run capture -- carJump 30 --vehicle=car-kit/police --theme=sunset   # themes: day | sunset
npm run capture -- carJump 30 --vehicle=car-kit/police --music=music.mp3
npm run capture -- carJump 30 --outcome=fail      # fail | success | both (default: fail, fade, then successful retry = 16 s)
# audio is automatic (procedural sfx + a bouncy tune, see audio.mjs). Flags: --no-audio  --no-music  --music=your.mp3 (replaces the generated tune)
npm run batch                                 # one video per vehicle in VEHICLES (src/vehicles.js)
# gallery to browse models: ?scenario=lineup&vehicle=car-kit/sedan,car-kit/taxi,train-kit/train-tram-modern
```

## Episodes (scenarios)
- `carJump` – ramp jump over a crate wall. Fail: crash, crates tumble. Success: confetti.
- `riverJump` – flooded road. Fail: splash into the water. Success: clears the river.
- `planeHoops` – older placeholder (no world/audio yet).
Each has an optional `<name>.cues.js` (timings + sound cues). Batch: `node batch.mjs 30 riverJump`.

## World
`src/world.js` builds the environment shared by every scenario: gradient sky, clouds, hills, grass, racing road with barriers,
fences, grandstands/tents, flags, trees, sun with shadows. Deterministic (seeded) so renders are repeatable.
Add themes in `THEMES`. Rendering takes ~3 min per 8 s video at 30fps (shadows + 1080p, software GL).

## Assets (all Kenney, CC0 — see License.txt in each folder)
`public/models/<pack>/<file>.glb`, referenced as `<pack>/<file>`:
- `car-kit` – cars, taxi, police, fire truck, tractor, karts… (also cones, boxes)
- `toy-car-kit` – monster truck, racers + **ramps, loops, hills, bumps, coins, gates** (obstacle pieces!)
- `train-kit` – locomotives, trams, carriages + railroad pieces
- `racing-kit` – race cars, ramps, barriers, fences, tents, trees
- `starter-kit` – motorcycle, trucks

## Add an episode
Create `src/scenarios/<name>.js` exporting `duration` (seconds) and `setup(scene, camera)`
that returns `update(t)`. Make everything a pure function of `t` so renders are deterministic.
`loadVehicle(name)` in `src/vehicles.js` loads any model, scales it, and faces it toward -Z (per-pack facing is set there).
`planeHoops` still uses placeholder shapes (no plane model yet).

## YouTube Kids notes
Mark videos "made for kids". Vary scenarios/titles (templated mass-produced uploads risk demonetization).
Check licenses of assets and music; credit CC-BY.
