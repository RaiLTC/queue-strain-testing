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

export const VERSION = '1.4.06';
export const VERSION_ID = '2026-11-14 05H39M';

// none / info / urgent
export const NOTICE = {
  // its own id: a new one shows the notice again to players who read the old one
  id: '2026-11-13 1.4.0',
  mode: 'info',
  text: `Scanning can make the game lag a little while it runs.\nSuggestions is at an early stage: it should get better with time.\nFound something off? Message me (Rai) in the in-game chat if online, or in the official oss!idle Discord`,
};

// the last big update. Kept exactly as released (id and text), so players who read it don't see it light up again.
// notify: false keeps it from glowing even when it changed
export const CHANGELOG = {
  id: '2026-11-13 1.4.0',
  notify: true,
  text: `v1.4.0 · 13 Nov 2026
• New Suggestions tab: finds a better queue by dropping, repeating, swapping and adding maps
• Map library: the best maps for each skill, built from Suggestions
• Faster scans: uses the shared sim cache first
• Levels: Overall display, your routes, next upgrades on the bar
• Overview: the top 3 skills this queue trains
• "Sweet Spot" is now "Peak"
• Window works better around the queue, chat and menus
• Bunch of fixes`,
};

// small fixes since the last big update: the wrench button, glowing orange until read. Empty text hides it;
// a new id (or text) lights it up again, unless notify is false.
// Which one to update: a #.#.# release (1.3.5, 1.3.6) writes CHANGELOG and empties HOTFIXES; an x.x.x# release
// (1.3.51, 1.3.58) only adds to HOTFIXES and leaves CHANGELOG exactly as it is
export const HOTFIXES = {
  id: VERSION_ID,
  notify: true,
  text: `v${VERSION} · 13 Nov 2026
• Fixed memory building up while scanning, which could slow or crash the game
• Suggestions: checks its pick exactly, XP comparison, progress bar and Stop button
• Faster scans and Suggestions
• Smoother while finding suggestions; shows what it's waiting for
• Fixed scans stopping on a speed you can't use (after a Speed prestige)`,
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
  // the Window group in the options: fade the window while the mouse is away (how see-through, in %), and what a
  // click outside it does: 'close' (closes it, the game doesn't get the click), 'through' (closes it and the game
  // gets the click too) or 'stay' (nothing)
  fadeAway: true,
  fadeAmount: 80,
  clickOutside: 'close',
  // Esc while editing the queue: 'addon' (closes this window only; the game doesn't get the Esc) or 'both' (closes
  // this window and lets the Esc through to the game, which closes Edit Queue)
  escEditing: 'addon',
  // while editing the queue with its mods menu up, clicks go through this window to the menu under it
  modsPassThrough: true,
  // while the game's options menu is open, clicks go through this window too, and it turns this see-through (%)
  optionsPassThrough: true,
  optionsSeeThrough: 90,
  // and on the game's Add-ons page, hidden completely
  addonsSeeThrough: 100,
  // while the chat is open, the part of this window over it is cleared, so the chat shows and takes clicks there
  chatHole: true,
  // the local estimate: each map's newest this many real plays at the queue's rate (closest to your current level)
  localPlays: 5,
  // calibration simulates each real play again: the newest this many per map
  calibrationPlays: 5,
  // between simulator calls (the API allows 1200 a minute)
  callSpacingMs: 55,
  // when the simulator is busy: seconds to wait before each new try
  retryWaitsSec: [2, 4, 8, 16, 32],
  // after the queue changes: seconds without another change before scanning again
  // after a queue change, how long the queue has to stay the same before the update: right away when only
  // repeats changed, a moment when maps were added, removed or moved (so a few edits in a row update once)
  rescanWaitSec: { repeats: 0, maps: 1 },
  // how often the queue is checked for changes, while the window is open
  queueCheckMs: 500,
  // a queue change is updated from the stored simulator answers, no new calls except for new maps, while the
  // last full scan is younger than this; past it, a full scan
  quickUpdateMaxMin: 60,
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
  tabs: { overview: 'Overview', xp: 'XP', sv: 'Speed Jam / Memory', levels: 'Levels', suggest: 'Suggestions', debug: 'Debug' },
  stages: {
    cold: ['Cold', 'Play harder maps to warm up.'],
    warming: ['Warming Up', 'Play harder maps to reach Peak.'],
    peak: ['Peak', 'Your physical skills are at their best.'],
    pushing: ['Past Peak', 'Play easier maps to come back to it.'],
    fatigued: ['Fatigued', 'You earn less XP. Play easier maps to rest.'],
  },
  options: {
    scan: 'Scan queue',
    scanToStart: 'Scan to start',
    lookAhead: 'Look ahead',
    hours: 'hours',
    startAt: 'Start at',
    startAtTip: 'Leave empty to start from where your character is now',
    minOfStrain: 'minutes of strain',
    runs: 'Runs per play',
    runsTip: 'A play is random, so each one can be simulated a few times and averaged, as the official sim does. More runs: steadier numbers, but more simulator calls on the first scan (later scans reuse them).',
    animations: 'Animations',
    animationsTip: 'Turn off to stop every animation in this window, for performance.',
    rescan: 'Rescan when the queue changes',
    rescanTip: 'When you add, remove or move maps, or change a rate or repeats, the add-on updates by itself: right away for repeats, {sec} second after adding, removing or moving maps. It uses the answers it already has, so only new maps ask the simulator. Once the last full scan is over {min} minutes old, it scans again in full. Playing through the queue doesn\'t count as a change.',
    localPlays: 'Local plays',
    localPlaysTip: 'For the XP tab\'s local estimate: how many of your newest plays of each map (at the queue\'s rate and mods, last 24 hours) it averages. Fewer: closer to your current level. More: a steadier average. {n} by default.',
    memoryPlays: 'Memory plays',
    memoryPlaysTip: 'For maps that give Speed Jam or Memory XP: how many of your next plays of each the Speed Jam / Memory tab shows',
    windowGroup: 'Window',
    fade: 'Fade when the mouse is away',
    fadeTip: 'The window turns see-through while the mouse is outside it, and back when it comes in. The slider sets how see-through.',
    clickOutside: 'Click outside',
    clickOutsideTip: 'What a click outside the window does. A click on Edit the queue, or while it is open, never closes it.',
    escEditing: 'Esc while editing the queue',
    escEditingTip: 'What Esc does while Edit Queue is open: close only this window, or close it and Edit Queue too.',
    escAddon: 'Closes this window',
    escBoth: 'Closes it and Edit Queue',
    outsideClose: 'Closes it (the game ignores the click)',
    outsideThrough: 'Closes it (the game gets the click too)',
    outsideStay: 'Nothing',
    optionsPass: 'Click through when options or Add-ons is open',
    optionsPassTip: 'While the game\'s options menu or Add-ons page is open, this window turns see-through (hidden on Add-ons) and clicks go through it to the game.',
    chatHole: 'Show the chat through the window',
    chatHoleTip: 'While the chat is open, the part of this window over it is cleared, so the chat can be read and clicked there.',
    modsPass: 'Click through when mods menu is open',
    modsPassTip: 'While editing the queue with the mods menu open, this window turns see-through (as much as the fade slider says) and clicks go through it to the game, so the menu can be used even under it.',
  },
  status: {
    simulating: 'Simulating the queue…',
    busy: 'Simulator busy, retrying in {sec}s (try {n} of {of})…',
    busyNote: 'simulator busy, retrying (try {n} of {of})',
    queueChanged: 'Queue changed: updating in a moment…',
    rescanning: 'Queue changed: scanning again…',
    updating: 'Queue changed: updating…',
    countsTip: 'Calls reused: simulator answers kept from earlier scans, no server call. New calls: asked from the simulator now. Estimated: plays that borrowed the nearest stored answer after a queue change; press Scan queue for exact numbers.',
    queueChangedOff: 'Your queue changed since the scan. Press Scan queue to include it.',
    queueBack: 'The queue is back as scanned.',
    newRuns: 'Scan again to use the new number of runs.',
    stopped: 'Stopped. Press Scan queue to start again.',
    closed: 'Stopped: the window was closed. Press Scan queue to start again.',
  },
  xp: {
    noLocal: 'No local estimate: this XP rises and falls with how many times you\'ve played each map (Tries), so past plays don\'t tell the next ones. See the Speed Jam / Memory tab.',
    totalNoLocal: 'Without Speed Jam and Memory.',
  },
  levels: {
    title: 'Levels and XP',
    intro: 'How close each skill is to prestige with this queue. Click one for more information.',
    skill: 'Skill',
    xph: 'XP/h',
    prestige: 'Prestige',
    bar: 'Levels to prestige',
    readyNow: 'ready now',
    overall: 'Overall',
    rebirth: 'Rebirth',
    toRebirth: 'To rebirth',
    rebirthAt: 'Rebirth at overall Lv {n}',
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
    legendUpgrade: 'Upgrade',
    display: 'Display',
    viewRegular: 'Regular',
    viewOverall: 'Overall',
    viewRegularRoute: 'Regular + route',
    viewOverallRoute: 'Overall + route',
    useRoutes: 'Use routes',
    useRoutesTip: 'Gemini\'s level up sim is installed: its routes can be followed here. Upgrades are bought at your routes\' levels, and XP comes faster after each one.',
    introOverall: 'Each skill\'s overall level, as on your profile. Click one for more information.',
    introRoute: 'Upgrades are bought along your routes.',
    nextLevel: 'Next level',
    barOverall: 'Level progress',
    nextUpgrade: 'Next upgrade',
    upgradesLeft: 'Upgrades to go',
    upgradeAt: 'Upgrade #{k} at Lv {lv}',
    upgradeNow: 'now',
    routeDone: 'route done',
    noRoute: 'no route for P{p}',
  },
  matchHelp: 'How close the add-on is to what you really earned on these plays. 100% is a perfect match.',
};
/** A TEXT line with its {names} filled in. */
export const tx = (line, vars = {}) => String(line).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
