// The forecast: simulating the queue play by play, the cache, calibration and the local estimate.

import { SETTINGS } from './config.js';
import { MINDBLOCK, RECENT_LIMIT, SKILLS, allowedRate, rateAllowed, clearWaiting, fetchT, logPerf, setWaiting, withTimeout, gameRows, logProblem, medalsOf, memoryPlays, mindblockFactor, num, playsSince, recentPlaysOf, serverTries } from './game.js';
import { LEAD_IN_MS, PHYSICAL, STRAIN_CAP, afterPlay, barKnots, barOf, fatigueLevel, fatigueXp, gainLevels, lerp, restedFatigue, warmup, warmupTrend, xpForLevel } from './rules/fatigue.js';
import { DAY_MS, geneticsXpOf, recall } from './rules/genes.js';
import { scanToken } from './ui/window.js';

// =====================================================================
// 4. THE FORECAST
// =====================================================================
/** Plays of a map are simulated once per step of strained minutes: 5 while cold, where it changes how
 *  a play goes most, 10 up to the peak's end at 1h30, then 20, where the play moves slowly. */
export const strainStep = (minutes) => {
  if (minutes < 30) return Math.round(minutes / 5) * 5;
  if (minutes < 90) return 30 + Math.round((minutes - 30) / 10) * 10;
  return 90 + Math.round((minutes - 90) / 20) * 20;
};
/** Memory plays a map is simulated at: whole plays early on, where each one changes the play most. */
export const PLAY_STEPS = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 80, 120, 200];
export const playStep = (plays) => PLAY_STEPS.reduce((best, p) => (Math.abs(p - plays) < Math.abs(best - plays) ? p : best), 0);
/** The sim API allows 1200 calls a minute. */
export const CALL_SPACING_MS = SETTINGS.callSpacingMs;
export const MAX_PLAYS = 3000;

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Long runs of answers already known come back without ever letting the game draw a frame: every ~10ms, step aside
// for a moment so the game stays smooth.
let lastYield = 0;
// scheduler.yield where there is one; else a MessageChannel task (setTimeout 0 waits at least 4ms once nested)
const yieldNow = (() => {
  if (typeof scheduler !== 'undefined' && scheduler && typeof scheduler.yield === 'function') return () => scheduler.yield();
  if (typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); }; return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); }); }
  return () => new Promise(r => setTimeout(r, 0));
})();
export const breathe = async () => { const now = performance.now(); if (now - lastYield > 4) { await yieldNow(); lastYield = performance.now(); } };
// One limit for every simulator call the add-on makes, from anywhere (scans, Suggestions, the library, all at once):
// at most one every CALL_SPACING_MS and 1,100 a minute, under the server's 1,200 a minute a player. A busy answer
// (429) pauses them all for as long as the server asks.
const callTimes = [];
let lastCall = 0, pausedUntil = 0;
export const pauseCalls = (ms) => { pausedUntil = Math.max(pausedUntil, Date.now() + ms); };
export const callSlot = async () => {
  for (;;) {
    const now = Date.now();
    while (callTimes.length && now - callTimes[0] > 60000) callTimes.shift();
    const wait = Math.max(pausedUntil - now, lastCall + CALL_SPACING_MS - now, callTimes.length >= 1100 ? 60000 - (now - callTimes[0]) + 20 : 0);
    if (wait <= 0) { callTimes.push(now); lastCall = now; clearWaiting('simulator busy'); clearWaiting('simulator limit (1,100 a minute)'); return; }
    if (pausedUntil > now) setWaiting('simulator busy', pausedUntil);
    else if (wait > 1000) setWaiting('simulator limit (1,100 a minute)', now + wait);
    await sleep(Math.max(5, wait));
  }
};
/** Runs `tasks` (functions returning promises) at most `limit` at once; their results in order. */
export const pool = async (tasks, limit) => {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } }));
  return out;
};

// The simulator's answers, kept across scans and restarts. An answer belongs to the character as it
// was: its generation and every skill's whole level, prestige and upgrades. When any of those change
// the answers stop counting, and none counts past a day.
export const CACHE_KEY = 'queue-strain:sim';
export const CACHE_TTL_MS = 24 * 3600 * 1000;
export const CACHE_MAX = 30000;
export let simCache = null;
export let cacheDirty = false;

export const loadCache = () => {
  if (simCache) return simCache;
  simCache = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const now = Date.now();
    for (const [k, v] of Object.entries(saved.entries || {})) if (v && now - v.at < CACHE_TTL_MS) simCache.set(k, v);
  } catch (_) { /* a broken cache is an empty one */ }
  return simCache;
};
// kept in IndexedDB (a database the game keeps on this computer, sized in gigabytes, not localStorage's 5MB)
const CACHE_DB = 'queue-strain-cache';
const cacheDb = () => new Promise((ok, no) => { const q = indexedDB.open(CACHE_DB, 1); q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains('kv')) q.result.createObjectStore('kv'); }; q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
let cacheLoaded = null;
/** Loads the stored answers from IndexedDB (once), moving any left in localStorage over and removing them there. */
export const initCache = () => {
  if (cacheLoaded) return cacheLoaded;
  cacheLoaded = (async () => {
    const map = loadCache(), now = Date.now();
    try {
      const db = await cacheDb();
      const saved = await new Promise((ok) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get('sim'); q.onsuccess = () => ok(q.result || {}); q.onerror = () => ok({}); });
      db.close();
      for (const [k, v] of Object.entries(saved.entries || {})) if (v && now - v.at < CACHE_TTL_MS && !map.has(k)) map.set(k, v);
    } catch (_) {}
    try { if (localStorage.getItem(CACHE_KEY)) { cacheDirty = true; localStorage.removeItem(CACHE_KEY); } } catch (_) {}
  })();
  return cacheLoaded;
};
export const saveCache = () => {
  if (!simCache || !cacheDirty) return;
  // the newest first, up to the cap; old ones (past a day) go
  const now = Date.now();
  let entries = [...simCache.entries()].filter(([, v]) => now - v.at < CACHE_TTL_MS);
  if (entries.length > CACHE_MAX) entries = entries.sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  if (entries.length !== simCache.size) { simCache = new Map(entries); indexKept = null; }
  cacheDirty = false;
  void cacheDb().then(db => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ entries: Object.fromEntries(entries) }, 'sim'); tx.oncomplete = () => db.close(); tx.onerror = () => db.close(); }).catch(() => {});
};
/** What the simulator has already answered about each map at `owner`'s levels (our stored answers): plays, fails
 *  and XP per skill, by map@rate. Free real data for ranking maps without new calls. */
export const knownMaps = (owner) => {
  const out = new Map();
  for (const [k, v] of loadCache()) {
    if (!v || !v.answer || Date.now() - v.at >= CACHE_TTL_MS) continue;
    const parts = k.split('|');
    if (parts[0] !== owner) continue;
    const id = num(parts[1]), rate = num(parts[2]);
    const key = `${id}@${rate}`, m = out.get(key) || { id, rate, n: 0, fails: 0, xp: {} };
    m.n++;
    if (v.answer.passed === false) m.fails++;
    for (const [sk, x] of Object.entries(v.answer.xp || {})) m.xp[sk] = (m.xp[sk] || 0) + num(x);
    out.set(key, m);
  }
  return out;
};
/** What the answers depend on in the character: the cache key's first part. */
export const ownerOf = (row) => [num(row.id), num(row.generation) || 1,
  ...SKILLS.map(s => `${Math.floor(num(row[s]))}.${num(row[`${s}Prestige`])}.${num(row[`${s}Upgrades`])}`)].join(':');
export const cached = (owner, key) => {
  const hit = loadCache().get(`${owner}|${key}`);
  return hit && Date.now() - hit.at < CACHE_TTL_MS && hit.answer.xp ? hit.answer : undefined;
};
export const remember = (owner, key, answer) => {
  // only what the forecast reads
  const xp = {};
  for (const [skill, v] of Object.entries(answer.xp || {})) if (typeof v === 'number') xp[skill] = Math.round(v * 10) / 10;
  const kept = { passed: answer.passed, strained_minutes: answer.strained_minutes, fail_seconds: answer.fail_seconds, fail_progress: answer.fail_progress, xp };
  const k = `${owner}|${key}`, had = loadCache().has(k);
  loadCache().set(k, { at: Date.now(), answer: kept });
  cacheDirty = true;
  if (!had && indexKept && owner.split(':', 1)[0] === indexKept.char) addToIndex(indexKept.index, k, kept);
};

/** How far apart two characters' cached answers are: the levels between them, or Infinity when the
 *  generation, a prestige or upgrades differ (those change a play too much to borrow its answer). */
export const ownerGap = (a, b) => {
  if (a === b) return 0;
  const A = a.split(':'), B = b.split(':');
  if (A[0] !== B[0] || A[1] !== B[1] || A.length !== B.length) return Infinity;
  let gap = 0;
  for (let i = 2; i < A.length; i++) {
    const [la, pa, ua] = A[i].split('.'), [lb, pb, ub] = B[i].split('.');
    if (pa !== pb || ua !== ub) return Infinity;
    gap += Math.abs(num(la) - num(lb));
  }
  return gap;
};
/** Between two answers, `t` of the way from `a` to `b`: XP and strain blended, the rest from the nearer one. */
export const blendAnswers = (a, b, t) => {
  const near = t < 0.5 ? a : b;
  const xp = {};
  for (const sk of new Set([...Object.keys(a.xp || {}), ...Object.keys(b.xp || {})])) xp[sk] = num(a.xp[sk]) + (num(b.xp[sk]) - num(a.xp[sk])) * t;
  return { ...near, xp, strained_minutes: num(a.strained_minutes) + (num(b.strained_minutes) - num(a.strained_minutes)) * t };
};
/**
 * A play's answer from the stored ones, without the simulator: after a queue change, the strain of the plays
 * moves but the maps mostly don't. Of the same map, rate and mods: the nearest character (levels), the nearest
 * Tries step, the same run when there is one, and between the two nearest strain steps, blended (as the
 * official sim does on a pick). Undefined when the map has none: it needs the simulator.
 */
export const nearestAnswer = (index, owner, beatmapId, r, m, bucket, playsKey, run) => {
  const list = index.get(`${beatmapId}|${r}|${[...m].sort().join('')}`);
  if (!list) return undefined;
  const gaps = new Map();
  const gapOf = (own) => { if (!gaps.has(own)) gaps.set(own, ownerGap(owner, own)); return gaps.get(own); };
  const best = Math.min(...list.map(c => gapOf(c.own)));
  if (!Number.isFinite(best)) return undefined;
  let pool = list.filter(c => gapOf(c.own) === best);
  const triesGap = Math.min(...pool.map(c => Math.abs(c.plays - playsKey)));
  pool = pool.filter(c => Math.abs(c.plays - playsKey) === triesGap);
  const sameRun = pool.filter(c => c.run === run);
  if (sameRun.length) pool = sameRun;
  const below = pool.filter(c => c.bucket <= bucket).sort((a, b) => b.bucket - a.bucket)[0];
  const above = pool.filter(c => c.bucket >= bucket).sort((a, b) => a.bucket - b.bucket)[0];
  if (below && above && below.bucket !== above.bucket) return blendAnswers(below.answer, above.answer, (bucket - below.bucket) / (above.bucket - below.bucket));
  return (below || above).answer;
};
/** The stored answers of character `charId`, by map, rate and mods, for nearestAnswer. */
// built once per character and kept (answers remembered later are added to it), not again for every forecast
let indexKept = null;
const addToIndex = (index, k, answer) => {
  const parts = k.split('|');
  if (parts.length < 6) return;
  const group = `${parts[1]}|${parts[2]}|${parts[3]}`;
  if (!index.has(group)) index.set(group, []);
  index.get(group).push({ own: parts[0], bucket: num(parts[4]), plays: num(parts[5]), run: parts[6] ? num(parts[6].slice(1)) : 0, answer });
};
export const answerIndex = (charId) => {
  if (indexKept && indexKept.char === String(charId)) return indexKept.index;
  const index = new Map();
  const now = Date.now();
  for (const [k, v] of loadCache()) {
    if (!(v && v.answer && v.answer.xp) || now - v.at >= CACHE_TTL_MS) continue;
    if (k.split(':', 1)[0] !== String(charId)) continue;
    addToIndex(index, k, v.answer);
  }
  indexKept = { char: String(charId), index };
  return index;
};


// ---------------------------------------------------------------------
// The official sim add-on's stored plays (IndexedDB 'oss-idle-sim', store 'plays'): players run it a lot, so it
// often has already simulated the very play a forecast needs. Its key (github.com/oss-idle/addon-sim, samples.ts
// and sweep.ts): sim version | the 11 skills' play levels, rounded | DIVINE 0/1 | map@rate@mods | map plays.
// Its XP is the simulator's with the mods and (physical skills) fatigue divided out, so both go back in here.
// ---------------------------------------------------------------------
const GAME_SKILLS = ['accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release', 'reading', 'consistency', 'concentration', 'speedjam', 'memory'];
const MOD_ORDER = ['EZ', 'NF', 'HR', 'SD', 'PF'];
const OFFICIAL_KEEP_MS = 7 * 24 * 3600 * 1000;
const xpGivesLevel = (xp) => { let level = 0; while (level < 400 && xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++; } return { level, xp }; };
const levelProgress = (level, xp) => { const n = xpForLevel(level); return n > 0 ? Math.min(1, Math.max(0, xp / n)) : 0; };
/** A skill's play level, as the game reckons it (shared xp.ts): the better of its level and the level its lifetime XP buys, plus prestige. */
const playLevelOf = (level, xp, lifetimeXp, prestige = 0) => { const lt = xpGivesLevel(lifetimeXp); return Math.max(level + levelProgress(level, xp), lt.level + levelProgress(lt.level, lt.xp)) + prestige; };
/** How much of a physical skill's level is there to play with, tired and warmed up as it is (shared fatigue.ts). */
const keptShare = (level, fatigue, warm = 1) => lerp(1, 0.25, fatigue) * lerp(lerp(1, 0.5, Math.min(1, level / 100)), 1, warm);
const xpToLevel = (level) => { let t = 0; for (let i = 0; i < level; i++) t += xpForLevel(i); return t; };
const levelsMemo = new WeakMap();
const officialLevels = (skills, minutes, rested = false) => {
  let byMin = levelsMemo.get(skills);
  if (!byMin) { byMin = new Map(); levelsMemo.set(skills, byMin); }
  const mk = `${rested ? 1 : 0}|${minutes}`;
  if (byMin.has(mk)) return byMin.get(mk);
  const v = officialLevelsNow(skills, minutes, rested);
  byMin.set(mk, v);
  return v;
};
const officialLevelsNow = (skills, minutes, rested = false) => {
  const restedOnly = rested;
  const fatigue = fatigueLevel(minutes), warm = warmup(minutes, num(skills.stamina && skills.stamina.upgrades));
  return GAME_SKILLS.map((name) => {
    const s = skills[name] || {};
    const rested = playLevelOf(num(s.level), num(s.xp), num(s.lifetime_xp), num(s.prestige));
    const kept = PHYSICAL.includes(name) && !restedOnly ? keptShare(rested, fatigue, warm) : 1;
    let lv = rested;
    if (kept < 1) { const tired = xpGivesLevel((xpToLevel(num(s.level)) + num(s.xp)) * kept); lv = playLevelOf(tired.level, tired.xp, num(s.lifetime_xp) * kept, num(s.prestige)); }
    return lv < 100 ? Math.round(lv) : Math.round(lv * 2) / 2;
  }).join(',');
};
/**
 * Every play the official sim stored that fits the character now, for the library scan: by map@rate, its XP per
 * skill (in the simulator's terms) and strain. For each map@rate the closest record is taken (play levels with no
 * fatigue: at Peak). It counts when the map's KEY skills (the ones getting 5%+ of its XP) are within 2 levels of
 * the character's: the XP formula barely moves past level 100, and skills that win almost no notes on a map hardly
 * change it. Speed Jam's and Memory's XP come from a record whose own two levels are within 2. `exact` when every
 * level is equal. Same sim version, under 7 days.
 */
export const officialPlaysFor = async (skills, generation, mods, minutes, mapIds, rates, playsOf, tol = 2) => {
  const out = new Map();
  const index = await loadOfficial();
  if (!index.size || !index.db) return out;
  const mine = officialLevels(skills, minutes, true).split(',');
  const modsKey = MOD_ORDER.filter(m => (mods || []).includes(m)).join(',');
  const SJM = [GAME_SKILLS.indexOf('speedjam'), GAME_SKILLS.indexOf('memory')];
  const rateSet = new Set(rates.map(r => String(r)));
  const forNine = new Map(), forSjm = new Map(), nineDist = new Map(), sjmDist = new Map();
  const diff = (lv, i) => Math.abs(Number(lv[i]) - Number(mine[i]));
  for (const key of [...mapIds].flatMap(id => (index.byMap && index.byMap.get(Number(id))) || [])) {
    const parts = key.split('|');
    if (parts.length < 5 || parts[2] !== String(generation >= 2 ? 1 : 0)) continue;
    const [id, rate, mk] = parts[3].split('@');
    if (mk !== modsKey || !rateSet.has(rate) || !mapIds.has(Number(id))) continue;
    if (Number(parts[4]) !== (playsOf.get(Number(id)) || 0)) continue;
    const lv = parts[1].split(',');
    const mr = `${id}@${rate}`;
    // a first cut from the key alone (no skill more than 10 levels off), the closest record kept per map@rate
    const nine = lv.map((v, i) => (SJM.includes(i) ? 0 : diff(lv, i)));
    if (Math.max(...nine) <= 10) { const d = nine.reduce((t, v) => t + v, 0); if (!nineDist.has(mr) || d < nineDist.get(mr)) { nineDist.set(mr, d); forNine.set(mr, key); } }
    const sd = Math.max(...SJM.map(i => diff(lv, i)));
    if (sd <= tol && (!sjmDist.has(mr) || sd < sjmDist.get(mr))) { sjmDist.set(mr, sd); forSjm.set(mr, key); }
  }
  const want = [...new Set([...forNine.values(), ...forSjm.values()])];
  const recs = new Map();
  await new Promise((ok) => {
    const st = index.db.transaction('plays', 'readonly').objectStore('plays');
    let left = want.length;
    if (!left) ok();
    for (const k of want) { const q = st.get(k); q.onsuccess = () => { recs.set(k, q.result); if (!--left) ok(); }; q.onerror = () => { if (!--left) ok(); }; }
  });
  const mean = (rec, sk) => { const ss = (rec.samples || []).filter(x => x && x.passed !== false); return ss.length ? ss.reduce((t, x) => t + num(x.xp && x.xp[sk]), 0) / ss.length : 0; };
  const ok = (rec) => rec && num(rec.at) >= Date.now() - OFFICIAL_KEEP_MS && Array.isArray(rec.samples) && rec.samples.length;
  const ez = (mods || []).includes('EZ') ? 0.5 : 1, hr = (mods || []).includes('HR');
  for (const [mr, key] of forNine) {
    const rec = recs.get(key);
    if (!ok(rec)) continue;
    // its key skills (5%+ of its XP) must be within 2 levels of yours
    const lv = key.split('|')[1].split(','), tot = GAME_SKILLS.filter(sk => sk !== 'speedjam' && sk !== 'memory').reduce((t, sk) => t + mean(rec, sk), 0);
    if (!(tot > 0)) continue;
    if (GAME_SKILLS.some((sk, i) => !SJM.includes(i) && mean(rec, sk) / tot >= 0.05 && diff(lv, i) > tol)) continue;
    const sj = forSjm.get(mr) && recs.get(forSjm.get(mr));
    const xp = {};
    for (const sk of GAME_SKILLS) {
      const src = sk === 'speedjam' || sk === 'memory' ? (ok(sj) ? sj : null) : rec;
      xp[sk] = src ? mean(src, sk) * ez * (sk === 'accuracy' && hr ? 1.1 : 1) : 0;
    }
    const passed = rec.samples.some(x => x && x.passed !== false);
    const exact = nineDist.get(mr) === 0 && sjmDist.get(mr) === 0;
    out.set(mr, { xp, passed, exact, strained: rec.samples.reduce((t, x) => t + num(x && x.strained), 0) / rec.samples.length });
  }
  return out;
};
let officialIndex = null;
const officialValues = new Map();
export const officialStats = { keys: 0, versions: [], hits: 0, misses: 0, error: '' };

// ---------------------------------------------------------------------
// The shared sim cache (cache.oss.idle.rhythmgamers.net, made for add-ons): every play the official sim servers
// make is kept there, one per skillset. Asked first, a batch of maps a request at the character's play levels; only
// what it doesn't have goes to the simulator. At most 60 lookups a minute (we keep to 55). Its XP is at x1: times the
// skill's own multiplier (upgrades, overdrive, prestige) and, for physical skills, the fatigue XP factor; mods are in.
// Memory: it keeps a map only never played or played 68+ times.
// ---------------------------------------------------------------------
export const SHARED_CACHE_URL = 'https://cache.oss.idle.rhythmgamers.net';
export const sharedStats = { lookups: 0, rows: 0, hits: 0, error: '' };
const sharedRows = new Map(), sharedAsked = new Set(), lookupTimes = [];
// what's kept in memory from the shared cache, at most (the oldest go first): enough for a few scans
const SHARED_KEEP = 20000;
const trimOldest = (coll, max) => { if (coll.size <= max) return; let n = coll.size - Math.floor(max * 0.75); for (const k of coll.keys()) { if (n-- <= 0) break; coll.delete(k); } };
/** A shared cache row, only the parts the forecast reads. */
const compactRow = (row) => ({ passed: row.passed, strained_minutes: row.strained_minutes, fail_seconds: row.fail_seconds, fail_progress: row.fail_progress, xp: Object.fromEntries(Object.entries(row.xp || {}).map(([sk, v]) => [sk, num(v)])) });
const learnedOf = (plays) => (plays <= 0 ? false : plays >= 68 ? true : undefined);
const ownMult = (s) => { const od = num(s && s.overdrive), odM = od <= 0 ? 1 : Math.max(1, Math.min(od, 2.5 * Math.pow(od, Math.log10(2)))); return (1 + 0.1 * num(s && s.upgrades) * odM) * Math.pow(1.1, num(s && s.prestige)); };
const lookupFree = () => { const now = Date.now(); while (lookupTimes.length && now - lookupTimes[0] > 60000) lookupTimes.shift(); return lookupTimes.length < 55; };
const lookupSlot = async () => {
  for (;;) {
    const now = Date.now();
    while (lookupTimes.length && now - lookupTimes[0] > 60000) lookupTimes.shift();
    if (lookupTimes.length < 55) { lookupTimes.push(now); clearWaiting('shared cache limit (55 a minute)'); return; }
    setWaiting('shared cache limit (55 a minute)', lookupTimes[0] + 60000);
    await sleep(60000 - (now - lookupTimes[0]) + 50);
  }
};
/** Asks the shared cache about `ids` at play levels `levels` (the 11 joined, as officialLevels gives them). */
// `sink`: rows go to it (key, row) instead of being kept here: for the library, which asks about every map at once
// `wait` false: when the minute's lookups are used up, nothing is asked (and it can be asked again later)
export const sharedLookup = async (generation, levels, ids, mods = [], sink = null, wait = true) => {
  const want = sink ? [...new Set(ids)] : [...new Set(ids)].filter(id => !sharedAsked.has(`${generation}|${levels}|${id}`));
  if (!want.length || typeof fetch === 'undefined') return;
  if (!wait && !lookupFree()) { sharedStats.skipped = num(sharedStats.skipped) + 1; return; }
  const lv = levels.split(',').map(Number), body = Object.fromEntries(GAME_SKILLS.map((sk, i) => [sk, lv[i]]));
  for (let i = 0; i < want.length; i += 200) {
    const chunk = want.slice(i, i + 200);
    if (!sink) { for (const id of chunk) sharedAsked.add(`${generation}|${levels}|${id}`); trimOldest(sharedAsked, SHARED_KEEP); }
    try {
      await lookupSlot();
      const res = await fetchT(`${SHARED_CACHE_URL}/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generation, levels: body, beatmap_ids: chunk, mods }) });
      sharedStats.lookups++;
      if (!res.ok) { sharedStats.error = `answered ${res.status}`; continue; }
      const { columns, rows } = await res.json();
      const at = Object.fromEntries((columns || []).map((c, k) => [c, k]));
      if (at.strained_minutes === undefined || at.xp === undefined) continue;
      for (const row of rows || []) {
        const mk = MOD_ORDER.filter(m => (row[at.mods] || []).includes(m)).join(',');
        const key = `${generation}|${levels}|${row[at.beatmap_id]}@${row[at.rate]}@${mk}@${row[at.learned] ? 1 : 0}`, kept = compactRow(Object.fromEntries(columns.map((c, k) => [c, row[k]])));
        if (sink) sink(key, kept); else sharedRows.set(key, kept);
        sharedStats.rows++;
      }
      if (!sink) trimOldest(sharedRows, SHARED_KEEP);
      sharedStats.error = '';
    } catch (e) { sharedStats.error = String(e && e.message ? e.message : e); }
  }
};
/** For the library: every play the shared cache has at the character's play levels (`minutes` in), for `ids` at
 *  `rates`, by map@rate, in the simulator's terms. */
export const sharedPlaysFor = async (skills, generation, mods, minutes, ids, rates, playsOf) => {
  const out = new Map();
  const levels = officialLevels(skills, minutes);
  const tired = fatigueXp(fatigueLevel(minutes)), mk = MOD_ORDER.filter(m => (mods || []).includes(m)).join(',');
  const rateSet = new Set(rates.map(String)), rows = new Map();
  await sharedLookup(generation, levels, ids, mods, (key, row) => { const [id, rate, rmk] = key.split('|').pop().split('@'); if (rateSet.has(rate) && rmk === mk) rows.set(key, row); });
  for (const id of ids) {
    const learned = learnedOf(playsOf.get(id) || 0);
    if (learned === undefined) continue;
    for (const rate of rates) {
      const row = rows.get(`${generation}|${levels}|${id}@${rate}@${mk}@${learned ? 1 : 0}`);
      if (!row || row.passed === false) continue;
      out.set(`${id}@${rate}`, { xp: Object.fromEntries(Object.entries(row.xp || {}).map(([sk, v]) => [sk, num(v) * ownMult(skills[sk]) * (PHYSICAL.includes(sk) ? tired : 1)])), passed: true, exact: true, strained: num(row.strained_minutes) });
    }
  }
  return out;
};
/** The shared cache's play for this exact one, in the simulator's terms, or null. `ids`: the maps to ask about together. */
const sharedAnswer = async (skills, generation, beatmapId, rate, mods, minutes, plays, ids) => {
  const learned = learnedOf(plays);
  if (learned === undefined || (mods || []).includes('NF')) return null;
  const levels = officialLevels(skills, minutes);
  await sharedLookup(generation, levels, ids && ids.length ? ids : [beatmapId], mods, null, false);
  const row = sharedRows.get(`${generation}|${levels}|${beatmapId}@${rate}@${MOD_ORDER.filter(m => (mods || []).includes(m)).join(',')}@${learned ? 1 : 0}`);
  if (!row) return null;
  const tired = fatigueXp(fatigueLevel(minutes));
  const xp = Object.fromEntries(Object.entries(row.xp || {}).map(([sk, v]) => [sk, num(v) * ownMult(skills[sk]) * (PHYSICAL.includes(sk) ? tired : 1)]));
  sharedStats.hits++;
  return { xp: row.passed === false ? {} : xp, passed: row.passed !== false, strained_minutes: num(row.strained_minutes), fail_seconds: row.fail_seconds ?? undefined, fail_progress: row.fail_progress ?? undefined, shared: true };
};
/** Reads the official sim's keys once (the values when asked for), keeping only the recent ones' versions. */
const loadOfficial = async () => {
  if (officialIndex) return officialIndex;
  officialIndex = new Set();
  try {
    if (typeof indexedDB === 'undefined') return officialIndex;
    const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: 'oss-idle-sim' }];
    if (!dbs.some(d => d.name === 'oss-idle-sim')) return officialIndex;
    const db = await withTimeout(new Promise((ok, no) => { const q = indexedDB.open('oss-idle-sim'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); q.onblocked = () => no(new Error('busy (the sim add-on is updating it)')); q.onupgradeneeded = () => { q.transaction.abort(); no(new Error('no store')); }; }), 5000, 'opening the official sim\'s records');
    if (!db.objectStoreNames.contains('plays')) { db.close(); return officialIndex; }
    const keys = await new Promise((ok, no) => { const q = db.transaction('plays', 'readonly').objectStore('plays').getAllKeys(); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
    officialIndex.byMap = new Map();
    for (const k of keys) {
      const ks = String(k), id = Number((ks.split('|')[3] || '').split('@')[0]);
      officialIndex.add(ks);
      if (!officialIndex.byMap.has(id)) officialIndex.byMap.set(id, []);
      officialIndex.byMap.get(id).push(ks);
    }
    officialIndex.db = db;
    officialStats.keys = officialIndex.size;
    officialStats.versions = [...new Set(keys.map(k => String(k).split('|')[0]))];
  } catch (e) { officialStats.error = String(e && e.message ? e.message : e); }
  return officialIndex;
};
/** The official sim's answer for this exact play, as the simulator would give it, or null. Run `run` of its samples. */
const officialAnswer = async (skills, generation, beatmapId, rate, mods, minutes, plays, run) => {
  const index = await loadOfficial();
  if (!index.size || !index.db) return null;
  const levels = officialLevels(skills, minutes);
  const modsKey = MOD_ORDER.filter(m => (mods || []).includes(m)).join(',');
  for (const version of officialStats.versions) {
    const key = `${version}|${levels}|${generation >= 2 ? 1 : 0}|${beatmapId}@${rate}@${modsKey}|${plays}`;
    if (!index.has(key)) continue;
    let rec = officialValues.get(key);
    if (rec === undefined) {
      rec = await new Promise((ok) => { const q = index.db.transaction('plays', 'readonly').objectStore('plays').get(key); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
      officialValues.set(key, rec);
      trimOldest(officialValues, 2000);
    }
    if (!rec || !(num(rec.at) >= Date.now() - OFFICIAL_KEEP_MS) || !Array.isArray(rec.samples) || !rec.samples.length) continue;
    const sample = rec.samples[run % rec.samples.length];
    if (!sample || sample.passed === false) continue;
    const tired = fatigueXp(fatigueLevel(minutes));
    const ez = (mods || []).includes('EZ') ? 0.5 : 1, nf = (mods || []).includes('NF');
    if (nf) return null;
    const xp = Object.fromEntries(Object.entries(sample.xp || {}).map(([sk, v]) => [sk, num(v) * ez * (sk === 'accuracy' && (mods || []).includes('HR') ? 1.1 : 1) * (PHYSICAL.includes(sk) ? tired : 1)]));
    officialStats.hits++;
    return { xp, passed: true, strained_minutes: num(sample.strained), official: true };
  }
  officialStats.misses++;
  return null;
};

/** Maps that give any Speed Jam or Memory XP: their next `count` plays, one at a time, at the strain
 *  (and mindblock) the forecast plays each at; past the forecast's plays of the map, at its last one's (issue #8). Memory XP rises while a map is learned and fades once it is known,
 *  taking Speed Jam's with it, so these are simulated at every play count, not the forecast's steps. */
export async function svCurves(queue, r, count, token, onProgress) {
  const out = [];
  const seen = new Set();
  for (const p of r.plays) {
    const entry = queue.entries[p.entry];
    if (seen.has(entry.beatmapId)) continue;
    seen.add(entry.beatmapId);
    const total = SKILLS.reduce((sum, sk) => sum + num(p.xp[sk]), 0);
    const sv = num(p.xp.speedjam) + num(p.xp.memory);
    if (!(sv > 0)) continue;
    const start = Math.max(0, Math.round(num(r.memory[entry.beatmapId])));
    const rows = [];
    const own = r.plays.filter(q => queue.entries[q.entry].beatmapId === entry.beatmapId);
    for (let k = 0; k < count; k++) {
      if (token !== scanToken) throw new Error('stopped');
      const q = own[Math.min(k, own.length - 1)];
      const answer = await r.simulate(entry, q.before, start + k, true);
      onProgress();
      const xp = answer.xp || {};
      rows.push({ play: start + k + 1, speedjam: num(xp.speedjam), memory: num(xp.memory), block: num(q.block ?? 1) });
    }
    out.push({ entry, share: total > 0 ? sv / total : 0, start, rows });
  }
  return out;
}

/** The simulator's XP is what a play earns before the character's own multipliers (genetics, medals and
 *  what else the server adds after the play). Each skill's factor from one to the other, from the
 *  character's real plays of the queue's maps as the game stored them (score_xp, score): each one is
 *  simulated again as it was played (its rate and mods, the map's Tries then, the levels then, stepped
 *  back from now by the XP earned since), and what it really earned is set against that. The strain a
 *  play was made at is not stored, so it is simulated at now's. */
export const CALIBRATE_PLAYS = SETTINGS.calibrationPlays;
/** A factor past these is more likely a bad comparison than a real bonus: shown, not applied. */
export const FACTOR_MIN = 0.5, FACTOR_MAX = 50;
/** `minus` XP taken back off `xp` into `level`. */
export const levelBack = (level, xp, minus) => {
  while (minus > xp && level > 0) { minus -= xp; level--; xp = xpForLevel(level); }
  return { level, xp: Math.max(0, xp - minus) };
};
export const parseGains = (text) => {
  try { const g = JSON.parse(text || '{}'); return g && typeof g === 'object' ? g : {}; } catch (_) { return {}; }
};
export async function calibrate(row, queue, { startMinutes, rate, triesOffset = {}, genetics = {}, simulateAs, stopped }) {
  // the newest plays, however old: no time limit
  const since = 0;
  const out = { plays: 0, factors: {}, real: {}, sim: {}, n: {}, low: {}, high: {}, conf: {}, ignored: {}, detail: [] };
  let recent;
  try {
    recent = await gameRows('SELECT playedAt, gains FROM score_xp WHERE characterId = ? AND playedAt >= ? ORDER BY playedAt DESC', [row.id, since]);
  } catch (_) { return out; /* an older game keeps no gains */ }
  if (!recent || !recent.length) return out;
  const recentGains = recent.map(x => ({ at: num(x.playedAt), gains: parseGains(x.gains) }));
  const resetAt = num(row.memoryResetAt);
  let forgets = [];
  try { forgets = JSON.parse(row.memoryForgetAt || '[]'); } catch (_) {}
  const nowLv = Object.fromEntries(SKILLS.map(s => [s, { level: Math.floor(num(row[s])), xp: num(row[`${s}XP`]) }]));
  // every play from a day before the first one looked at: for each real play's mindblock then
  const allPlays = await playsSince(row, since - DAY_MS);
  for (const entry of queue.entries.filter((e, i, all) => all.findIndex(x => x.beatmapId === e.beatmapId) === i)) {
    const id = entry.beatmapId;
    let rows = null;
    try {
      rows = await gameRows('SELECT x.playedAt AS playedAt, x.gains AS gains, s.rate AS rate, s.mods AS mods FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? AND x.beatmapId = ? AND x.playedAt >= ? ORDER BY x.playedAt DESC LIMIT ?', [row.id, id, since, 300]);
    } catch (_) { rows = null; }
    if (!rows || !rows.length) continue;
    // only plays at the rate the queue plays the map: the newest of them
    const queueRate = entry.lockedRate ?? rate;
    rows = rows.filter(x => Math.abs((num(x.rate) || 1) - queueRate) < 0.001).slice(0, CALIBRATE_PLAYS);
    if (!rows.length) continue;
    // the map's plays, for its Tries at each real play
    const played = [];
    for (const x of (await gameRows('SELECT playedAt FROM score WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?', [row.id, id, resetAt])) || []) played.push({ at: num(x.playedAt), share: 1 });
    try {
      for (const x of (await gameRows('SELECT playedAt, share FROM memory_fail WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?', [row.id, id, resetAt])) || []) played.push({ at: num(x.playedAt), share: num(x.share) });
    } catch (_) {}
    for (const x of rows) {
      if (stopped()) throw new Error('stopped');
      const at = num(x.playedAt);
      const gains = parseGains(x.gains);
      const tries = Math.max(0, recall(played.filter(p => p.at < at), forgets.filter(t => t >= resetAt && t < at), at) + num(triesOffset[id]));
      // the levels before this play: now's, less everything earned from this play on
      const levelsThen = {};
      for (const sk of SKILLS) {
        const since = recentGains.filter(g => g.at >= at).reduce((sum, g) => sum + num(g.gains[sk]), 0);
        levelsThen[sk] = levelBack(nowLv[sk].level, nowLv[sk].xp, since);
      }
      const r = num(x.rate) || 1;
      const m = String(x.mods || '').split(',').map(v => v.trim()).filter(Boolean);
      if (!rateAllowed(r, row)) { out.skippedRates = (out.skippedRates || 0) + 1; continue; }
      const answer = await simulateAs(id, r, m, startMinutes, tries, levelsThen);
      if (!answer || answer.rejected) { out.skippedRejected = (out.skippedRejected || 0) + 1; continue; }
      const sim = answer.xp || {};
      const recentThen = recentPlaysOf(allPlays, id, at);
      const block = mindblockFactor(recentThen);
      out.plays++;
      out.detail.push({ beatmapId: id, title: entry.title, playedAt: at, rate: r, mods: m.join(','), tries, levelsThen, recentThen, block, real: gains, sim });
      for (const sk of SKILLS) {
        // what the server takes off before the bonuses: the factor left is the bonuses alone
        const a = num(gains[sk]), b = num(sim[sk]) * (MINDBLOCK.has(sk) ? block : 1) * (genetics[sk] ? genetics[sk].total : 1);
        if (!(a > 0 && b > 0)) continue;
        out.real[sk] = (out.real[sk] || 0) + a;
        out.sim[sk] = (out.sim[sk] || 0) + b;
        out.n[sk] = (out.n[sk] || 0) + 1;
        const ratio = a / b;
        out.low[sk] = Math.min(out.low[sk] ?? Infinity, ratio);
        out.high[sk] = Math.max(out.high[sk] ?? 0, ratio);
      }
    }
  }
  for (const sk of SKILLS) {
    if (!(out.sim[sk] > 0)) continue;
    const factor = out.real[sk] / out.sim[sk];
    const spread = out.high[sk] / out.low[sk];
    // how sure: plays behind it and how much they agree. Speed Jam and Memory hang on Tries: rough at best.
    let conf = out.n[sk] >= 3 && spread <= 1.5 ? 'good' : out.n[sk] >= 2 && spread <= 2.5 ? 'fair' : 'rough';
    if ((sk === 'speedjam' || sk === 'memory') && conf !== 'rough') conf = 'rough';
    if (factor < FACTOR_MIN || factor > FACTOR_MAX) { out.ignored[sk] = factor; out.conf[sk] = 'ignored'; continue; }
    out.factors[sk] = factor;
    out.conf[sk] = conf;
  }
  return out;
}

/** A set of mods as one text, in any order: "HR,SD". */
export const modsText = (mods) => (Array.isArray(mods) ? mods : String(mods || '').split(',')).map(v => String(v).trim()).filter(Boolean).sort().join(',');
/** The local estimate's plays: each queue map's newest real plays at the rate and mods the queue plays it
 *  (SETTINGS.localPlays), as { beatmapId, rate, mods, playedAt, real }. Read from the game's database alone: no
 *  simulator call. `rate` and `mods`: the player's, for the entries that don't lock their own. */
export async function localPlaysOf(row, queue, rate, count = SETTINGS.localPlays, mods = []) {
  const since = Date.now() - DAY_MS; // the last 24 hours only
  const out = [];
  for (const entry of queue.entries.filter((e, i, all) => all.findIndex(x => x.beatmapId === e.beatmapId) === i)) {
    let rows = null;
    try {
      rows = await gameRows('SELECT x.playedAt AS playedAt, x.gains AS gains, s.rate AS rate, s.mods AS mods FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? AND x.beatmapId = ? AND x.playedAt >= ? ORDER BY x.playedAt DESC LIMIT ?', [row.id, entry.beatmapId, since, 5000]);
    } catch (_) { rows = null; }
    const queueRate = entry.lockedRate ?? rate;
    const queueMods = modsText(entry.lockedRate === undefined ? mods : (entry.lockedMods || []));
    let atRate = (rows || []).filter(v => num(v.playedAt) >= since && Math.abs((num(v.rate) || 1) - queueRate) < 0.001 && modsText(v.mods) === queueMods);
    // a map that gives no XP leaves nothing in the XP log: its plays still count, from the scores, as plays of 0 XP
    if (!atRate.length) {
      let plays = null;
      try { plays = await gameRows('SELECT playedAt, rate, mods FROM score WHERE characterId = ? AND beatmapId = ? AND playedAt >= ? ORDER BY playedAt DESC', [row.id, entry.beatmapId, since]); } catch (_) { plays = null; }
      atRate = (plays || []).filter(v => Math.abs((num(v.rate) || 1) - queueRate) < 0.001 && modsText(v.mods) === queueMods).map(v => ({ ...v, gains: '{}' }));
    }
    // the map's plays at this rate in the last 24 hours, shown next to how many the estimate uses
    const day = atRate.length;
    for (const x of atRate.slice(0, count)) {
      out.push({ beatmapId: entry.beatmapId, rate: num(x.rate) || 1, mods: queueMods, playedAt: num(x.playedAt), real: parseGains(x.gains), day });
    }
  }
  return out;
}

/** Each play of the queue in order, repeats spelled out; the head only has the repeats it has left. */
export const expand = (entries, resuming) => entries.flatMap((e, i) => Array(Math.max(i === 0 && resuming ? 0 : 1, e.repeat - (resuming && i === 0 ? e.played : 0))).fill(i));

/**
 * Loop the queue for `hours`, asking `simulate` what each play does at its fatigue.
 * Returns every play and the samples of the bar over time.
 */
/** Waits between tries when the simulator is busy or can't be reached: 5 more tries, each waiting longer. */
export const RETRY_WAITS_MS = SETTINGS.retryWaitsSec.map(sec => sec * 1000);
/** Worth trying again: the server busy, or the connection failing. A wrong request is not. */
export const isTransient = (e) => /busy|try again|timed? ?out|network|failed to fetch|fetch failed|overload|unavailable|too many|rate.?limit|\b(429|500|502|503|504)\b|ECONN|socket/i.test(String(e && (e.message || e)));

export async function forecast(queue, ctx, onProgress, token) {
  const { api, row, genes, gear, startMinutes, delaySec, hours, rate, mods } = ctx;
  const knots = barKnots(gear, genes);
  const first = expand(queue.entries, true);
  const loop = expand(queue.entries, false);
  const plays = [];
  const samples = [{ t: 0, minutes: startMinutes, bar: barOf(startMinutes, knots) }];
  if (!loop.length) return { plays, samples, knots, loopSec: 0, loopDrift: 0, loopPlays: 0, memory: {}, memoryLocal: {}, triesFrom: {}, counts: () => ({ calls: 0, fromCache: 0 }) };

  const mapIds = [...new Set(queue.entries.map(e => e.beatmapId))];
  const genetics = geneticsXpOf(ctx.geneSource ? ctx.geneSource.genetics : row.geneticsJson);
  // a what-if (Suggestions) reuses what the last scan read: Tries, calibration, medals and the day's plays are the
  // same for every variant of the queue, and reading them again (server requests, database reads) is what's slow
  const reuse = ctx.reuse || null;
  // Tries: the server's when it answers, else counted from this computer's plays as the game does for guests
  const memoryLocal = reuse && reuse.memoryLocal ? reuse.memoryLocal : await memoryPlays(row, mapIds);
  const fromServer = reuse && reuse.memory ? null : await serverTries(row, mapIds);
  const memory = {}, triesFrom = {};
  for (const id of mapIds) {
    if (reuse && reuse.memory && reuse.memory[id] !== undefined) { memory[id] = reuse.memory[id]; triesFrom[id] = (reuse.triesFrom || {})[id] || 'local'; continue; }
    const server = fromServer ? fromServer[id] : undefined;
    memory[id] = server ?? memoryLocal[id];
    triesFrom[id] = server !== undefined ? 'server' : 'local';
  }
  /** The run this simulator works for: a scan, or later a new Memory plays count. Its calls stop with it. */
  let runToken = token;
  const asks = new Map();
  let calls = 0, fromCache = 0;
  /** How far the scan is: plays forecast so far, new simulator calls, stored answers reused. */
  const progress = () => ({ plays: plays.length, calls, fromCache });
  // a quick update (after a queue change): a play the cache has no answer for borrows the nearest stored one,
  // and only a map with none at all asks the simulator. The scan turns it off after the Speed Jam / Memory curves.
  let approxOn = !!ctx.quick, approxIndex = null;
  // The character as each play is simulated: it levels up as the forecast's XP comes in, and the plays
  // after a level-up are simulated at the new level (cached answers belong to the level they were got at).
  const lv = Object.fromEntries(SKILLS.map(s => [s, { level: Math.floor(num(row[s])), xp: num(row[`${s}XP`]), lifetime: num(row[`${s}LifetimeXp`]) }]));
  const skillsOf = () => Object.fromEntries(SKILLS.map(s => [s, {
    level: lv[s].level, xp: lv[s].xp, lifetime_xp: lv[s].lifetime,
    prestige: num(row[`${s}Prestige`]), upgrades: num(row[`${s}Upgrades`]), overdrive: num(row[`${s}Overdrive`]),
  }]));
  const ownerNow = () => ownerOf({ ...row, ...Object.fromEntries(SKILLS.map(s => [s, lv[s].level])) });
  let skills = skillsOf();
  let owner = ownerNow();
  const startSkills = skills, startOwner = owner;
  /** Ask the simulator about one play of `beatmapId` by the character `asSkills` (cached as `asOwner`):
   *  from the cache, from a call already on its way, or with a new call in its turn. */
  /** One run: a play is random, so each run is asked for and kept on its own (run 0 as before runs existed). */
  /** Diagnostics: the simulator's calls this scan: time spent, the slowest, busy answers retried, failures. */
  const simStats = { ms: 0, slowest: 0, busy: 0, failed: 0, rejected: 0 };
  /** Where a forecast's time goes (for the Suggestions' timing line): exact cache hits, building the index of
   *  stored answers, nearest-answer lookups, new simulator calls. */
  const timing = { exact: 0, official: 0, indexMs: 0, indexBuilds: 0, nearMs: 0, near: 0, calls: 0, reused: 0 };
  const askRun = async (asOwner, asSkills, beatmapId, r, m, bucket, playsKey, run) => {
    const key = `${beatmapId}|${r}|${[...m].sort().join('')}|${bucket}|${playsKey}${run ? `|#${run}` : ''}`;
    const kept = cached(asOwner, key);
    if (kept) { fromCache++; timing.exact++; return { answer: kept, fresh: false }; }
    // the shared sim cache may have this very play (every official simulation, anyone's), asked with the queue's maps
    const sh = await sharedAnswer(asSkills, num(row.generation) || 1, beatmapId, r, m, bucket, playsKey, mapIds);
    if (sh) { fromCache++; timing.official++; remember(asOwner, key, sh); return { answer: sh, fresh: false }; }
    // the official sim add-on may have simulated this very play already
    const off = await officialAnswer(asSkills, num(row.generation) || 1, beatmapId, r, m, bucket, playsKey, run || 0);
    if (off) { fromCache++; timing.official++; remember(asOwner, key, off); return { answer: off, fresh: false }; }
    if (approxOn) {
      if (!approxIndex) { const t0 = performance.now(); approxIndex = answerIndex(num(row.id)); timing.indexMs += performance.now() - t0; timing.indexBuilds++; }
      const t1 = performance.now();
      const near = nearestAnswer(approxIndex, asOwner, beatmapId, r, m, bucket, playsKey, run || 0);
      timing.nearMs += performance.now() - t1; timing.near++;
      if (near) { fromCache++; return { answer: near, fresh: false, approx: true }; }
    }
    const askKey = `${asOwner}|${key}`;
    const fresh = !asks.has(askKey);
    if (fresh) {
      asks.set(askKey, (async () => {
        await callSlot();
        if (runToken !== scanToken) throw new Error('stopped');
        let answer;
        for (let attempt = 0; ; attempt++) {
          const t0 = performance.now();
          try {
            answer = await withTimeout(api.simulate({
              beatmap_id: beatmapId, rate: r, mods: m, generation: num(row.generation) || 1,
              strain_minutes: bucket, map_plays: playsKey, skills: asSkills,
            }), 20000, 'a simulator call');
            const ms = performance.now() - t0;
            simStats.ms += ms;
            simStats.slowest = Math.max(simStats.slowest, ms);
            break;
          } catch (e) {
            if (runToken !== scanToken) throw new Error('stopped');
            if (attempt >= RETRY_WAITS_MS.length || !isTransient(e)) {
              simStats.failed++;
              logProblem('simulate', `map ${beatmapId}: ${e && e.message ? e.message : e}`);
              throw e;
            }
            simStats.busy++;
            logProblem('simulate', `map ${beatmapId}: ${e && e.message ? e.message : e} (retrying)`);
            // busy: this call waits, and every call after it waits too, so the server gets a break
            const pause = RETRY_WAITS_MS[attempt];
            pauseCalls(pause);
            if (ctx.onRetry) ctx.onRetry(attempt + 1, RETRY_WAITS_MS.length, pause);
            const until = Date.now() + pause;
            while (Date.now() < until) { if (runToken !== scanToken) throw new Error('stopped'); await sleep(250); }
          }
        }
        calls++;
        timing.calls++;
        onProgress(progress());
        remember(asOwner, key, answer);
        return answer;
      })());
      // a call that failed for good is asked again next time, not kept as failed
      asks.get(askKey).catch(() => asks.delete(askKey));
    }
    try {
      return { answer: await asks.get(askKey), fresh };
    } catch (e) {
      if (runToken !== scanToken || /stopped/.test(String(e && e.message))) throw e;
      simStats.rejected = (simStats.rejected || 0) + 1;
      if (!approxIndex) approxIndex = answerIndex(num(row.id));
      const near = nearestAnswer(approxIndex, asOwner, beatmapId, r, m, bucket, playsKey, run || 0);
      return { answer: near ? { ...near, rejected: true } : { passed: true, strained_minutes: 0, xp: {}, rejected: true }, fresh: false, approx: true };
    }
  };
  /** Ask the simulator about one play, `runs` times, and average the answers. */
  const runs = Math.min(5, Math.max(1, Math.round(num(ctx.runs)) || 1));
  const ask = async (...args) => {
    const got = await Promise.all(Array.from({ length: runs }, (_, i) => askRun(...args, i)));
    if (got.length === 1) return got[0];
    const answers = got.map(g => g.answer);
    const mean = (vals) => vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const xp = {};
    for (const sk of new Set(answers.flatMap(a => Object.keys(a.xp || {})))) xp[sk] = mean(answers.map(a => num(a.xp && a.xp[sk])));
    const fails = answers.filter(a => a.passed === false);
    const answer = {
      passed: fails.length * 2 <= answers.length,
      strained_minutes: mean(answers.map(a => num(a.strained_minutes))),
      fail_seconds: fails.length ? mean(fails.map(a => num(a.fail_seconds))) : undefined,
      fail_progress: fails.length ? mean(fails.map(a => num(a.fail_progress))) : undefined,
      xp,
      rejected: answers.some(a => a.rejected) || undefined,
    };
    return { answer, fresh: got.some(g => g.fresh), approx: got.some(g => g.approx) };
  };
  /** The simulator's answer for a play of the queue, and how it was got: `fresh` when this call went to the simulator. */
  const simulateWith = async (entry, minutes, mapPlays, exact = false) => {
    const r = allowedRate(entry.lockedRate ?? rate, row);
    const m = entry.lockedRate === undefined ? mods : (entry.lockedMods || []);
    const bucket = Math.min(STRAIN_CAP, strainStep(minutes));
    const playsKey = exact ? Math.max(0, Math.round(mapPlays)) : playStep(mapPlays);
    const { answer, fresh, approx } = await ask(owner, skills, entry.beatmapId, r, m, bucket, playsKey);
    return { answer, fresh, approx, bucket, playsKey };
  };
  const simulate = async (...args) => (await simulateWith(...args)).answer;

  // the XP that levels the character up is the real one: calibrate first, on the character's real plays
  const calib = reuse && reuse.calib ? reuse.calib : await calibrate(row, queue, {
    startMinutes,
    rate,
    // a real play's Tries then: this computer's count then, moved by how far the server's is from it now
    genetics,
    triesOffset: Object.fromEntries(mapIds.map(id => [id, num(memory[id]) - num(memoryLocal[id])])),
    /** One real play as it was played: its rate and mods, the map's Tries then and the levels then. */
    simulateAs: async (beatmapId, r, m, minutes, tries, levelsThen) => {
      const asSkills = Object.fromEntries(SKILLS.map(s => [s, {
        level: levelsThen[s].level, xp: levelsThen[s].xp, lifetime_xp: lv[s].lifetime,
        prestige: num(row[`${s}Prestige`]), upgrades: num(row[`${s}Upgrades`]), overdrive: num(row[`${s}Overdrive`]),
      }]));
      const asOwner = ownerOf({ ...row, ...Object.fromEntries(SKILLS.map(s => [s, levelsThen[s].level])) });
      return (await ask(asOwner, asSkills, beatmapId, r, m, Math.min(STRAIN_CAP, strainStep(minutes)), Math.max(0, Math.round(tries)))).answer;
    },
    stopped: () => runToken !== scanToken,
  });
  // medals from the server; when it can't be reached, each skill's bonus as learned from the real plays
  const medals = reuse && reuse.medals ? reuse.medals : await medalsOf(row);
  const bonusOf = (sk) => (medals.ok ? medals.multiplier : calib.factors[sk] > 0 ? calib.factors[sk] : 1) * genetics[sk].total;
  const gainOf = (answer, sk, block) => num(answer.xp && answer.xp[sk]) * (MINDBLOCK.has(sk) ? block : 1) * bonusOf(sk);
  // mindblock's count: the last 50 plays within a day, then the forecast's own plays
  const nowMs = Date.now();
  // a copy each time: the forecast adds its own plays to it as it goes
  const recent = reuse && reuse.recent ? reuse.recent.slice() : (await playsSince(row, nowMs - DAY_MS)).slice(-RECENT_LIMIT);
  const recentAtStart = recent.slice();
  const recentStart = recent.length;
  const recentByMap = Object.fromEntries(mapIds.map(id => [id, recent.filter(x => x.id === id).length]));

  let fatigue = { at: 0, minutes: startMinutes };
  let t = 0;
  const playsOf = { ...memory };
  const endSec = hours * 3600;
  let loopFrom = first.length === loop.length ? { plays: 0, t: 0, minutes: startMinutes } : undefined;
  let loopSec = 0, loopDrift = 0;
  // ctx.prior: the forecast this one is a change of ({ plays, entries }). While its plays are of the same maps (same
  // rate, mods, length) from the same strain, their answers are taken as they were instead of asked for again; from
  // the first play that differs, everything is asked for as usual
  const prior = ctx.prior && Array.isArray(ctx.prior.plays) && Array.isArray(ctx.prior.entries) ? ctx.prior : null;
  let reusing = !!prior;
  const sameEntry = (a, b) => a && b && a.beatmapId === b.beatmapId && (a.lockedRate ?? rate) === (b.lockedRate ?? rate) && num(a.lengthSec) === num(b.lengthSec)
    && (a.lockedRate === undefined ? mods : (a.lockedMods || [])).join(',') === (b.lockedRate === undefined ? mods : (b.lockedMods || [])).join(',');
  for (let i = 0; t < endSec && plays.length < MAX_PLAYS; i++) {
    if (token !== scanToken) throw new Error('stopped');
    await breathe();
    const at = i < first.length ? first[i] : loop[(i - first.length) % loop.length];
    const entry = queue.entries[at];
    const before = restedFatigue(fatigue, t * 1000, genes, gear);
    const tries = playsOf[entry.beatmapId] || 0;
    let got = null;
    if (reusing) {
      const pp = prior.plays[i];
      if (pp && pp.ans && sameEntry(prior.entries[pp.entry], entry) && Math.abs(num(pp.before) - before) < 1e-9 && Math.abs(num(pp.tries) - tries) < 1e-9) { got = { answer: pp.ans, fresh: false, approx: pp.approx, bucket: pp.simStrain, playsKey: pp.simTries }; timing.reused++; fromCache++; }
      else reusing = false;
    }
    const { answer, fresh, approx, bucket, playsKey } = got || await simulateWith(entry, before, tries);
    const recentPlays = recentPlaysOf(recent, entry.beatmapId, nowMs + t * 1000);
    const block = mindblockFactor(recentPlays);
    const r = entry.lockedRate ?? rate;
    let lengthSec = entry.lengthSec;
    if (!(lengthSec > 0)) lengthSec = 120;
    const fullSec = lengthSec / r;
    const passed = answer.passed !== false;
    const durationSec = LEAD_IN_MS / 1000 + (passed ? fullSec : (answer.fail_seconds ?? fullSec));
    const strained = num(answer.strained_minutes);
    const start = t;
    t += durationSec;
    // a failed play still tires the character for the map's full length
    fatigue = afterPlay(fatigue, fullSec / 60, strained, t * 1000, genes, gear);
    const bar = barOf(fatigue.minutes, knots);
    playsOf[entry.beatmapId] = (playsOf[entry.beatmapId] || 0) + (passed ? 1 : num(answer.fail_progress) || 0.5);
    const ups = [];
    for (const sk of SKILLS) {
      const gain = gainOf(answer, sk, block);
      if (!(gain > 0)) continue;
      const g = gainLevels(lv[sk].level, lv[sk].xp, gain);
      if (g.level > lv[sk].level) ups.push({ skill: sk, level: g.level });
      lv[sk] = { level: g.level, xp: g.xp, lifetime: lv[sk].lifetime + gain };
    }
    skills = skillsOf();
    if (ups.length) owner = ownerNow();
    recent.push({ at: nowMs + start * 1000, id: entry.beatmapId });
    if (recent.length > RECENT_LIMIT * 2) recent.splice(0, recent.length - RECENT_LIMIT);
    plays.push({ entry: at, start, end: t, before, tries, fresh, approx: !!approx, ups, recentPlays, block, simStrain: bucket, simTries: playsKey, failAt: passed ? undefined : num(answer.fail_progress), ans: answer, xp: answer.xp || {}, strained, lengthMin: fullSec / 60, minutes: fatigue.minutes, bar, trend: warmupTrend(fullSec / 60, strained), passed });
    samples.push({ t, minutes: fatigue.minutes, bar });
    onProgress(progress());
    t += delaySec;
    if (!loopFrom && plays.length === first.length) {
      loopFrom = { plays: plays.length, t, minutes: restedFatigue(fatigue, t * 1000, genes, gear) };
    } else if (loopFrom && !loopSec && plays.length === loopFrom.plays + loop.length) {
      loopSec = t - loopFrom.t;
      loopDrift = restedFatigue(fatigue, t * 1000, genes, gear) - loopFrom.minutes;
    }
  }
  saveCache();
  skills = startSkills;
  owner = startOwner;
  return {
    timing: { ...timing, simMs: simStats.ms },
    recentPlays: recentAtStart,
    plays, samples, knots, loopSec, loopDrift, loopPlays: loop.length, loopStart: loopFrom ? loopFrom.plays : 0, memory, memoryLocal, triesFrom, calib, medals, genetics, recentStart, recentByMap, simStats, runs,
    simulate, counts: () => ({ calls, fromCache }), useToken: (t) => { runToken = t; },
    /** A quick update keeps borrowing stored answers through the Speed Jam / Memory curves, then stops. */
    setApprox: (on) => { approxOn = on; },
  };
}
