import * as THREE from 'three';
import { loadVehicle, loadModel } from '../vehicles.js';
import { createFade, createConfetti, createSmoke } from '../fx.js';
import { FAIL_LEN, WIN_LEN, TI } from './carJump.cues.js'; // TI = impact time within the fail attempt

// ?outcome=fail | success | both (default: fail first, fade, then a successful retry)
// Everything is a pure function of t (crash physics is pre-simulated at fixed dt), so renders are deterministic.
const TILT = 0.28, T = Math.tan(TILT);
const startZ = 12, rampLow = -14, rampHigh = -22, landZ = -50, WALL_Z = -32;
export let duration = FAIL_LEN + WIN_LEN;

const lerp = THREE.MathUtils.lerp, ease = (k) => k * k * (3 - 2 * k), clamp01 = (k) => Math.min(1, Math.max(0, k));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---- approach poses -------------------------------------------------------
function failApproach(t) {
  let z, y = 0, pitch = 0;
  if (t < 3.0) { const k = t / 3.0; z = lerp(startZ, rampLow, ease(k) * 0.3 + k * 0.7); }
  else if (t < 3.7) { const k = (t - 3.0) / 0.7; z = lerp(rampLow, rampHigh, k); y = (rampLow - z) * T; pitch = TILT; }
  else { const k = (t - 3.7) / (TI - 3.7); z = lerp(rampHigh, -30.4, k); y = lerp(2.3, 1.8, k) + 4.8 * k * (1 - k); pitch = lerp(TILT, 0.05, k); }
  return { z, y, pitch, yaw: 0, roll: 0 };
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

// ---- pre-simulated crash (vehicle bonks into the wall, crates tumble) -----
const DT = 1 / 60, SIM_LEN = 3.2;
function simulateCrash(homes) {
  const n = Math.ceil(SIM_LEN / DT) + 1, r = rng(42);
  const car = { p: new THREE.Vector3(0, 1.8, -30.4), v: new THREE.Vector3(0.4, 3.5, 4.2), yaw: 0, yawV: 5, pitch: 0, pitchV: -5, roll: 0, rollV: 3 };
  const carF = new Float32Array(n * 6);
  const crates = homes.map((h) => {
    const hit = Math.abs(h.ix) <= 1 ? 1 : 0.35;
    return {
      p: h.p.clone(), f: new Float32Array(n * 6), rot: new THREE.Vector3(),
      v: new THREE.Vector3(h.ix * 2.2 * hit + (r() - 0.5) * 2, (2.5 + r() * 4 + h.ih * 1.5) * hit + 0.8, -(4 + r() * 6 + h.ih * 2) * hit - 0.5),
      w: new THREE.Vector3((r() - 0.5) * 16, (r() - 0.5) * 16, (r() - 0.5) * 16),
    };
  });
  for (let i = 0; i < n; i++) {
    carF.set([car.p.x, car.p.y, car.p.z, car.pitch, car.yaw, car.roll], i * 6);
    car.v.y -= 20 * DT; car.p.addScaledVector(car.v, DT);
    if (car.p.y < 0) { car.p.y = 0; car.v.y = car.v.y < -1 ? -car.v.y * 0.35 : 0; car.v.x *= 0.92; car.v.z *= 0.93; car.yawV *= 0.96; }
    car.yaw += car.yawV * DT; car.yawV *= 0.985;
    car.pitchV += (-60 * car.pitch - 5 * car.pitchV) * DT; car.pitch += car.pitchV * DT;
    car.rollV += (-60 * car.roll - 5 * car.rollV) * DT; car.roll += car.rollV * DT;
    for (const c of crates) {
      c.f.set([c.p.x, c.p.y, c.p.z, c.rot.x, c.rot.y, c.rot.z], i * 6);
      c.v.y -= 22 * DT; c.p.addScaledVector(c.v, DT); c.rot.addScaledVector(c.w, DT);
      if (c.p.y < 0.72) { c.p.y = 0.72; c.v.y = c.v.y < -1 ? -c.v.y * 0.3 : 0; c.v.x *= 0.94; c.v.z *= 0.94; c.w.multiplyScalar(0.9); }
    }
  }
  return { n, carF, crateF: crates.map((c) => c.f) };
}
function sample(f, n, tau, out) {
  const i = Math.min(Math.max(tau / DT, 0), n - 1), i0 = Math.floor(i), i1 = Math.min(i0 + 1, n - 1), a = i - i0;
  for (let k = 0; k < 6; k++) out[k] = lerp(f[i0 * 6 + k], f[i1 * 6 + k], a);
  return out;
}

export async function setup(scene, camera, opts = {}) {
  const outcome = ['fail', 'success'].includes(opts.outcome) ? opts.outcome : 'both';
  duration = outcome === 'fail' ? FAIL_LEN : outcome === 'success' ? WIN_LEN : FAIL_LEN + WIN_LEN;

  const car = await loadVehicle(opts.vehicle || 'car-kit/sedan');
  car.rotation.order = 'YXZ'; scene.add(car);
  const ramp = await loadModel('racing-kit/roadRampLong', { scale: 4.15, center: true });
  ramp.position.set(0, 0, -18); scene.add(ramp);

  // crate wall (5 wide x 2 high); each crate sits in a pivot at its centre so it can tumble
  const homes = [], pivots = [];
  for (let ix = -2; ix <= 2; ix++) for (let ih = 0; ih < 2; ih++) {
    const c = await loadModel('car-kit/box', { scale: 1.7, center: true });
    c.position.y = -0.6; const pv = new THREE.Group(); pv.add(c);
    const p = new THREE.Vector3(ix * 1.2, ih * 1.2 + 0.6, WALL_Z); pv.position.copy(p);
    scene.add(pv); homes.push({ p, ix, ih }); pivots.push(pv);
  }
  for (const x of [-3, 3]) for (const z of [-26, -28.5]) {
    const c = await loadModel('car-kit/cone', { scale: 1.6, center: true }); c.position.set(x, 0, z); scene.add(c);
  }

  const crash = simulateCrash(homes), tmp = new Array(6);
  const setFade = createFade(camera, scene);
  const smokeHit = createSmoke(scene, { count: 12, seed: 5, size: 3, life: 1.4 });
  const smokeLand = createSmoke(scene, { count: 10, seed: 9, size: 2.2, life: 1.0, speed: 4 });
  const confetti = createConfetti(scene, { center: [0, 0, -56], spread: [9, 0, 9] });
  const camOff = new THREE.Vector3();

  return (t) => {
    const fail = outcome === 'fail' || (outcome === 'both' && t < FAIL_LEN);
    const tau = outcome === 'both' && t >= FAIL_LEN ? t - FAIL_LEN : t;

    // vehicle + crates
    let pose;
    if (fail) {
      if (tau < TI) pose = failApproach(tau);
      else { sample(crash.carF, crash.n, tau - TI, tmp); pose = { x: tmp[0], y: tmp[1], z: tmp[2], pitch: tmp[3], yaw: tmp[4], roll: tmp[5] }; }
      homes.forEach((h, i) => {
        if (tau < TI) { pivots[i].position.copy(h.p); pivots[i].rotation.set(0, 0, 0); }
        else { sample(crash.crateF[i], crash.n, tau - TI, tmp); pivots[i].position.set(tmp[0], tmp[1], tmp[2]); pivots[i].rotation.set(tmp[3], tmp[4], tmp[5]); }
      });
    } else {
      pose = winPose(tau);
      homes.forEach((h, i) => { pivots[i].position.copy(h.p); pivots[i].rotation.set(0, 0, 0); });
    }
    car.position.set(pose.x || 0, pose.y, pose.z);
    car.rotation.set(pose.pitch, pose.yaw, pose.roll);
    car.userData.wheels.forEach((w) => (w.rotation.x = pose.z * 0.8));

    // effects
    smokeHit(fail ? tau - TI : -1, new THREE.Vector3(0, 1.2, -31));
    smokeLand(!fail ? tau - 6.4 : -1, new THREE.Vector3(0, 0.3, landZ));
    confetti(!fail ? tau - 6.7 : -1);

    // camera
    if (fail) {
      const camZ = tau < TI ? pose.z : -30.4;
      camera.position.set(5.5, 4.5 + Math.min(pose.y, 3) * 0.4, camZ + 10);
      const s = tau >= TI ? Math.exp(-(tau - TI) * 5) : 0;
      camera.position.x += Math.sin(tau * 70) * 0.35 * s; camera.position.y += Math.cos(tau * 83) * 0.3 * s;
      camera.lookAt(0, 1 + Math.min(pose.y, 3) * 0.6, tau < TI ? pose.z - 3 : -30);
    } else if (tau < 7.6) {
      camera.position.set(5.5, 4.5 + pose.y * 0.4, pose.z + 10);
      camera.lookAt(0, 1 + pose.y * 0.6, pose.z - 3);
    } else { // victory orbit around the vehicle
      const k = ease(clamp01((tau - 7.6) / 1.4)), a = Math.atan2(5.5, 10) + k * Math.PI * 0.9, r = lerp(11.4, 8, k);
      camOff.set(Math.sin(a) * r, lerp(4.5, 3.2, k), Math.cos(a) * r);
      camera.position.set(camOff.x, camOff.y, pose.z + camOff.z); camera.lookAt(0, 1.2, pose.z);
    }

    // fades: in at start, out/in between attempts, out at the end
    let f = 0;
    if (t < 0.5) f = 1 - t / 0.5;
    if (outcome === 'both') { if (t > FAIL_LEN - 0.8 && t < FAIL_LEN) f = (t - (FAIL_LEN - 0.8)) / 0.8; else if (t >= FAIL_LEN && t < FAIL_LEN + 0.8) f = 1 - (t - FAIL_LEN) / 0.8; }
    if (t > duration - 0.7) f = Math.max(f, (t - (duration - 0.7)) / 0.7);
    setFade(clamp01(f));
  };
}
