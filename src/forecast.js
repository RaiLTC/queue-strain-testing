// The forecast: simulating the queue play by play, the cache, calibration and the local estimate.

import { SETTINGS } from './config.js';
import { MINDBLOCK, RECENT_LIMIT, SKILLS, gameRows, logProblem, medalsOf, memoryPlays, mindblockFactor, num, playsSince, recentPlaysOf, serverTries } from './game.js';
import { LEAD_IN_MS, STRAIN_CAP, afterPlay, barKnots, barOf, gainLevels, restedFatigue, warmupTrend, xpForLevel } from './rules/fatigue.js';
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

// The simulator's answers, kept across scans and restarts. An answer belongs to the character as it
// was: its generation and every skill's whole level, prestige and upgrades. When any of those change
// the answers stop counting, and none counts past a day.
export const CACHE_KEY = 'queue-strain:sim';
export const CACHE_TTL_MS = 24 * 3600 * 1000;
export const CACHE_MAX = 4000;
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
export const saveCache = () => {
  if (!simCache || !cacheDirty) return;
  // the newest first, up to the cap
  const entries = [...simCache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  simCache = new Map(entries);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: Object.fromEntries(entries) })); } catch (_) {}
  cacheDirty = false;
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
  loadCache().set(`${owner}|${key}`, { at: Date.now(), answer: kept });
  cacheDirty = true;
};

/** Maps that give any Speed Jam or Memory XP: their next `count` plays, one at a time, at the strain
 *  the forecast first plays them at. Memory XP rises while a map is learned and fades once it is known,
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
    for (let k = 0; k < count; k++) {
      if (token !== scanToken) throw new Error('stopped');
      const answer = await r.simulate(entry, p.before, start + k, true);
      onProgress();
      const xp = answer.xp || {};
      rows.push({ play: start + k + 1, speedjam: num(xp.speedjam), memory: num(xp.memory) });
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
      const answer = await simulateAs(id, r, m, startMinutes, tries, levelsThen);
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

/** The local estimate's plays: each queue map's newest real plays at the rate the queue plays it (SETTINGS.localPlays),
 *  as { beatmapId, rate, playedAt, real }. Read from the game's database alone: no simulator call. */
export async function localPlaysOf(row, queue, rate, count = SETTINGS.localPlays) {
  const since = 0;
  const out = [];
  for (const entry of queue.entries.filter((e, i, all) => all.findIndex(x => x.beatmapId === e.beatmapId) === i)) {
    let rows = null;
    try {
      rows = await gameRows('SELECT x.playedAt AS playedAt, x.gains AS gains, s.rate AS rate, s.mods AS mods FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? AND x.beatmapId = ? AND x.playedAt >= ? ORDER BY x.playedAt DESC LIMIT ?', [row.id, entry.beatmapId, since, 5000]);
    } catch (_) { rows = null; }
    const queueRate = entry.lockedRate ?? rate;
    for (const x of (rows || []).filter(v => Math.abs((num(v.rate) || 1) - queueRate) < 0.001).slice(0, count)) {
      out.push({ beatmapId: entry.beatmapId, rate: num(x.rate) || 1, playedAt: num(x.playedAt), real: parseGains(x.gains) });
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
  // Tries: the server's when it answers, else counted from this computer's plays as the game does for guests
  const memoryLocal = await memoryPlays(row, mapIds);
  const fromServer = await serverTries(row, mapIds);
  const memory = {}, triesFrom = {};
  for (const id of mapIds) {
    const server = fromServer ? fromServer[id] : undefined;
    memory[id] = server ?? memoryLocal[id];
    triesFrom[id] = server !== undefined ? 'server' : 'local';
  }
  /** The run this simulator works for: a scan, or later a new Memory plays count. Its calls stop with it. */
  let runToken = token;
  const asks = new Map();
  let calls = 0, nextCall = 0, fromCache = 0;
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
  const simStats = { ms: 0, slowest: 0, busy: 0, failed: 0 };
  const askRun = async (asOwner, asSkills, beatmapId, r, m, bucket, playsKey, run) => {
    const key = `${beatmapId}|${r}|${[...m].sort().join('')}|${bucket}|${playsKey}${run ? `|#${run}` : ''}`;
    const kept = cached(asOwner, key);
    if (kept) { fromCache++; return { answer: kept, fresh: false }; }
    const askKey = `${asOwner}|${key}`;
    const fresh = !asks.has(askKey);
    if (fresh) {
      asks.set(askKey, (async () => {
        const wait = Math.max(0, nextCall - Date.now());
        nextCall = Date.now() + wait + CALL_SPACING_MS;
        if (wait) await sleep(wait);
        if (runToken !== scanToken) throw new Error('stopped');
        let answer;
        for (let attempt = 0; ; attempt++) {
          const t0 = performance.now();
          try {
            answer = await api.simulate({
              beatmap_id: beatmapId, rate: r, mods: m, generation: num(row.generation) || 1,
              strain_minutes: bucket, map_plays: playsKey, skills: asSkills,
            });
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
            nextCall = Math.max(nextCall, Date.now() + pause + CALL_SPACING_MS);
            if (ctx.onRetry) ctx.onRetry(attempt + 1, RETRY_WAITS_MS.length, pause);
            const until = Date.now() + pause;
            while (Date.now() < until) { if (runToken !== scanToken) throw new Error('stopped'); await sleep(250); }
          }
        }
        onProgress(++calls);
        remember(asOwner, key, answer);
        return answer;
      })());
      // a call that failed for good is asked again next time, not kept as failed
      asks.get(askKey).catch(() => asks.delete(askKey));
    }
    return { answer: await asks.get(askKey), fresh };
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
    };
    return { answer, fresh: got.some(g => g.fresh) };
  };
  /** The simulator's answer for a play of the queue, and how it was got: `fresh` when this call went to the simulator. */
  const simulateWith = async (entry, minutes, mapPlays, exact = false) => {
    const r = entry.lockedRate ?? rate;
    const m = entry.lockedRate === undefined ? mods : (entry.lockedMods || []);
    const bucket = Math.min(STRAIN_CAP, strainStep(minutes));
    const playsKey = exact ? Math.max(0, Math.round(mapPlays)) : playStep(mapPlays);
    const { answer, fresh } = await ask(owner, skills, entry.beatmapId, r, m, bucket, playsKey);
    return { answer, fresh, bucket, playsKey };
  };
  const simulate = async (...args) => (await simulateWith(...args)).answer;

  // the XP that levels the character up is the real one: calibrate first, on the character's real plays
  const calib = await calibrate(row, queue, {
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
  const medals = await medalsOf(row);
  const bonusOf = (sk) => (medals.ok ? medals.multiplier : calib.factors[sk] > 0 ? calib.factors[sk] : 1) * genetics[sk].total;
  const gainOf = (answer, sk, block) => num(answer.xp && answer.xp[sk]) * (MINDBLOCK.has(sk) ? block : 1) * bonusOf(sk);
  // mindblock's count: the last 50 plays within a day, then the forecast's own plays
  const nowMs = Date.now();
  const recent = (await playsSince(row, nowMs - DAY_MS)).slice(-RECENT_LIMIT);
  const recentStart = recent.length;
  const recentByMap = Object.fromEntries(mapIds.map(id => [id, recent.filter(x => x.id === id).length]));

  let fatigue = { at: 0, minutes: startMinutes };
  let t = 0;
  const playsOf = { ...memory };
  const endSec = hours * 3600;
  let loopFrom = first.length === loop.length ? { plays: 0, t: 0, minutes: startMinutes } : undefined;
  let loopSec = 0, loopDrift = 0;
  for (let i = 0; t < endSec && plays.length < MAX_PLAYS; i++) {
    if (token !== scanToken) throw new Error('stopped');
    const at = i < first.length ? first[i] : loop[(i - first.length) % loop.length];
    const entry = queue.entries[at];
    const before = restedFatigue(fatigue, t * 1000, genes, gear);
    const tries = playsOf[entry.beatmapId] || 0;
    const { answer, fresh, bucket, playsKey } = await simulateWith(entry, before, tries);
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
    plays.push({ entry: at, start, end: t, before, tries, fresh, ups, recentPlays, block, simStrain: bucket, simTries: playsKey, failAt: passed ? undefined : num(answer.fail_progress), xp: answer.xp || {}, strained, lengthMin: fullSec / 60, minutes: fatigue.minutes, bar, trend: warmupTrend(fullSec / 60, strained), passed });
    samples.push({ t, minutes: fatigue.minutes, bar });
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
    plays, samples, knots, loopSec, loopDrift, loopPlays: loop.length, loopStart: loopFrom ? loopFrom.plays : 0, memory, memoryLocal, triesFrom, calib, medals, genetics, recentStart, recentByMap, simStats, runs,
    simulate, counts: () => ({ calls, fromCache }), useToken: (t) => { runToken = t; },
  };
}
