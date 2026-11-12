// Recording mode: endless random stages with random vehicles/themes, avoiding repeats of what was just shown.
import SPECS from './vehicleSpecs.json';
import { classify } from './vehicleClass.js';
import { THEMES } from './stages.js';

const RANGE = { easy: [1, 35], mixed: [1, 100], hard: [55, 100] };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Recorder {
  constructor(diff = 'mixed') {
    this.diff = diff; this.hist = { veh: [], cls: [], theme: [], types: [] }; this.queue = null; this.nextDef = null;
    this.worker = new Worker(new URL('./genWorker.js', import.meta.url), { type: 'module' });
    this.pending = new Map(); this.seq = 0;
    this.worker.onmessage = (e) => {
      const { id, def, error } = e.data, p = this.pending.get(id); this.pending.delete(id);
      if (p) (error ? p.reject(new Error(error)) : p.resolve(def));
    };
  }
  setDifficulty(d) { this.diff = d; this.queue = null; this.nextDef = null; }

  // choose what the next stage should be (vehicle, theme, difficulty), steering away from recent ones
  _choose() {
    const h = this.hist, [lo, hi] = RANGE[this.diff] || RANGE.mixed;
    let vs = SPECS.filter((s) => !s.carriage && !h.veh.slice(-14).includes(s.id));
    const diffClass = vs.filter((s) => classify(s).cls !== h.cls[h.cls.length - 1]);
    if (diffClass.length) vs = diffClass;
    const spec = pick(vs.length ? vs : SPECS.filter((s) => !s.carriage));
    let themes = THEMES.filter((t) => !h.theme.slice(-2).includes(t)); if (!themes.length) themes = THEMES;
    return { k: lo + Math.floor(Math.random() * (hi - lo + 1)), vehicle: spec.id, theme: pick(themes), salt: 1 + Math.floor(Math.random() * 1e6), avoid: h.types[h.types.length - 1] || [], maxLen: 340 };
  }
  _generate() {
    const job = this._choose(), id = ++this.seq;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, ...job }); });
  }
  _record(def) {
    const spec = SPECS.find((s) => s.id === def.vehicle), h = this.hist;
    h.veh.push(def.vehicle); h.cls.push(classify(spec).cls); h.theme.push(def.theme);
    h.types.push([...new Set(def.segs.map((s) => s.t).filter((t) => t !== 'flat' && t !== 'jump'))]);
    for (const a of Object.values(h)) if (a.length > 30) a.shift();
  }

  /** the next stage to play; also starts generating the one after it in the background */
  async take() {
    const def = await (this.queue || this._generate());
    this._record(def); this.nextDef = null;
    this.queue = this._generate().then((d) => { this.nextDef = d; return d; });
    return def;
  }
}
