// Usage: node capture.mjs <scenario> [fps=30] [--vehicle=vehicle-truck-red] [--music=file.mp3] [--theme=day|sunset] [--outcome=fail|success|both] [--no-audio] [--no-music] [--out=path.mp4]
// Renders the scenario frame-by-frame (deterministic) and pipes PNGs into ffmpeg.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { renderAudio, writeWav } from './audio.mjs';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [scenario = 'carJump', fpsArg = '30'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { vehicle = '', music, theme = 'day', outcome = '' } = flags;
const fps = Number(fpsArg);
fs.mkdirSync('out', { recursive: true });
const outFile = flags.out || `out/${scenario}${outcome ? '-' + outcome : ''}${theme !== 'day' ? '-' + theme : ''}${vehicle ? '-' + vehicle.replace(/^vehicle-/, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60) : ''}.mp4`;

const server = await createServer({ logLevel: 'error', server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:5199/?scenario=${scenario}&vehicle=${vehicle}&theme=${theme}&outcome=${outcome}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
const duration = await page.evaluate(() => window.__duration);
const frames = Math.round(duration * fps);

// Audio: procedural sfx (+ generated tune) from the scenario's cues; --music=file replaces the generated tune.
const wav = outFile.replace(/\.mp4$/, '.wav');
const cueMod = fs.existsSync(`src/scenarios/${scenario}.cues.js`) ? await import(`./src/scenarios/${scenario}.cues.js`) : null;
const useAudio = cueMod && flags['no-audio'] === undefined;
if (useAudio) writeWav(wav, renderAudio({ cues: cueMod.cues(outcome || 'both'), duration, withMusic: !music && flags['no-music'] === undefined }));

const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
if (useAudio) args.push('-i', wav);
if (music) args.push('-stream_loop', '-1', '-i', music);
if (useAudio && music) args.push('-filter_complex', `[2:a]volume=0.35[m];[1:a][m]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${duration - 0.7}:d=0.7[a]`, '-map', '0:v', '-map', '[a]');
else if (useAudio) args.push('-map', '0:v', '-map', '1:a');
else if (music) args.push('-map', '0:v', '-map', '1:a', '-af', `afade=t=out:st=${duration - 1}:d=1`);
if (useAudio || music) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outFile);
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.renderFrame(t), i / fps);
  const png = await page.locator('canvas').screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % fps === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close(); await server.close();
console.log('wrote', outFile);
