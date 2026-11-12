import * as THREE from 'three';
import { loadModel } from '../vehicles.js';
import { createSplash, createSmoke, createConfetti } from '../fx.js';
import { mulberry32 } from './terrain.js';

const DEPTH = 7; // terrain thickness (z from -3.5 to +3.5)

export const THEME_STYLE = {
  meadow: { top: 0x3a8fe0, hor: 0xcfe9ff, grass: 0x6fae3f, dirt: 0x8a5a3a, hill: 0x5b9a35, cloud: 0xffffff, sun: 0xfff2d8, sunI: 2.3, hemi: 1.0, trees: ['toy-car-kit/tree', 'toy-car-kit/tree-pine', 'racing-kit/treeLarge', 'racing-kit/treeSmall'] },
  desert: { top: 0x4aa3e8, hor: 0xffe8c0, grass: 0xe0b86a, dirt: 0xb98a4a, hill: 0xd9a45a, cloud: 0xfff6e8, sun: 0xfff0d0, sunI: 2.6, hemi: 1.0, cactus: true },
  snow: { top: 0x7fb0e8, hor: 0xf0f6ff, grass: 0xf4f8ff, dirt: 0xaebfd0, hill: 0xdfe9f5, cloud: 0xffffff, sun: 0xffffff, sunI: 2.0, hemi: 1.1, trees: ['toy-car-kit/tree-pine'] },
  sunset: { top: 0x3b3f8f, hor: 0xffb27a, grass: 0x5f8f3a, dirt: 0x6b4a34, hill: 0x4a7a35, cloud: 0xffd9bf, sun: 0xffc48a, sunI: 2.4, hemi: 1.0, trees: ['toy-car-kit/tree', 'racing-kit/treeLarge'] },
  candy: { top: 0xff8fd0, hor: 0xffe6f2, grass: 0x7be0c3, dirt: 0xd96aa7, hill: 0xb48cff, cloud: 0xffffff, sun: 0xfff0f8, sunI: 2.2, hemi: 1.1, trees: ['racing-kit/treeSmall', 'toy-car-kit/tree'], tint: 0xff9ad0 },
  night: { top: 0x0b1030, hor: 0x2e3f86, grass: 0x2f6b3a, dirt: 0x4a3a2a, hill: 0x1e3a55, cloud: 0x6f7fb5, sun: 0xaabbff, sunI: 1.5, hemi: 1.15, trees: ['toy-car-kit/tree-pine', 'racing-kit/treeLarge'], tint: 0x6f9f7f, stars: true },
};
const SURFACE = { ice: 0xa6e6ff, mud: 0x5b3b22, boost: 0x39d96b, spring: 0xff5a5a };

function skyDome(top, hor) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(hor) } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 p; void main(){ float k = pow(clamp(p.y*1.4+0.05,0.0,1.0),0.6); gl_FragColor = vec4(mix(hor, top, k),1.0); }' });
  return new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), m);
}
function arrowTexture(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const x = 30 + i * 62; g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 22, 32); g.lineTo(x, 52); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });

export class GameView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2500);
    this.scene = new THREE.Scene();
    this.stageGroup = new THREE.Group(); this.scene.add(this.stageGroup);
    this.cam = { x: 0, y: 0, d: 24 };
    this.fxPool = null; this.confetti = null; this.running = [];
    window.addEventListener('resize', () => this.resize()); this.resize();
  }
  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  clearStage() {
    this.stageGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && o.userData.ownMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    this.scene.remove(this.stageGroup); this.stageGroup = new THREE.Group(); this.scene.add(this.stageGroup);
    for (const o of [this.sky, this.clouds, this.hills, this.stars, this.sun, this.hemi]) if (o) this.scene.remove(o);
    if (this.confetti) { this.scene.remove(this.confetti.mesh); this.confetti = null; }
    for (const f of this.fxObjs || []) f.root.forEach((o) => this.scene.remove(o));
    this.fxObjs = []; this.running = [];
  }

  async loadStage(stage, spec, vp) {
    this.clearStage();
    const style = THEME_STYLE[stage.def.theme] || THEME_STYLE.meadow, scene = this.scene, G = this.stageGroup;
    this.style = style; this.stage = stage; this.spec = spec; this.vp = vp;
    scene.background = new THREE.Color(style.hor); scene.fog = new THREE.Fog(style.hor, 110, 520);
    this.sky = skyDome(style.top, style.hor); scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(style.top, style.grass, style.hemi); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(style.sun, style.sunI); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    Object.assign(this.sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 140 });
    scene.add(this.sun, this.sun.target);

    this._clouds(style); this._hills(style); if (style.stars) this._stars();
    this._terrain(stage, style, G);
    await this._props(stage, G);
    await this._decor(stage, style, G);
    await this._vehicle(spec, vp);
    this._fx();
    const s = stage.start; this.cam.x = s.x + 4; this.cam.y = s.y + 1.8; this.cam.d = 24;
  }

  _clouds(style) {
    const g = new THREE.Group(), r = mulberry32(21), mat = new THREE.MeshBasicMaterial({ color: style.cloud, fog: false });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group(), n = 3 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat); s.scale.set(9 + r() * 7, 4 + r() * 3, 6 + r() * 4); s.position.set(j * 9 - n * 4, r() * 2, r() * 4); c.add(s); }
      c.position.set((i - 8) * 90 + r() * 40, 55 + r() * 50, -120 - r() * 220); g.add(c);
    }
    this.clouds = g; this.scene.add(g);
  }
  _hills(style) {
    const g = new THREE.Group(), r = mulberry32(5), mat = new THREE.MeshStandardMaterial({ color: style.hill, flatShading: true, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat), w = 40 + r() * 60;
      h.scale.set(w, 12 + r() * 26, w * 0.8); h.position.set((i - 20) * 70 + r() * 30, -6, -260 - r() * 200); g.add(h);
    }
    this.hills = g; this.scene.add(g);
  }
  _stars() {
    const r = mulberry32(8), pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { const a = r() * Math.PI * 2, e = 0.15 + r() * 1.2; pos.set([Math.cos(a) * Math.cos(e) * 800, Math.sin(e) * 800, -Math.abs(Math.sin(a) * Math.cos(e)) * 800 - 50], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })); this.scene.add(this.stars);
  }

  _terrain(stage, style, G) {
    const dirtMat = std(style.dirt, { flatShading: true }), mats = {};
    const surfMat = (s) => mats[s] || (mats[s] = std(SURFACE[s] ?? style.grass));
    for (const p of stage.pieces) {
      if (p.pts.length < 2) continue;
      const pts = p.pts, minY = Math.min(...pts.map((q) => q[1])) - 14, shape = new THREE.Shape();
      shape.moveTo(pts[0][0], minY); shape.lineTo(pts[0][0], pts[0][1] - 0.45); for (const q of pts) shape.lineTo(q[0], q[1] - 0.45); shape.lineTo(pts[pts.length - 1][0], minY); shape.closePath();
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false }), dirtMat);
      body.position.z = -DEPTH / 2; body.receiveShadow = true; body.userData.ownMat = false; G.add(body);
      // top surface band
      const band = new THREE.Shape(); band.moveTo(pts[0][0], pts[0][1]); for (const q of pts) band.lineTo(q[0], q[1]);
      for (let i = pts.length - 1; i >= 0; i--) band.lineTo(pts[i][0], pts[i][1] - 0.55); band.closePath();
      const top = new THREE.Mesh(new THREE.ExtrudeGeometry(band, { depth: DEPTH + 0.02, bevelEnabled: false }), surfMat(p.surface));
      top.position.z = -DEPTH / 2 - 0.01; top.receiveShadow = true; top.castShadow = true; G.add(top);
    }
    // pits: dark deep water + a bright surface
    const deep = std(0x12507f), surf = new THREE.MeshStandardMaterial({ color: 0x2aa3e8, roughness: 0.15, transparent: true, opacity: 0.88 });
    this.waters = [];
    for (const pit of stage.pits) {
      const w = pit.x1 - pit.x0, box = new THREE.Mesh(new THREE.BoxGeometry(w, 12, DEPTH), deep); box.position.set((pit.x0 + pit.x1) / 2, pit.y - 6, 0); G.add(box);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(w, DEPTH), surf); top.rotation.x = -Math.PI / 2; top.position.set((pit.x0 + pit.x1) / 2, pit.y, 0); G.add(top); this.waters.push(top);
    }
    // pads
    for (const pad of stage.pads) {
      if (pad.type === 'mud') continue;
      const len = pad.x1 - pad.x0, tex = pad.type === 'boost' ? arrowTexture('#1fb356') : arrowTexture('#e53935');
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, len / 4), 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, DEPTH * 0.7), new THREE.MeshBasicMaterial({ map: tex })); m.position.set((pad.x0 + pad.x1) / 2, pad.y + 0.06, 0);
      if (pad.type === 'spring') { m.scale.y = 3; m.geometry = new THREE.BoxGeometry(len, 0.3, DEPTH * 0.7); }
      G.add(m);
    }
    // static blocks (logs)
    for (const b of stage.blocks) { const m = new THREE.Mesh(new THREE.CylinderGeometry(b.h / 2, b.h / 2, DEPTH * 0.8, 14), std(0x8a5a2b)); m.rotation.x = Math.PI / 2; m.position.set(b.x, b.y, 0); m.scale.set(b.w / b.h, 1, 1); m.castShadow = true; G.add(m); }
  }

  async _props(stage, G) {
    this._propMeshesByOrder = []; this.propsReady = undefined;
    const palette = [0xff4081, 0xffeb3b, 0x40c4ff, 0x69f0ae, 0xff9100, 0xb388ff];
    for (const p of stage.props) {
      let mesh = null;
      if (p.type === 'crate') { const m = await loadModel('car-kit/box', { scale: p.w / 0.71, center: true }); m.position.y = -p.h / 2; mesh = new THREE.Group(); mesh.add(m); }
      else if (p.type === 'barrel') { mesh = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 2.4, 18), std(0xf57c00)); body.rotation.x = Math.PI / 2; const band = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.02, p.r + 0.02, 0.35, 18), std(0xffffff)); band.rotation.x = Math.PI / 2; mesh.add(body, band); }
      else if (p.type === 'pin') { mesh = new THREE.Group(); mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(p.w * 0.45, p.w * 0.55, p.h, 14), std(0xffffff))); const st = new THREE.Mesh(new THREE.CylinderGeometry(p.w * 0.47, p.w * 0.5, 0.25, 14), std(0xe53935)); st.position.y = p.h * 0.18; mesh.add(st); }
      else if (p.type === 'ball') mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 18, 14), std(palette[p.ci % 6], { roughness: 0.4 }));
      else if (p.type === 'ferry') {
        const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#ffd400'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#222';
        for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 20, 32); g.lineTo(i * 20 + 12, 32); g.lineTo(i * 20 + 32, 0); g.lineTo(i * 20 + 20, 0); g.fill(); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(p.len / 3, 1);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(p.len, 0.5, DEPTH * 0.92), [std(0x5a606b), std(0x5a606b), std(0x6f7683), std(0x3a3f47), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
      }
      else if (p.type === 'seesaw') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(p.len, 0.32, DEPTH * 0.6), std(0xb07a3e));
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.75, 0.9, 3), std(0x7a7a7a)); base.rotation.z = Math.PI; base.position.set(p.x, p.y + 0.35, 0); base.castShadow = true; G.add(base);
      }
      this._propMeshesByOrder.push(mesh);
      if (!mesh) continue;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      G.add(mesh);
    }
  }

  async _decor(stage, style, G) {
    const r = mulberry32(stage.def.seed + 5), end = stage.length;
    const addTree = async (name, x, y, z, sc) => {
      const m = await loadModel(name, { scale: sc, center: true });
      if (style.tint) m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(style.tint); o.userData.ownMat = true; } });
      m.position.set(x, y, z); m.rotation.y = r() * 6.28; G.add(m);
    };
    for (let x = 4; x < end + 30; x += 5 + r() * 9) {
      const gy = stage.groundY(x) ?? stage.groundY(x - 3) ?? 0, z = -(7 + r() * 28), depthShade = 1;
      if (style.cactus) { const c = new THREE.Group(), mat = std(0x3f8f3f), h = 2.5 + r() * 3; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, h, 10), mat); trunk.position.y = h / 2; c.add(trunk); for (const sd of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.3, 8), mat); arm.position.set(sd * 0.75, h * 0.6, 0); c.add(arm); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1, 8), mat); up.position.set(sd * 1.0, h * 0.6 + 0.8, 0); c.add(up); } c.position.set(x, gy, z); G.add(c); }
      else { const t = style.trees[Math.floor(r() * style.trees.length)]; await addTree(t, x, gy - 0.1, z, 3.2 + r() * 3.5); }
    }
    // start + finish gates, checkpoint flags
    const gate = async (x, flags) => {
      const gy = stage.groundY(x) ?? 0, g = await loadModel('racing-kit/overhead', { scale: 8.5, center: true }); g.rotation.y = Math.PI / 2; g.scale.multiplyScalar(0.62); g.position.set(x, gy, 0); G.add(g);
      if (flags) for (const z of [-3.8, 3.8]) { const f = await loadModel('racing-kit/flagCheckers', { scale: 6, center: true }); f.position.set(x + 1.2, gy, z); G.add(f); }
    };
    await gate(3, false); await gate(stage.finishX, true);
    for (const cp of stage.checkpoints.slice(1)) { const b = await loadModel('racing-kit/bannerTowerRed', { scale: 6.5, center: true }); b.position.set(cp.x, (stage.groundY(cp.x) ?? cp.y), -3.9); G.add(b); }
    for (const [name, x] of [['racing-kit/grandStand', 14], ['racing-kit/tent', 24], ['racing-kit/grandStandCovered', stage.finishX + 10], ['racing-kit/tentLong', stage.finishX + 26]]) {
      const m = await loadModel(name, { scale: 4.5, center: true }); m.position.set(x, stage.groundY(x) ?? 0, -9); m.rotation.y = Math.PI / 2; G.add(m);
    }
    G.traverse((o) => { if (o.isMesh && !o.material.isShaderMaterial) { o.receiveShadow = true; } });
  }

  async _vehicle(spec, vp) {
    const outer = new THREE.Group(), inner = new THREE.Group();
    const model = await loadModel(spec.id, { scale: vp.scale });
    const dir = spec.facing === '-z' ? -1 : 1;
    const cz = spec.axles[0].z - spec.axles[0].x * dir;
    model.position.set(0, -vp.cy * vp.scale, -cz * vp.scale);
    inner.rotation.y = dir * Math.PI / 2; inner.add(model); outer.add(inner); this.stageGroup.add(outer);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // wheel nodes -> physics axles (rear = 0, front = 1)
    const raw = [];
    model.traverse((o) => { if (/wheel/i.test(o.name) && !(o.parent && /wheel/i.test(o.parent.name))) raw.push(o); });
    this.wheelNodes = [];
    const wl = model.children.length ? raw.filter((o) => !(spec.pack === 'car-kit' && o.name === 'wheel-back' && Math.abs(o.position.x) < 0.05)) : raw;
    for (const o of wl) {
      const zLocal = o.position.z, rear = spec.axles[0].z, front = spec.axles[spec.axles.length - 1].z;
      const axle = Math.abs(zLocal - rear) <= Math.abs(zLocal - front) ? 0 : 1;
      this.wheelNodes.push({ obj: o, axle, rest: o.position.clone() });
    }
    // damage visuals: private copies of the body materials (the cached model shares them), wheels spin then yaw
    const wheelParts = new Set(); for (const wn of this.wheelNodes) { wn.obj.rotation.order = 'YXZ'; wn.obj.traverse((o) => wheelParts.add(o)); }
    this.bodyMats = [];
    model.traverse((o) => { if (o.isMesh && !wheelParts.has(o) && o.material && o.material.color) { o.material = o.material.clone(); this.bodyMats.push({ m: o.material, base: o.material.color.clone() }); } });
    this.model = model; this.dmgApplied = -1; this.emitAcc = 0; this.fireAcc = 0;
    this.carOuter = outer; this.dirSign = dir;
  }

  _fx() {
    this.fxObjs = [];
    const mk = (fn, n) => Array.from({ length: n }, () => ({ fn, a: null, t0: -99, o: new THREE.Vector3(), extra: 0 }));
    const before = new Set(this.scene.children);
    this.splashes = Array.from({ length: 3 }, () => ({ fn: createSplash(this.scene), t0: -99, o: new THREE.Vector3(), y: 0 }));
    this.smokes = Array.from({ length: 6 }, () => ({ fn: createSmoke(this.scene, { count: 8, seed: 3, size: 2, life: 0.9, speed: 3 }), t0: -99, o: new THREE.Vector3() }));
    // damage smoke / fire trail and flying debris (pooled meshes, driven by time)
    const puffGeo = new THREE.IcosahedronGeometry(1, 1), debGeo = new THREE.BoxGeometry(1, 1, 1);
    this.puffs = Array.from({ length: 60 }, () => {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      m.visible = false; m.userData.noShadow = true; this.scene.add(m);
      return { m, t0: -99, life: 1, x: 0, y: 0, vx: 0, vy: 0, s0: 0.3, s1: 1.5, fire: false, d: 0 };
    });
    this.debris = Array.from({ length: 40 }, () => {
      const m = new THREE.Mesh(debGeo, new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 }));
      m.visible = false; m.userData.noShadow = true; this.scene.add(m);
      return { m, t0: -99, life: 1.6, x: 0, y: 0, vx: 0, vy: 0, sx: 0, sy: 0, sz: 0, size: 0.2, rest: false };
    });
    this.pi = 0; this.di = 0;
    this.fxObjs.push({ root: this.scene.children.filter((c) => !before.has(c)) });
    this.si = 0; this.mi = 0;
  }

  _puff(now, x, y, vx, vy, life, s0, s1, fire, d) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    Object.assign(p, { t0: now, life, x, y, vx, vy, s0, s1, fire, d });
  }
  _debris(e, now) {
    const n = Math.min(10, 2 + Math.floor(e.hit * 26)), palette = [0x2b2b2b, 0x6e6e6e, 0xbdbdbd, 0xff7043, 0xffd54a];
    for (let i = 0; i < n; i++) {
      const p = this.debris[this.di++ % this.debris.length], sz = 0.12 + Math.random() * (0.18 + e.hit);
      p.m.material.color.setHex(palette[Math.floor(Math.random() * palette.length)]);
      Object.assign(p, { t0: now, life: 1.7, x: e.x + (Math.random() - 0.5) * 1.5, y: e.y + 0.2, vx: -e.dvx * 0.25 + (Math.random() - 0.5) * 7, vy: 3 + Math.random() * (4 + e.hit * 14), sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12, sz: (Math.random() - 0.5) * 12, size: sz, rest: false });
    }
    for (let i = 0; i < 3 + Math.round(e.hit * 12); i++) this._puff(now, e.x + (Math.random() - 0.5) * 2, e.y + 0.3, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, 0.9, 0.4, 1.8 + e.hit * 3, false, Math.max(0.3, e.damage));
  }
  event(e, now) {
    if (e.type === 'bump' && e.hit > 0.03) this._debris(e, now);
    if (e.type === 'splash') { const s = this.splashes[this.si++ % this.splashes.length]; s.t0 = now; s.o.set(e.x, e.y, 0); s.y = e.y; }
    else if (e.type === 'bump' && e.power > 0.35 || e.type === 'spring' || e.type === 'boost') { const s = this.smokes[this.mi++ % this.smokes.length]; s.t0 = now; s.o.set(e.x, e.y - 0.6, 0.5); }
    else if (e.type === 'finish') {
      if (this.confetti) this.scene.remove(this.confetti.mesh);
      this.confetti = { t0: now, fn: createConfetti(this.scene, { count: 260, center: [e.x + 8, e.y, 0], spread: [12, 0, 4], yRange: [6, 12], fall: 3.2, floorY: e.y - 1 }) };
      this.confetti.mesh = this.scene.children[this.scene.children.length - 1];
    }
  }

  update(sim, now, dt) {
    const snap = sim.snapshot(), car = this.carOuter;
    // vehicle + wheels
    car.position.set(snap.x, snap.y, 0); car.rotation.z = snap.a;
    const ca = Math.cos(-snap.a), sa = Math.sin(-snap.a), s = this.vp.scale;
    for (const wn of this.wheelNodes) {
      const w = snap.wheels[wn.axle], dx = w.x - snap.x, dy = w.y - snap.y;
      const ly = dx * sa + dy * ca; // wheel height in chassis space
      wn.obj.position.y = wn.rest.y + (ly - this.vp.axles[wn.axle].y) / s;
      wn.obj.rotation.x = -this.dirSign * w.a;
    }
    // camera: look ahead, pull back with speed, smooth
    const spd = Math.abs(sim.speed), k = 1 - Math.exp(-dt * 3.2);
    const tx = snap.x + Math.min(9, spd * 0.55 + 3), ty = snap.y + 1.8, td = 24 + Math.min(13, spd * 0.5);
    if (!sim.dead) { // while the car is in the water the camera stays put so the splash is visible
      this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 2.2));
    }
    this.cam.d += (td - this.cam.d) * (1 - Math.exp(-dt * 1.5));
    const shake = this.shake > 0 ? (this.shake -= dt, Math.sin(now * 90) * this.shake * 0.6) : 0;
    this.camera.position.set(this.cam.x, this.cam.y + 0.9 + shake, this.cam.d);
    this.camera.lookAt(this.cam.x - 1, this.cam.y - 0.3, 0);
    // follow-parallax for sky layers, light follows the car
    this.sky.position.set(this.cam.x, 0, 0); this.clouds.position.x = this.cam.x * 0.85; this.hills.position.x = this.cam.x * 0.9; if (this.stars) this.stars.position.x = this.cam.x;
    this.sun.position.set(snap.x + 16, snap.y + 34, 22); this.sun.target.position.set(snap.x, snap.y, 0); this.sun.target.updateMatrixWorld();
    // props
    if (this.propsReady === undefined) this._bindProps(sim);
    for (const pm of this.propBind) { const b = pm.body, p = b.getPosition(); pm.mesh.position.set(p.x, p.y, 0); pm.mesh.rotation.z = b.getAngle(); }
    // effects
    for (const s2 of this.splashes) s2.fn(now - s2.t0, s2.o, s2.y);
    for (const s2 of this.smokes) s2.fn(now - s2.t0, s2.o);
    this._damageFx(sim, now, dt, snap);
    if (this.confetti) { this.confetti.fn(now - this.confetti.t0); }
  }

  // body darkens/squashes, wheels wobble, smoke (then fire) trails the vehicle; all scale with sim.damage
  _damageFx(sim, now, dt, snap) {
    const d = sim.damage, s = this.modelScale ?? this.vp.scale;
    if (Math.abs(d - this.dmgApplied) > 0.003) {
      this.dmgApplied = d;
      const soot = new THREE.Color(0x2d2926);
      for (const b of this.bodyMats) b.m.color.copy(b.base).lerp(soot, Math.min(1, d * 0.85));
      this.model.scale.set(s, s * (1 - 0.11 * d), s * (1 - 0.08 * d)); this.model.rotation.x = 0.07 * d; // crumpled + sagging
    }
    this.wheelNodes.forEach((wn, i) => { wn.obj.rotation.y = d > 0.05 ? Math.sin(now * 17 + i * 2.1) * 0.22 * d * d + (i === 0 ? 0.55 * Math.max(0, d - 0.45) : 0) : 0; });
    if (!sim.dead && d > 0.08) {
      const a = snap.a, ca = Math.cos(a), sa = Math.sin(a), lx = this.vp.chassis.hx * 0.6, ly = this.vp.chassis.y1 * 0.9;
      const hx = snap.x + lx * ca - ly * sa, hy = snap.y + lx * sa + ly * ca;
      this.emitAcc += dt * (3 + 30 * d);
      while (this.emitAcc >= 1) { this.emitAcc -= 1; this._puff(now, hx + (Math.random() - 0.5) * 0.5, hy, -sim.speed * 0.12 + (Math.random() - 0.5) * 1.2, 1.4 + Math.random() * 1.6, 0.9 + d * 0.8, 0.25, 1.2 + d * 1.6, false, d); }
      if (d > 0.62) { this.fireAcc += dt * (10 + 30 * (d - 0.62)); while (this.fireAcc >= 1) { this.fireAcc -= 1; this._puff(now, hx + (Math.random() - 0.5) * 0.6, hy - 0.1, -sim.speed * 0.05 + (Math.random() - 0.5), 2.2 + Math.random(), 0.35, 0.35, 0.1, true, d); } }
    }
    const smokeLight = new THREE.Color(0xe8e8e8), smokeDark = new THREE.Color(0x1b1b1b), fireA = new THREE.Color(0xffd54a), fireB = new THREE.Color(0xff4d00);
    for (const p of this.puffs) {
      const age = now - p.t0;
      if (age < 0 || age > p.life) { p.m.visible = false; continue; }
      const k = age / p.life;
      p.m.visible = true; p.m.position.set(p.x + p.vx * age, p.y + p.vy * age + 0.4 * age * age, 0.5);
      p.m.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      if (p.fire) { p.m.material.color.copy(fireA).lerp(fireB, k); p.m.material.opacity = 0.95 * (1 - k); }
      else { p.m.material.color.copy(smokeLight).lerp(smokeDark, Math.min(1, p.d * 1.25)); p.m.material.opacity = 0.6 * (1 - k) ** 1.2 * (0.55 + p.d * 0.45); }
    }
    for (const p of this.debris) {
      const age = now - p.t0;
      if (age < 0 || age > p.life) { p.m.visible = false; continue; }
      const t = p.rest ? p.restAge : age; let y = p.y + p.vy * t - 11 * t * t;
      const gy = this.stage.groundY(p.x + p.vx * t);
      if (gy != null && y < gy + p.size * 0.5) { y = gy + p.size * 0.5; if (!p.rest) { p.rest = true; p.restAge = age; p.rx = p.x + p.vx * age; p.ry = y; } }
      p.m.visible = true; p.m.position.set(p.rest ? p.rx : p.x + p.vx * t, p.rest ? p.ry : y, 0.3);
      p.m.rotation.set(p.sx * t, p.sy * t, p.sz * t); p.m.scale.setScalar(p.size * Math.min(1, (p.life - age) / 0.4));
    }
  }

  _bindProps(sim) {
    // meshes were added in prop order; collect them again by matching sim.props order
    this.propBind = []; this.propsReady = true;
    const meshes = this._propMeshesByOrder;
    sim.props.forEach((p, i) => { if (meshes[i]) this.propBind.push({ body: p.body, mesh: meshes[i] }); });
  }

  render() { this.renderer.render(this.scene, this.camera); }
  shakeCamera(a) { this.shake = Math.max(this.shake || 0, a); }
}
