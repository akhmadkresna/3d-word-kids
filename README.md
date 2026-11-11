# 3d-word-kids

Cheap, voice-free 3D kids videos: vehicles (car, plane, train, bike…) overcoming obstacles.
Three.js scene → Playwright frame-by-frame capture → ffmpeg MP4 (+ optional music).

## Use
```bash
npm install
npm run dev                       # preview at http://localhost:5173/?scenario=carJump&live
npm run capture -- carJump 30     # -> out/carJump.mp4 (1080p, 30fps)
npm run capture -- planeHoops 30 music.mp3
```

## Add an episode
Create `src/scenarios/<name>.js` exporting `duration` (seconds) and `setup(scene, camera)`
that returns `update(t)`. Make everything a pure function of `t` so renders are deterministic.
Vehicles are primitives in `src/vehicles.js`; swap in CC0 glTF models (Kenney, Quaternius) with `GLTFLoader`.

## YouTube Kids notes
Mark videos "made for kids". Vary scenarios/titles (templated mass-produced uploads risk demonetization).
Check licenses of assets and music; credit CC-BY.
