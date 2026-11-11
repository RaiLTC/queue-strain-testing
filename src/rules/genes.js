// Genetics, Tries (memory recall) and the XP curve, ported from oss!idle 1.4.3.0.

import { SKILLS, num } from '../game.js';

// =====================================================================
// 2. GENES AND MEMORY (genetics.ts, rulesets/mania/4k/genes.ts, memoryRecall.ts)
// =====================================================================
/** The 4K ring: a tree's neighbours are next to it. */
export const RING = ['accuracy', 'release', 'coordination', 'speed', 'stamina', 'consistency', 'jackspeed', 'reading', 'speedjam', 'memory', 'concentration'];
/** The stamina tree's fatigue genes: effect and amount per tier. */
export const FATIGUE_GENES = { longSets: ['strainRate', 0.05], wellRested: ['restRate', 0.1], quickWarmup: ['warmRate', 0.1], stayWarm: ['warmHold', 10] };

/** Genetics as an object, from the server's or a `geneticsJson` text. */
export const asGenetics = (v) => {
  if (v && typeof v === 'object') return v;
  try { return v ? JSON.parse(v) : null; } catch (_) { return null; }
};
/** The fatigue genes of a character's genetics. */
export const fatigueGenesOf = (json) => {
  const g = asGenetics(json);
  if (!g || !g.genes) return {};
  const picked = (g.picks || []).map(p => p.skill);
  const at = RING.indexOf('stamina'), n = RING.length;
  const strength = picked.reduce((sum, p) => sum + (p === 'stamina' ? 1 : (p === RING[(at + 1) % n] || p === RING[(at + n - 1) % n] ? 0.5 : 0)), 0);
  const out = {};
  for (const [id, [effect, per]] of Object.entries(FATIGUE_GENES)) {
    const tiers = (g.genes[id] || 0) * strength;
    if (tiers > 0) out[effect] = (out[effect] || 0) + per * tiers;
  }
  return out;
};

/** Every 4K gene by its tree (rulesets/mania/4k/genes.ts): the first is the tree's XP gene, the second its overdrive gene. */
export const GENE_TREES = {
  accuracy: 'talented perfectPitch calibrated cleanStart perfectStart marvelousStart learner metronome chordCohesion',
  release: 'tailChaser holdout lnSpecialist lightTouch shieldBreaker quickLetGo steadyRelease lnFlow catchYourBreath inverse',
  coordination: 'ambidextrous twoMinds independence handSplit fullHands chordGrip calmHands composure safeFumble regroup polyrhythm',
  speed: 'adrenaline rush quickFingers cleanStreams pacing burst secondHand ceiling topSpeed comfortZone',
  stamina: 'marathoner longHaul slowBurn secondBreath grit deepLungs restStops lowGear ironWrists longSets wellRested quickWarmup stayWarm',
  consistency: 'iceVeins coldBlood steady smallChokes cleanReleases unshakeable thickSkin unbothered flowState bounceBack clutch',
  jackspeed: 'hammer anvil anchor bounce freshFingers shortRest jackCeiling easyJacks minijacks chordjack',
  reading: 'sightReader secondGlance patternSense steadyEyes overview rhythmSense offBeat crossHand shapeReading trillHands settleIn familiarShapes',
  speedjam: 'waveRider undertow speedReader brake lateLook dejaVu looseMatch oldNews shakeItOff softLanding svSurfer',
  memory: 'thoroughLearner prodigy beatmapStudy learnFromFailure educatedGuess mapperAdvantage longMemory personalFavorites muscleMemory accurateMemory',
  concentration: 'deepFocus inTheZone attentionSpan slowFade lostInTheMusic steadyHands anchored secondWind catnap freshStart finalStretch',
};
/** genetics.ts: a tree's strength adds 10% XP per point, each tier held in it 5%, and its XP gene 5% a tier at that strength. */
export const GENETIC_XP_BONUS = 0.1, GENE_XP_BONUS = 0.05, XP_GENE_PER = 0.05, LN_XP_PER = 0.1;
/** Each skill's XP multiplier from the genetics (geneticsXpMultiplier), with its parts. LN Specialist's bonus on
 *  LN maps alone is kept apart: the add-on can't tell which maps are LN maps. */
export const geneticsXpOf = (json) => {
  const g = asGenetics(json);
  const picked = g && Array.isArray(g.picks) ? g.picks.map(p => p && p.skill) : [];
  const genes = g && g.genes && typeof g.genes === 'object' ? g.genes : {};
  const n = RING.length;
  const out = {};
  for (const sk of SKILLS) {
    const at = RING.indexOf(sk);
    const strength = at < 0 ? 0 : picked.reduce((sum, p) => sum + (p === sk ? 1 : p === RING[(at + 1) % n] || p === RING[(at + n - 1) % n] ? 0.5 : 0), 0);
    const ids = (GENE_TREES[sk] || '').split(' ');
    const tiers = ids.reduce((sum, id) => sum + num(genes[id]), 0);
    const xpGene = num(genes[ids[0]]);
    const parts = { strength, fromStrength: GENETIC_XP_BONUS * strength, xpGene, fromXpGene: XP_GENE_PER * xpGene * strength, tiers, fromTiers: GENE_XP_BONUS * tiers,
      lnMaps: sk === 'release' ? LN_XP_PER * num(genes.lnSpecialist) * strength : 0 };
    out[sk] = { ...parts, total: 1 + parts.fromStrength + parts.fromXpGene + parts.fromTiers };
  }
  return out;
};

export const FORGET_PLAYS = 10;
export const DAILY_DECAY = 0.05;
export const DAY_MS = 86400000;
export const decayed = (plays, ms) => plays * (1 - DAILY_DECAY) ** (Math.max(0, ms) / DAY_MS);
export const recall = (played, forgetAt, now = Date.now()) => {
  const events = [...played.map(p => ({ t: p.at, share: p.share, forget: false })), ...forgetAt.map(t => ({ t, share: 0, forget: true }))].sort((a, b) => a.t - b.t);
  let plays = 0;
  let last = events[0]?.t ?? now;
  for (const e of events) {
    plays = decayed(plays, e.t - last);
    last = e.t;
    plays = e.forget ? Math.max(0, plays - FORGET_PLAYS) : plays + e.share;
  }
  return decayed(plays, now - last);
};
