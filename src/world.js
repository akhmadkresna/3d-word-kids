import * as THREE from 'three';
import { loadModel } from './vehicles.js';

const THEMES = {
  day:    { top: 0x3a8fe0, horizon: 0xcfe9ff, fog: 0xcfe9ff, ground: '#6fae3f', hill: 0x5b9a35, sun: 0xfff2d8, sunI: 2.4, hemiSky: 0xcfe9ff, hemiGround: 0x6f8f4a, hemiI: 1.0, sunPos: [40, 70, 30], cloud: 0xffffff },
  sunset: { top: 0x3b3f8f, horizon: 0xffb27a, fog: 0xf5b98f, ground: '#5f8f3a', hill: 0x4a7a35, sun: 0xffc48a, sunI: 2.2, hemiSky: 0xffd2a8, hemiGround: 0x55703a, hemiI: 0.9, sunPos: [-60, 28, 20], cloud: 0xffd9bf },
};

// small deterministic PRNG so every render of an episode looks identical
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function sky(t) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(t.top) }, hor: { value: new THREE.Color(t.horizon) } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 p; void main(){ float k = pow(clamp(p.y,0.0,1.0),0.55); gl_FragColor = vec4(mix(hor, top, k),1.0); }',
  });
  return new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), mat);
}

function grassTexture(base) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    g.fillRect(r() * 256, r() * 256, 2 + r() * 4, 2 + r() * 4);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function clouds(t) {
  const g = new THREE.Group(), r = rng(21);
  const mat = new THREE.MeshBasicMaterial({ color: t.cloud, fog: false });
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group(), n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
      s.scale.set(9 + r() * 7, 4 + r() * 3, 6 + r() * 4); s.position.set(j * 9 - n * 4, r() * 2, r() * 4);
      c.add(s);
    }
    c.position.set((r() - 0.5) * 520, 70 + r() * 50, -80 - r() * 360);
    g.add(c);
  }
  return g;
}

function hills(t) {
  const g = new THREE.Group(), r = rng(5);
  const mat = new THREE.MeshStandardMaterial({ color: t.hill, flatShading: true, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
    const side = i % 2 ? 1 : -1, w = 30 + r() * 35;
    h.scale.set(w, 10 + r() * 26, w); h.receiveShadow = true;
    h.position.set(side * (75 + r() * 140), -2, 40 - r() * 330);
    g.add(h);
  }
  return g;
}

export async function buildWorld(scene, renderer, themeName = 'day') {
  const t = THEMES[themeName] || THEMES.day;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene.background = new THREE.Color(t.horizon);
  scene.fog = new THREE.Fog(t.fog, 90, 420);
  scene.add(sky(t), clouds(t), hills(t));

  scene.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiI));
  const sun = new THREE.DirectionalLight(t.sun, t.sunI);
  sun.position.set(...t.sunPos); sun.target.position.set(0, 0, -35);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 110, bottom: -110, near: 1, far: 260 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ map: grassTexture(t.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

  const S = 8; // racing-kit tile (1 unit) -> 8 m, about two vehicle widths
  const place = async (name, x, z, { scale = S, ry = 0, y = 0, center = true } = {}) => {
    const m = await loadModel(name, { scale, center }); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
  };

  // road
  for (let z = 44; z > -130; z -= S) await place('racing-kit/roadStraight', 0, z, { y: 0.01 });

  const r = rng(99);
  // barriers + pylons along both road edges
  for (let i = 0, z = 40; z > -125; z -= 2, i++) for (const x of [-4.6, 4.6]) {
    await place(i % 2 ? 'racing-kit/barrierRed' : 'racing-kit/barrierWhite', x, z, { scale: 8, ry: Math.PI / 2 });
  }
  // fences, tents, grandstands, flags behind the barriers
  for (let z = 36; z > -125; z -= S) for (const x of [-9, 9]) await place('racing-kit/fenceStraight', x, z, { ry: Math.PI / 2 });
  const stands = ['racing-kit/grandStand', 'racing-kit/tent', 'racing-kit/grandStandCovered', 'racing-kit/tentLong', 'racing-kit/tent'];
  for (let i = 0, z = 28; z > -120; z -= 16, i++) {
    await place(stands[i % stands.length], -17, z, { ry: Math.PI / 2 });
    if (i % 2 === 0) await place('racing-kit/flagCheckers', 11, z + 6, { scale: 6 });
    if (i % 3 === 1) await place('racing-kit/bannerTowerRed', 11, z, { scale: 7 });
  }
  await place('racing-kit/grandStandRound', 18, -10, { ry: -Math.PI / 2 });
  await place('racing-kit/overhead', 0, -66, { scale: 8.5 });

  // trees (racing-kit + toy-car-kit) scattered off the road, deterministic
  const trees = ['racing-kit/treeLarge', 'racing-kit/treeSmall', 'toy-car-kit/tree', 'toy-car-kit/tree-pine'];
  for (let i = 0; i < 150; i++) {
    const side = r() > 0.5 ? 1 : -1, x = side * (24 + r() * 90), z = 50 - r() * 200;
    await place(trees[Math.floor(r() * trees.length)], x, z, { scale: 5 + r() * 5, ry: r() * 6.28 });
  }

  scene.traverse((o) => { if (o.isMesh && o !== ground && !o.material.isShaderMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  return { sun, ground };
}
