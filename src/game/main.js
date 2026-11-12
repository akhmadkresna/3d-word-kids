import { GameView } from './view.js';
import { GameAudio } from './audio.js';
import { Sim, DT } from './sim.js';
import { buildStage } from './terrain.js';
import { vehiclePhysics } from './vehicleClass.js';
import STAGES from './stages.json';
import SPECS from './vehicleSpecs.json';
import { Recorder } from './recorder.js';

const $ = (id) => document.getElementById(id);
const specById = Object.fromEntries(SPECS.map((s) => [s.id, s]));
const SAVE = 'vroom-stages-v2'; // bumped when stage content changed
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } })();
save.stars ||= {}; save.best ||= {}; save.order ||= 'seq';
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch {} };

const view = new GameView($('game')), audio = new GameAudio();
let recMode = false, recorder = null, curDef = null, normalK = 1;
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
  if (state === 'finished') { restartStage(); return; }
  if (!sim || state === 'loading') return;
  if (state === 'ready') { restartStage(); return; }
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
$('restartBtn').onclick = () => { toggleMenu(false); restartStage(); };
$('recBtn').onclick = () => { audio.start(); toggleMenu(false); if (recMode) exitRec(); else enterRec(); };
$('recDiffBtn').onclick = () => { const order = ['mixed', 'easy', 'hard']; const cur = recorder ? recorder.diff : (params.get('diff') || 'mixed'); const nx = order[(order.indexOf(cur) + 1) % 3]; if (recorder) recorder.setDifficulty(nx); else params.set('diff', nx); updateRecButtons(); };
$('recExit').onclick = () => { if (recMode) exitRec(); };
$('randomBtn').onclick = () => { toggleMenu(false); randomStage(); };
$('randBtn').onclick = () => { audio.start(); randomStage(); };
const showOrder = () => { $('orderBtn').textContent = save.order === 'random' ? '🔀 After a stage: random' : '➡ After a stage: in order'; };
$('orderBtn').onclick = () => { save.order = save.order === 'random' ? 'seq' : 'random'; persist(); showOrder(); };
showOrder();
$('muteBtn').onclick = () => { audio.start(); audio.setMuted(!audio.muted); $('muteBtn').textContent = audio.muted ? '🔇' : '🔊'; };
$('musicBtn').onclick = () => { audio.start(); audio.setMusic(!audio.musicOn); $('musicBtn').textContent = `🎵 Music: ${audio.musicOn ? 'on' : 'off'}`; };
$('resetProgress').onclick = () => { if (confirm('Clear all stars and best times?')) { save.stars = {}; save.best = {}; persist(); buildMenu(); } };

// ---------- stages ----------
async function startDef(def) {
  curDef = def; k = def.k; const token = ++loadToken, spec = specById[def.vehicle], vp = vehiclePhysics(spec);
  state = 'loading'; $('loading').style.display = 'flex'; $('loading').textContent = recMode ? `🎬 ${spec.name}…` : `Stage ${k}…`; setMsg('');
  stage = buildStage(def); sim = new Sim(stage, spec);
  try { await view.loadStage(stage, spec, vp); } catch (e) { console.error(e); $('loading').textContent = 'Could not load: ' + e.message; return; }
  if (token !== loadToken) return;
  for (let i = 0; i < 30; i++) sim.step(false); // let the suspension settle
  sim.events.length = 0; sim.time = 0;
  if (!recMode) { normalK = k; location.hash = String(k); try { localStorage.setItem(SAVE + '-last', String(k)); } catch {} }
  $('stageNum').textContent = recMode ? `🎬 Mix · level ${k}` : `Stage ${k}`; $('vehName').textContent = spec.name; hintShown = false;
  $('timeBest').textContent = !recMode && save.best[k] ? `Best ${fmt(save.best[k])}` : `Par ${fmt(def.par)}`;
  $('loading').style.display = 'none'; state = 'ready';
  setMsg(`${spec.name}<small>Hold <b>GAS</b> to go! · ${def.length} m${recMode ? '' : '<br>☰ Stages (top right) = pick any stage'}</small>`);
  view.cam.x = stage.start.x + 4;
}
const startStage = (n) => { recMode = false; document.body.classList.remove('rec'); return startDef(STAGES[Math.max(1, Math.min(STAGES.length, n)) - 1]); };
function restartStage() { return startDef(curDef); }

// recording mode: endless random stages + random vehicles (generated and bot-checked in a worker, one ahead)
async function startRecStage() {
  state = 'loading'; $('loading').style.display = 'flex'; $('loading').textContent = '🎬 Mixing the next stage…';
  try { startDef(await recorder.take()); } catch (e) { console.error(e); $('loading').textContent = 'Recording mode failed: ' + e.message; }
}
function enterRec(diff) {
  recMode = true; document.body.classList.add('rec');
  if (!recorder) recorder = new Recorder(diff || 'mixed'); else if (diff) recorder.setDifficulty(diff);
  updateRecButtons(); startRecStage();
}
function exitRec() { recMode = false; document.body.classList.remove('rec'); updateRecButtons(); startStage(normalK || 1); }
function updateRecButtons() {
  $('recBtn').textContent = recMode ? '🎬 Recording mode: ON (tap to stop)' : '🎬 Recording mode: random stages + cars';
  $('recDiffBtn').textContent = `Difficulty: ${recorder ? recorder.diff : (params.get('diff') || 'mixed')}`;
}

function randomStage() { let n; do { n = 1 + Math.floor(Math.random() * STAGES.length); } while (n === k && STAGES.length > 1); startStage(n); }
function nextStage() { if (recMode) startRecStage(); else if (save.order === 'random') randomStage(); else startStage(k >= STAGES.length ? 1 : k + 1); }

function onFinish(e) {
  state = 'finished'; finishAt = now; const def = curDef, t = e.time, st = starsFor(t, def.par);
  if (!recMode) {
    if (!save.best[k] || t < save.best[k]) save.best[k] = +t.toFixed(2);
    if (st > (save.stars[k] || 0)) save.stars[k] = st; persist();
  }
  countdown = recMode ? 5 : 7; renderFinish(t, st);
}
function renderFinish(t, st) {
  if (recMode) {
    const nx = recorder && recorder.nextDef ? specById[recorder.nextDef.vehicle].name : '…';
    setMsg(`STAGE COMPLETE!<span class="stars">${starStr(st)}</span>${fmt(t)}<small>Next: ${nx} · auto in ${Math.ceil(countdown)} · or press GAS</small>`); return;
  }
  const last = k >= STAGES.length && save.order !== 'random';
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

    const def = curDef, prog = Math.max(0, Math.min(1, sim.x / stage.finishX));
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
window.__game = { get sim() { return sim; }, view, startStage, enterRec, get recorder() { return recorder; }, get state() { return state; }, STAGES };

const fromHash = parseInt((location.hash || '').replace(/\D/g, ''), 10);
let lastSaved = 1; try { lastSaved = parseInt(localStorage.getItem(SAVE + '-last') || '1', 10) || 1; } catch {}
normalK = fromHash || lastSaved || 1;
if (params.has('rec')) enterRec(params.get('diff') || 'mixed'); else { updateRecButtons(); startStage(normalK); }
