# Vroom Stages 🚗

A one-button 3D car game with **100 stages**. Every stage has its own vehicle, theme, length and obstacles.
Built to play with kids — and to record: one video can cover many stages (the game auto-advances).

## Controls (only two buttons)
| | Keyboard | Touch / mouse |
|---|---|---|
| **GAS** (hold) | `Space` (or ↑ → D W) | big green button |
| **RESET** (back to last checkpoint) | `R` | big orange button |

Extras: the **⛶ full-screen button** (or `F`; on iPhone use *Share → Add to Home Screen*, then open it from the Home Screen: it is installable and runs full screen in landscape), the **☰ Stages** button (or `Esc`) opens the stage picker (any stage, restart, music on/off). **🎲** jumps to a random stage, and the menu can switch auto-advance between *in order* and *random* (handy for recording). Direct link to a stage: `…/#37`.
Finish a stage → ★ rating by time (par is based on a test bot) → next stage starts automatically (or press GAS).

## What makes it fun (tuned from real play-testing with kids)
Kids got bored fast on long calm tracks and loved **ramps that fling the car and lots of bumps**, so the game is built around that:
- **Floaty, bouncy physics:** reduced gravity in the air (long hang time), soft bouncy suspension and wheels, vehicles 20 % faster, and every stage starts by rolling down a drop-in slope so the action begins immediately.
- **Every stage = a RAMP TRAIN** (3-4 launch ramps back to back, each one throws you ~40 m) **+ a BUMP FIELD** (10-16 big psychedelic bouncy bumps) **+ one showpiece/bumpy obstacle**, with small bumps instead of flat road in between. Stages are ~20-30 s.
- **Manual stunts (hold GAS in the air = backflip):** after a short moment of real air time, *kick the gas and the car spins backwards; keep holding and it keeps spinning* (double, triple, mega flips). **Let go and the spin stops**; if you are close to level the car levels itself and lands safely, but let go too late / at a bad angle and you get a **💥 CRASH LANDING** (big damage, debris, maybe on your roof — press RESET). Land it level after a flip for 🌀 BACKFLIP! / DOUBLE / TRIPLE (✨ PERFECT for a very clean landing). Trains cannot flip (too long).
- **🚀 SUPER RAMP finale:** every stage ends with a boosted, 7-11 m tall rainbow ramp, 3-5 s of air time to show off (stunts!), a long downhill landing zone, and then the finish line.
- ⭐ stars and 🎈 balloons along the way, cheering animals, loops, rainbow bridges, tunnels, mushrooms.
`node tools/fun-metrics.mjs` measures it: airtime went from 24 % to 52 %, big jumps (>0.8 s) from 4 to ~11 per minute, longest calm stretch from 2.6 s to 1.3 s.

### Playing it "right"
The stage checker (`npm run validate`) uses a **"good player" bot**: gas on the ground, let go of it in the air. Players who never let go of GAS will spin and crash a lot on big jumps (about 3 crash landings per stage in simulation) — that is the intended trade-off between "hold GAS = easy driving" and "stunts need timing".

## Trains pull wagons (gerbong)
Every train (diesel, locomotive, electric, tram) pulls 2-4 coupled wagons (box, coal, tanker, container, flatbed, lumber…). Each wagon is its own physics body with its own wheels on a limited-angle hinge, so the train bends over bumps and flies over gaps as one. The start platform is lengthened to hold the whole train, trains skip loops/ferries/seesaws (too long), and the camera pulls back to frame the full train.

## Cliff gaps (fall in the water!)
About 70 % of ramp trains launch you over a **water gap** sized to 50-78 % of what that vehicle can fly, plus ramp-jump cliffs elsewhere (84 of 100 stages have at least one, ~3 per stage on average, up to 30 m wide). Too slow = splash and respawn at the checkpoint.

## Looks: crisp + day/night
Palette textures use nearest-texel sampling, the game renders at up to 2x pixel ratio (and drops resolution only if the device cannot keep up), the 60 Hz physics is interpolated to the screen frame rate, and shadows move in whole texels, so the vehicle stays sharp while moving.
The **🌗 button** (top bar) cycles **auto** (each stage keeps its own look) → **☀️ day** → **🌙 night** (stars, moon, headlights); it applies instantly and is remembered. URL `?tod=night` also works.

## Showpieces and friends
- **Cheering animals** (bunny, chick, bear, frog, sheep, pig) stand along every track and a crowd waits at the finish; they jump, wave and squeak as the vehicle passes.
- **Loop-the-loop:** hit the boost pad, then ride the striped ring (it is a scripted "magic" loop, so it always works).
- **Rainbow bridge:** a glowing rainbow road floating in the sky. **Tunnel:** the world goes dark, neon lights and headlights come on. **Bouncy mushrooms:** big red polka-dot domes that launch you sky-high. The **candy** world has giant lollipops.
Every stage has a ramp jump, a high climb, one showpiece (loop / rainbow / tunnel / mushrooms) and one classic obstacle, plus stars and balloons.

## Bumps that fly and shake
- **Launcher bump** – a pink-rainbow hump with a catapult inside: it fires you ~14 m into the air, with a star arc to follow.
- **Whoops** – back-to-back humps, airtime every time. **Funky bumps** – random shapes (round, spike, camel, plateau) in psychedelic stripes.
- **Washboard** – a yellow/black rumble strip of many small bumps: the vehicle, camera and a "brrrr" sound all rattle (more at higher speed).
- **Double loops** appear in later stages.

## Damage
Every knock adds damage in proportion to how hard it was (soft landing ≈ 3–6 %, hard crash up to 35 %). The meter under the stage name shows it, and the vehicle shows it:
smoke that gets thicker and darker, fire above ~60 %, a sooty crumpled body, a wobbly wheel, debris flying off, and a sputtering engine. It is cosmetic only (stages stay solvable).
**RESET** (or falling in water) repairs the vehicle.

## Recording mode (random stages + random cars)
Menu (☰ Stages) → **🎬 Recording mode**, or open the game with **`?rec=1`** (e.g. `…/3d-word-kids/?rec=1&diff=hard`; `diff` = `easy` / `mixed` / `hard`).
Endless: after each stage a brand-new one starts, with a random vehicle, theme, difficulty and obstacle mix — generated and bot-checked in a background worker one stage ahead, so there is no waiting.
It avoids repeating the last 14 vehicles, the same vehicle type back-to-back, the last 2 themes, and the obstacle types of the previous stage. Stages are capped at ~340 m so one video covers many stages. Stars/progress are not saved in this mode.
The top-right buttons are hidden for clean footage; a small dim **⏹** button (or `Esc`) stops recording mode.

## Play locally
```bash
npm install
npm run dev          # http://localhost:5173
```

## Put it on GitHub Pages
1. Merge this branch into `main` (the workflow runs on pushes to `main`).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow (`.github/workflows/pages.yml`) validates all stages, builds, and deploys. The URL is
   `https://<user>.github.io/<repo>/`. You can also run it manually from the **Actions** tab.

## How it works
- **Physics:** 2D rigid bodies ([planck.js](https://github.com/piqnt/planck)) — suspension, wheel motors, crates, barrels, balls, pins, seesaws, boost/spring pads, ice, mud, water pits.
  Kid-friendly assists: low centre of mass, self-levelling in the air, downforce at speed, auto-reset when stuck.
- **Graphics:** three.js, Kenney CC0 3D models (`public/models`). Six themes: meadow, desert, snow, sunset, candy, night.
- **Sound:** all synthesized in the browser (engine, crashes, splash, fanfare, tune). No audio files.
- **49 vehicles:** cars, trucks, karts, racers, tractors, a monster truck, a motorcycle and trains. Wheels spin and bounce on their suspension.

### Stages
`src/game/stages.json` is generated by `npm run stages` (`tools/build-stages.mjs`): obstacle size scales with the vehicle's wheels and speed and
with the stage number, then a **bot plays every stage** (holding GAS) and any stage it can't finish is regenerated easier.
`npm run validate` re-checks all 100 after you change physics (CI runs it before every deploy).
Ramp **jumps over water gaps are the main obstacle** and appear in every stage (gaps grow with the stage number, from stage 15 some are chained).
Stage 1 is a gentle sedan drive; every 10th stage is a longer "boss" stage. More obstacle types unlock gradually: drop-off cliffs (stage 8), crates/barrels (6-8), **boost-pad long jumps** (12), pins/balls (14-16), logs (18), ice and **moving ferry platforms** (20: board while it is docked, release GAS to ride across, drive off), seesaws (24), springs (28), steps (30), mud (34).

### Code map
- `src/game/sim.js` physics · `terrain.js` stage builder · `stages.js` generator · `bot.js` test players
- `src/game/view.js` 3D scene · `audio.js` sound · `main.js` controls/HUD/stage flow
- `src/game/vehicleSpecs.json` wheel layouts extracted from the models by `npm run vehicles`

## Also in this repo: video renderer
The earlier scripted-video pipeline (Three.js + Playwright + ffmpeg, procedural audio) still works: `render.html`, `capture.mjs`, `queue.mjs`, `batch.mjs`.
```bash
npm run capture -- carJump 30 --vehicle=car-kit/taxi --theme=sunset
node queue.mjs --count=7 --dry-run
```

## Credits
3D models: [Kenney](https://kenney.nl) (CC0) — Car Kit, Toy Car Kit, Train Kit, Racing Kit. Licenses in `public/models/*/`. Music and sound effects are generated.
