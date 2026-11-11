import * as G from './ref.mjs';
import { _internals as A } from '../dist/queue-strain.js';

let worst = 0, n = 0;
const cmp = (a, b) => { worst = Math.max(worst, Math.abs(a - b)); n++; };
const geneSets = [{}, { strainRate: 0.15, restRate: 0.2, warmRate: 0.3, warmHold: 20 }, { warmHold: 50 }];
for (const genes of geneSets) for (const up of [0, 3, 10, 13, 16]) {
  const knots = A.barKnots(up, genes);
  for (let m = 0; m <= 430; m += 0.7) {
    cmp(A.barOf(m, knots), G.warmupBar(m, up, genes));
    cmp(A.warmup(m, up, genes), G.warmup(m, up, genes));
  }
  for (const [mins, strained, gap] of [[2, 0.1, 30], [3, 2.8, 0], [1.5, 0.5, 600], [4, 4, 5]]) for (const start of [0, 40, 100, 300, 419]) {
    const before = { at: 0, minutes: start };
    const now = (mins * 60 + gap) * 1000;
    cmp(A.afterPlay(before, mins, strained, now, genes, up).minutes, G.afterPlay(before, mins, strained, now, genes, up).minutes);
    cmp(A.restedFatigue(before, now, genes, up), G.restedFatigue(before, now, genes, up));
    cmp(A.warmupTrend(mins, strained), G.warmupTrend(mins, strained));
  }
}
const now = Date.now();
const played = [{ at: now - 5 * 86400000, share: 1 }, { at: now - 3 * 86400000, share: 0.4 }, { at: now - 3600000, share: 1 }];
cmp(A.recall(played, [now - 2 * 86400000], now), G.recall(played, [now - 2 * 86400000], now));
console.log(`${n} comparisons, largest difference ${worst.toExponential(2)}`);
// stamina picked twice + consistency beside it = strength 2.5; longSets 5 tiers, stayWarm 2 tiers
console.log(A.fatigueGenesOf(JSON.stringify({ picks: [{ skill: 'stamina' }, { skill: 'stamina' }, { skill: 'consistency' }], genes: { longSets: 5, stayWarm: 2, xpStamina: 3 } })));
console.log(JSON.stringify(A.expand([{ repeat: 2, played: 1 }, { repeat: 1, played: 0 }, { repeat: 3, played: 0 }], true)), JSON.stringify(A.expand([{ repeat: 2, played: 1 }, { repeat: 1 }, { repeat: 3 }], false)));
let w2 = 0;
for (let m = 0; m <= 430; m += 0.5) w2 = Math.max(w2, Math.abs(A.fatigueXp(A.fatigueLevel(m)) - G.fatigueXp(G.fatigueLevel(m))));
console.log('fatigue XP share: largest difference', w2, '| at 300/360/420 min:', [300, 360, 420].map(m => A.fatigueXp(A.fatigueLevel(m)).toFixed(3)).join(' / '));
let w3 = 0;
for (let l = 0; l <= 140; l++) w3 = Math.max(w3, Math.abs(A.xpForLevel(l) - G.xpForLevel(l)) / G.xpForLevel(l));
for (const [l, x, g] of [[100, 5e6, 3e7], [101, 1e6, 9e8], [50, 10, 1e6]]) { const a = A.gainLevels(l, x, g), b = G.gainLevels(l, x, g); w3 = Math.max(w3, Math.abs(a.level - b.level), Math.abs(a.xp - b.xp) / (b.xp + 1)); }
console.log('XP curve: largest relative difference', w3, '| level 101 costs', Math.round(A.xpForLevel(101)).toLocaleString());
// mindblock against the official sim's curve (cubic_bezier(.6,0,.6,1), 25 plays, floor 0.25), via ref.mjs's bezier
const blockRef = (n) => { const B = G.cubicBezier(.6, 0, .6, 1); return 1 + (0.25 - 1) * B(Math.min(1, n / 25)); };
let w4 = 0; for (let n = 0; n <= 60; n++) w4 = Math.max(w4, Math.abs(A.mindblockFactor(n) - blockRef(n)));
console.log('mindblock: largest difference', w4, '| at 5/10/15/25:', [5, 10, 15, 25].map(n => A.mindblockFactor(n).toFixed(2)).join(' / '), '| skills cut:', [...A.MINDBLOCK].join(','));
console.log('medals known:', Object.keys(A.MEDAL_TIER).length);
const T0 = 1e12, H = 3600e3;
console.log('recent count (3 in window, 1 too old, 1 after):', A.recentPlaysOf([{ at: T0 - 30 * H, id: 5 }, { at: T0 - 3 * H, id: 5 }, { at: T0 - 2 * H, id: 6 }, { at: T0 - 2 * H, id: 5 }, { at: T0 - H, id: 5 }, { at: T0 + H, id: 5 }], 5, T0));
