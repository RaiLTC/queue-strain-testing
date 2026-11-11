// The game's fatigue.ts, cubic_bezier.ts, lerp.ts and memoryRecall.ts (oss!idle 1.4.3.0), as read,
// kept in the game's own structure (warmupBar in one piece) to check the add-on's port against.
export const cubicBezier = (...a) => cubic_bezier(...a);
const cubic_bezier = (x0, y0, x1, y1) => {
	const ax = 1.0 - (x1 = 3.0 * (x1 - x0) - (x0 *= 3.0)) - x0;
	const ay = 1.0 - (y1 = 3.0 * (y1 - y0) - (y0 *= 3.0)) - y0;
	let i = 0, r = 0.0, s = 0.0, d = 0.0, x = 0.0;
	return (t) => {
		if (t < 0) return 0;
		if (t > 1) return 1;
		for (r = t, i = 0; 32 > i; i++) {
			if (1e-5 > Math.abs((x = r * (r * (r * ax + x1) + x0) - t))) {
				return r * (r * (r * ay + y1) + y0);
			} else if (1e-5 > Math.abs((d = r * (r * ax * 3.0 + x1 * 2.0) + x0))) {
				break;
			} else {
				r -= x / d;
			}
		}
		if ((s = 0.0) > (r = t)) return 0;
		else if ((d = 1.0) < r) return 1;
		for (i = 0; d > s && i < 64; i++) {
			if (1e-5 > Math.abs((x = r * (r * (r * ax + x1) + x0)) - t)) break;
			if (t > x) s = r;
			else d = r;
			r = 0.5 * (d - s) + s;
		}
		return r * (r * (r * ay + y1) + y0);
	};
};
const lerp = (start, end, t) => start + (end - start) * t;

const LIGHT_SHARE = 0.2;
const STRAIN_RATE = 3;
const STRAIN_CAP = 7 * 60;
const ONSET_MINUTES = 5 * 60;
const FULL_MINUTES = 7 * 60;
const FATIGUE_CB = cubic_bezier(.4, 0, .6, 1);
const WARM_MINUTES = 90;
const WARM_EARLY = 30;
const GEAR_LADDER = 10;
const GEAR_SPEED = 0.1;
const GEAR_HOLD = 3;
const GEAR_DECAY = 0.7;
const HALF_WARM_MINUTES = 5 * 60;
const COLD_MINUTES = 6 * 60;

export const restedFatigue = (fatigue, now, genes = {}, upgrades = 0) => {
	const minutes = fatigue?.minutes ?? 0;
	const rested = Math.max(0, now - (fatigue?.at ?? now)) / 60_000;
	const fast = 1 + (genes.restRate ?? 0);
	const above = Math.max(0, minutes - warmupCurve(upgrades, genes).peakEnd);
	if (rested * fast <= above) return minutes - rested * fast;
	return Math.max(0, minutes - above - (rested - above / fast));
};
const ease = (minutes, from, to) => to > from ? FATIGUE_CB((minutes - from) / (to - from)) : Number(minutes >= to);
const warmGear = (upgrades) => {
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
export const warmup = (minutes, upgrades = 0, genes = {}) => {
	const { warm, peakEnd, half, cold } = warmupCurve(upgrades, genes);
	if (minutes < warm) return ease(minutes, 0, warm);
	if (minutes < half) return lerp(1, 0.5, ease(minutes, peakEnd, half));
	return lerp(0.5, 0, ease(minutes, half, cold));
};
const SWEET_SPOT = 0.9;
export const BAR_ZONES = [0.4, 0.6, 0.8];
const crossing = (turned, lo, hi) => {
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (turned(mid)) hi = mid;
		else lo = mid;
	}
	return hi;
};
export const warmupBar = (minutes, upgrades = 0, genes = {}) => {
	const { warm, peakEnd, cold } = warmupCurve(upgrades, genes);
	const onset = Math.min(ONSET_MINUTES, FULL_MINUTES, STRAIN_CAP);
	const sweetEnd = crossing(m => warmup(m, upgrades, genes) < SWEET_SPOT, peakEnd, cold);
	const knots = [0, crossing(m => warmup(m, upgrades, genes) >= SWEET_SPOT, 0, warm), Math.min(sweetEnd, onset), onset, STRAIN_CAP];
	const at = [0, ...BAR_ZONES, 1];
	let i = 1;
	while (i < knots.length - 1 && minutes > knots[i]) i++;
	const span = knots[i] - knots[i - 1];
	const t = span > 0 ? (minutes - knots[i - 1]) / span : 1;
	return lerp(at[i - 1], at[i], Math.min(1, Math.max(0, t)));
};
const playedStrain = (minutes, strained, genes = {}) => {
	const rate = STRAIN_RATE * (1 - (genes.strainRate ?? 0));
	return minutes > 0 ? minutes * lerp(-1, rate, ease(strained / minutes, LIGHT_SHARE, 1)) : 0;
};
export const warmupTrend = (minutes, strained) => {
	if (minutes <= 0) return 0;
	const drift = playedStrain(minutes, strained) / minutes;
	return drift >= 0 ? Math.ceil(Math.min(1, drift / STRAIN_RATE) * 3) : -Math.ceil(Math.min(1, -drift) * 3);
};
export const afterPlay = (before, minutes, strained, now, genes = {}, upgrades = 0) => {
	const rested = restedFatigue(before, now - minutes * 60_000, genes, upgrades);
	const next = rested + playedStrain(minutes, strained, genes);
	return { at: now, minutes: Math.min(STRAIN_CAP, Math.max(0, next)) };
};

const FORGET_PLAYS = 10;
const DAILY_DECAY = 0.05;
const DAY_MS = 86_400_000;
const decayed = (plays, ms) => plays * (1 - DAILY_DECAY) ** (Math.max(0, ms) / DAY_MS);
export const recall = (played, forgetAt, now = Date.now()) => {
	const events = [
		...played.map(p => (typeof p === 'number' ? { t: p, share: 1, forget: false } : { t: p.at, share: p.share, forget: false })),
		...forgetAt.map(t => ({ t, share: 0, forget: true })),
	].sort((a, b) => a.t - b.t);
	let plays = 0;
	let last = events[0]?.t ?? now;
	for (const e of events) {
		plays = decayed(plays, e.t - last);
		last = e.t;
		plays = e.forget ? Math.max(0, plays - FORGET_PLAYS) : plays + e.share;
	}
	return decayed(plays, now - last);
};
const XP_FLOOR = 0.05;
export const fatigueLevel = (minutes) => {
	const full = Math.min(FULL_MINUTES, STRAIN_CAP);
	return ease(minutes, Math.min(ONSET_MINUTES, full), full);
};
export const fatigueXp = (level) => lerp(1, XP_FLOOR, level);
const progressionCurve = cubic_bezier(.1, .4, .95, 0);
const lateProgressionCurve = cubic_bezier(.5, 0, 1, .4);
export const lateLevelXp = (level) => {
	if (level < 100) return 0;
	const steps = level - 99;
	return steps * (steps + 1) / 2 * 10_000_000 * 1.25 ** Math.floor((level - 100) / 10);
};
export const xpForLevel = (level) => 100 + (progressionCurve(level / 100) * 9900) + (lateProgressionCurve((level - 60) / 40) * 90000) + lateLevelXp(level);
export const gainLevels = (level, xp, gained) => {
	xp += gained;
	let levels = 0;
	while (xp > xpForLevel(level)) { xp -= xpForLevel(level); level++; levels++; }
	return { level, xp, levels };
};
