import { GameView } from './view.js';
import { GameAudio } from './audio.js';
import { Sim, DT } from './sim.js';
import { buildStage } from './terrain.js';
import { vehiclePhysics } from './vehicleClass.js';
import STAGES from './stages.json';
import SPECS from './vehicleSpecs.json';

const $ = (id) => document.getElementById(id);
const specById = Object.fromEntries(SPECS.map((s) => [s.id, s]));
const SAVE = 'vroom-stages-v2'; // bumped when stage content changed
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } })();
save.stars ||= {}; save.best ||= {};
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch {} };

const view = new GameView($('game')), audio = new GameAudio();
let sim = null, stage = null, k = 1, state = 'loading', now = 0, gasKeys = 0, gasPtr = false, countdown = 0, finishAt = 0, hintShown = false, loadToken = 0;
const params = new URLSearchParams(location.search), autoGas = params.has('autogas');

// ---------- input: ONE gas button + ONE reset button ----------
const gasHeld = () => autoGas || gasKeys > 0 || gasPtr;
const GAS_KEYS = new Set(['Space', 'ArrowUp', 'ArrowRight', 'KeyD', 'KeyW']), held = new Set();
addEventListener('keydown', (e) => {
  audio.start();
  if (e.code === 'Escape') { toggleMenu(); e.preventDefault(); return; }
  if ($('menu').classList.contains('open')) return;
  if (GAS_KEYS.has(e.code)) { e.preventDefault(); if (!held.has(e.code)) { held.add(e.code); gasKeys++; onGasPress(); } }
  if ((e.code === 'KeyR' || e.code === 'Backspace') && !e.repeat) { e.preventDefault(); doReset(); }
});
addEventListener('keyup', (e) => { if (held.delete(e.code)) gasKeys = Math.max(0, gasKeys - 1); });
addEventListener('blur', () => { held.clear(); gasKeys = 0; gasPtr = false; $('gas').classList.remove('down'); });
const gasBtn = $('gas'), resetBtn = $('reset');
gasBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); gasBtn.setPointerCapture(e.pointerId); gasPtr = true; gasBtn.classList.add('down'); onGasPress(); });
const gasUp = () => { gasPtr = false; gasBtn.classList.remove('down'); };
gasBtn.addEventListener('pointerup', gasUp); gasBtn.addEventListener('pointercancel', gasUp); gasBtn.addEventListener('lostpointercapture', gasUp);
resetBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); resetBtn.classList.add('down'); doReset(); });
resetBtn.addEventListener('pointerup', () => resetBtn.classList.remove('down')); resetBtn.addEventListener('pointercancel', () => resetBtn.classList.remove('down'));
addEventListener('contextmenu', (e) => e.preventDefault());

function onGasPress() {
  if (state === 'ready') { state = 'playing'; sim.time = 0; setMsg(''); }
  else if (state === 'finished' && now - finishAt > 1.4) nextStage();
}
function doReset() {
  if (state === 'finished') { startStage(k); return; }
  if (!sim || state === 'loading') return;
  if (state === 'ready') { startStage(k); return; }
  sim.reset(); audio.play({ type: 'reset' });
}

// ---------- UI ----------
const setMsg = (html) => { $('msg').innerHTML = html; };
const fmt = (t) => (t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : `${t.toFixed(1)}s`);
function starsFor(t, par) { return t <= par ? 3 : t <= par * 1.7 ? 2 : 1; }
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function buildMenu() {
  const g = $('grid'); g.innerHTML = '';
  STAGES.forEach((s) => {
    const b = document.createElement('button'), st = save.stars[s.k] || 0;
    b.className = (s.k === k ? 'cur ' : '') + (st ? 'done' : '');
    b.innerHTML = `${s.k}<span class="st">${st ? starStr(st) : ''}</span><small>${specById[s.vehicle].name}</small>`;
    b.onclick = () => { toggleMenu(false); startStage(s.k); };
    g.appendChild(b);
  });
}
function toggleMenu(force) {
  const m = $('menu'), open = force ?? !m.classList.contains('open');
  m.classList.toggle('open', open); if (open) buildMenu();
}
$('menuBtn').onclick = () => { audio.start(); toggleMenu(); };
$('menuClose').onclick = () => toggleMenu(false);
$('restartBtn').onclick = () => { toggleMenu(false); startStage(k); };
$('muteBtn').onclick = () => { audio.start(); audio.setMuted(!audio.muted); $('muteBtn').textContent = audio.muted ? '🔇' : '🔊'; };
$('musicBtn').onclick = () => { audio.start(); audio.setMusic(!audio.musicOn); $('musicBtn').textContent = `🎵 Music: ${audio.musicOn ? 'on' : 'off'}`; };
$('resetProgress').onclick = () => { if (confirm('Clear all stars and best times?')) { save.stars = {}; save.best = {}; persist(); buildMenu(); } };

// ---------- stages ----------
async function startStage(n) {
  k = Math.max(1, Math.min(STAGES.length, n)); const token = ++loadToken;
  state = 'loading'; $('loading').style.display = 'flex'; $('loading').textContent = `Stage ${k}…`; setMsg('');
  const def = STAGES[k - 1], spec = specById[def.vehicle], vp = vehiclePhysics(spec);
  stage = buildStage(def); sim = new Sim(stage, spec);
  try { await view.loadStage(stage, spec, vp); } catch (e) { console.error(e); $('loading').textContent = 'Could not load: ' + e.message; return; }
  if (token !== loadToken) return;
  for (let i = 0; i < 30; i++) sim.step(false); // let the suspension settle
  sim.events.length = 0; sim.time = 0;
  location.hash = String(k); try { localStorage.setItem(SAVE + '-last', String(k)); } catch {}
  $('stageNum').textContent = `Stage ${k}`; $('vehName').textContent = spec.name; hintShown = false;
  $('timeBest').textContent = save.best[k] ? `Best ${fmt(save.best[k])}` : `Par ${fmt(def.par)}`;
  $('loading').style.display = 'none'; state = 'ready';
  setMsg(`${spec.name}<small>Hold <b>GAS</b> to go! · ${def.length} m<br>☰ Stages (top right) = pick any stage</small>`);
  view.cam.x = stage.start.x + 4;
}
function nextStage() { startStage(k >= STAGES.length ? 1 : k + 1); }

function onFinish(e) {
  state = 'finished'; finishAt = now; const def = STAGES[k - 1], t = e.time, st = starsFor(t, def.par);
  if (!save.best[k] || t < save.best[k]) save.best[k] = +t.toFixed(2);
  if (st > (save.stars[k] || 0)) save.stars[k] = st; persist();
  countdown = 7; renderFinish(t, st);
}
function renderFinish(t, st) {
  const last = k >= STAGES.length;
  setMsg(`${last ? '🏆 ALL 100 STAGES! 🏆' : 'STAGE COMPLETE!'}<span class="stars">${starStr(st)}</span>${fmt(t)}<small>${last ? 'Press GAS to start again' : `Press GAS for next stage · auto in ${Math.ceil(countdown)}`} · RESET to replay</small>`);
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
function frame(tms) {
  const dt = Math.min(0.1, (tms - last) / 1000); last = tms; now += dt;
  if (sim && state !== 'loading') {
    if (state === 'ready' && gasHeld()) onGasPress(); // holding GAS through a stage change just starts driving
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 6) {
      sim.step(state === 'playing' || state === 'finished' ? gasHeld() : false);
      acc -= DT; steps++;
      for (const e of sim.events) {
        audio.play(e); view.event(e, now);
        if (e.type === 'bump' && e.power > 0.5) view.shakeCamera(0.25 * e.power);
        if (e.type === 'finish') onFinish(e);
      }
      sim.events.length = 0;
    }
    if (acc > DT * 6) acc = 0;
    view.update(sim, now, dt);
    audio.engine(sim.throttle, sim.speed, !sim.dead);

    const def = STAGES[k - 1], prog = Math.max(0, Math.min(1, sim.x / stage.finishX));
    $('progFill').style.width = `${prog * 100}%`; $('progCar').style.left = `${prog * 100}%`;
    if (state === 'playing') $('timeNow').textContent = fmt(sim.time);
    if (state === 'finished') { countdown -= dt; $('timeNow').textContent = fmt(sim.finishTime); if (countdown <= 0) nextStage(); else renderFinish(sim.finishTime, starsFor(sim.finishTime, def.par)); }
    if (state === 'ready') $('timeNow').textContent = '0.0s';
    const hint = sim.hint && state === 'playing';
    resetBtn.classList.toggle('pulse', hint);
    if (hint && !hintShown) { audio.play({ type: 'hint' }); setMsg('Stuck?<small>Press <b>RESET ↺</b></small>'); hintShown = true; }
    if (!hint && hintShown && state === 'playing') { setMsg(''); hintShown = false; }
    if (sim.dead && state === 'playing') setMsg('💦 Splash!'); else if (state === 'playing' && !hintShown && $('msg').textContent === '💦 Splash!') setMsg('');
  }
  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test / recording helpers
window.__game = { get sim() { return sim; }, view, startStage, get state() { return state; }, STAGES };

const fromHash = parseInt((location.hash || '').replace(/\D/g, ''), 10);
let lastSaved = 1; try { lastSaved = parseInt(localStorage.getItem(SAVE + '-last') || '1', 10) || 1; } catch {}
startStage(fromHash || lastSaved || 1);
