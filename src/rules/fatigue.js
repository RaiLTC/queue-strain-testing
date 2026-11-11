// The game's fatigue and warm-up rules, ported from oss!idle 1.4.3.0.

import { TEXT } from '../config.js';

// =====================================================================
// 1. THE GAME'S FATIGUE RULES (fatigue.ts, cubic_bezier.ts, lerp.ts)
// =====================================================================
export const lerp = (start, end, t) => start + (end - start) * t;

export const cubicBezier = (x0, y0, x1, y1) => {
  const ax = 1.0 - (x1 = 3.0 * (x1 - x0) - (x0 *= 3.0)) - x0;
  const ay = 1.0 - (y1 = 3.0 * (y1 - y0) - (y0 *= 3.0)) - y0;
  return (t) => {
    let i, r, s, d, x;
    if (t < 0) return 0;
    if (t > 1) return 1;
    for (r = t, i = 0; i < 32; i++) {
      if (Math.abs((x = r * (r * (r * ax + x1) + x0) - t)) < 1e-5) return r * (r * (r * ay + y1) + y0);
      if (Math.abs((d = r * (r * ax * 3.0 + x1 * 2.0) + x0)) < 1e-5) break;
      r -= x / d;
    }
    if ((s = 0.0) > (r = t)) return 0;
    if ((d = 1.0) < r) return 1;
    for (i = 0; d > s && i < 64; i++) {
      if (Math.abs((x = r * (r * (r * ax + x1) + x0)) - t) < 1e-5) break;
      if (t > x) s = r; else d = r;
      r = 0.5 * (d - s) + s;
    }
    return r * (r * (r * ay + y1) + y0);
  };
};

export const LIGHT_SHARE = 0.2;
export const STRAIN_RATE = 3;
export const STRAIN_CAP = 7 * 60;
export const ONSET_MINUTES = 5 * 60;
export const FULL_MINUTES = 7 * 60;
export const FATIGUE_CB = cubicBezier(0.4, 0, 0.6, 1);
export const WARM_MINUTES = 90;
export const WARM_EARLY = 30;
export const GEAR_LADDER = 10;
export const GEAR_SPEED = 0.1;
export const GEAR_HOLD = 3;
export const GEAR_DECAY = 0.7;
export const HALF_WARM_MINUTES = 5 * 60;
export const COLD_MINUTES = 6 * 60;
export const SWEET_SPOT = 0.9;
/** Where the warm-up bar's sweet spot, past-peak and fatigued zones start. The last is ONSET_MINUTES
 *  (300 min of strain) on every bar: from there the physical skills' XP gains are cut. */
export const BAR_ZONES = [0.4, 0.6, 0.8];
export const XP_CUT = BAR_ZONES[2];
/** play.ts: every play starts with this lead-in. */
export const LEAD_IN_MS = 2000;

export const ease = (minutes, from, to) => (to > from ? FATIGUE_CB((minutes - from) / (to - from)) : Number(minutes >= to));

export const warmGear = (upgrades) => {
  const tiers = Math.max(0, upgrades - GEAR_LADDER);
  return Math.min(upgrades, GEAR_LADDER) + (1 - GEAR_DECAY ** tiers) / (1 - GEAR_DECAY);
};

export const warmupCurve = (upgrades = 0, genes = {}) => {
  const gear = warmGear(upgrades);
  const hold = gear * GEAR_HOLD + (genes.warmHold ?? 0);
  const cold = Math.min(COLD_MINUTES + hold, STRAIN_CAP);
  const half = Math.min(HALF_WARM_MINUTES + hold, cold);
  const peakEnd = Math.min(WARM_MINUTES + hold, half);
  const warm = Math.min((WARM_MINUTES / (1 + gear * GEAR_SPEED) - WARM_EARLY) / (1 + (genes.warmRate ?? 0)), peakEnd);
  return { warm, peakEnd, half, cold };
};

export const restedFatigue = (fatigue, now, genes = {}, upgrades = 0) => {
  const minutes = fatigue?.minutes ?? 0;
  const rested = Math.max(0, now - (fatigue?.at ?? now)) / 60000;
  const fast = 1 + (genes.restRate ?? 0);
  const above = Math.max(0, minutes - warmupCurve(upgrades, genes).peakEnd);
  if (rested * fast <= above) return minutes - rested * fast;
  return Math.max(0, minutes - above - (rested - above / fast));
};

export const warmup = (minutes, upgrades = 0, genes = {}) => {
  const { warm, peakEnd, half, cold } = warmupCurve(upgrades, genes);
  if (minutes < warm) return ease(minutes, 0, warm);
  if (minutes < half) return lerp(1, 0.5, ease(minutes, peakEnd, half));
  return lerp(0.5, 0, ease(minutes, half, cold));
};

export const crossing = (turned, lo, hi) => {
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (turned(mid)) hi = mid; else lo = mid;
  }
  return hi;
};

/** The strained minutes where the warm-up bar's knots sit: start, sweet spot, its end, fatigue onset, cap. */
export const barKnots = (upgrades = 0, genes = {}) => {
  const { warm, peakEnd, cold } = warmupCurve(upgrades, genes);
  const onset = Math.min(ONSET_MINUTES, FULL_MINUTES, STRAIN_CAP);
  const sweetEnd = crossing(m => warmup(m, upgrades, genes) < SWEET_SPOT, peakEnd, cold);
  return [0, crossing(m => warmup(m, upgrades, genes) >= SWEET_SPOT, 0, warm), Math.min(sweetEnd, onset), onset, STRAIN_CAP];
};

export const barOf = (minutes, knots) => {
  const at = [0, ...BAR_ZONES, 1];
  let i = 1;
  while (i < knots.length - 1 && minutes > knots[i]) i++;
  const span = knots[i] - knots[i - 1];
  const t = span > 0 ? (minutes - knots[i - 1]) / span : 1;
  return lerp(at[i - 1], at[i], Math.min(1, Math.max(0, t)));
};

export const playedStrain = (minutes, strained, genes = {}) => {
  const rate = STRAIN_RATE * (1 - (genes.strainRate ?? 0));
  return minutes > 0 ? minutes * lerp(-1, rate, ease(strained / minutes, LIGHT_SHARE, 1)) : 0;
};

/** -3..3: which way and how hard a play moves the bar (the game's arrows). */
export const warmupTrend = (minutes, strained) => {
  if (minutes <= 0) return 0;
  const drift = playedStrain(minutes, strained) / minutes;
  return drift >= 0 ? Math.ceil(Math.min(1, drift / STRAIN_RATE) * 3) : -Math.ceil(Math.min(1, -drift) * 3);
};

export const afterPlay = (before, minutes, strained, now, genes = {}, upgrades = 0) => {
  const rested = restedFatigue(before, now - minutes * 60000, genes, upgrades);
  const next = rested + playedStrain(minutes, strained, genes);
  return { at: now, minutes: Math.min(STRAIN_CAP, Math.max(0, next)) };
};

/** Each zone's name and what to do there (the game's own hints, without repeating the name). */
// exhausted, the physical skills earn XP_FLOOR of their gains: fatigueLevel then fatigueXp
export const XP_FLOOR = 0.05;
export const fatigueLevel = (minutes) => {
  const full = Math.min(FULL_MINUTES, STRAIN_CAP);
  return ease(minutes, Math.min(ONSET_MINUTES, full), full);
};
export const fatigueXp = (level) => lerp(1, XP_FLOOR, level);
/** The skills whose XP the fatigue cut takes (rulesets/mania/4k/skills.ts PHYSICAL_SKILLS). */
export const PHYSICAL = ['speed', 'stamina', 'jackspeed', 'coordination'];

export const STAGES = TEXT.stages;
export const stageOf = (bar) => {
  const [peak, pushing, fatigued] = BAR_ZONES;
  if (bar < peak) return bar < peak / 2 ? 'cold' : 'warming';
  if (bar < pushing) return 'peak';
  return bar < fatigued ? 'pushing' : 'fatigued';
};

// The XP each level costs (xp.ts): past 100 every level costs more, x1.25 again every ten levels
export const progressionCurve = cubicBezier(0.1, 0.4, 0.95, 0);
export const lateProgressionCurve = cubicBezier(0.5, 0, 1, 0.4);
export const LATE_LEVEL_XP = 10000000;
export const lateLevelXp = (level) => {
  if (level < 100) return 0;
  const steps = level - 99;
  return steps * (steps + 1) / 2 * LATE_LEVEL_XP * 1.25 ** Math.floor((level - 100) / 10);
};
export const xpForLevel = (level) => 100 + progressionCurve(level / 100) * 9900 + lateProgressionCurve((level - 60) / 40) * 90000 + lateLevelXp(level);
/** `gained` XP on top of `xp` into `level`: the level it lands in and the XP into it. */
export const gainLevels = (level, xp, gained) => {
  xp += gained;
  while (xp > xpForLevel(level)) { xp -= xpForLevel(level); level++; }
  return { level, xp };
};
/** A level and the share of the next one, as one number: 101.47. */
export const levelOf = (level, xp) => level + Math.min(0.9999, Math.max(0, xp / xpForLevel(level)));
