// The library, from plays that already exist (no scan of the game's catalog): the official sim add-on's stored plays
// at levels close to the character's, this add-on's own simulator answers, and the character's real plays. Per
// skill, the best 15 maps by XP a minute; each is then confirmed with one simulation at the character's exact levels,
// and one that no longer makes the 15 gives its place to the next best, confirmed in turn. Kept on this computer
// (IndexedDB) for the character's current levels.

import { SKILLS, catalogEntries, gameRows, logProblem, num } from './game.js';
import { CALL_SPACING_MS, RETRY_WAITS_MS, callSlot, pauseCalls, pool, cached, initCache, isTransient, knownMaps, officialPlaysFor, ownerOf, remember, sharedPlaysFor, sleep, strainStep } from './forecast.js';
import { STRAIN_CAP } from './rules/fatigue.js';

const DB = 'queue-strain', STORE = 'library';
export const LIBRARY_TOP = 100;
/** Most confirming simulations for one skill: a list that keeps falling apart stops here. */
const CONFIRM_CAP = 150;
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
/** What the library depends on in the character: its levels, overall levels, prestiges and upgrades. */
export const libraryOwner = (row) => `${ownerOf(row)}|${SKILLS.map(s => Math.floor(num(row[`${s}LifetimeXp`]) / 1e6)).join(',')}`;
export const loadLibrary = async (row) => { try { return (await idb('readonly', st => st.get(libraryOwner(row)))) || null; } catch (_) { return null; } };
const saveLibrary = async (row, data) => {
  try {
    const keep = libraryOwner(row), mine = `${num(row.id)}:`;
    const keys = (await idb('readonly', st => st.getAllKeys())) || [];
    const old = keys.filter(k => String(k).startsWith(mine) && k !== keep);
    await idb('readwrite', st => { for (const k of old) st.delete(k); return st.put(data, keep); });
  } catch (e) { logProblem('library', e); }
};

/**
 * Builds the library: `api` the game's add-on API, `row` the character, `rates` the allowed ones, `mods`, `minutes`
 * the strain to confirm at (mid Peak), `bonus(skill)` medals x genetics (to put real plays on the simulator's scale),
 * `onProgress({phase, skill, calls})`, `stopped()`. Returns { at, lists: { skill: [entry] } }.
 */
export async function buildLibrary({ api, row, rates, mods = [], minutes, bonus = () => 1, onProgress = () => {}, stopped = () => false }) {
  await initCache();
  const owner = ownerOf(row);
  const entries = await catalogEntries();
  const byId = new Map(entries.map(e => [e.id, e]));
  const skills = Object.fromEntries(SKILLS.map(s => [s, { level: Math.floor(num(row[s])), xp: num(row[`${s}XP`]), lifetime_xp: num(row[`${s}LifetimeXp`]), prestige: num(row[`${s}Prestige`]), upgrades: num(row[`${s}Upgrades`]), overdrive: num(row[`${s}Overdrive`]) }]));
  const plays = new Map();
  try { for (const x of (await gameRows('SELECT beatmapId, COUNT(*) AS n FROM score WHERE characterId = ? AND playedAt >= ? GROUP BY beatmapId', [row.id, num(row.memoryResetAt)])) || []) plays.set(num(x.beatmapId), num(x.n)); } catch (_) {}
  // every candidate: map@rate -> XP per skill a play (simulator scale), where it came from
  const cand = new Map();
  const put = (mr, xp, source, exact, strained) => { const old = cand.get(mr); if (!old || (exact && !old.exact)) cand.set(mr, { xp, source, exact, strained }); };
  // first the shared sim cache: every official simulation anyone made, at your exact play levels
  onProgress({ phase: 'Asking the shared sim cache' });
  try { for (const [mr, a] of await sharedPlaysFor(skills, num(row.generation) || 1, mods, minutes, entries.map(e => e.id), rates, plays)) put(mr, a.xp, 'shared cache', true, a.strained); } catch (e) { logProblem('library', e); }
  onProgress({ phase: 'Reading the official sim\'s plays' });
  for (const [mr, a] of await officialPlaysFor(skills, num(row.generation) || 1, mods, minutes, new Set(entries.map(e => e.id)), rates, plays, 3)) if (a.passed !== false) put(mr, a.xp, 'official sim', a.exact, a.strained);
  for (const [mr, a] of knownMaps(owner)) if (a.fails * 2 < a.n) put(mr, Object.fromEntries(SKILLS.map(sk => [sk, num(a.xp[sk]) / Math.max(1, a.n)])), 'this add-on', true);
  // your real plays (last 14 days): what you really got, bonuses taken back out, at the levels you had then
  try {
    const rows = (await gameRows('SELECT x.beatmapId AS id, x.gains AS gains, s.rate AS rate FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? AND x.playedAt >= ?', [row.id, Date.now() - 14 * 86400000])) || [];
    const sum = new Map();
    for (const x of rows) {
      const mr = `${num(x.id)}@${Math.round((num(x.rate) || 1) * 100) / 100}`;
      let g = {}; try { g = JSON.parse(x.gains || '{}') || {}; } catch (_) {}
      const m = sum.get(mr) || { n: 0, xp: {} };
      m.n++;
      for (const sk of SKILLS) m.xp[sk] = (m.xp[sk] || 0) + num(g[sk]) / Math.max(1e-9, bonus(sk));
      sum.set(mr, m);
    }
    for (const [mr, m] of sum) if (!cand.has(mr)) put(mr, Object.fromEntries(SKILLS.map(sk => [sk, m.xp[sk] / m.n])), 'your plays', false);
  } catch (e) { logProblem('library', e); }

  const perMin = (mr, xp, sk) => { const [id, rate] = mr.split('@').map(Number), e = byId.get(id); const v = sk === 'all' ? SKILLS.reduce((t, s2) => t + num(xp[s2]) * bonus(s2), 0) / bonus('all') : num(xp[sk]); return e ? v / Math.max(0.1, e.lengthSec / rate / 60) : 0; };
  const bucket = Math.min(STRAIN_CAP, strainStep(minutes));
  let calls = 0, nextCall = 0;
  /** One simulation at the character's exact levels, mid Peak: confirms a candidate (or drops it, failed). */
  const confirm = async (mr) => {
    const c = cand.get(mr);
    if (c.exact || c.confirmed) return;
    const [id, rate] = mr.split('@').map(Number), p = plays.get(id) || 0;
    const key = `${id}|${rate}|${[...mods].sort().join('')}|${bucket}|${p}`;
    let answer = cached(owner, key);
    for (let attempt = 0; !answer && !stopped(); attempt++) {
      await callSlot();
      try { answer = await api.simulate({ beatmap_id: id, rate, mods, generation: num(row.generation) || 1, strain_minutes: bucket, map_plays: p, skills }); calls++; remember(owner, key, answer); }
      catch (e) { if (attempt >= RETRY_WAITS_MS.length || !isTransient(e)) { logProblem('library', `map ${id}: ${e && e.message ? e.message : e}`); break; } pauseCalls(RETRY_WAITS_MS[attempt]); }
    }
    if (!answer) return;
    c.xp = answer.passed === false ? {} : Object.fromEntries(SKILLS.map(sk => [sk, num(answer.xp && answer.xp[sk])]));
    c.confirmed = true;
    c.strained = num(answer.strained_minutes);
  };
  // per skill: the best 15, each confirmed; one that falls out gives its place to the next best, confirmed in turn
  const lists = {};
  // every skill, then 'all': the most XP a minute whatever the balance (each skill's XP with its own bonus)
  for (const sk of [...SKILLS, 'all']) {
    if (stopped()) break;
    let spent = 0;
    for (;;) {
      const ranked = [...cand.keys()].map(mr => ({ mr, v: perMin(mr, cand.get(mr).xp, sk) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
      const top = ranked.slice(0, LIBRARY_TOP);
      const batch = top.filter(x => !cand.get(x.mr).exact && !cand.get(x.mr).confirmed).slice(0, Math.max(1, Math.min(10, CONFIRM_CAP - spent)));
      const next = batch[0];
      if (!next || spent >= CONFIRM_CAP || stopped()) { lists[sk] = top.map(x => { const c = cand.get(x.mr), [id, rate] = x.mr.split('@').map(Number), e = byId.get(id); return { id, rate, title: e ? e.title : `Map ${id}`, stars: e ? e.stars : 0, lengthSec: e ? e.lengthSec : 0, perMin: x.v, source: c.source, sure: !!(c.exact || c.confirmed), strainedShare: c.strained !== undefined && e ? Math.max(0, Math.min(1, num(c.strained) / Math.max(0.1, e.lengthSec / rate / 60))) : undefined }; }); break; }
      onProgress({ phase: 'Confirming', skill: sk, calls });
      await pool(batch.map(x => () => confirm(x.mr)), 10);
      spent += batch.length;
      for (const x of batch) if (cand.get(x.mr) && !cand.get(x.mr).confirmed) cand.delete(x.mr);
    }
  }
  const data = { at: Date.now(), lists, calls };
  if (!stopped()) await saveLibrary(row, data);
  onProgress({ phase: 'Done', calls, finished: true });
  return data;
}
