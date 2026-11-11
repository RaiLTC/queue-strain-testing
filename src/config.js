// Queue Strain: an oss!idle add-on (Alt+Shift+F) that shows where the queue that is playing takes your strain,
// warm-up bar, XP and levels. Made for oss!idle 1.4.3.0.
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
//
// Sources:
// - oss!idle 1.4.3.0 source (github.com/oss-idle/oss-idle): the fatigue, warm-up, XP curve, Tries, genetics,
//   medals and prestige rules, the add-on API and simulator, and the dock the queue is read from.
// - The official oss!idle sim add-on (github.com/oss-idle/addon-sim): the order the server applies
//   mindblock, fatigue, medals and mods to a play's XP, and the server endpoints for medals.
// - Your own plays, from the game's local database: the local estimate and the calibration check.

// What you edit for a release: the version, the notice, the changelog, settings and every text players see.

export const VERSION = '1.3.2';
export const VERSION_ID = '2026-11-11 06H37M';

// none / info / urgent
export const NOTICE = {
  id: VERSION_ID,
  mode: 'info',
  text: `The numbers look right so far. Speed Jam and Memory haven't been checked yet: that's next.\nFound something off? Message me (Rai) in the in-game chat if online, or in the official oss!idle Discord`,
};

export const CHANGELOG = {
  id: VERSION_ID,
  text: `v${VERSION} · 11 Nov 2026\n• Redesigned levels tab\n• Scans again by itself when you change the queue\n• Scanning works with Edit Queue open\n• Retries when the simulator is busy\n• Local estimate uses all your recent plays\n• Option to turn off animations\n• New time formatting\n• Bunch of fixes`,
};

// ---------------------------------------------------------------------
// SETTINGS: defaults and numbers that are safe to tune. Players can still change the first five in the window.
// ---------------------------------------------------------------------
export const SETTINGS = {
  lookAheadHours: 6,
  runsPerPlay: 2,
  memoryPlays: 12,
  animations: true,
  rescanOnQueueChange: true,
  // the local estimate: each map's newest this many real plays at the queue's rate (closest to your current level)
  localPlays: 5,
  // calibration simulates each real play again: the newest this many per map
  calibrationPlays: 5,
  // between simulator calls (the API allows 1200 a minute)
  callSpacingMs: 55,
  // when the simulator is busy: seconds to wait before each new try
  retryWaitsSec: [2, 4, 8, 16, 32],
  // after the queue changes: seconds without another change before scanning again
  rescanSettleSec: 3,
  colors: {
    now: '#3987e5',
    prestige: '#ff8ab7',
    prestigeShift: '#b8487a',
    levelComplete: '#8fb8ec',
    maps: ['#3987e5', '#d95926', '#199e70', '#c98500'],
    otherMaps: '#6b7280',
  },
};

// ---------------------------------------------------------------------
// TEXT: words players see. {name} is filled in by the add-on.
// ---------------------------------------------------------------------
export const TEXT = {
  tabs: { overview: 'Overview', xp: 'XP', sv: 'Speed Jam / Memory', levels: 'Levels', debug: 'Debug' },
  stages: {
    cold: ['Cold', 'Play harder maps to warm up.'],
    warming: ['Warming Up', 'Play harder maps to reach the sweet spot.'],
    peak: ['Sweet Spot', 'Your physical skills are at their best.'],
    pushing: ['Past Sweet Spot', 'Play easier maps to come back to it.'],
    fatigued: ['Fatigued', 'You earn less XP. Play easier maps to rest.'],
  },
  options: {
    scan: 'Scan queue',
    scanToStart: 'Scan to start',
    lookAhead: 'Look ahead',
    hours: 'hours',
    startAt: 'Start at',
    startAtTip: 'Leave empty to start from where your character is now',
    minOfStrain: 'min of strain',
    runs: 'Runs per play',
    runsTip: 'A play is random, so each one can be simulated a few times and averaged, as the official sim does. More runs: steadier numbers, but more simulator calls on the first scan (later scans reuse them).',
    animations: 'Animations',
    animationsTip: 'Turn off to stop every animation in this window, for performance.',
    rescan: 'Rescan when the queue changes',
    rescanTip: 'When you add, remove or move maps, or change a rate or repeats, the add-on scans again by itself, {sec} seconds after your last change. Playing through the queue doesn\'t count as a change.',
    localPlays: 'Local plays',
    localPlaysTip: 'For the XP tab\'s local estimate: how many of your newest plays of each map (at the queue\'s rate) it averages. Fewer: closer to your current level. More: a steadier average. {n} by default.',
    memoryPlays: 'Memory plays',
    memoryPlaysTip: 'For maps that give Speed Jam or Memory XP: how many of your next plays of each the Speed Jam / Memory tab shows',
  },
  status: {
    simulating: 'Simulating the queue…',
    busy: 'Simulator busy, retrying in {sec}s (try {n} of {of})…',
    busyNote: 'simulator busy, retrying (try {n} of {of})',
    queueChanged: 'Queue changed: scanning again in a moment…',
    rescanning: 'Queue changed: scanning again…',
    queueChangedOff: 'Your queue changed since the scan. Press Scan queue to include it.',
    queueBack: 'The queue is back as scanned.',
    newRuns: 'Scan again to use the new number of runs.',
    stopped: 'Stopped. Press Scan queue to start again.',
    closed: 'Stopped: the window was closed. Press Scan queue to start again.',
  },
  levels: {
    title: 'Levels and XP',
    intro: 'How close each skill is to prestige with this queue. Click one for more information.',
    skill: 'Skill',
    xph: 'XP/h',
    prestige: 'Prestige',
    bar: 'Levels to prestige',
    readyNow: 'ready now',
    keepPlaying: 'If you keep playing this queue',
    xpToGo: '{xp} XP to go',
    mapsTitle: 'Where its XP comes from',
    noXp: 'This queue gives it no XP.',
    other: 'Other ({n})',
    paceTitle: 'Leveling pace',
    now: 'Now',
    after: 'After {time}',
    xpTitle: 'XP',
    perHour: 'Per hour',
    queueShare: '{pct}% of the queue\'s',
    perPlay: 'Per play',
    perLoop: 'Per loop',
    within: 'In {time}',
    toPrestige: 'To prestige',
    legendNow: 'Now',
    legendProgress: 'Progress',
    legendComplete: 'Level up',
    legendPrestige: 'Prestige',
  },
  matchHelp: 'How close the add-on is to what you really earned on these plays. 100% is a perfect match.',
};
/** A TEXT line with its {names} filled in. */
export const tx = (line, vars = {}) => String(line).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
