// The whole-library scan: every 4K map in the game's catalog at every rate the player allows, one real play
// each from the server's simulator at the middle of Peak, ranked per skill by XP a minute. Kept on this computer
// (IndexedDB) for the character's current play levels: the top 10 per skill, and the best ones that cool strain
// down or warm it up. Maps that provably can't reach any list (their XP ceiling, from the game's own formula) are
// never simulated, and the strongest ceilings go first so the lists fill early and cut more.

import { SKILLS, catalogEntries, gameRows, logProblem, num, xpCeiling } from './game.js';
import { CALL_SPACING_MS, RETRY_WAITS_MS, cached, initCache, isTransient, officialPlaysFor, ownerOf, remember, sleep, strainStep } from './forecast.js';
import { STRAIN_CAP } from './rules/fatigue.js';

const DB = 'queue-strain', STORE = 'library';
const TOP = 100;
const openDb = () => new Promise((ok, no) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(STORE)) q.result.createObjectStore(STORE); };
  q.onsuccess = () => ok(q.result);
  q.onerror = () => no(q.error);
});
const idb = async (mode, fn) => {
  const db = await openDb();
  try { return await new Promise((ok, no) => { const tx = db.transaction(STORE, mode); const q = fn(tx.objectStore(STORE)); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); }); }
  finally { db.close(); }
};
/** What the library's results depend on in the character: its levels, overall levels, prestiges and upgrades. */
export const libraryOwner = (row) => `${ownerOf(row)}|${SKILLS.map(s => Math.floor(num(row[`${s}LifetimeXp`]) / 1e6)).join(',')}`;
/** The saved scan for this character as it is now, or null. */
export const loadLibrary = async (row) => {
  try { const v = await idb('readonly', st => st.get(libraryOwner(row))); return v || null; } catch (_) { return null; }
};
const saveLibrary = async (row, data) => { try { await idb('readwrite', st => st.put(data, libraryOwner(row))); } catch (e) { logProblem('library', e); } };
/** Deletes this character's saved scans for levels it no longer has: only the current one stays. */
const pruneLibrary = async (row) => {
  try {
    const keep = libraryOwner(row), mine = `${num(row.id)}:`;
    const keys = (await idb('readonly', st => st.getAllKeys())) || [];
    const old = keys.filter(k => String(k).startsWith(mine) && k !== keep);
    if (old.length) await idb('readwrite', st => { let q = null; for (const k of old) q = st.delete(k); return q; });
  } catch (e) { logProblem('library', e); }
};

/** A play's role by how it moves strain: the share of its length it strains you for. */
export const roleOf = (strainedShare) => (strainedShare < 0.5 ? 'cools' : strainedShare > 0.9 ? 'warms' : 'holds');

/** The lists from the results: per skill, the top 100 by XP a minute, and the top 100 of those that cool and warm. */
export const listsOf = (results) => {
  const lists = {};
  for (const sk of SKILLS) {
    const rows = results.filter(x => num(x.perMin[sk]) > 0).sort((a, b) => b.perMin[sk] - a.perMin[sk]);
    lists[sk] = { top: rows.slice(0, TOP), cools: rows.filter(x => x.role === 'cools').slice(0, TOP), warms: rows.filter(x => x.role === 'warms').slice(0, TOP) };
  }
  return lists;
};

/**
 * Scan: `api` the game's add-on API, `row` the character, `rates` to try, `minutes` the strain to play at (mid
 * Peak), `onProgress({done, total, skipped, calls})`, `stopped()`. Results already saved for these levels are kept.
 */
export async function scanLibrary({ api, row, rates, mods = [], minutes, onProgress, stopped }) {
  await initCache();
  await pruneLibrary(row);
  const prev = await loadLibrary(row);
  const results = prev ? prev.results : [];
  const done = new Set(results.map(x => `${x.id}@${x.rate}`));
  const owner = ownerOf(row);
  const skills = Object.fromEntries(SKILLS.map(s => [s, { level: Math.floor(num(row[s])), xp: num(row[`${s}XP`]), lifetime_xp: num(row[`${s}LifetimeXp`]), prestige: num(row[`${s}Prestige`]), upgrades: num(row[`${s}Upgrades`]), overdrive: num(row[`${s}Overdrive`]) }]));
  const bucket = Math.min(STRAIN_CAP, strainStep(minutes));
  // memory only pays on maps you've played: their play counts since the last memory reset
  const plays = new Map();
  try { for (const x of (await gameRows('SELECT beatmapId, COUNT(*) AS n FROM score WHERE characterId = ? AND playedAt >= ? GROUP BY beatmapId', [row.id, num(row.memoryResetAt)])) || []) plays.set(num(x.beatmapId), num(x.n)); } catch (_) {}
  const entries = await catalogEntries();
  // first, for free: the plays the official sim add-on already made at your exact levels (the 9 skills by their
  // overall levels; Speed Jam and Memory by their own), in Peak (no fatigue), with this sim version
  onProgress({ done: 0, total: 0, skipped: 0, calls: 0, note: 'Reusing the official sim\'s plays at your levels' });
  const reused = await officialPlaysFor(skills, num(row.generation) || 1, mods, minutes, new Set(entries.map(e => e.id)), rates, plays);
  const byId = new Map(entries.map(e => [e.id, e]));
  let fromOfficial = 0;
  for (const [mr, a] of reused) {
    if (done.has(mr)) continue;
    const [id, rate] = mr.split('@').map(Number), e = byId.get(id);
    if (!e) continue;
    const mins = Math.max(0.1, e.lengthSec / rate / 60);
    const perMin = Object.fromEntries(SKILLS.map(sk => [sk, a.passed === false ? 0 : num(a.xp[sk]) / mins]));
    const strained = Math.max(0, Math.min(1, num(a.strained) / mins));
    results.push({ id, title: e.title, stars: e.stars, rate, minutes: mins, perMin, passed: a.passed !== false, role: roleOf(strained), strained, official: true, approx: !a.exact });
    done.add(mr);
    fromOfficial++;
  }
  // the near matches that made a top list get played again at your exact levels, first: exact numbers where it
  // matters, near-free ones everywhere else
  const redo = new Set();
  { const l0 = listsOf(results); for (const sk of SKILLS) for (const list of [l0[sk].top, l0[sk].cools, l0[sk].warms]) for (const x of list) if (x.approx) redo.add(`${x.id}@${x.rate}`); }
  for (let i = results.length - 1; i >= 0; i--) if (redo.has(`${results[i].id}@${results[i].rate}`)) { done.delete(`${results[i].id}@${results[i].rate}`); results.splice(i, 1); }
  // then every map x rate still missing, strongest ceiling first
  const work = [];
  for (const e of entries) {
    for (const rate of rates) {
      if (done.has(`${e.id}@${rate}`)) continue;
      const ceil = Object.fromEntries(SKILLS.map(sk => [sk, xpCeiling(row, e.id, rate, sk, mods, plays.has(e.id)) / Math.max(0.1, e.lengthSec / rate / 60)]));
      work.push({ e, rate, ceil, best: redo.has(`${e.id}@${rate}`) ? Infinity : Math.max(...Object.values(ceil)) });
    }
  }
  work.sort((a, b) => b.best - a.best);
  let calls = 0, skipped = 0, n = 0, nextCall = 0;
  if (fromOfficial) await saveLibrary(row, { at: Date.now(), results });
  const floors = () => { const l = listsOf(results); return Object.fromEntries(SKILLS.map(sk => [sk, l[sk].top.length >= TOP && l[sk].cools.length >= TOP && l[sk].warms.length >= TOP ? Math.min(l[sk].top[TOP - 1].perMin[sk], l[sk].cools[TOP - 1].perMin[sk], l[sk].warms[TOP - 1].perMin[sk]) : 0])); };
  let fl = floors();
  for (const w of work) {
    if (stopped()) break;
    n++;
    // provably can't reach any list of any skill: skip it
    if (w.best !== Infinity && SKILLS.every(sk => w.ceil[sk] <= fl[sk])) { skipped++; if (n % 50 === 0) onProgress({ done: n, total: work.length, skipped, calls }); continue; }
    const p = plays.get(w.e.id) || 0;
    const key = `${w.e.id}|${w.rate}|${[...mods].sort().join('')}|${bucket}|${p}`;
    let answer = cached(owner, key);
    if (!answer) {
      for (let attempt = 0; ; attempt++) {
        const wait = Math.max(0, nextCall - Date.now());
        if (wait) await sleep(wait);
        nextCall = Date.now() + CALL_SPACING_MS;
        if (stopped()) break;
        try {
          answer = await api.simulate({ beatmap_id: w.e.id, rate: w.rate, mods, generation: num(row.generation) || 1, strain_minutes: bucket, map_plays: p, skills });
          calls++;
          remember(owner, key, answer);
          break;
        } catch (e) {
          if (attempt >= RETRY_WAITS_MS.length || !isTransient(e)) { logProblem('library', `map ${w.e.id}: ${e && e.message ? e.message : e}`); break; }
          nextCall = Date.now() + RETRY_WAITS_MS[attempt];
        }
      }
    }
    if (!answer) continue;
    const mins = Math.max(0.1, w.e.lengthSec / w.rate / 60);
    const perMin = Object.fromEntries(SKILLS.map(sk => [sk, answer.passed === false ? 0 : num(answer.xp && answer.xp[sk]) / mins]));
    const strained = Math.max(0, Math.min(1, num(answer.strained_minutes) / mins));
    results.push({ id: w.e.id, title: w.e.title, stars: w.e.stars, rate: w.rate, minutes: mins, perMin, passed: answer.passed !== false, role: roleOf(strained), strained });
    done.add(`${w.e.id}@${w.rate}`);
    if (results.length % 10 === 0) { fl = floors(); await saveLibrary(row, { at: Date.now(), results }); }
    onProgress({ done: n, total: work.length, skipped, calls, reused: fromOfficial });
  }
  await saveLibrary(row, { at: Date.now(), results });
  onProgress({ done: n, total: work.length, skipped, calls, reused: fromOfficial, finished: !stopped() });
  return results;
}
