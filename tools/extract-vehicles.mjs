// Reads the glb files and writes src/game/vehicleSpecs.json (wheel axles, sizes) used by the game physics.
// Run: node tools/extract-vehicles.mjs
import fs from 'node:fs';

const LIST = {
  'car-kit': ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'police', 'van', 'delivery', 'truck', 'truck-flat', 'ambulance', 'firetruck', 'garbage-truck', 'tractor', 'tractor-police', 'tractor-shovel', 'race', 'race-future', 'kart-oobi', 'kart-oodi', 'kart-ooli', 'kart-oopi', 'kart-oozi'],
  'toy-car-kit': ['vehicle-monster-truck', 'vehicle-speedster', 'vehicle-drag-racer', 'vehicle-racer', 'vehicle-racer-low', 'vehicle-suv', 'vehicle-truck', 'vehicle-vintage-racer'],
  'racing-kit': ['raceCarRed', 'raceCarGreen', 'raceCarOrange', 'raceCarWhite'],
  'starter-kit': ['vehicle-motorcycle', 'vehicle-truck-red', 'vehicle-truck-yellow', 'vehicle-truck-green', 'vehicle-truck-purple'],
  'train-kit': ['train-diesel-a', 'train-diesel-b', 'train-locomotive-a', 'train-locomotive-c', 'train-electric-bullet-a', 'train-electric-city-a', 'train-tram-classic', 'train-tram-modern'],
};
const FACES_MINUS_Z = ['toy-car-kit'];

function readGlb(path) {
  const b = fs.readFileSync(path), l = b.readUInt32LE(12);
  return JSON.parse(b.slice(20, 20 + l).toString());
}
function pretty(id) {
  const f = id.split('/').pop().replace(/^vehicle-/, '').replace(/^train-/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
  let n = f.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bSuv\b/, 'SUV').replace(/\bOobi|Oodi|Ooli|Oopi|Oozi\b/, (m) => m);
  if (id.startsWith('train-kit/')) n += ' Train';
  else if (/kart/i.test(id)) n = 'Go Kart ' + n.replace(/^Kart\s*/i, '');
  return n;
}

const out = [];
for (const [pack, files] of Object.entries(LIST)) for (const file of files) {
  const id = `${pack}/${file}`, j = readGlb(`public/models/${id}.glb`);
  const nodes = j.nodes, wheels = [], parts = [];
  const meshBox = (mi) => {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of j.meshes[mi].primitives) { const a = j.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); } }
    return { mn, mx };
  };
  const walk = (i, off) => {
    const n = nodes[i], t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
    const pos = [off[0] + t[0], off[1] + t[1], off[2] + t[2]];
    if (n.mesh !== undefined) {
      const { mn, mx } = meshBox(n.mesh);
      const isWheel = /wheel/i.test(n.name || '') && !/spare/i.test(n.name || '');
      const box = { mn: mn.map((v, k) => v * s[k] + pos[k]), mx: mx.map((v, k) => v * s[k] + pos[k]) };
      if (isWheel) wheels.push({ name: n.name, pos, r: Math.max((mx[1] - mn[1]) * s[1], (mx[2] - mn[2]) * s[2]) / 2 });
      parts.push(box);
    }
    for (const c of n.children || []) walk(c, pos);
  };
  for (const r of j.scenes[0].nodes) walk(r, [0, 0, 0]);
  // the Car Kit SUV carries a spare tyre on the back door (node 'wheel-back', x=0): not a real wheel
  if (pack === 'car-kit') for (let i = wheels.length - 1; i >= 0; i--) if (wheels[i].name === 'wheel-back' && Math.abs(wheels[i].pos[0]) < 0.05) wheels.splice(i, 1);
  if (!wheels.length) { console.warn('no wheels', id); continue; }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const b of parts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.mn[i]); mx[i] = Math.max(mx[i], b.mx[i]); }
  // group wheels into axles by z position
  const axles = [];
  for (const w of wheels) {
    let a = axles.find((x) => Math.abs(x.z - w.pos[2]) < 0.04);
    if (!a) axles.push(a = { z: w.pos[2], y: w.pos[1], r: w.r, n: 0 });
    a.n++; a.r = Math.max(a.r, w.r);
  }
  axles.sort((a, b) => a.z - b.z);
  const minusZ = FACES_MINUS_Z.includes(pack);
  // forward = direction the nose points; normalise so axles[0] is the REAR axle and last is FRONT
  if (minusZ) axles.reverse();
  const cz = (mn[2] + mx[2]) / 2, dir = minusZ ? -1 : 1;
  const spec = {
    id, name: pretty(id), pack, facing: minusZ ? '-z' : '+z',
    length: +(mx[2] - mn[2]).toFixed(3), height: +(mx[1] - mn[1]).toFixed(3), width: +(mx[0] - mn[0]).toFixed(3),
    bottom: +mn[1].toFixed(3), top: +mx[1].toFixed(3),
    // axle offsets measured along the vehicle's forward direction, from the body centre
    axles: axles.map((a) => ({ x: +(((a.z - cz) * dir)).toFixed(3), y: +a.y.toFixed(3), r: +a.r.toFixed(3), z: +a.z.toFixed(3) })),
  };
  out.push(spec);
}
fs.writeFileSync('src/game/vehicleSpecs.json', JSON.stringify(out, null, 1));
console.log(`wrote ${out.length} vehicles`);
for (const s of out) console.log(s.id.padEnd(38), `len ${s.length} h ${s.height} axles ${s.axles.map((a) => `${a.x}/r${a.r}`).join(' ')}`);
