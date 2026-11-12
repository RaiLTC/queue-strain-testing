// The add-on's entry: what oss!idle calls.

import { expand, playStep, strainStep } from './forecast.js';
import { MEDAL_TIER, MINDBLOCK, mindblockFactor, readQueue, recentPlaysOf } from './game.js';
import { afterPlay, barKnots, barOf, fatigueLevel, fatigueXp, gainLevels, restedFatigue, warmup, warmupTrend, xpForLevel } from './rules/fatigue.js';
import { fatigueGenesOf, geneticsXpOf, recall } from './rules/genes.js';
import { shortTime } from './ui/parts.js';

// for tests
export const _internals = { xpForLevel, gainLevels, fatigueLevel, fatigueXp, strainStep, playStep, barKnots, barOf, warmup, afterPlay, restedFatigue, warmupTrend, fatigueGenesOf, recall, expand, readQueue, shortTime, geneticsXpOf, mindblockFactor, recentPlaysOf, MEDAL_TIER, MINDBLOCK };

export { mount, unmount } from './ui/window.js';
