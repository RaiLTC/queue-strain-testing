// Upgrade routes, as Gemini's level up sim (the route add-on) plans and saves them, and what following one does
// to a skill's levelling: each upgrade spends levels and makes the skill's XP come faster.

import { xpForLevel } from './fatigue.js';

/** Where the route add-on keeps its settings in the game's storage. There: the add-on is installed. */
export const ROUTES_KEY = 'gemini-level-up-sim:live';

const ROUTE_BASE_UPGRADES = 10;
/** Upgrade #k: the level it unlocks at and the levels it costs. #1-10 unlock at 10, 20 ... 100 and cost 10 levels;
 *  the ones after (one more a prestige) unlock at 101, 102 ... and cost 1. */
export const routeUpgradeSpecs = (k) => (k <= ROUTE_BASE_UPGRADES ? { unlockLevel: k * 10, drop: 10 } : { unlockLevel: 90 + k, drop: 1 });
export const routeMaxUpgrades = (prestige) => ROUTE_BASE_UPGRADES + Math.max(0, prestige);

const routeXpSums = [0];
/** All the XP from level 0 up to `level` (101.47 is 47% into level 101). */
export const routeCumXp = (level) => {
  if (level <= 0) return 0;
  const L = Math.floor(level);
  while (routeXpSums.length <= L) routeXpSums.push(routeXpSums[routeXpSums.length - 1] + xpForLevel(routeXpSums.length - 1));
  return routeXpSums[L] + (level - L) * xpForLevel(L);
};

/** How much overdrive strengthens each upgrade's XP bonus. */
export const routeOverdrive = (o) => (o <= 0 ? 1 : Math.max(1, Math.min(o, 2.5 * Math.pow(o, Math.log10(2)))));
/** A skill's XP multiplier from its upgrades and overdrive. */
export const routeUpgradeMult = (upgrades, overdrive) => 1 + 0.1 * upgrades * routeOverdrive(overdrive);

/** The saved routes: for each prestige, the levels to buy upgrades #1, #2 ... at (every skill at that prestige
 *  follows the same one). Null when the route add-on isn't installed; {} when it is but has no routes. */
export const readRoutes = () => {
  let raw = null;
  try { raw = localStorage.getItem(ROUTES_KEY); } catch (_) {}
  if (raw === null) return null;
  const out = {};
  try {
    const saved = JSON.parse(raw) || {};
    let routes = saved.routes && typeof saved.routes === 'object' ? saved.routes : {};
    // routes were kept by skill for a while: the last skill's set, else the fullest (as the route add-on reads them)
    if (Object.values(routes).some(v => v && typeof v === 'object')) {
      const sets = Object.values(routes).filter(v => v && typeof v === 'object');
      const filled = (set) => Object.values(set).filter(Boolean).length;
      const own = routes[saved.skill];
      routes = own && typeof own === 'object' && filled(own) ? own : sets.sort((a, b) => filled(b) - filled(a))[0];
    }
    for (const [prestige, text] of Object.entries(routes)) {
      if (typeof text !== 'string') continue;
      const levels = text.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
      if (levels.length) out[prestige] = levels;
    }
  } catch (_) {}
  return out;
};

/** A skill played through the forecast while following its route: whenever it reaches the level of its next
 *  upgrade it buys it (the level drops, overdrive grows), and its XP from then on is scaled by the new multiplier
 *  over the one it started with. Past the forecast, the same pace is kept up until the prestige level.
 *  `gainOf(play)` is the play's XP as forecast (with today's upgrades). Returns each play's scale (`ratioOf`), the
 *  purchases (`events`: upgrade number, when, at which level), the level after each play (`samples`), and when
 *  the skill can prestige (`readyAt` inside the forecast, `readySec` in all). */
export const simulateRoute = ({ plays, gainOf, L0, x0, upgrades, overdrive, prestige, route, odPct, need, basePerH, spanSec }) => {
  let u = upgrades, o = overdrive;
  const m0 = routeUpgradeMult(u, o);
  let f = L0 + Math.min(0.999999, Math.max(0, x0 / xpForLevel(L0)));
  const maxU = routeMaxUpgrades(prestige);
  const events = [], samples = [{ t: 0, level: f }], ratioOf = new Map();
  const planned = (k) => Math.max(route[k - 1], routeUpgradeSpecs(k).unlockLevel);
  const canBuy = () => u + 1 <= maxU && u + 1 <= route.length;
  const buy = (t) => {
    const k = u + 1, { unlockLevel, drop } = routeUpgradeSpecs(k);
    const landed = Math.max(0, f - drop);
    const spent = routeCumXp(f) - routeCumXp(landed);
    const minSpend = routeCumXp(unlockLevel) - routeCumXp(unlockLevel - drop);
    o += Math.max(1, minSpend > 0 ? spent / minSpend : 1) * (1 + odPct / 100);
    u++;
    events.push({ k, at: t, level: f, landed });
    f = landed;
  };
  const buyAll = (t) => { while (canBuy() && f >= planned(u + 1) - 1e-9) buy(t); };
  const gain = (xp) => {
    let L = Math.floor(f), x = (f - L) * xpForLevel(L) + xp;
    while (x >= xpForLevel(L)) { x -= xpForLevel(L); L++; }
    f = L + x / xpForLevel(L);
  };
  // the prestige comes after the route's last upgrade
  const ready = () => !canBuy() && f >= need - 1e-9;
  buyAll(0);
  let readyAt = ready() ? 0 : undefined;
  for (const p of plays) {
    // the play's XP at the multiplier of the moment. An upgrade is bought right at its route level, even inside a
    // play: the XP up to that level is spent on getting there, and the rest counts at the new multiplier
    const base = gainOf(p);
    let xp = base * routeUpgradeMult(u, o) / m0, total = 0;
    while (canBuy()) {
      const target = planned(u + 1);
      const short = Math.max(0, routeCumXp(target) - routeCumXp(f));
      if (xp < short) break;
      const before = routeUpgradeMult(u, o);
      f = Math.max(f, target);
      xp -= short; total += short;
      buy(p.end);
      xp *= routeUpgradeMult(u, o) / before;
    }
    gain(xp);
    total += xp;
    ratioOf.set(p, base > 0 ? total / base : routeUpgradeMult(u, o) / m0);
    if (readyAt === undefined && ready()) readyAt = p.end;
    samples.push({ t: p.end, level: f });
  }
  const endLevel = f;
  let readySec = readyAt;
  if (readySec === undefined) {
    readySec = Infinity;
    const perSec = basePerH / 3600;
    let t = spanSec;
    for (let guard = 0; guard < 80 && perSec > 0; guard++) {
      const target = canBuy() ? planned(u + 1) : need;
      if (f >= target - 1e-9) {
        if (canBuy()) { buy(t); continue; }
        readySec = t;
        break;
      }
      t += (routeCumXp(target) - routeCumXp(f)) / (perSec * routeUpgradeMult(u, o) / m0);
      f = target;
    }
  }
  return { ratioOf, events, samples, readyAt, readySec, endLevel, tracked: route.length > 0, prestige };
};
