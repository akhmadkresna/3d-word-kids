// Plan + render a batch of varied episodes with upload metadata.
//   node queue.mjs --count=7 [--fps=24] [--seed=1] [--dir=out/queue] [--dry-run]
// Resumable: finished episodes (existing .mp4) are skipped, so you can stop and rerun.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const count = Number(flags.count || 7), fps = flags.fps || '30', seed = Number(flags.seed || 1), dir = flags.dir || 'out/queue';
const SCENARIOS = { carJump: { crash: 'crates', win: 'Crate Jump', fail: 'CRASH', thumb: 'Crate Jump' }, riverJump: { win: 'River Jump', fail: 'SPLASH' } };

let s = seed >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// vehicle list comes from src/vehicles.js so there is one source of truth
const vehicles = [...fs.readFileSync('src/vehicles.js', 'utf8').match(/VEHICLES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const pretty = (v) => {
  const f = v.split('/').pop().replace(/^vehicle-/, '').replace(/^train-/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
  const name = f.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bSuv\b/, 'SUV');
  if (v.startsWith('train-kit/')) return `${name} Train`;
  return /truck|car|racer|speedster|sedan|suv|taxi|police|van|tractor|motorcycle|firetruck|ambulance/i.test(f) ? name : `${name} Car`;
};
const slug = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// plan: never repeat a vehicle until the pool is used up; alternate scenarios; mostly day, some sunset
const plan = []; let pool = [];
const names = Object.keys(SCENARIOS);
for (let i = 0; i < count; i++) {
  if (!pool.length) pool = shuffle(vehicles);
  const vehicle = pool.pop(), scenario = names[i % names.length], theme = rnd() < 0.3 ? 'sunset' : 'day';
  const n = String(i + 1).padStart(2, '0'), v = pretty(vehicle), sc = SCENARIOS[scenario];
  const id = `${n}-${slug(scenario)}-${slug(vehicle.split('/').pop())}-${theme}`;
  const titles = [`${v} ${sc.win}! Oops… Then a BIG Win!`, `Can the ${v} Do the ${sc.win}? Fail & Win`, `${v}: ${sc.win} Challenge (First Try vs. Second Try)`];
  plan.push({ id, scenario, vehicle, theme, title: titles[i % titles.length], file: `${dir}/${id}.mp4`, thumb: `${dir}/${id}.jpg` });
}

const desc = (e) => `Watch the ${pretty(e.vehicle)} try the ${SCENARIOS[e.scenario].win.toLowerCase()} — first it goes wrong, then it works! Fun cars, trucks and trains for kids. No talking, just fun sounds.

3D models: Kenney (CC0) — https://kenney.nl
Music and sound effects: generated.

#kids #cars #trucks #toys #stunts`;

fs.mkdirSync(dir, { recursive: true });
const manifest = plan.map((e) => ({ ...e, description: desc(e), madeForKids: true }));
fs.writeFileSync(`${dir}/episodes.json`, JSON.stringify(manifest, null, 2));
console.log(`Plan (${plan.length} episodes, fps ${fps}, seed ${seed}) -> ${dir}/episodes.json`);
for (const e of plan) console.log(`  ${e.id.padEnd(46)} ${e.title}`);
if (flags['dry-run']) process.exit(0);

let done = 0; const t0 = Date.now();
for (const e of plan) {
  if (fs.existsSync(e.file)) { console.log(`skip ${e.id} (exists)`); done++; continue; }
  const t1 = Date.now(); console.log(`\n== render ${e.id}`);
  const r = spawnSync('node', ['capture.mjs', e.scenario, fps, `--vehicle=${e.vehicle}`, `--theme=${e.theme}`, `--out=${e.file}`], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status || !fs.existsSync(e.file)) { console.error(`FAILED ${e.id}`); process.exit(1); }
  fs.rmSync(e.file.replace(/\.mp4$/, '.wav'), { force: true });
  // thumbnail: victory moment (confetti), 1.6 s before the end
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', e.file]).stdout.toString());
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, dur - 1.6)), '-i', e.file, '-frames:v', '1', '-q:v', '2', e.thumb]);
  done++; console.log(`done ${e.id} in ${((Date.now() - t1) / 60000).toFixed(1)} min (${done}/${plan.length})`);
}
console.log(`\nAll done in ${((Date.now() - t0) / 60000).toFixed(1)} min. Files + episodes.json in ${dir}/`);
