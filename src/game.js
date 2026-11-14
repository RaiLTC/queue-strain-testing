// Reading the game: its database, the queue in the dock, and the server (medals, genetics, Tries, mindblock).

import { PHYSICAL, cubicBezier, lerp } from './rules/fatigue.js';
import { DAY_MS, asGenetics, recall } from './rules/genes.js';

// =====================================================================
// 3. READING THE GAME
// =====================================================================
export const SKILLS = ['accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release', 'reading', 'consistency', 'concentration', 'speedjam', 'memory'];
export const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);

// ---- the speeds a character may play at (shared rate.ts): a 0.05 step each way per Speed upgrade, plus one per
// Speed prestige (kept for good), within 0.5-1.5. The game holds a queue's speed to these: snapped to 0.05, clamped ----
const r2 = (v) => Math.round(v * 100) / 100;
export const rateUnlocks = (row) => Math.max(0, num(row && row.speedUpgrades) + num(row && row.speedPrestige));
export const rateRange = (row) => { const u = rateUnlocks(row) * 0.05; return { lo: r2(Math.max(0.5, 1 - u)), hi: r2(Math.min(1.5, 1 + u)) }; };
export const allowedRate = (rate, row) => { const { lo, hi } = rateRange(row); return r2(Math.min(hi, Math.max(lo, Math.round(num(rate || 1) / 0.05) * 0.05))); };
export const rateAllowed = (rate, row) => Math.abs(allowedRate(rate, row) - num(rate || 1)) < 1e-6;
export const rateSteps = (row) => { const { lo, hi } = rateRange(row), out = []; for (let x = Math.round(lo * 20); x <= Math.round(hi * 20); x++) out.push(r2(x / 20)); return out; };

// ---- performance: what the add-on did and how long it took (Copy Diagnostics), and what it's waiting for ----
/** The last 300 events: scans, Suggestions steps, the library, waits, timeouts, stalls, frames the game lost. */
export const perfLog = [];
const perfStart = Date.now();
export const logPerf = (kind, text) => {
  perfLog.push(`+${((Date.now() - perfStart) / 1000).toFixed(1)}s ${kind}: ${text}`);
  if (perfLog.length > 300) perfLog.splice(0, perfLog.length - 300);
};
/** What the add-on is waiting for right now (shown while it runs): a reason and until when. */
export const waiting = { what: '', until: 0 };
export const setWaiting = (what, until) => { if (!waiting.what || waiting.what !== what) logPerf('wait', `${what} (${Math.max(0, Math.round((until - Date.now()) / 1000))}s)`); waiting.what = what; waiting.until = until; };
export const clearWaiting = (what) => { if (!what || waiting.what === what) { waiting.what = ''; waiting.until = 0; } };
export const waitingText = () => (waiting.what && waiting.until > Date.now() ? `Waiting: ${waiting.what}, ${Math.ceil((waiting.until - Date.now()) / 1000)}s` : '');
/** `p`, or an error ("timed out") after `ms`: a request that never answers can't hold everything up. */
export const withTimeout = (p, ms, what) => {
  let timer;
  return Promise.race([p, new Promise((_, no) => { timer = setTimeout(() => { logPerf('timeout', `${what} after ${ms / 1000}s`); no(new Error(`${what} timed out`)); }, ms); })]).finally(() => clearTimeout(timer));
};
/** fetch, given up after `ms`. */
export const fetchT = (url, opts = {}, ms = 15000) => {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { logPerf('timeout', `${String(url).replace(/^https?:\/\//, '').split('?')[0]} after ${ms / 1000}s`); ac.abort(); }, ms) : 0;
  return fetch(url, ac ? { ...opts, signal: ac.signal } : opts).finally(() => clearTimeout(timer));
};
/** Frames the game lost while something ran: long tasks (50ms+) from now until the returned stop() is called. */
export const watchFrames = () => {
  const lt = [];
  let po = null;
  try { po = new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(e.duration); }); po.observe({ entryTypes: ['longtask'] }); } catch (_) { po = null; }
  return () => { try { if (po) po.disconnect(); } catch (_) {} return po ? `${lt.length} long tasks, longest ${Math.round(Math.max(0, ...lt))}ms, ${Math.round(lt.reduce((a, b) => a + b, 0))}ms in all` : 'long tasks not measured'; };
};

export async function gameRows(sql, params = []) {
  const db = window.db;
  if (!db || !db.read) return null;
  const result = await db.read(d => d.exec(sql, params));
  const first = result[0];
  if (!first) return [];
  return first.values.map(row => Object.fromEntries(first.columns.map((c, i) => [c, row[i]])));
}

// ---------------------------------------------------------------------
// The server's XP rules, as the official oss!idle sim (github.com/oss-idle/addon-sim) applies them.
// The simulator's XP already has fatigue, mods and each skill's upgrades, overdrive and prestige in it.
// The server then takes mindblock off it and multiplies it by the medals held.
// ---------------------------------------------------------------------
/** Mindblock (the server's mindblock.ts, as the official sim mirrors it): a map's plays among the
 *  character's last 50 within 24 hours cut the XP of every skill but the physical ones and Memory. */
export const RECENT_LIMIT = 50;
export const FULL_BLOCK_PLAYS = 25;
export const MIN_BLOCK = 0.25;
export const BLOCK_CB = cubicBezier(0.6, 0, 0.6, 1);
export const mindblockFactor = (recentPlays) => lerp(1, MIN_BLOCK, BLOCK_CB(Math.min(1, recentPlays / FULL_BLOCK_PLAYS)));
export const MINDBLOCK = new Set(SKILLS.filter(s => !PHYSICAL.includes(s) && s !== 'memory'));
/** How many of `window` (plays as { at, id }, oldest first) are map `id`, among the last 50 within 24h before `at`. */
export const recentPlaysOf = (window, id, at) => window.filter(p => p.at < at && p.at >= at - DAY_MS).slice(-RECENT_LIMIT).filter(p => p.id === id).length;

/** Medals (achievements/catalogue.ts, rulesets/mania/4k/medals.ts): each one held multiplies all XP by its tier's bonus. */
export const MEDAL_BONUS = { bronze: 0.0025, silver: 0.005, gold: 0.01, platinum: 0.02, divine: 0.03 };
export const STAR_TIERS = ['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum', 'platinum', 'divine', 'divine'];
export const MEDAL_TIER = Object.fromEntries([
  ...STAR_TIERS.map((t, i) => [`pass-${i + 1}`, t]),
  ...STAR_TIERS.map((t, i) => [`fc-${i + 1}`, t]),
  ...SKILLS.flatMap(sk => [[`${sk}-50`, 'silver'], [`${sk}-100`, 'gold'], [`${sk}-105`, 'platinum'], [`${sk}-110`, 'divine']]),
  ...Object.entries({
    bronze: 'plays-100 hits-100k time-10h friends-1 overall-25 upgrades-1 genes-1 top-75 play-pp-50 play-pp-100 curator-1 mapper-1 mapper-2',
    silver: 'grade-ss plays-1k hits-1m time-100h friends-5 overall-50 upgrades-10 ladders-1 overdrive-2 prestige-1 genes-25 maxed-1 climaxx-500 first-1 pp-1k top-50 play-pp-200 curator-5 mapper-5 combo-727 same-map-100 fail-99 fail-10s night-owl first-chat possessed parallax wonderful against-nature identity-crisis buyers-remorse',
    gold: 'grade-x rice ln plays-5k hits-10m time-1000h friends-25 overall-75 overall-100 upgrades-50 ladders-5 overdrive-10 prestige-5 genes-50 maxed-5 climaxx-2k first-10 pp-5k top-25 play-pp-500 curator-25 mapper-10',
    platinum: 'plays-25k hits-50m time-10000h friends-100 overall-105 upgrades-100 ladders-10 overdrive-100 prestige-25 genes-100 maxed-15 climaxx-5k half-tree twin-genes first-100 pp-10k top-10 play-pp-750 curator-100 mapper-50',
    divine: 'grade-xx plays-100k hits-1b time-25000h friends-1k overall-110 ladders-11 overdrive-1000 prestige-100 rebirth genes-150 climaxx-10k triple-helix genome first-1000 pp-20k top-1 play-pp-1k mapper-100',
  }).flatMap(([tier, ids]) => ids.split(' ').map(id => [id, tier])),
]);
export const API_URL = 'https://api.oss.idle.rhythmgamers.net';
let catalogNames = null;
/** Every map's name by its id ("Artist - Title [Version]"), from the game's beatmap catalog. Loaded once. */
export async function mapNames() {
  if (catalogNames) return catalogNames;
  const out = {};
  try {
    const res = await fetchT(`${API_URL}/v1/beatmap/catalog`, {}, 30000);
    if (res.ok) {
      const walk = (v) => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (Array.isArray(v.versions) && v.title) for (const d of v.versions) if (d && d.id) { out[d.id] = `${v.artist ? `${v.artist} - ` : ''}${v.title}${d.version ? ` [${d.version}]` : ''}`; catalogLen[d.id] = num(d.total_length) / 1000; catalogStars[d.id] = num(d.difficulty); catalogInfo[d.id] = { keys: num(d.keys), mode: num(d.mode), objects: num(d.objects), ln: num(d.ln), bpm: num(d.bpm) }; }
        for (const k in v) if (k !== 'versions') walk(v[k]);
      };
      walk(await res.json());
      catalogNames = out;
    } else logProblem('catalog', `server answered ${res.status}`);
  } catch (e) { logProblem('catalog', e); }
  return out;
}
/** Each map's length in seconds at 1×, from the same catalog. */
const catalogLen = {};
/** And its star rating. */
const catalogStars = {};
/** And its keys, mode, note and long-note counts and BPM. */
const catalogInfo = {};
// ---------------------------------------------------------------------
// A proven ceiling on a map's XP, without simulating it: the game's own XP formula (shared
// rulesets/mania/4k/bots/character.ts factorXP, oss-idle v1.4.3.0) with every factor at its largest.
// raw = mapXP(share x levelF x scoreF x notesF x lengthF x 1000), then x the skill's multiplier, + the first
// clear bonus (accuracy), x HR's 1.1 (accuracy). scoreF <= 1.5; mapXP(v) <= 2.001 v (its curve overshoots 1 by
// about 0.0002); notesF rises with the note count, so the chart's full count bounds it; release can't win a
// slot without long notes; consistency is capped at 0.33 of the pressure. Memory has no useful bound.
// ---------------------------------------------------------------------
const CB_LEVEL = cubicBezier(0, 0.8, 0.4, 1), CB_NOTES = cubicBezier(0.62, 0.16, 0.5, 0.83), CB_LENGTH = cubicBezier(0.2, 0, 0.75, 0);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const norm = (n, a, b) => (b > a ? clamp01((Math.max(a, Math.min(b, n)) - a) / (b - a)) : (n >= b ? 1 : 0));
const tr = (n, a, b, c, d) => c + norm(n, a, b) * (d - c);
const NOTES_KIND = { accuracy: 'high', concentration: 'high', release: 'high', stamina: 'high', coordination: 'high', speed: 'medium', speedjam: 'medium', consistency: 'medium' };
const notesFactor = (skill, L, notes) => {
  const kind = NOTES_KIND[skill] || 'low';
  const [a, b] = kind === 'high' ? [tr(L, 0, 70, 0, 400), tr(L, 20, 100, 800, 1800)] : kind === 'medium' ? [tr(L, 0, 70, 0, 200), tr(L, 0, 100, 300, 1200)] : [tr(L, 0, 70, 0, 20), tr(L, 0, 100, 50, 700)];
  return CB_NOTES(norm(notes, a, b));
};
const levelFactor = (L) => 1 + (1 - CB_LEVEL(clamp01(L / 40))) * 2;
const lengthFactor = (ms) => 1 + CB_LENGTH(clamp01((ms - 120000) / 180000)) * 2;
const skillMultiplier = (row, sk) => { const od = num(row[`${sk}Overdrive`]), odM = od <= 0 ? 1 : Math.max(1, Math.min(od, 2.5 * Math.pow(od, Math.log10(2)))); return (1 + 0.1 * num(row[`${sk}Upgrades`]) * odM) * Math.pow(1.1, num(row[`${sk}Prestige`])); };
/** The most XP a play of map `id` at `rate` can give `skill` (simulator units), or Infinity when it can't be bounded. */
export const xpCeiling = (row, id, rate, skill, mods = [], everPlayed = true) => {
  // memory only pays on a map you've played (its progress is 0 at 0 plays); past that it can't be bounded
  if (skill === 'memory') return everPlayed ? Infinity : 0;
  const info = catalogInfo[id], len = catalogLen[id];
  if (!info || !len || !info.objects) return Infinity;
  const notes = info.objects + num(info.ln), L = num(row[skill]);
  const share = skill === 'release' ? (num(info.ln) > 0 ? 1 : 0) : skill === 'consistency' ? 0.33 : 1;
  if (!share) return 0;
  const v = share * levelFactor(L) * 1.5 * notesFactor(skill, L, notes) * lengthFactor(len * 1000 / rate) * 1000;
  let xp = 2.001 * v * skillMultiplier(row, skill);
  if (skill === 'accuracy') { xp += Math.floor(1000 * num(catalogStars[id]) * rate * 1.5); if ((mods || []).includes('HR')) xp *= 1.1; }
  return xp;
};
const PHYSICAL_GOALS = new Set(['speed', 'stamina', 'jackspeed', 'coordination', 'all']);
/** Maps from the whole library worth simulating for `goal`: every 4K map in the game's catalog (the server's, so
 *  current), without the ones in the queue, the ones harder than you've passed
 *  lately, and the ones that can't give the goal skill anything at all; ranked for the goal, the best `limit`. */
/** Every 4K map in the catalog: id, name, stars and length (seconds at 1x). */
export const catalogEntries = async () => {
  const names = await mapNames();
  return Object.keys(catalogInfo).map(Number).filter(id => catalogInfo[id].mode === 3 && catalogInfo[id].keys === 4 && catalogLen[id] > 0)
    .map(id => ({ id, title: names[id] || `Map ${id}`, stars: num(catalogStars[id]), lengthSec: catalogLen[id] }));
};
/** The last library pick: maps considered, and how many were ruled out by their proven ceiling. */
export const libraryStats = { considered: 0, provenOut: 0, bar: 0, broken: 0 };
export async function libraryMaps(row, skipIds, { goal = 'all', rate = 1, mods = [], limit = 12, known = new Map() } = {}) {
  const names = await mapNames();
  const skip = new Set(skipIds.map(Number));
  // the hardest map you've passed in the last 30 days, at about the rate you'd play these
  let hardest = 0;
  try {
    const rows = (await gameRows('SELECT beatmapId, rate FROM score WHERE characterId = ? AND playedAt >= ?', [row.id, Date.now() - 30 * DAY_MS])) || [];
    for (const x of rows) hardest = Math.max(hardest, num(catalogStars[num(x.beatmapId)]) * (num(x.rate) || 1));
  } catch (_) {}
  const cap = hardest > 0 ? hardest * 1.05 : Infinity;
  // your real fails lately, per map: a map you often fail is worth less than its XP says
  const failsOf = new Map(), playsOf = new Map();
  try {
    for (const x of (await gameRows('SELECT beatmapId, share FROM memory_fail WHERE characterId = ? AND playedAt >= ?', [row.id, Date.now() - 30 * DAY_MS])) || []) failsOf.set(num(x.beatmapId), (failsOf.get(num(x.beatmapId)) || 0) + 1);
    for (const x of (await gameRows('SELECT beatmapId FROM score WHERE characterId = ? AND playedAt >= ?', [row.id, Date.now() - 30 * DAY_MS])) || []) playsOf.set(num(x.beatmapId), (playsOf.get(num(x.beatmapId)) || 0) + 1);
  } catch (_) {}
  const goalXp = (xp) => (goal === 'all' ? Object.values(xp).reduce((t, v) => t + num(v), 0) : num(xp[goal]));
  const ids = Object.keys(catalogInfo).map(Number).filter(id => catalogInfo[id].mode === 3 && catalogInfo[id].keys === 4);
  const scored = [];
  for (const id of ids) {
    if (skip.has(id) || !catalogLen[id] || !names[id]) continue;
    const info = catalogInfo[id] || {};
    const stars = num(catalogStars[id]) * rate;
    if (!(stars > 0) || stars > cap) continue;
    const lnShare = info.objects ? num(info.ln) / info.objects : 0;
    // a skill that can't win a single note on this chart: release needs long notes
    if (goal === 'release' && !(lnShare > 0)) continue;
    const minutes = catalogLen[id] / rate / 60;
    // notes a second at this rate: the main pressure on speed and stamina
    const nps = info.objects ? info.objects / Math.max(1, catalogLen[id] / rate) : 0;
    // how promising, for the goal: physical skills want hard charts, accuracy long ones, release LN-heavy ones
    const nearTop = cap < Infinity ? stars / cap : stars / 10;
    const guess = goal === 'accuracy' ? minutes * (0.5 + nearTop) / Math.sqrt(1 + nps / 10)
      : goal === 'release' ? lnShare * nearTop * Math.sqrt(minutes)
      : PHYSICAL_GOALS.has(goal) ? nearTop * nearTop * Math.sqrt(minutes) * (1 + nps / 20)
      : nearTop * Math.sqrt(minutes);
    // what the simulator already said about it at your levels, when it has: real XP a minute and fails
    const k = known.get(`${id}@${rate}`);
    const real = k && k.n ? goalXp(k.xp) / k.n / Math.max(0.1, minutes) : undefined;
    const realFails = (failsOf.get(id) || 0) / Math.max(1, (failsOf.get(id) || 0) + (playsOf.get(id) || 0));
    const failShare = Math.max(k && k.n ? k.fails / k.n : 0, realFails);
    scored.push({ id, guess, real, failShare, stars });
  }
  // the guesses put on the real answers' scale: the typical real XP a minute per unit of guess, from the maps that have both
  const ratios = scored.filter(m => m.real > 0 && m.guess > 0).map(m => m.real / m.guess).sort((a, b) => a - b);
  const toReal = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  for (const m of scored) m.score = (m.real ?? m.guess * toReal) * (1 - m.failShare);
  // proven pruning: a map whose ceiling (most XP a minute it could ever give the goal) is under the best XP a minute
  // a map has really given (simulated at your levels) can't win, so it isn't simulated at all
  const ceilOf = (m) => { const minutes = Math.max(0.1, catalogLen[m.id] / rate / 60); const sk = goal === 'all' ? SKILLS : [goal]; return sk.reduce((t, s) => t + xpCeiling(row, m.id, rate, s, mods, everPlayed.has(m.id)), 0) / minutes; };
  const bar = Math.max(0, ...scored.filter(m => m.real > 0).map(m => m.real));
  const everPlayed = new Set();
  try { for (const x of (await gameRows('SELECT DISTINCT beatmapId FROM score WHERE characterId = ?', [row.id])) || []) everPlayed.add(num(x.beatmapId)); } catch (_) { for (const m of scored) everPlayed.add(m.id); }
  let provenOut = 0;
  const survivors = scored.filter(m => { if (m.real !== undefined) return true; const c = ceilOf(m); if (c <= bar) { provenOut++; return false; } return true; });
  // the check that the ceilings hold: no map simulated at your levels may have beaten its own ceiling
  libraryStats.broken = scored.filter(m => m.real > 0 && m.real > ceilOf(m) * 1.0001).length;
  libraryStats.provenOut = provenOut; libraryStats.considered = scored.length; libraryStats.bar = bar;
  scored.length = 0; scored.push(...survivors);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(m => ({
    beatmapId: m.id, title: names[m.id], lockedRate: rate, lockedMods: mods, repeat: 1, played: 0, lengthSec: catalogLen[m.id],
    history: { perMin: m.real || 0, plays: 0, stars: m.stars / rate, library: true, fails: m.failShare, known: m.real !== undefined },
  }));
}
/** Maps from the player's own recent history (the last `days`) that aren't in the queue, as queue entries ready
 *  to forecast: played at the rate and mods last used on them, ranked by the real XP a minute they earned then
 *  (from the game's XP log, no simulator call). The best `top` of them. */
export async function historyMaps(row, skipIds, { days = 7, top = 5, easy = 0 } = {}) {
  const names = await mapNames();
  const skip = new Set(skipIds.map(Number));
  let rows = [];
  try {
    rows = (await gameRows('SELECT x.beatmapId AS id, x.gains AS gains, s.rate AS rate, s.mods AS mods FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? AND x.playedAt >= ? ORDER BY x.playedAt DESC', [row.id, Date.now() - days * DAY_MS])) || [];
  } catch (e) { logProblem('history', e); }
  const byMap = new Map();
  for (const x of rows) {
    const id = num(x.id);
    if (!id || skip.has(id) || !catalogLen[id]) continue;
    let xp = 0;
    try { const g = JSON.parse(x.gains || '{}'); for (const v of Object.values(g || {})) xp += num(v); } catch (_) {}
    const m = byMap.get(id) || { id, rate: num(x.rate) || 1, mods: x.mods, xp: 0, n: 0 };
    // the newest play sets the rate and mods; the plays at that rate and mods make the average
    if ((num(x.rate) || 1) === m.rate && String(x.mods || '') === String(m.mods || '')) { m.xp += xp; m.n++; }
    byMap.set(id, m);
  }
  const all = [...byMap.values()].filter(m => m.n > 0 && m.xp > 0).map(m => {
    const lengthSec = catalogLen[m.id];
    const perMin = (m.xp / m.n) / Math.max(0.1, lengthSec / m.rate / 60);
    const mods = (Array.isArray(m.mods) ? m.mods : String(m.mods || '').split(',')).map(v => String(v).trim()).filter(Boolean);
    return { beatmapId: m.id, title: names[m.id] || `Map ${m.id}`, lockedRate: m.rate, lockedMods: mods, repeat: 1, played: 0, lengthSec, history: { perMin, plays: m.n, stars: catalogStars[m.id] || 0 } };
  });
  // the best by XP a minute, and (to cool down after a push) the easiest by star rating
  const best = [...all].sort((a, b) => b.history.perMin - a.history.perMin).slice(0, top);
  const cool = all.filter(e => !best.includes(e) && e.history.stars > 0).sort((a, b) => a.history.stars - b.history.stars).slice(0, easy).map(e => ({ ...e, history: { ...e.history, easy: true } }));
  return [...best, ...cool];
}

/** Writes `entries` (queue entries: beatmapId, lockedRate, lockedMods, repeat) into the character's playlist `name`,
 *  replacing what it held; created when missing, unless `mustExist` (overriding the current playlist). The way the
 *  official sim writes its playlists: one database write for the lot. Returns whether it was created. */
export async function writePlaylist(row, name, entries, { mustExist = false } = {}) {
  const SUGGESTED_PLAYLIST = String(name || '').trim();
  if (!SUGGESTED_PLAYLIST) throw new Error('Give the playlist a name.');
  const db = window.db;
  if (!db || !db.write) throw new Error('The game has not opened its database yet.');
  const hasChar = num((await gameRows("SELECT COUNT(*) AS n FROM pragma_table_info('playlist') WHERE name = 'characterId'"))?.[0]?.n) > 0;
  const findId = async () => { const r = await gameRows(hasChar ? 'SELECT id FROM playlist WHERE name = ? AND characterId = ? ORDER BY id LIMIT 1' : 'SELECT id FROM playlist WHERE name = ? ORDER BY id LIMIT 1', hasChar ? [SUGGESTED_PLAYLIST, row.id] : [SUGGESTED_PLAYLIST]); return r && r[0] ? num(r[0].id) : undefined; };
  let id = await findId();
  const created = id === undefined;
  if (created && mustExist) throw new Error(`No saved playlist named "${SUGGESTED_PLAYLIST}" to override.`);
  if (created) {
    await db.write(d => { d.exec(hasChar ? 'INSERT INTO playlist (name, createdAt, characterId) VALUES (?, ?, ?)' : 'INSERT INTO playlist (name, createdAt) VALUES (?, ?)', hasChar ? [SUGGESTED_PLAYLIST, Date.now(), row.id] : [SUGGESTED_PLAYLIST, Date.now()]); });
    id = await findId();
    if (id === undefined) throw new Error('Could not create the playlist.');
  }
  const order = ['EZ', 'NF', 'HR', 'SD', 'PF'];
  await db.write(d => {
    d.exec('DELETE FROM playlist_entry WHERE playlistId = ?', [id]);
    entries.forEach((e, i) => d.exec('INSERT INTO playlist_entry (playlistId, beatmapId, rate, mods, position, repeat) VALUES (?, ?, ?, ?, ?, ?)',
      [id, e.beatmapId, e.lockedRate ?? 0, order.filter(m => (e.lockedMods || []).includes(m)).join(','), i + 1, Math.max(1, num(e.repeat) || 1)]));
  });
  return created;
}
export let medalsKept = null;
/** Diagnostics: the add-on's last 20 problems this session (failed calls, retries, servers that didn't answer). */
export const diagLog = [];
export const logProblem = (where, msg) => {
  diagLog.push({ at: Date.now(), where, msg: String(msg && msg.message ? msg.message : msg).slice(0, 200) });
  if (diagLog.length > 20) diagLog.shift();
};

/** The character's medal XP multiplier, from its public profile on the server: { ok, multiplier, held, unknown },
 *  `ok` false when the server can't be reached. Kept for 10 minutes. */
export async function medalsOf(row) {
  const id = num(row.id);
  if (row.local) return { ok: true, multiplier: 1, held: 0, unknown: 0, guest: true };
  if (medalsKept && medalsKept.id === id && Date.now() - medalsKept.at < 600000) return medalsKept.value;
  let value = { ok: false, multiplier: 1, held: 0, unknown: 0 };
  try {
    const res = await fetchT(`${API_URL}/v1/characters/${id}/medals`);
    if (res.ok) {
      const { held } = await res.json();
      const ids = (Array.isArray(held) ? held : []).map(m => (m && typeof m === 'object' ? m.id : m));
      let multiplier = 1, unknown = 0;
      for (const mid of ids) {
        const tier = MEDAL_TIER[mid];
        if (tier) multiplier *= 1 + MEDAL_BONUS[tier]; else unknown++;
      }
      value = { ok: true, multiplier, held: ids.length, unknown };
    } else logProblem('medals', `server answered ${res.status}`);
  } catch (e) { logProblem('medals', e); /* offline: learned from real plays instead */ }
  if (value.ok) medalsKept = { id, at: Date.now(), value };
  return value;
}
/** The character's plays (score) from `since` on, oldest first, as { at, id }: what mindblock counts. */
export async function playsSince(row, since) {
  try {
    const rows = await gameRows('SELECT playedAt, beatmapId FROM score WHERE characterId = ? AND playedAt >= ? ORDER BY playedAt ASC', [row.id, since]);
    return (rows || []).map(x => ({ at: num(x.playedAt), id: num(x.beatmapId) })).filter(x => x.id).sort((a, b) => a.at - b.at);
  } catch (_) { return []; }
}

/** A setting the game keeps in localStorage as JSON. */
export const setting = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v === null || v === undefined ? fallback : v;
  } catch (_) {
    return fallback;
  }
};

/** Plays of each map that still train the character's memory, as the game counts them. */
export async function memoryPlays(row, beatmapIds) {
  const since = num(row.memoryResetAt);
  let forgets = [];
  try { forgets = JSON.parse(row.memoryForgetAt || '[]').filter(t => t >= since); } catch (_) {}
  const out = {};
  for (const id of beatmapIds) {
    const played = [];
    const scores = await gameRows('SELECT playedAt FROM score WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?', [row.id, id, since]);
    for (const s of scores || []) played.push({ at: num(s.playedAt), share: 1 });
    try {
      const fails = await gameRows('SELECT playedAt, share FROM memory_fail WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?', [row.id, id, since]);
      for (const f of fails || []) played.push({ at: num(f.playedAt), share: num(f.share) });
    } catch (_) { /* older games keep no failed plays */ }
    out[id] = recall(played, forgets);
  }
  return out;
}

/** The character's genetics. A signed-in character's live on the server alone (the game keeps them in memory,
 *  not in its database), read as the game does from GET /v1/me/characters; a guest's are in `geneticsJson`. */
export async function geneticsFor(row) {
  if (!row.local) {
    try {
      const res = await fetchT(`${API_URL}/v1/me/characters`, { credentials: 'include' });
      if (res.ok) {
        const list = await res.json();
        const dto = Array.isArray(list) ? list.find(c => c && num(c.id) === num(row.id)) : null;
        if (dto && dto.genetics && typeof dto.genetics === 'object') return { genetics: dto.genetics, from: 'server' };
        logProblem('genetics', 'character not in the server\'s list');
      } else logProblem('genetics', `server answered ${res.status}`);
    } catch (e) { logProblem('genetics', e); /* not reached: what this computer keeps, if anything */ }
  }
  const g = asGenetics(row.geneticsJson);
  return { genetics: g, from: g && g.picks && g.picks.length ? 'local' : 'none' };
}

/** Each map's Tries as the server keeps them (what a ranked play's Memory and Speed Jam train on, from every
 *  device): the game asks GET /v1/me/memory/:beatmap as the signed-in player, and so does this. A browser
 *  sends the session cookie; the desktop app adds its token to every API request itself. Undefined for a
 *  map the server didn't answer for; null when it can't be reached at all. */
export async function serverTries(row, beatmapIds) {
  if (row.local) return null;
  const out = {};
  for (const id of beatmapIds) {
    try {
      const res = await fetchT(`${API_URL}/v1/me/memory/${id}`, { credentials: 'include' });
      if (!res.ok) { logProblem('tries', `map ${id}: server answered ${res.status}`); if (res.status === 401 || res.status === 403) return null; continue; }
      const body = await res.json();
      if (typeof (body && body.plays) === 'number') out[id] = body.plays;
    } catch (e) { logProblem('tries', e); return null; }
  }
  return Object.keys(out).length ? out : null;
}

export const fiberOf = (el) => {
  if (!el) return undefined;
  const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
  return key ? el[key] : undefined;
};
export const hooksOf = (fiber) => {
  const states = [];
  let hook = fiber.memoizedState;
  while (hook && typeof hook === 'object' && 'next' in hook) {
    states.push(hook.memoizedState);
    hook = hook.next;
  }
  return states;
};

/** The queue the dock shows, in play order (the head plays next), or undefined. The dock's
 *  `useSynced(PlayQueue.state)` keeps it as { current, previous }. */
/** The dock parts that hold the queue (useSynced(PlayQueue.state)). The source line is missing while Edit Queue
 *  is open (the dock moves to the left column without it), so the controls and the queue list stand in. */
export const QUEUE_HOLDERS = ['.dock__source', '.dock__transport', '.dock__queue', '.dock__up-next', '.dock'];
export function readQueue() {
  for (const sel of QUEUE_HOLDERS) {
    const q = readQueueFrom(document.querySelector(sel));
    if (q) return { ...q, from: sel };
  }
  return undefined;
}
/** What makes two queues the same for the forecast: maps, order, rates, mods and repeats; not how far they have played. */
export const queueKey = (entries) => entries.map(e => `${e.beatmapId}@${e.lockedRate ?? ''}:${Array.isArray(e.lockedMods) ? e.lockedMods.join('') : ''}x${e.repeat}`);
/** Whether `now` is just `then` moved on by playing: its front maps done and gone, or (a looping queue) moved to the back. */
export const movedOn = (then, now) => {
  if (now.length === then.length) {
    for (let k = 1; k < then.length; k++) if (now.every((x, i) => x === then[(i + k) % then.length])) return true;
    return false;
  }
  return now.length < then.length && now.every((x, i) => x === then[i + then.length - now.length]);
};
export function readQueueFrom(el) {
  for (let fiber = fiberOf(el); fiber; fiber = fiber.return) {
    for (const state of hooksOf(fiber)) {
      const q = state && typeof state === 'object' ? state.current : undefined;
      if (q && typeof q === 'object' && Array.isArray(q.entries)) {
        return {
          label: q.label || '',
          entries: q.entries.filter(e => e && e.beatmap && e.beatmap.metadata).map((e) => {
            const meta = e.beatmap.metadata;
            const set = e.beatmap.set && e.beatmap.set.metadata ? e.beatmap.set.metadata : {};
            return {
              beatmapId: num(meta.id),
              title: `${set.artist ? `${set.artist} - ` : ''}${set.title || meta.title || `Map ${meta.id}`}${meta.version ? ` [${meta.version}]` : ''}`,
              lockedRate: e.beatmap.lockedRate,
              lockedMods: e.beatmap.lockedMods,
              repeat: Math.max(1, num(e.repeat) || 1),
              played: num(e.played),
              // the game's metadata keeps it in ms
              lengthSec: num(meta.total_length) / 1000,
            };
          }),
        };
      }
    }
  }
  return undefined;
}
