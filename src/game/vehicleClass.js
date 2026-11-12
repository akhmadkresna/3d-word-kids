// Gameplay classes: how big each vehicle is in the world and how it drives.
export const GRAVITY = 14;
export const FLOAT = 0.3; // while airborne gravity is reduced by 30 % (longer hang time = more fun)
const SPEED = 1.2;      // everything is 20 % faster than before: action starts sooner

export function classify(spec) {
  const id = spec.id;
  let c = { cls: 'car', len: 4.2, top: 19, torque: 1.0, density: 1.0, freq: 3.8, damp: 0.5, grip: 1.4, level: 1 };
  if (/kart/.test(id)) c = { ...c, cls: 'kart', len: 2.8, top: 17, torque: 0.9, density: 0.9 };
  else if (/motorcycle/.test(id)) c = { ...c, cls: 'moto', len: 3.2, top: 20, torque: 0.8, density: 0.8, level: 1.3 };
  else if (/monster/.test(id)) c = { ...c, cls: 'monster', len: 4.4, top: 17, torque: 1.5, density: 1.1, freq: 3.2, grip: 1.6 };
  else if (/tractor/.test(id)) c = { ...c, cls: 'tractor', len: 3.8, top: 13, torque: 1.8, density: 1.3, grip: 1.8 };
  else if (/train/.test(id)) c = { ...c, cls: 'train', len: 5.2, top: 15, torque: 1.5, density: 1.2, freq: 3.5 };
  else if (/(garbage|firetruck|delivery|ambulance|truck-flat|car-kit\/truck|vehicle-truck)/.test(id)) c = { ...c, cls: 'heavy', len: 4.8, top: 16, torque: 1.4, density: 1.2, freq: 3.8 };
  else if (/(race|speedster|drag|racer|vintage)/.test(id)) c = { ...c, cls: 'racer', len: 4.2, top: 23, torque: 1.1, density: 0.9, freq: 5 };
  return { ...c, top: c.top * SPEED, freq: c.freq * 0.9, damp: Math.min(c.damp, 0.55) }; // bouncier suspension: soft springs, little damping
}

// Everything the physics needs for one vehicle, in metres.
export function vehiclePhysics(spec) {
  const c = classify(spec), s = c.len / spec.length, cy = (spec.bottom + spec.top) / 2;
  const rear = spec.axles[0], front = spec.axles[spec.axles.length - 1];
  const axles = [rear, front].map((a) => ({ x: a.x * s, y: (a.y - cy) * s, r: a.r * s }));
  const bottomY = Math.min(axles[0].y, axles[1].y) + 0.35 * Math.min(axles[0].r, axles[1].r);
  const topY = (spec.top - cy) * s;
  return { ...c, scale: s, axles, chassis: { hx: spec.length * s * 0.46, y0: bottomY, y1: topY }, cy };
}
