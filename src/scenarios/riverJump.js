import * as THREE from 'three';
import { loadVehicle, loadModel } from '../vehicles.js';
import { createFade, createConfetti, createSmoke, createSplash } from '../fx.js';
import { FAIL_LEN, WIN_LEN, TI } from './riverJump.cues.js';

// Flooded road. ?outcome=fail | success | both. The ramp launches over a 12 m river.
const TILT = 0.28, T = Math.tan(TILT);
const startZ = 12, rampLow = -14, rampHigh = -22, landZ = -50;
const WATER_Z0 = -28, WATER_Z1 = -40, WATER_Y = 0.22;
const ENTRY_Z = -34;
export let duration = FAIL_LEN + WIN_LEN;

const lerp = THREE.MathUtils.lerp, ease = (k) => k * k * (3 - 2 * k), clamp01 = (k) => Math.min(1, Math.max(0, k));

function failPose(t) {
  let z, y = 0, pitch = 0, roll = 0;
  if (t < 3.0) { const k = t / 3.0; z = lerp(startZ, rampLow, ease(k) * 0.3 + k * 0.7); }
  else if (t < 3.7) { const k = (t - 3.0) / 0.7; z = lerp(rampLow, rampHigh, k); y = (rampLow - z) * T; pitch = TILT; }
  else if (t < TI) { const k = (t - 3.7) / (TI - 3.7); z = lerp(rampHigh, ENTRY_Z, k); y = 2.3 * (1 - k) + 4 * k * (1 - k) * 1.6; pitch = lerp(TILT, -0.55, k); }
  else { // floating: dips, bobs, drifts, wobbles
    const s = t - TI;
    z = ENTRY_Z - 2.2 * (1 - Math.exp(-s * 1.2));
    y = -0.4 + 0.4 * Math.exp(-s * 1.7) * Math.cos(s * 5.5);
    pitch = -0.55 * Math.exp(-s * 1.6) * Math.cos(s * 3.5) + 0.1 * Math.sin(s * 1.6) * Math.exp(-s * 0.25);
    roll = 0.12 * Math.sin(s * 2.4) * Math.exp(-s * 0.35);
  }
  return { z, y, pitch, yaw: 0, roll };
}
function winPose(t) {
  const lift = (rampLow - rampHigh) * T;
  let z, y = 0, pitch = 0, yaw = 0;
  if (t < 3.2) { const k = t / 3.2; z = lerp(startZ, rampLow, ease(k) * 0.3 + k * 0.7); }
  else if (t < 4.0) { const k = (t - 3.2) / 0.8; z = lerp(rampLow, rampHigh, k); y = (rampLow - z) * T; pitch = TILT; }
  else if (t < 6.4) { const k = (t - 4.0) / 2.4; z = lerp(rampHigh, landZ, k); y = lift * (1 - k) + 24 * k * (1 - k); pitch = TILT - 2 * TILT * k; }
  else if (t < 7.6) { const k = (t - 6.4) / 1.2; z = landZ - 7 * (1 - (1 - k) ** 2); y = 0.3 * Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k); }
  else { const k = clamp01((t - 7.6) / 1.4); z = landZ - 7; y = 0.7 * Math.abs(Math.sin(k * Math.PI * 2)); yaw = Math.PI * 2 * ease(k); }
  return { z, y, pitch, yaw, roll: 0 };
}

function waterMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#2aa3e8'); grad.addColorStop(1, '#1c7fc4'); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
  for (let i = 0; i < 26; i++) { const x = (i * 97) % 256, y = (i * 59) % 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 6, x + 28, y); g.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 3); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.93 }) };
}

export async function setup(scene, camera, opts = {}) {
  const outcome = ['fail', 'success'].includes(opts.outcome) ? opts.outcome : 'both';
  duration = outcome === 'fail' ? FAIL_LEN : outcome === 'success' ? WIN_LEN : FAIL_LEN + WIN_LEN;

  const car = await loadVehicle(opts.vehicle || 'car-kit/sedan');
  car.rotation.order = 'YXZ'; scene.add(car);
  const ramp = await loadModel('racing-kit/roadRampLong', { scale: 4.15, center: true });
  ramp.position.set(0, 0, -18); scene.add(ramp);

  // river across the road + warning pylons on both banks
  const { tex, mat } = waterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40, WATER_Z0 - WATER_Z1), mat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, (WATER_Z0 + WATER_Z1) / 2); water.receiveShadow = true; scene.add(water);
  for (const z of [WATER_Z0 + 0.8, WATER_Z1 - 0.8]) for (const x of [-3.2, -1.1, 1.1, 3.2]) {
    const p = await loadModel('racing-kit/pylon', { scale: 7, center: true }); p.position.set(x, 0, z); scene.add(p);
  }

  const setFade = createFade(camera, scene);
  const splash = createSplash(scene), puffs = createSmoke(scene, { count: 10, seed: 9, size: 2.2, life: 1.0, speed: 4 });
  const confetti = createConfetti(scene, { center: [0, 0, -56], spread: [9, 0, 9] });
  const camOff = new THREE.Vector3();

  return (t) => {
    const fail = outcome === 'fail' || (outcome === 'both' && t < FAIL_LEN);
    const tau = outcome === 'both' && t >= FAIL_LEN ? t - FAIL_LEN : t;
    const pose = fail ? failPose(tau) : winPose(tau);

    car.position.set(0, pose.y, pose.z); car.rotation.set(pose.pitch, pose.yaw, pose.roll);
    car.userData.wheels.forEach((w) => (w.rotation.x = pose.z * 0.8));
    tex.offset.set(t * 0.03, t * 0.05); // gentle current

    splash(fail ? tau - TI : -1, new THREE.Vector3(0, 0.1, ENTRY_Z), WATER_Y);
    puffs(!fail ? tau - 6.4 : -1, new THREE.Vector3(0, 0.3, landZ));
    confetti(!fail ? tau - 6.7 : -1);

    if (fail) {
      const camZ = tau < TI ? pose.z : ENTRY_Z;
      camera.position.set(5.5, 4.5 + Math.min(pose.y, 3) * 0.4, camZ + 10);
      const s = tau >= TI ? Math.exp(-(tau - TI) * 6) : 0;
      camera.position.y += Math.cos(tau * 83) * 0.25 * s;
      camera.lookAt(0, 1 + Math.max(0, Math.min(pose.y, 3)) * 0.6, tau < TI ? pose.z - 3 : ENTRY_Z + 1);
    } else if (tau < 7.6) {
      camera.position.set(5.5, 4.5 + pose.y * 0.4, pose.z + 10);
      camera.lookAt(0, 1 + pose.y * 0.6, pose.z - 3);
    } else {
      const k = ease(clamp01((tau - 7.6) / 1.4)), a = Math.atan2(5.5, 10) + k * Math.PI * 0.9, r = lerp(11.4, 8, k);
      camOff.set(Math.sin(a) * r, lerp(4.5, 3.2, k), Math.cos(a) * r);
      camera.position.set(camOff.x, camOff.y, pose.z + camOff.z); camera.lookAt(0, 1.2, pose.z);
    }

    let f = 0;
    if (t < 0.5) f = 1 - t / 0.5;
    if (outcome === 'both') { if (t > FAIL_LEN - 0.8 && t < FAIL_LEN) f = (t - (FAIL_LEN - 0.8)) / 0.8; else if (t >= FAIL_LEN && t < FAIL_LEN + 0.8) f = 1 - (t - FAIL_LEN) / 0.8; }
    if (t > duration - 0.7) f = Math.max(f, (t - (duration - 0.7)) / 0.7);
    setFade(clamp01(f));
  };
}
