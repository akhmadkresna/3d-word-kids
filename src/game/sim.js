// Physics for one stage + one vehicle. Pure planck (no DOM / three) so it also runs in Node for the bot tests.
import * as planck from 'planck';
import { GRAVITY, FLOAT, vehiclePhysics } from './vehicleClass.js';
import SPECS from './vehicleSpecs.json' with { type: 'json' };

const { World, Vec2, Box, Circle, Chain, Edge, WheelJoint, RevoluteJoint } = planck;
const rot = (v, a) => new Vec2(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a));
const FRICTION = { grass: 0.9, boost: 1.0, spring: 0.9, ice: 0.05, mud: 1.1, rainbow: 1.0, shroom: 0.9, funk: 0.9, rumble: 1.0 };
export const DT = 1 / 60;

// Ferry platform: docks at the near lip, travels across, docks at the far lip, returns (12 s cycle).
export const FERRY_CYCLE = 12, FERRY_DOCK = 3.5;
const smooth = (t) => t * t * (3 - 2 * t);
export function ferryU(t) { // 0 = docked near side, 1 = docked far side
  const u = ((t % FERRY_CYCLE) + FERRY_CYCLE) % FERRY_CYCLE;
  if (u < FERRY_DOCK) return 0;
  if (u < 6) return smooth((u - FERRY_DOCK) / (6 - FERRY_DOCK));
  if (u < 9.5) return 1;
  return 1 - smooth((u - 9.5) / (FERRY_CYCLE - 9.5));
}
export function ferryCenter(d, t) {
  const left0 = d.x0 - 0.3, left1 = d.x1 + 0.3 - d.len;
  return left0 + (left1 - left0) * ferryU(t) + d.len / 2;
}
/** seconds the ferry will stay docked on the near side (0 if it is away) */
export function ferryDockRemaining(t) { const u = ((t % FERRY_CYCLE) + FERRY_CYCLE) % FERRY_CYCLE; return u < FERRY_DOCK ? FERRY_DOCK - u : 0; }

export class Sim {
  constructor(stage, spec) {
    this.stage = stage; this.spec = spec; this.vp = vehiclePhysics(spec);
    this.world = new World({ gravity: new Vec2(0, -GRAVITY) });
    this.events = []; this.time = 0; this.resets = 0; this.finished = false; this.finishTime = null;
    this.deadTimer = 0; this.flipTimer = 0; this.stuckTimer = 0; this.throttle = 0; this.cpIndex = 0; this.hint = false;
    this.collect = stage.collectibles.map((c) => ({ ...c, got: false })); this.starsGot = 0; this.starsTotal = this.collect.length;
    this.padState = new Map(); this.boostT = 0; this.damage = 0; this.lastHit = -9; this.loop = null; this.superDone = false; this.rumble = 0; this.airT = 0; this.airRot = 0; this.groundT = 0; this.trick = null; this.flips = 0; this.bestAir = 0; this.props = []; this.maxX = 0;
    this._buildTerrain(); this._buildProps(); this._buildCar(); this._buildWagons(); this.reset(true);
  }

  _buildTerrain() {
    const g = this.world.createBody();
    for (const p of this.stage.pieces) {
      if (p.pts.length < 2) continue;
      g.createFixture(new Chain(p.pts.map((q) => new Vec2(q[0], q[1])), false), { friction: FRICTION[p.surface] ?? 0.9, restitution: 0 });
    }
    for (const w of this.stage.walls) g.createFixture(new Edge(new Vec2(w[0][0], w[0][1]), new Vec2(w[1][0], w[1][1])), { friction: 0.5 });
    for (const b of this.stage.blocks) g.createFixture(new Box(b.w / 2, b.h / 2, new Vec2(b.x, b.y), 0), { friction: 0.6 });
    this.ground = g;
  }

  _buildProps() {
    const w = this.world;
    for (const p of this.stage.props) {
      let body;
      if (p.type === 'ferry') {
        body = w.createBody({ type: 'kinematic', position: new Vec2(ferryCenter(p, 0), p.y - 0.25) });
        body.createFixture(new Box(p.len / 2, 0.25), { friction: 1.3 });
      } else if (p.type === 'seesaw') {
        const pivot = new Vec2(p.x, p.y + 0.55);
        body = w.createBody({ type: 'dynamic', position: pivot, angle: 0.12 });
        body.createFixture(new Box(p.len / 2, 0.16), { density: 1.2, friction: 0.9 });
        w.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -0.125, upperAngle: 0.125 }, this.ground, body, pivot));
      } else {
        body = w.createBody({ type: 'dynamic', position: new Vec2(p.x, p.y), allowSleep: true });
        if (p.type === 'crate') body.createFixture(new Box(p.w / 2, p.h / 2), { density: 0.35, friction: 0.5, restitution: 0.1 });
        else if (p.type === 'barrel') body.createFixture(new Circle(p.r), { density: 0.4, friction: 0.5, restitution: 0.2 });
        else if (p.type === 'pin') body.createFixture(new Box(p.w / 2, p.h / 2), { density: 0.3, friction: 0.5, restitution: 0.1 });
        else if (p.type === 'ball') body.createFixture(new Circle(p.r), { density: 0.25, friction: 0.4, restitution: 0.65 });
      }
      this.props.push({ def: p, body, home: { x: body.getPosition().x, y: body.getPosition().y, a: body.getAngle() } });
    }
  }

  _buildCar() {
    const vp = this.vp, w = this.world, c = vp.chassis;
    this.chassis = w.createBody({ type: 'dynamic', position: new Vec2(0, 5), angularDamping: 0.4 });
    this.chassisFixture = this.chassis.createFixture(new Box(c.hx, (c.y1 - c.y0) / 2, new Vec2(0, (c.y1 + c.y0) / 2), 0), { density: vp.density, friction: 0.3, restitution: 0.05 });
    this.chassisFixture.setUserData('chassis');
    // low centre of mass: much harder to tip over, and kid friendly
    const md = { mass: 0, center: new Vec2(0, 0), I: 0 };
    this.chassis.getMassData(md);
    const low = c.y0 + (c.y1 - c.y0) * 0.1, mm = md.mass, dc = md.center.y - low;
    md.center = new Vec2(0, low); md.I = md.I + mm * (low * low - (md.center.y + dc) * (md.center.y + dc)) + mm * dc * dc * 0.0;
    md.I = Math.max(md.I, mm * 0.5);
    this.chassis.setMassData(md);
    this.wheels = vp.axles.map((a) => {
      const b = w.createBody({ type: 'dynamic', position: new Vec2(a.x, 5 + a.y) });
      const f = b.createFixture(new Circle(a.r), { density: vp.density * 0.6, friction: vp.grip, restitution: 0.28 }); f.setUserData('wheel');
      const j = w.createJoint(new WheelJoint({ motorSpeed: 0, maxMotorTorque: 0, enableMotor: true, frequencyHz: vp.freq, dampingRatio: vp.damp }, this.chassis, b, b.getPosition(), new Vec2(0, 1)));
      return { body: b, joint: j, r: a.r, off: a };
    });
    const mass = this.chassis.getMass() + this.wheels.reduce((s, x) => s + x.body.getMass(), 0);
    this.mass = mass;
    this.torque = (mass * GRAVITY * 0.55 * vp.torque) / this.wheels.length;
    // brake torque scales with wheel radius so a small wheel is not over-braked
    this.inertia = this.chassis.getInertia();
  }

  // ---- train wagons: coupled behind the locomotive with limited-angle hinges; unpowered, they just roll ----
  _makeBodies(vp, motor) {
    const w = this.world, c = vp.chassis;
    const chassis = w.createBody({ type: 'dynamic', position: new Vec2(0, 5), angularDamping: 0.4 });
    chassis.createFixture(new Box(c.hx, (c.y1 - c.y0) / 2, new Vec2(0, (c.y1 + c.y0) / 2), 0), { density: vp.density, friction: 0.3, restitution: 0.05 }).setUserData('chassis');
    const md = { mass: 0, center: new Vec2(0, 0), I: 0 }; chassis.getMassData(md);
    md.center = new Vec2(0, c.y0 + (c.y1 - c.y0) * 0.1); md.I = Math.max(md.I, md.mass * 0.5); chassis.setMassData(md);
    const wheels = vp.axles.map((a) => {
      const b = w.createBody({ type: 'dynamic', position: new Vec2(a.x, 5 + a.y) });
      b.createFixture(new Circle(a.r), { density: vp.density * 0.6, friction: vp.grip, restitution: 0.28 }).setUserData('wheel');
      const j = w.createJoint(new WheelJoint({ motorSpeed: 0, maxMotorTorque: 0, enableMotor: motor, frequencyHz: vp.freq, dampingRatio: vp.damp }, chassis, b, b.getPosition(), new Vec2(0, 1)));
      return { body: b, joint: j, r: a.r, off: a };
    });
    return { chassis, wheels };
  }
  _buildWagons() {
    this.wagons = []; const ids = this.stage.def.wagons || []; if (!ids.length) return;
    let prev = { body: this.chassis, hxFull: (this.spec.length * this.vp.scale) / 2, yA: this.vp.axles[0].y + 0.3, rearAnchor: null };
    prev.rearAnchor = new Vec2(-prev.hxFull, prev.yA);
    let totalMass = this.mass;
    for (const id of ids) {
      const wspec = SPECS.find((v) => v.id === id), wvp = vehiclePhysics(wspec, this.vp.scale), hxFull = (wspec.length * wvp.scale) / 2, yA = wvp.axles[0].y + 0.3;
      const { chassis, wheels } = this._makeBodies({ ...wvp, density: wvp.density * 0.7 }, false);
      const aFront = new Vec2(hxFull + 0.25, yA); // the coupling gap is 0.25 m
      const pp = prev.body.getPosition(), anchorW = new Vec2(pp.x + prev.rearAnchor.x, pp.y + prev.rearAnchor.y);
      chassis.setTransform(new Vec2(anchorW.x - aFront.x, anchorW.y - aFront.y), 0);
      for (const wh of wheels) wh.body.setTransform(new Vec2(chassis.getPosition().x + wh.off.x, chassis.getPosition().y + wh.off.y), 0);
      this.world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -0.6, upperAngle: 0.6 }, prev.body, chassis, anchorW));
      const wag = { chassis, wheels, vp: wvp, aFront, prevAnchor: prev.rearAnchor, prevBody: prev.body, spec: wspec };
      this.wagons.push(wag); totalMass += chassis.getMass() + wheels.reduce((a, x) => a + x.body.getMass(), 0);
      prev = { body: chassis, hxFull, yA, rearAnchor: new Vec2(-hxFull, yA) };
    }
    // the locomotive has to pull everything: scale its drive torque with the whole train's weight
    this.torque = (totalMass * GRAVITY * 0.55 * this.vp.torque * 0.8) / this.wheels.length;
  }
  _placeWagons() { // lay the wagons out in a straight line behind the locomotive (spawn / respawn)
    for (const w of this.wagons) {
      const pb = w.prevBody, pa = pb.getAngle(), pp = pb.getPosition(), anchor = rot(w.prevAnchor, pa), aw = new Vec2(pp.x + anchor.x, pp.y + anchor.y), off = rot(w.aFront, pa);
      w.chassis.setTransform(new Vec2(aw.x - off.x, aw.y - off.y), pa);
      const cp = w.chassis.getPosition();
      for (const wh of w.wheels) { const o = rot(wh.off, pa); wh.body.setTransform(new Vec2(cp.x + o.x, cp.y + o.y), 0); wh.body.setLinearVelocity(new Vec2(0, 0)); wh.body.setAngularVelocity(0); }
      w.chassis.setLinearVelocity(new Vec2(0, 0)); w.chassis.setAngularVelocity(0);
    }
  }

  _spawnPose(cp) {
    const vp = this.vp, gx = (x) => this.stage.groundY(x);
    let y = -1e9;
    for (const a of vp.axles) { const g = gx(cp.x + a.x) ?? cp.y; y = Math.max(y, g + a.r - a.y); }
    const slope = Math.atan2((gx(cp.x + 1.5) ?? cp.y) - (gx(cp.x - 1.5) ?? cp.y), 3);
    return { x: cp.x, y: y + 0.2, a: Math.max(-0.6, Math.min(0.6, slope)) };
  }

  reset(initial = false) {
    const cp = this.stage.checkpoints[Math.min(this.cpIndex, this.stage.checkpoints.length - 1)];
    const p = this._spawnPose(cp), ca = Math.cos(p.a), sa = Math.sin(p.a);
    this.chassis.setTransform(new Vec2(p.x, p.y), p.a); this.chassis.setLinearVelocity(new Vec2(0, 0)); this.chassis.setAngularVelocity(0);
    for (const wh of this.wheels) {
      const o = wh.off; wh.body.setTransform(new Vec2(p.x + o.x * ca - o.y * sa, p.y + o.x * sa + o.y * ca), 0);
      wh.body.setLinearVelocity(new Vec2(0, 0)); wh.body.setAngularVelocity(0);
    }
    if (this.wagons.length) this._placeWagons();
    if (this.loop) { this._setDynamic(); this.loop = null; }
    this.trick = null; this.airT = 0; this.airRot = 0;
    this.damage = 0; // a reset / respawn repairs the vehicle
    this.throttle = 0; this.deadTimer = 0; this.flipTimer = 0; this.stuckTimer = 0; this.hint = false; this.dead = false;
    this.prevV = new Vec2(0, 0); this.maxX = p.x; this.grace = 0.5;
    if (!initial) { this.resets++; this.events.push({ type: 'reset', x: p.x, y: p.y }); }
  }

  get x() { return this.chassis.getPosition().x; }
  get y() { return this.chassis.getPosition().y; }
  get angle() { return this.chassis.getAngle(); }
  get speed() { return this.chassis.getLinearVelocity().x; }

  // ---- automatic mid-air flips: purely visual rotation of the model, planned at take-off so it always finishes before landing ----
  _predictLanding() {
    const p = this.chassis.getPosition(), v = this.chassis.getLinearVelocity(), g = GRAVITY * (1 - FLOAT);
    for (let t = 0.05; t < 4.5; t += 0.05) {
      const x = p.x + v.x * t, y = p.y + v.y * t - 0.5 * g * t * t, gy = this.stage.groundY(x);
      if (gy == null) { if (y < p.y - 6) return null; continue; } // over a pit: no trick
      if (y - 1.0 <= gy) return t;
    }
    return 4.5;
  }
  trickAngle() {
    return 0; // (flips are real physics now: hold GAS in the air to spin)
    const T = this.trick; if (!T) return 0;
    const sm = (k) => k * k * (3 - 2 * k);
    if (T.landed !== undefined) { const k = Math.min(1, (this.time - T.landed) / 0.15), base = T.angleAtLand, tgt = Math.round(base / (2 * Math.PI)) * 2 * Math.PI; if (k >= 1) { this.trick = null; return 0; } return (base + (tgt - base) * sm(k)) % (2 * Math.PI); }
    return T.dir * 2 * Math.PI * T.flips * sm(Math.min(1, (this.time - T.t0) / T.dur));
  }
  _updateAir(dt, grounded) {
    if (grounded > 0) this.groundT += dt; else this.groundT = 0;
    if (grounded === 0) { this.airT += dt; this.airRot += this.chassis.getAngularVelocity() * dt; }
    else if (this.airT > 0) {
      // landing: how much did we spin, and how level are we compared with the ground?
      if (this.airT > this.bestAir) this.bestAir = this.airT;
      if (this.airT > 0.3 && !this.wagons.length) {
        const rotTurns = this.airRot / (2 * Math.PI), n = Math.round(Math.abs(rotTurns)), g = this.stage.groundY;
        const slope = Math.atan2((g(this.x + 1.5) ?? this.y) - (g(this.x - 1.5) ?? this.y), 3);
        let rel = this.angle - slope; rel -= Math.round(rel / (2 * Math.PI)) * 2 * Math.PI;
        if (n >= 1 && Math.abs(rel) < 1.0) { this.flips += n; this.events.push({ type: 'flip', n, total: this.flips, perfect: Math.abs(rel) < 0.3, x: this.x, y: this.y }); }
        else if (Math.abs(this.airRot) > 1.6 && Math.abs(rel) > 1.1) { this.damage = Math.min(1, this.damage + 0.25); this.events.push({ type: 'crash', rel, x: this.x, y: this.y }); }
      }
      if (this.airT > 1.6) this.events.push({ type: 'air', time: this.airT, x: this.x, y: this.y });
      this.airT = 0; this.airRot = 0;
    }
  }

  _collect(pos) { // stars + balloons: grabbed by the vehicle body or either wheel (generous radius, kids are small!)
    const reach = this.vp.chassis.hx * 0.7 + 0.9;
    for (const c of this.collect) {
      if (c.got || c.x < pos.x - 6) continue;
      if (c.x > pos.x + 6) break;
      let near = Math.hypot(c.x - pos.x, c.y - pos.y) < reach;
      for (let i = 0; i < this.wheels.length && !near; i++) { const q = this.wheels[i].body.getPosition(); near = Math.hypot(c.x - q.x, c.y - q.y) < this.wheels[i].r + 1.1; }
      if (near) { c.got = true; this.starsGot++; this.events.push({ type: 'collect', kind: c.type, ci: c.ci, x: c.x, y: c.y }); }
    }
  }

  // ---- scripted vertical loop: the vehicle rides the ring on rails (2D physics cannot cross its own track) ----
  _bodies() { return [this.chassis, ...this.wheels.map((w) => w.body), ...this.wagons.flatMap((g) => [g.chassis, ...g.wheels.map((w) => w.body)])]; }
  _setDynamic() { for (const b of this._bodies()) b.setDynamic(); }
  _startLoop(l, speed) {
    const h = this.vp.axles.reduce((a, q) => a + (q.r - q.y), 0) / this.vp.axles.length; // chassis centre height above the track surface
    this.loop = { l, th: -Math.PI / 2, v: Math.max(11, speed), rc: Math.max(1.4, l.R - h), cx: l.x0, cy: l.y + l.R, spin: 0 };
    for (const b of this._bodies()) { b.setKinematic(); b.setLinearVelocity(new Vec2(0, 0)); b.setAngularVelocity(0); }
    this.events.push({ type: 'loop', x: l.x0, y: l.y + l.R });
  }
  _loopStep(dt) {
    const L = this.loop; L.th += (L.v / L.rc) * dt; L.spin += (L.v * dt);
    if (L.th >= (3 * Math.PI) / 2) return this._endLoop();
    const ang = L.th + Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    this.chassis.setTransform(new Vec2(L.cx + L.rc * Math.cos(L.th), L.cy + L.rc * Math.sin(L.th)), ang);
    const cp = this.chassis.getPosition();
    for (const wh of this.wheels) wh.body.setTransform(new Vec2(cp.x + wh.off.x * ca - wh.off.y * sa, cp.y + wh.off.x * sa + wh.off.y * ca), -L.spin / wh.r);
  }
  _endLoop() {
    const L = this.loop; this.loop = null; this._setDynamic();
    const p = this._spawnPose({ x: L.cx + 2.8, y: L.l.y }), ca = Math.cos(p.a), sa = Math.sin(p.a);
    this.chassis.setTransform(new Vec2(p.x, p.y), p.a);
    for (const wh of this.wheels) wh.body.setTransform(new Vec2(p.x + wh.off.x * ca - wh.off.y * sa, p.y + wh.off.x * sa + wh.off.y * ca), 0);
    for (const b of this._bodies()) { b.setLinearVelocity(new Vec2(L.v, 0)); b.setAngularVelocity(0); }
    this.prevV = new Vec2(L.v, 0); this.grace = 0.4;
  }

  grounded() {
    let n = 0;
    for (const wh of this.wheels) { for (let ce = wh.body.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching() && ce.other !== undefined) { n++; break; } }
    return n;
  }

  step(gas, dt = DT) {
    this.time += dt; this.grace = Math.max(0, this.grace - dt);
    const vp = this.vp, pos = this.chassis.getPosition(), vel = this.chassis.getLinearVelocity(), ang = this.chassis.getAngle();

    // respawn timer after falling in water
    if (this.dead) { this.deadTimer -= dt; if (this.deadTimer <= 0) this.reset(); this.world.step(dt, 8, 3); return; }
    if (this.loop) { this._loopStep(dt); this._collect(this.chassis.getPosition()); this.world.step(dt, 8, 3); return; }

    // throttle ramps up/down so the vehicle does not jerk
    const wantGas = gas && !this.finished;
    this.boostT = Math.max(0, this.boostT - dt);
    this.throttle = Math.max(0, Math.min(1, this.throttle + (wantGas ? 3 : -5) * dt));
    const grounded = this.grounded();
    for (const wh of this.wheels) {
      const target = this.throttle * (vp.top / wh.r) * (this.boostT > 0 ? 1.45 : 1);
      wh.joint.setMotorSpeed(-target);
      wh.joint.setMaxMotorTorque(this.finished ? this.torque * 1.2 : wantGas ? this.torque : this.torque * 0.22);
      if (this.finished) wh.joint.setMotorSpeed(0);
    }

    // AIR CONTROL: after 0.3 s of real air time, HOLD GAS = spin backwards (backflips!). Let go = the spin stops, and the car only levels itself
    // if it is already close to level. Release too late / at the wrong angle = a bad landing. (Short bump-hops keep the old gentle self-levelling.)
    const stunt = grounded === 0 && this.airT > 0.3 && !this.wagons.length && !this.finished;
    if (stunt) {
      const w = this.chassis.getAngularVelocity();
      if (wantGas) { if (w < 7.5) this.chassis.applyTorque(this.inertia * 26); }
      else if (Math.abs(ang) < 1.0) this.chassis.applyTorque(this.inertia * (-9 * ang - 3.5 * w));
      else this.chassis.applyTorque(this.inertia * (-2.8 * w));
    } else {
      // stability assist: level the vehicle on short hops, gently resist flips on the ground
      const kk = grounded ? 3 + 10 * Math.min(1, Math.abs(ang) / 0.8) : 22 * vp.level, cc = grounded ? 2.2 : 5;
      if (Math.abs(ang) < 2.4 || !grounded) this.chassis.applyTorque(this.inertia * (-kk * ang - cc * this.chassis.getAngularVelocity()) * (this.finished ? 1.5 : 1));
    }

    // downforce at speed keeps the wheels on crests (arcade feel)
    if (grounded && Math.abs(vel.x) > 8) this.chassis.applyForceToCenter(new Vec2(0, -this.mass * GRAVITY * 0.25 * Math.min(1, (Math.abs(vel.x) - 8) / 8)));

    // pads
    for (const pad of this.stage.pads) {
      const inPad = this.wheels.some((wh) => { const p = wh.body.getPosition(); return p.x >= pad.x0 && p.x <= pad.x1 && p.y < pad.y + (pad.type === 'shroom' || pad.type === 'catapult' ? 3.8 : 2.5); });
      const was = this.padState.get(pad) || false; this.padState.set(pad, inPad);
      if (!inPad) continue;
      if (pad.type === 'boost' && wantGas) { this.boostT = 1.1; this.chassis.applyForceToCenter(new Vec2(Math.cos(ang) * this.mass * 22, Math.sin(ang) * this.mass * 22)); if (!was) this.events.push({ type: 'boost', x: pos.x, y: pos.y }); }
      else if (pad.type === 'boost' && !was) this.events.push({ type: 'boost', x: pos.x, y: pos.y });
      if (pad.type === 'spring' && !was) { for (const b of this._bodies()) b.setLinearVelocity(new Vec2(b.getLinearVelocity().x * 1.05, Math.max(b.getLinearVelocity().y, 0) + 17)); this.events.push({ type: 'spring', x: pos.x, y: pos.y }); }
      if (pad.type === 'shroom' && !was) { for (const b of this._bodies()) b.setLinearVelocity(new Vec2(b.getLinearVelocity().x * 1.04, Math.max(b.getLinearVelocity().y, 0) + 20)); this.events.push({ type: 'shroom', x: pos.x, y: pos.y }); }
      if (pad.type === 'catapult' && !was) { for (const b of this._bodies()) b.setLinearVelocity(new Vec2(b.getLinearVelocity().x * 1.08, Math.max(b.getLinearVelocity().y, 0) + 12.5)); this.events.push({ type: 'catapult', x: pos.x, y: pos.y }); }
      if (pad.type === 'mud') for (const b of this._bodies()) { const v = b.getLinearVelocity(); b.setLinearVelocity(new Vec2(v.x * 0.985, v.y)); }
    }

    // floaty: reduced gravity while airborne (everything stays in flight longer)
    if (grounded === 0) for (const b of this._bodies()) b.applyForceToCenter(new Vec2(0, b.getMass() * GRAVITY * FLOAT));
    this._updateAir(dt, grounded);
    for (const pr of this.props) if (pr.def.type === 'ferry') { // kinematic platform follows the ferry timetable
      const tx = ferryCenter(pr.def, this.time), cx = pr.body.getPosition().x;
      pr.body.setLinearVelocity(new Vec2((tx - cx) / dt, 0));
    }
    this.world.step(dt, 8, 3);

    // events + state
    const v2 = this.chassis.getLinearVelocity(), dvx = v2.x - this.prevV.x, dvy = v2.y - this.prevV.y, dv = Math.hypot(dvx, dvy);
    if (this.grace <= 0 && dv > 3.5 && this.time - this.lastHit > 0.15 && !(this.rumble > 0.25 && dv < 6)) { // (a rumble-strip rattle is not damage)
      // every knock adds damage in proportion to how hard it was: a soft landing ~3-6 %, a hard crash up to 35 % (cosmetic only)
      const hit = Math.min(0.3, (dv - 3) / 150); this.damage = Math.min(1, this.damage + hit); this.lastHit = this.time;
      this.events.push({ type: 'bump', power: Math.min(1, dv / 22), hit, damage: this.damage, dvx, dvy, x: pos.x, y: pos.y });
    }
    if (!this.wagons.length) for (const l of this.stage.loops) { // (trains are too long for loops) fast enough at the foot of a ring -> ride the loop
      if (pos.x > l.x0 - 0.8 && pos.x < l.x0 + 1.6 && Math.abs(pos.y - (l.y + 1.3)) < 2.4 && v2.x > 7) { this._startLoop(l, v2.x); return; }
    }
    this.prevV = new Vec2(v2.x, v2.y);
    this.maxX = Math.max(this.maxX, pos.x);
    const onRumble = this.stage.rumbles.some((r) => pos.x > r.x0 - 1 && pos.x < r.x1 + 1) && this.grounded() > 0;
    this.rumble += ((onRumble ? Math.min(1, Math.abs(v2.x) / 16) : 0) - this.rumble) * Math.min(1, dt * 8);
    for (const l of this.stage.superLips) if (!this.superDone && pos.x > l.x && this.airT > 0) { this.superDone = true; this.events.push({ type: 'super', x: pos.x, y: pos.y }); }
    this._collect(pos);
    while (this.cpIndex + 1 < this.stage.checkpoints.length && pos.x > this.stage.checkpoints[this.cpIndex + 1].x) { this.cpIndex++; this.events.push({ type: 'checkpoint', x: pos.x, y: pos.y }); }
    if (!this.finished && pos.x >= this.stage.finishX) { this.finished = true; this.finishTime = this.time; this.events.push({ type: 'finish', time: this.time, x: pos.x, y: pos.y }); }

    // water / out of world
    for (const pit of this.stage.pits) if (pos.x > pit.x0 - 1 && pos.x < pit.x1 + 1 && pos.y < pit.y - 1.2) return this._die(pit.y, pos);
    if (pos.y < this.stage.deathY) return this._die(this.stage.deathY, pos);

    // stuck / flipped hint (UI shows a big RESET hint; auto-reset if it lasts)
    const flipped = Math.abs(ang) > 2.0 && Math.hypot(v2.x, v2.y) < 2.5;
    this.flipTimer = flipped ? this.flipTimer + dt : 0;
    const stalled = wantGas && Math.abs(v2.x) < 0.4 && grounded > 0;
    this.stuckTimer = stalled ? this.stuckTimer + dt : 0;
    this.hint = this.flipTimer > 1.0 || this.stuckTimer > 3;
    if (this.flipTimer > 3.2 || this.stuckTimer > 12) this.reset();
  }

  _die(waterY, pos) { this.dead = true; this.deadTimer = 1.1; this.events.push({ type: 'splash', x: pos.x, y: waterY }); }

  snapshot() {
    const p = this.chassis.getPosition();
    return {
      x: p.x, y: p.y, a: this.chassis.getAngle(), dead: this.dead, hint: this.hint,
      wheels: this.wheels.map((w) => { const q = w.body.getPosition(); return { x: q.x, y: q.y, a: w.body.getAngle() }; }),
      wagons: this.wagons.map((g) => { const q = g.chassis.getPosition(); return { x: q.x, y: q.y, a: g.chassis.getAngle(), wheels: g.wheels.map((w) => { const r = w.body.getPosition(); return { x: r.x, y: r.y, a: w.body.getAngle() }; }) }; }),
    };
  }
}
