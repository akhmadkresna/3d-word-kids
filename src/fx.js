import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const quiet = (o) => { o.userData.noShadow = true; return o; };

// Full-screen black fade (a quad parked in front of the camera). Returns set(opacity 0..1).
export function createFade(camera, scene) {
  scene.add(camera);
  const m = quiet(new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false })));
  m.position.z = -0.3; m.renderOrder = 999; m.frustumCulled = false; m.visible = false; camera.add(m);
  return (a) => { m.material.opacity = a; m.visible = a > 0.002; };
}

// Confetti: pure function of time. update(tau) where tau = seconds since the burst (negative = hidden).
export function createConfetti(scene, { count = 320, seed = 3, center = [0, 0, 0], spread = [9, 7, 8], yRange = [5, 10], fall = 3.2 } = {}) {
  const r = rng(seed), palette = [0xff4081, 0xffeb3b, 0x40c4ff, 0x69f0ae, 0xff9100, 0xb388ff].map((c) => new THREE.Color(c));
  const mesh = quiet(new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.03, 0.18), new THREE.MeshBasicMaterial({ fog: false }), count));
  mesh.frustumCulled = false;
  const P = [];
  for (let i = 0; i < count; i++) {
    P.push({
      x: center[0] + (r() - 0.5) * 2 * spread[0], y: yRange[0] + r() * (yRange[1] - yRange[0]), z: center[2] + (r() - 0.5) * 2 * spread[2],
      d: r() * 0.9, f: 2 + r() * 3, ph: r() * 6.28, s: [r() * 9, r() * 9, r() * 9], fall: fall * (0.75 + r() * 0.5),
    });
    mesh.setColorAt(i, palette[i % palette.length]);
  }
  scene.add(mesh);
  const o = new THREE.Object3D();
  return (tau) => {
    for (let i = 0; i < count; i++) {
      const p = P[i], t = tau - p.d;
      if (t < 0) { o.scale.setScalar(0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); continue; }
      const tl = (p.y - 0.05) / p.fall, te = Math.min(t, tl);
      o.scale.setScalar(1);
      o.position.set(p.x + Math.sin(te * p.f + p.ph) * 0.8, Math.max(0.05, p.y - p.fall * t), p.z);
      o.rotation.set(te * p.s[0], te * p.s[1], te * p.s[2]);
      o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

// Dust/smoke puffs. update(tau, origin) where tau = seconds since the event.
export function createSmoke(scene, { count = 10, seed = 11, color = 0xe0e0e0, life = 1.3, speed = 3, size = 2.5 } = {}) {
  const r = rng(seed), puffs = [];
  for (let i = 0; i < count; i++) {
    const m = quiet(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })));
    m.visible = false; scene.add(m);
    puffs.push({ m, a: r() * 6.28, s: speed * (0.4 + r() * 0.8), up: 0.8 + r() * 1.6 });
  }
  return (tau, origin) => {
    for (const p of puffs) {
      if (tau < 0 || tau > life) { p.m.visible = false; continue; }
      const k = tau / life;
      p.m.visible = true;
      p.m.position.set(origin.x + Math.cos(p.a) * p.s * tau, origin.y + p.up * tau, origin.z + Math.sin(p.a) * p.s * tau);
      p.m.scale.setScalar(0.5 + size * k); p.m.material.opacity = 0.85 * (1 - k) ** 1.5;
    }
  };
}

// Water splash: droplets on ballistic arcs + an expanding ripple ring. update(tau, origin, waterY).
export function createSplash(scene, { count = 40, seed = 23, life = 1.8 } = {}) {
  const r = rng(seed), drops = [];
  const dm = new THREE.MeshBasicMaterial({ color: 0xd6f1ff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < count; i++) {
    const m = quiet(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), dm)); m.visible = false; scene.add(m);
    const a = r() * 6.28, sp = 1 + r() * 3.5;
    drops.push({ m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5 + r() * 6, s: 0.6 + r() * 1.2 });
  }
  const ring = quiet(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const ring2 = ring.clone(); ring2.material = ring.material.clone(); scene.add(ring2);
  return (tau, o, waterY = 0.08) => {
    for (const d of drops) {
      const y = o.y + d.vy * tau - 9 * tau * tau;
      if (tau < 0 || y < waterY) { d.m.visible = false; continue; }
      d.m.visible = true; d.m.position.set(o.x + d.vx * tau, y, o.z + d.vz * tau); d.m.scale.setScalar(d.s);
    }
    for (const [rg, delay, spd] of [[ring, 0, 4.5], [ring2, 0.35, 3.5]]) {
      const t = tau - delay;
      if (t < 0 || t > life) { rg.visible = false; continue; }
      rg.visible = true; rg.position.set(o.x, waterY + 0.02, o.z); rg.scale.setScalar(0.4 + spd * t); rg.material.opacity = 0.8 * (1 - t / life);
    }
  };
}
