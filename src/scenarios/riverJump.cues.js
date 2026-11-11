// Flooded road: fail = falls short and splashes in, success = flies across the water.
export const FAIL_LEN = 7, WIN_LEN = 9, TI = 4.35; // TI = moment of water impact in the fail attempt

export function cues(outcome = 'both') {
  const c = [];
  const fail = (o) => {
    c.push({ type: 'engine', t0: o + 0.2, t1: o + 3.0, f0: 55, f1: 165, g: 0.5 });
    c.push({ type: 'engine', t0: o + 3.0, t1: o + TI, f0: 165, f1: 210, g: 0.55 });
    c.push({ type: 'whoosh', t0: o + 3.65, t1: o + TI, g: 0.3 });
    c.push({ type: 'splash', t0: o + TI, g: 1 });
    c.push({ type: 'bloop', t0: o + TI + 0.9, g: 0.5 });
    c.push({ type: 'trombone', t0: o + 5.0, g: 0.55 });
    c.push({ type: 'duck', t0: o + TI - 0.1, t1: o + 6.8, g: 0.15 });
  };
  const win = (o) => {
    c.push({ type: 'engine', t0: o + 0.2, t1: o + 3.2, f0: 55, f1: 175, g: 0.5 });
    c.push({ type: 'engine', t0: o + 3.2, t1: o + 4.0, f0: 175, f1: 235, g: 0.55 });
    c.push({ type: 'whoosh', t0: o + 3.9, t1: o + 6.4, g: 0.4 });
    c.push({ type: 'thud', t0: o + 6.4, g: 0.9 });
    c.push({ type: 'engine', t0: o + 6.4, t1: o + 7.6, f0: 140, f1: 65, g: 0.4 });
    c.push({ type: 'pop', t0: o + 6.7, g: 0.7 });
    c.push({ type: 'fanfare', t0: o + 6.7, g: 0.6 });
    c.push({ type: 'cheer', t0: o + 6.8, t1: o + 9.0, g: 0.7 });
    c.push({ type: 'horn', t0: o + 7.7, g: 0.5 });
    c.push({ type: 'duck', t0: o + 6.3, t1: o + 8.6, g: 0.4 });
  };
  if (outcome === 'fail') fail(0);
  else if (outcome === 'success') win(0);
  else { fail(0); win(FAIL_LEN); }
  return c;
}
