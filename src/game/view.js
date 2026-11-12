import * as THREE from 'three';
import { loadModel } from '../vehicles.js';
import { createSplash, createSmoke, createConfetti } from '../fx.js';
import { mulberry32 } from './terrain.js';
import { vehiclePhysics } from './vehicleClass.js';
import SPECS from './vehicleSpecs.json';

const DEPTH = 7; // terrain thickness (z from -3.5 to +3.5)

export const THEME_STYLE = {
  meadow: { top: 0x3a8fe0, hor: 0xcfe9ff, grass: 0x6fae3f, dirt: 0x8a5a3a, hill: 0x5b9a35, cloud: 0xffffff, sun: 0xfff2d8, sunI: 2.3, hemi: 1.0, trees: ['toy-car-kit/tree', 'toy-car-kit/tree-pine', 'racing-kit/treeLarge', 'racing-kit/treeSmall'] },
  desert: { top: 0x4aa3e8, hor: 0xffe8c0, grass: 0xe0b86a, dirt: 0xb98a4a, hill: 0xd9a45a, cloud: 0xfff6e8, sun: 0xfff0d0, sunI: 2.6, hemi: 1.0, cactus: true },
  snow: { top: 0x7fb0e8, hor: 0xf0f6ff, grass: 0xf4f8ff, dirt: 0xaebfd0, hill: 0xdfe9f5, cloud: 0xffffff, sun: 0xffffff, sunI: 2.0, hemi: 1.1, trees: ['toy-car-kit/tree-pine'] },
  sunset: { top: 0x3b3f8f, hor: 0xffb27a, grass: 0x5f8f3a, dirt: 0x6b4a34, hill: 0x4a7a35, cloud: 0xffd9bf, sun: 0xffc48a, sunI: 2.4, hemi: 1.0, trees: ['toy-car-kit/tree', 'racing-kit/treeLarge'] },
  candy: { lolli: true, top: 0xff8fd0, hor: 0xffe6f2, grass: 0x7be0c3, dirt: 0xd96aa7, hill: 0xb48cff, cloud: 0xffffff, sun: 0xfff0f8, sunI: 2.2, hemi: 1.1, trees: ['racing-kit/treeSmall', 'toy-car-kit/tree'], tint: 0xff9ad0 },
  night: { top: 0x0b1030, hor: 0x2e3f86, grass: 0x2f6b3a, dirt: 0x4a3a2a, hill: 0x1e3a55, cloud: 0x6f7fb5, sun: 0xaabbff, sunI: 1.5, hemi: 1.15, trees: ['toy-car-kit/tree-pine', 'racing-kit/treeLarge'], tint: 0x6f9f7f, stars: true },
};
const DAY_LIGHT = { top: 0x3a8fe0, hor: 0xcfe9ff, sun: 0xfff2d8, sunI: 2.3, hemi: 1.0, cloud: 0xffffff, stars: false };
const NIGHT_LIGHT = { top: 0x0b1030, hor: 0x2e3f86, sun: 0xaabbff, sunI: 1.5, hemi: 1.15, cloud: 0x6f7fb5, stars: true };
const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
/** lighting + ground colours for a stage theme under a time-of-day override ('auto' keeps the theme's own look) */
export function lookFor(themeName, mode) {
  const base = THEME_STYLE[themeName] || THEME_STYLE.meadow, look = { ...base };
  if (mode === 'day') { Object.assign(look, DAY_LIGHT); if (themeName === 'night' || themeName === 'sunset') { const m = THEME_STYLE.meadow; look.grass = m.grass; look.dirt = m.dirt; look.hill = m.hill; } }
  else if (mode === 'night') { Object.assign(look, NIGHT_LIGHT); if (themeName !== 'night') { look.grass = dim(base.grass, 0.4); look.dirt = dim(base.dirt, 0.4); look.hill = dim(base.hill, 0.42); } }
  return look;
}
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
    this.maxPR = Math.min(window.devicePixelRatio || 1, 2); this.pr = this.maxPR; this.fpsEma = 1 / 60; this.prCool = 3; // crisp by default; drops resolution only if the device cannot keep up
    this.renderer.setPixelRatio(this.pr); this.tod = 'auto';
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

  /** dynamic resolution: full sharpness while the frame rate holds, step down if it does not, step back up when it recovers */
  _adaptRes(dt) {
    this.fpsEma += (Math.min(dt, 0.1) - this.fpsEma) * 0.05; this.prCool -= dt;
    if (this.prCool > 0) return;
    if (this.fpsEma > 0.026 && this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); this.prCool = 3; }
    else if (this.fpsEma < 0.0185 && this.pr < this.maxPR) { this.pr = Math.min(this.maxPR, this.pr + 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); this.prCool = 5; }
  }

  // ---- smooth motion: physics runs at a fixed 60 Hz; the screen shows a blend of the last two physics states ----
  _grab(sim) {
    const p = sim.chassis.getPosition(), props = new Float32Array(sim.props.length * 3);
    sim.props.forEach((q, i) => { const b = q.body.getPosition(); props[i * 3] = b.x; props[i * 3 + 1] = b.y; props[i * 3 + 2] = q.body.getAngle(); });
    return { x: p.x, y: p.y, a: sim.chassis.getAngle(), wheels: sim.wheels.map((w) => { const q = w.body.getPosition(); return { x: q.x, y: q.y, a: w.body.getAngle() }; }), wagons: sim.wagons.map((g) => { const q = g.chassis.getPosition(); return { x: q.x, y: q.y, a: g.chassis.getAngle(), wheels: g.wheels.map((w) => { const r = w.body.getPosition(); return { x: r.x, y: r.y, a: w.body.getAngle() }; }) }; }), props };
  }
  capture(sim) { const g = this._grab(sim); this.prev = this.cur && Math.hypot(g.x - this.cur.x, g.y - this.cur.y) < 4 ? this.cur : g; this.cur = g; }
  resetCapture(sim) { this.cur = this.prev = this._grab(sim); }
  _interp(sim, alpha) {
    const A = this.prev, B = this.cur; if (!A || !B) return { ...sim.snapshot(), props: null };
    const L = (a, b) => a + (b - a) * alpha, La = (a, b) => { let d = b - a; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return a + d * alpha; };
    return { x: L(A.x, B.x), y: L(A.y, B.y), a: La(A.a, B.a), dead: sim.dead, hint: sim.hint, wheels: B.wheels.map((w, i) => ({ x: L(A.wheels[i].x, w.x), y: L(A.wheels[i].y, w.y), a: La(A.wheels[i].a, w.a) })), wagons: (B.wagons || []).map((w, i) => { const a = (A.wagons && A.wagons[i]) || w; return { x: L(a.x, w.x), y: L(a.y, w.y), a: La(a.a, w.a), wheels: w.wheels.map((q, j) => ({ x: L(a.wheels[j].x, q.x), y: L(a.wheels[j].y, q.y), a: La(a.wheels[j].a, q.a) })) }; }), props: A.props.length === B.props.length ? { A: A.props, B: B.props, alpha } : null };
  }

  /** day / night switch ('auto' = each stage's own look). Applies instantly, no reload. */
  setTimeOfDay(mode) {
    this.tod = mode; if (!this.stage) return;
    const L = this.look = this.style = lookFor(this.stage.def.theme, mode), sc = this.scene;
    sc.background.setHex(L.hor); sc.fog.color.setHex(L.hor);
    this.sky.material.uniforms.top.value.setHex(L.top); this.sky.material.uniforms.hor.value.setHex(L.hor);
    this.hemi.color.setHex(L.top); this.hemi.groundColor.setHex(L.grass); this.sun.color.setHex(L.sun);
    this.cloudMat.color.setHex(L.cloud); this.hillMat.color.setHex(L.hill); this.dirtMat.color.setHex(L.dirt); if (this.surfMats.grass) this.surfMats.grass.color.setHex(L.grass);
    this.stars.visible = !!L.stars; this.moon.visible = !!L.stars;
  }

  clearStage() {
    this.stageGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && o.userData.ownMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    this.scene.remove(this.stageGroup); this.stageGroup = new THREE.Group(); this.scene.add(this.stageGroup);
    for (const o of [this.sky, this.clouds, this.hills, this.stars, this.sun, this.hemi, this.headlight, this.headGlow]) if (o) this.scene.remove(o);
    if (this.confetti) { this.scene.remove(this.confetti.mesh); this.confetti = null; }
    for (const f of this.fxObjs || []) f.root.forEach((o) => this.scene.remove(o));
    this.fxObjs = []; this.running = [];
  }

  async loadStage(stage, spec, vp) {
    this.clearStage();
    const style = lookFor(stage.def.theme, this.tod), scene = this.scene, G = this.stageGroup;
    this.style = style; this.look = style; this.stage = stage; this.spec = spec; this.vp = vp;
    scene.background = new THREE.Color(style.hor); scene.fog = new THREE.Fog(style.hor, 110, 520);
    this.sky = skyDome(style.top, style.hor); scene.add(this.sky);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false })); this.moon.position.set(-430, 520, -520); this.moon.visible = !!style.stars; this.sky.add(this.moon);

    this.hemi = new THREE.HemisphereLight(style.top, style.grass, style.hemi); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(style.sun, style.sunI); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    Object.assign(this.sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 140 });
    scene.add(this.sun, this.sun.target);
    this.headlight = new THREE.PointLight(0xfff1c9, 0, 44, 1.2); scene.add(this.headlight); this.tunnelK = 0;

    this._clouds(style); this._hills(style); this._stars(); this.stars.visible = !!style.stars;
    this.headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,244,200,1)'); r.addColorStop(0.35, 'rgba(255,230,150,.55)'); r.addColorStop(1, 'rgba(255,220,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); this.headGlow.scale.setScalar(2.6); this.headGlow.visible = false; this.headGlow.userData.noShadow = true; scene.add(this.headGlow);
    this._terrain(stage, style, G);
    await this._props(stage, G);
    this._collectibles(stage, G); this._features(stage, G); this._animals(stage, G);
    await this._decor(stage, style, G);
    await this._vehicle(spec, vp); await this._wagons(stage);
    this._fx();
    const s = stage.start, ex = stage.trainExtra || 0; this.cam.x = s.x + 4 - ex * 0.5; this.cam.y = s.y + 1.8; this.cam.d = 24 + ex * 0.85;
  }

  _clouds(style) {
    const g = new THREE.Group(), r = mulberry32(21), mat = new THREE.MeshBasicMaterial({ color: style.cloud, fog: false }); this.cloudMat = mat;
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group(), n = 3 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat); s.scale.set(9 + r() * 7, 4 + r() * 3, 6 + r() * 4); s.position.set(j * 9 - n * 4, r() * 2, r() * 4); c.add(s); }
      c.position.set((i - 8) * 90 + r() * 40, 55 + r() * 50, -120 - r() * 220); g.add(c);
    }
    this.clouds = g; this.scene.add(g);
  }
  _hills(style) {
    const g = new THREE.Group(), r = mulberry32(5), mat = new THREE.MeshStandardMaterial({ color: style.hill, flatShading: true, roughness: 1 }); this.hillMat = mat;
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
    const dirtMat = std(style.dirt, { flatShading: true }), mats = {}; this.dirtMat = dirtMat; this.surfMats = mats;
    const surfMat = (s) => {
      if (mats[s]) return mats[s];
      if (s === 'shroom') { // red cap with white dots (UVs are world coordinates, one tile = 4 m)
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#e53935'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff';
        for (const [x, y, r] of [[28, 30, 16], [92, 22, 11], [70, 78, 18], [22, 100, 10], [110, 108, 13]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.25, 0.25); t.colorSpace = THREE.SRGBColorSpace;
        return (mats[s] = std(0xffffff, { map: t }));
      }
      if (s === 'funk' || s === 'rumble') { // psychedelic zig-zag stripes / yellow-black rumble strip (UVs are world coordinates)
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
        if (s === 'funk') { const cols = ['#ff4081', '#ffd600', '#00e5ff', '#76ff03', '#b388ff']; for (let i = -4; i < 12; i++) { g.fillStyle = cols[((i % 5) + 5) % 5]; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 80, 128); g.lineTo(i * 16 + 64, 128); g.fill(); } }
        else { g.fillStyle = '#ffcc00'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#222'; for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 16, 0, 16, 128); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(s === 'funk' ? 1 / 6 : 1 / 1.8, s === 'funk' ? 1 / 6 : 1); t.colorSpace = THREE.SRGBColorSpace;
        return (mats[s] = std(0xffffff, { map: t, emissive: s === 'funk' ? 0x331133 : 0x000000 }));
      }
      return (mats[s] = std(SURFACE[s] ?? style.grass));
    };
    const ribbon = (pts, d0, d1, mat, depth) => { // thin extruded strip between (y-d0) and (y-d1)
      const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1] - d0); for (const q of pts) sh.lineTo(q[0], q[1] - d0);
      for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1] - d1); sh.closePath();
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }), mat); m.position.z = -depth / 2; return m;
    };
    const RAINBOW = [0xff3b3b, 0xff9100, 0xffeb3b, 0x4cd964, 0x40c4ff, 0x5c6bc0, 0xb388ff];
    for (const p of stage.pieces) {
      if (p.pts.length < 2) continue;
      if (p.surface === 'rainbow') { // floating rainbow bridge: 7 glowing colour bands, no ground underneath
        RAINBOW.forEach((c, i) => { const m = ribbon(p.pts, i * 0.15, (i + 1) * 0.15 + 0.01, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.5 }), DEPTH * 0.92); m.castShadow = true; G.add(m); });
        continue;
      }
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

  _collectibles(stage, G) {
    // gold stars (extruded 5-point shape) and coloured balloons; shared geometry/materials
    const sh = new THREE.Shape(), R = 0.62, r = 0.28;
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
    sh.closePath();
    const starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }); starGeo.translate(0, 0, -0.11);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xff9800, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.3 });
    const balGeo = new THREE.SphereGeometry(0.62, 14, 12), knotGeo = new THREE.ConeGeometry(0.12, 0.22, 8), stringGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4);
    const strMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), colors = [0xff4081, 0xffeb3b, 0x40c4ff, 0x69f0ae, 0xff9100, 0xb388ff], balMats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
    this.collectMeshes = [];
    for (const c of stage.collectibles) {
      const g = new THREE.Group();
      if (c.type === 'star') { const m = new THREE.Mesh(starGeo, starMat); m.castShadow = false; g.add(m); }
      else { const b = new THREE.Mesh(balGeo, balMats[c.ci % 6]); b.scale.set(0.9, 1.12, 0.9); const k = new THREE.Mesh(knotGeo, balMats[c.ci % 6]); k.position.y = -0.74; k.rotation.x = Math.PI; const st = new THREE.Mesh(stringGeo, strMat); st.position.y = -1.4; g.add(b, k, st); }
      g.position.set(c.x, c.y, 0); g.userData.noShadow = true; g.traverse((o) => { o.userData.noShadow = true; }); G.add(g);
      this.collectMeshes.push(g);
    }
  }

  _features(stage, G) {
    // vertical loops: striped ring + two rails (the vehicle rides it on rails, see sim._startLoop)
    for (const l of stage.loops) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff5252'; g.fillRect(i * 16, 0, 16, 32); }
      const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1); tex.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group(); grp.position.set(l.x0, l.y + l.R, 0);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(l.R, l.R, 4.6, 72, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.55 })); band.rotation.x = Math.PI / 2; band.castShadow = true; grp.add(band);
      for (const z of [-2.35, 2.35]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(l.R, 0.22, 8, 72), std(0x37474f, { metalness: 0.3 })); rail.position.z = z; grp.add(rail); }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), std(0x37474f)); sign.position.set(-l.R - 2.5, -l.R + 1.3, 3.2); grp.add(sign);
      G.add(grp);
    }
    // tunnels: dark back wall with neon strips, ceiling with lamps, portal frames (the world also darkens while you are inside)
    const neon = [0x40c4ff, 0xff4081, 0xffeb3b, 0x69f0ae];
    for (const t of stage.tunnels) {
      const wall = std(0x1c2140, { roughness: 0.9 }), ceil = std(0x2b3158);
      let i = 0;
      for (let x = t.x0; x < t.x1; x += 6, i++) {
        const xm = x + 3, gy = stage.groundY(xm) ?? stage.groundY(x) ?? 0;
        const w = new THREE.Mesh(new THREE.BoxGeometry(6.02, 11, 0.4), wall); w.position.set(xm, gy + 4.4, -3.5); G.add(w);
        for (const yy of [1.0, 7.0]) { const n = new THREE.Mesh(new THREE.BoxGeometry(6.02, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: neon[(i + (yy > 3 ? 1 : 0)) % 4] })); n.position.set(xm, gy + yy, -3.25); G.add(n); }
        const c = new THREE.Mesh(new THREE.BoxGeometry(6.02, 0.5, 7.2), ceil); c.position.set(xm, gy + 8.4, 0); c.castShadow = true; G.add(c);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); lamp.position.set(xm, gy + 7.9, 0); lamp.userData.noShadow = true; G.add(lamp);
      }
      for (const xp of [t.x0, t.x1]) {
        const gy = stage.groundY(xp) ?? 0, col = std(xp === t.x0 ? 0x40c4ff : 0xff4081);
        for (const z of [-3.1, 3.1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.2, 0.8), col); p.position.set(xp, gy + 4.2, z); G.add(p); }
        const l = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 7.4), col); l.position.set(xp, gy + 8.9, 0); G.add(l);
      }
    }
  }

  // ---- cheering animals (built from simple shapes; they jump and wave when the vehicle passes) ----
  _makeAnimal(kind) {
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
    const root = new THREE.Group(), sph = (r, c, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), M(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
    const P = { bunny: { b: 0xffffff, h: 0xffffff, a: 0xffffff }, chick: { b: 0xffd54a, h: 0xffd54a, a: 0xffc107 }, bear: { b: 0x9a6a43, h: 0xa87750, a: 0x8a5c3a }, frog: { b: 0x5bc85b, h: 0x6fd86f, a: 0x4caf50 }, sheep: { b: 0xfafafa, h: 0x4e4e4e, a: 0xeeeeee }, pig: { b: 0xffa8c0, h: 0xffb3c9, a: 0xff94b2 } }[kind];
    root.add(sph(0.5, P.b, 0, 0.55, 0, 1, 1.05, 0.9));
    const head = new THREE.Group(); head.position.set(0, 1.3, 0.05); head.add(sph(kind === 'sheep' ? 0.3 : 0.42, P.h, 0, 0, kind === 'sheep' ? 0.25 : 0, 1, 1, 1)); root.add(head);
    const eye = (x, y, z, r = 0.075) => { head.add(sph(r, 0x111111, x, y, z)); };
    if (kind === 'frog') { for (const sx of [-1, 1]) { head.add(sph(0.16, 0xffffff, sx * 0.22, 0.38, 0.1)); head.add(sph(0.08, 0x111111, sx * 0.22, 0.4, 0.23)); } const mo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), M(0x2e7d32)); mo.position.set(0, -0.12, 0.4); head.add(mo); }
    else if (kind === 'sheep') { eye(-0.1, 0.0, 0.5); eye(0.1, 0.0, 0.5); for (let i = 0; i < 5; i++) head.add(sph(0.17, 0xffffff, (i - 2) * 0.14, 0.3, 0.1)); for (const sx of [-1, 1]) head.add(sph(0.08, 0x333333, sx * 0.3, 0.05, 0.2, 1.8, 0.8, 0.8)); }
    else { eye(-0.16, 0.06, 0.36); eye(0.16, 0.06, 0.36); }
    if (kind === 'bunny') { for (const sx of [-1, 1]) { const ear = sph(0.12, 0xffffff, sx * 0.15, 0.62, 0, 1, 3.4, 0.7); head.add(ear); head.add(sph(0.06, 0xffb6c8, sx * 0.15, 0.62, 0.05, 1, 3.4, 0.5)); } head.add(sph(0.06, 0xff7f9f, 0, -0.05, 0.4)); root.add(sph(0.14, 0xffffff, 0, 0.35, -0.5)); }
    if (kind === 'chick') { const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), M(0xff9800)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.02, 0.5); head.add(beak); head.add(sph(0.07, 0xffc107, 0, 0.45, 0.05, 0.6, 1.8, 0.6)); }
    if (kind === 'bear') { for (const sx of [-1, 1]) head.add(sph(0.15, 0x8a5c3a, sx * 0.32, 0.34, 0)); head.add(sph(0.18, 0xd7b894, 0, -0.1, 0.34, 1, 0.8, 0.8)); head.add(sph(0.06, 0x111111, 0, -0.03, 0.5)); }
    if (kind === 'pig') { const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 14), M(0xff8fb0)); sn.rotation.x = Math.PI / 2; sn.position.set(0, -0.08, 0.44); head.add(sn); for (const sx of [-1, 1]) { head.add(sph(0.03, 0x7a2a45, sx * 0.06, -0.08, 0.52)); const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 6), M(0xff8fb0)); ear.position.set(sx * 0.28, 0.38, 0); ear.rotation.z = -sx * 0.5; head.add(ear); } }
    const arms = [];
    for (const sx of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(sx * 0.5, 0.85, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 8), M(P.a)); arm.position.y = -0.27; arm.castShadow = true; piv.add(arm);
      piv.add(sph(0.12, P.a, 0, -0.56, 0)); root.add(piv); arms.push({ piv, sx });
      root.add(sph(0.16, 0x37474f, sx * 0.2, 0.06, 0.18, 1, 0.6, 1.4));
    }
    return { root, arms, head };
  }
  _animals(stage, G) {
    this.animals = []; const kinds = ['bunny', 'chick', 'bear', 'frog', 'sheep', 'pig'], r = mulberry32((stage.def.seed || 1) + 777);
    const spots = [];
    for (let x = 32; x < stage.finishX - 10; x += 26 + r() * 30) spots.push(x);
    for (let i = 0; i < 6; i++) spots.push(stage.finishX + 4 + i * 4.2); // a crowd at the finish
    spots.forEach((x, i) => {
      const gy = stage.groundY(x); if (gy == null || stage.pits.some((p) => x > p.x0 - 8 && x < p.x1 + 8) || stage.loops.some((l) => Math.abs(x - l.x0) < l.R + 4) || stage.tunnels.some((t) => x > t.x0 - 4 && x < t.x1 + 4)) return;
      const a = this._makeAnimal(kinds[Math.floor(r() * kinds.length)]); const sc = 1.7 + r() * 0.5;
      a.root.scale.setScalar(sc); a.root.position.set(x, gy, -(1.9 + r() * 1.1)); a.root.traverse((o) => { if (o.isMesh) o.userData.noShadow = false; });
      G.add(a.root); this.animals.push({ ...a, x, gy, i, sc, cheered: false, z: a.root.position.z });
    });
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
      else if (style.lolli && r() < 0.6) { // giant swirl lollipop
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const cols = ['#ff5fa2', '#ffffff', '#7be0c3', '#ffe066'];
        for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 2 ? 1 : (i / 2) % 2 ? 0 : 2]; g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 64, (i / 12) * 6.283, ((i + 1) / 12) * 6.283); g.fill(); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const h = 3 + r() * 3, rad = 1.1 + r() * 0.8, lp = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 8), std(0xffffff)); stick.position.y = h / 2; const disc = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.3, 28), [std(0xffffff), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]); disc.rotation.x = Math.PI / 2; disc.position.y = h + rad * 0.6;
        lp.add(stick, disc); lp.position.set(x, gy, z); G.add(lp);
      }
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

  // train wagons (gerbong): same models-on-physics idea as the locomotive, minus the damage effects
  async _wagons(stage) {
    this.wagonVis = [];
    for (const id of stage.def.wagons || []) {
      const wspec = SPECS.find((v) => v.id === id), wvp = vehiclePhysics(wspec, this.vp.scale), dir = wspec.facing === '-z' ? -1 : 1, cz = wspec.axles[0].z - wspec.axles[0].x * dir;
      const outer = new THREE.Group(), inner = new THREE.Group(), model = await loadModel(id, { scale: wvp.scale });
      model.position.set(0, -wvp.cy * wvp.scale, -cz * wvp.scale); inner.rotation.y = dir * Math.PI / 2; inner.add(model); outer.add(inner); this.stageGroup.add(outer);
      model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const raw = [], nodes = []; model.traverse((o) => { if (/wheel/i.test(o.name) && !(o.parent && /wheel/i.test(o.parent.name))) raw.push(o); });
      for (const o of raw) { const rear = wspec.axles[0].z, front = wspec.axles[wspec.axles.length - 1].z, axle = Math.abs(o.position.z - rear) <= Math.abs(o.position.z - front) ? 0 : 1; o.rotation.order = 'YXZ'; nodes.push({ obj: o, axle, rest: o.position.clone() }); }
      this.wagonVis.push({ outer, nodes, wvp, dir });
    }
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

  _puff(now, x, y, vx, vy, life, s0, s1, fire, d, tint = null) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    Object.assign(p, { t0: now, life, x, y, vx, vy, s0, s1, fire, d, tint });
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
    if (e.type === 'flip') for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this._puff(now, e.x, e.y + 1, Math.cos(a) * 4, Math.sin(a) * 4 + 1, 0.8, 0.25, 0.8, false, 0, [0xff4081, 0xffd600, 0x00e5ff, 0x76ff03][i % 4]); }
    if (e.type === 'loop') for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this._puff(now, e.x + Math.cos(a) * 5.5, e.y + Math.sin(a) * 5.5, Math.cos(a) * 2, Math.sin(a) * 2, 0.9, 0.3, 0.9, false, 0, [0xff5252, 0xffffff, 0xffeb3b, 0x40c4ff][i % 4]); }
    if (e.type === 'catapult') for (let i = 0; i < 12; i++) { const a = Math.PI * (0.1 + 0.8 * (i / 11)); this._puff(now, e.x, e.y, Math.cos(a) * 6, Math.sin(a) * 6, 0.8, 0.25, 1.0, false, 0, [0xff4081, 0xffd600, 0x00e5ff, 0x76ff03][i % 4]); }
    if (e.type === 'shroom') for (let i = 0; i < 10; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 9)); this._puff(now, e.x, e.y, Math.cos(a) * 5, Math.sin(a) * 5, 0.8, 0.25, 0.9, false, 0, i % 2 ? 0xffffff : 0xff5a5a); }
    if (e.type === 'collect') { // sparkle burst
      const cols = e.kind === 'balloon' ? [0xff4081, 0xffeb3b, 0x40c4ff, 0x69f0ae] : [0xffe066, 0xfff3a0, 0xffc400];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + Math.random(); this._puff(now, e.x, e.y, Math.cos(a) * (2 + Math.random() * 3), Math.sin(a) * (2 + Math.random() * 3), 0.5, 0.18, 0.5, false, 0, cols[i % cols.length]); }
    }
    if (e.type === 'splash') { const s = this.splashes[this.si++ % this.splashes.length]; s.t0 = now; s.o.set(e.x, e.y, 0); s.y = e.y; }
    else if (e.type === 'bump' && e.power > 0.35 || e.type === 'spring' || e.type === 'boost' || e.type === 'catapult') { const s = this.smokes[this.mi++ % this.smokes.length]; s.t0 = now; s.o.set(e.x, e.y - 0.6, 0.5); }
    else if (e.type === 'finish') {
      if (this.confetti) this.scene.remove(this.confetti.mesh);
      this.confetti = { t0: now, fn: createConfetti(this.scene, { count: 260, center: [e.x + 8, e.y, 0], spread: [12, 0, 4], yRange: [6, 12], fall: 3.2, floorY: e.y - 1 }) };
      this.confetti.mesh = this.scene.children[this.scene.children.length - 1];
    }
  }

  update(sim, now, dt, alpha = 1) {
    this._adaptRes(dt);
    const snap = this._interp(sim, alpha), car = this.carOuter;
    // vehicle + wheels
    const rj = sim.rumble || 0; // washboard: the vehicle rattles
    car.position.set(snap.x, snap.y + Math.sin(now * 91) * 0.04 * rj, 0); car.rotation.z = snap.a + (sim.trickAngle ? sim.trickAngle() : 0) + Math.sin(now * 77) * 0.012 * rj;
    const ca = Math.cos(-snap.a), sa = Math.sin(-snap.a), s = this.vp.scale;
    for (const wn of this.wheelNodes) {
      const w = snap.wheels[wn.axle], dx = w.x - snap.x, dy = w.y - snap.y;
      const ly = dx * sa + dy * ca; // wheel height in chassis space
      wn.obj.position.y = wn.rest.y + (ly - this.vp.axles[wn.axle].y) / s;
      wn.obj.rotation.x = -this.dirSign * w.a;
    }
    // wagons follow their physics bodies (wheels spin and ride their suspension like the locomotive's)
    (this.wagonVis || []).forEach((wv, i) => {
      const w = snap.wagons && snap.wagons[i]; if (!w) return;
      wv.outer.position.set(w.x, w.y, 0); wv.outer.rotation.z = w.a;
      const ca = Math.cos(-w.a), sa = Math.sin(-w.a), sc = wv.wvp.scale;
      for (const wn of wv.nodes) { const q = w.wheels[wn.axle], dx = q.x - w.x, dy = q.y - w.y; wn.obj.position.y = wn.rest.y + (dx * sa + dy * ca - wv.wvp.axles[wn.axle].y) / sc; wn.obj.rotation.x = -wv.dir * q.a; }
    });
    // camera: look ahead, pull back with speed, smooth
    this.spdS = (this.spdS ?? 0) + (Math.abs(sim.speed) - (this.spdS ?? 0)) * (1 - Math.exp(-dt * 2.5)); // smoothed: raw speed jitters on bumps and made the vehicle wobble on screen
    const spd = this.spdS, k = 1 - Math.exp(-dt * 3.2);
    let tx = snap.x + Math.min(9, spd * 0.55 + 3), ty = snap.y + 1.8, td = 24 + Math.min(13, spd * 0.5);
    if (snap.wagons && snap.wagons.length) { const span = snap.x - snap.wagons[snap.wagons.length - 1].x; tx -= span * 0.5; td += span * 0.85; } // trains: frame the whole train
    if (sim.loop) { tx = sim.loop.cx; ty = sim.loop.cy; td = 26 + sim.loop.l.R * 2.4; } // frame the whole ring while looping
    else { const airK = Math.max(0, Math.min(1, (sim.airT - 0.25) / 0.9)); td += 9 * airK; ty += 2.6 * airK; tx += 3 * airK; } // big air: pull back and look ahead
    if (!sim.dead) { // while the car is in the water the camera stays put so the splash is visible
      this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 2.2));
    }
    this.cam.d += (td - this.cam.d) * (1 - Math.exp(-dt * 1.5));
    const rum = sim.rumble || 0, shake = (this.shake > 0 ? (this.shake -= dt, Math.sin(now * 90) * this.shake * 0.6) : 0) + Math.sin(now * 63) * 0.11 * rum;
    this.camera.position.set(this.cam.x, this.cam.y + 0.9 + shake, this.cam.d);
    this.camera.lookAt(this.cam.x - 1, this.cam.y - 0.3, 0);
    // follow-parallax for sky layers, light follows the car
    this.sky.position.set(this.cam.x, 0, 0); this.clouds.position.x = this.cam.x * 0.85; this.hills.position.x = this.cam.x * 0.9; if (this.stars) this.stars.position.x = this.cam.x;
    { // shadow stability: move the light in whole shadow-map texels only (otherwise shadow edges shimmer while driving)
      const off = this._sunOff || (this._sunOff = new THREE.Vector3(16, 34, 22)), dir = off.clone().normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right), texel = 68 / 2048;
      const tg = new THREE.Vector3(snap.x, snap.y, 0), a = tg.dot(right), b = tg.dot(up);
      tg.addScaledVector(right, Math.round(a / texel) * texel - a).addScaledVector(up, Math.round(b / texel) * texel - b);
      this.sun.target.position.copy(tg); this.sun.position.copy(tg).add(off); this.sun.target.updateMatrixWorld();
    }
    // props
    if (this.propsReady === undefined) this._bindProps(sim);
    for (const pm of this.propBind) {
      if (snap.props) { const { A, B, alpha: al } = snap.props, i = pm.idx * 3; let da = B[i + 2] - A[i + 2]; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; pm.mesh.position.set(A[i] + (B[i] - A[i]) * al, A[i + 1] + (B[i + 1] - A[i + 1]) * al, 0); pm.mesh.rotation.z = A[i + 2] + da * al; }
      else { const b = pm.body, p = b.getPosition(); pm.mesh.position.set(p.x, p.y, 0); pm.mesh.rotation.z = b.getAngle(); }
    }
    // effects
    for (const s2 of this.splashes) s2.fn(now - s2.t0, s2.o, s2.y);
    for (const s2 of this.smokes) s2.fn(now - s2.t0, s2.o);
    this._damageFx(sim, now, dt, snap);
    // tunnels: dim the world and switch on the headlights while the vehicle is inside
    const inT = this.stage.tunnels.some((t) => snap.x > t.x0 - 1 && snap.x < t.x1 + 1);
    this.tunnelK += ((inT ? 1 : 0) - this.tunnelK) * (1 - Math.exp(-dt * 5));
    const tk = this.tunnelK, nk = this.look.stars ? 1 : 0; // nk: it is night -> headlights on
    this.hemi.intensity = this.look.hemi * (1 - 0.62 * tk); this.sun.intensity = this.look.sunI * (1 - 0.85 * tk);
    this.headlight.intensity = Math.max(55 * tk, 34 * nk); this.headlight.position.set(snap.x + 3.2, snap.y + 1.4, 7);
    { const on = Math.max(tk, nk) > 0.3 && !sim.dead, a = snap.a, hx = this.vp.chassis.hx; this.headGlow.visible = on;
      if (on) { const fy = this.vp.chassis.y0 + 0.45; this.headGlow.position.set(snap.x + Math.cos(a) * hx * 0.98 - Math.sin(a) * fy, snap.y + Math.sin(a) * hx * 0.98 + Math.cos(a) * fy, 0.8); } }
    // cheering animals: jump and wave when the vehicle is close; squeak once when it arrives
    for (const a of this.animals || []) {
      const dx = snap.x - a.x, ex = Math.max(0, Math.min(1, (13 - Math.abs(dx)) / 9)), e2 = ex * ex * (3 - 2 * ex);
      a.root.position.y = a.gy + Math.abs(Math.sin(now * 9 + a.i)) * 0.6 * e2 * a.sc * 0.55;
      a.root.rotation.y = Math.max(-0.55, Math.min(0.55, dx * -0.05)) * e2; a.head.rotation.z = Math.sin(now * 6 + a.i) * 0.12 * e2;
      for (const { piv, sx } of a.arms) piv.rotation.z = sx * (0.25 + e2 * (2.0 + Math.sin(now * 13 + a.i + sx) * 0.55));
      if (!a.cheered && Math.abs(dx) < 7) { a.cheered = true; if (this.onSound) this.onSound({ type: 'cheer', pitch: a.i % 5 });
        for (let j = 0; j < 5; j++) this._puff(now, a.x + (j - 2) * 0.6, a.gy + 3.4 * a.sc * 0.8, (j - 2) * 0.8, 2.2 + Math.random(), 0.8, 0.2, 0.6, false, 0, [0xff4081, 0xffeb3b, 0xffffff][j % 3]); }
      if (Math.abs(dx) > 40) a.cheered = false;
    }
    if (this.collectMeshes) sim.collect.forEach((c, i) => {
      const g = this.collectMeshes[i]; if (!g) return;
      g.visible = !c.got; if (c.got) return;
      g.position.y = c.y + Math.sin(now * 2 + i) * 0.14;
      if (c.type === 'star') g.rotation.y = now * 2.4 + i; else g.rotation.z = Math.sin(now * 1.6 + i) * 0.12;
    });
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
      if (p.tint != null) { p.m.material.color.setHex(p.tint); p.m.material.opacity = 0.95 * (1 - k) ** 1.5; }
      else if (p.fire) { p.m.material.color.copy(fireA).lerp(fireB, k); p.m.material.opacity = 0.95 * (1 - k); }
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
    sim.props.forEach((p, i) => { if (meshes[i]) this.propBind.push({ body: p.body, mesh: meshes[i], idx: i }); });
  }

  render() { this.renderer.render(this.scene, this.camera); }
  shakeCamera(a) { this.shake = Math.max(this.shake || 0, a); }
}
