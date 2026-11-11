# 3d-word-kids

Cheap, voice-free 3D kids videos: vehicles (car, plane, train, bike…) overcoming obstacles.
Three.js scene → Playwright frame-by-frame capture → ffmpeg MP4 (+ optional music).

## Use
```bash
npm install
npm run dev                       # preview at http://localhost:5173/?scenario=carJump&live
npm run capture -- carJump 30 --vehicle=vehicle-motorcycle   # -> out/carJump-motorcycle.mp4
npm run capture -- carJump 30 --music=music.mp3
npm run batch                     # one video per vehicle (4 trucks + motorcycle)
```

## Add an episode
Create `src/scenarios/<name>.js` exporting `duration` (seconds) and `setup(scene, camera)`
that returns `update(t)`. Make everything a pure function of `t` so renders are deterministic.
Vehicles: real CC0 models from Kenney's Racing Kit in `public/models` (4 trucks, 1 motorcycle), loaded by `loadVehicle()` in `src/vehicles.js`.
To add more (planes, trains…), drop a `.glb` in `public/models`, add its name to `VEHICLES`. `planeHoops` still uses placeholder shapes.

## YouTube Kids notes
Mark videos "made for kids". Vary scenarios/titles (templated mass-produced uploads risk demonetization).
Check licenses of assets and music; credit CC-BY.
