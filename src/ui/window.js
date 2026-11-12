// The window: mount, the options, scanning, and every tab.

import { SETTINGS, TEXT, VERSION, VERSION_ID, tx } from '../config.js';
import { cached, forecast, localPlaysOf, modsText, parseGains, saveCache, svCurves } from '../forecast.js';
import { MINDBLOCK, SKILLS, mapNames, diagLog, gameRows, geneticsFor, logProblem, movedOn, num, queueKey, readQueue, setting } from '../game.js';
import { BAR_ZONES, STAGES, STRAIN_CAP, XP_CUT, barKnots, barOf, gainLevels, levelOf, stageOf, warmup, xpForLevel } from '../rules/fatigue.js';
import { fatigueGenesOf } from '../rules/genes.js';
import { readRoutes, routeCumXp, simulateRoute } from '../rules/routes.js';
import { LOG_READ_KEY, MATCH_HELP, NOTICE_READ_KEY, SKILL_NAMES, SKILL_SHORT, STAGE_COLOR, TABS, arrows, barHtml, changelogHtml, clock, hotfixHtml, hotfixId, HOTFIX_READ_KEY, dur, durH, durWords, esc, fmt, graphHtml, logId, matchColor, matchText, minText, noticeHtml, noticeId, shortTime, unitsHtml, wireSlider } from './parts.js';
import { CSS } from './style.js';

export let root = null;
export let keyListener = null;
/** Closes the window on a click outside it. */
export let outsideListener = null;
/** Lets clicks through the window while the mods menu is up in Edit Queue. */
export let moveListener = null;
export let styleEl = null;
/** Bumped to stop a scan that is running. */
export let scanToken = 0;
/** Checks for new real plays every 2 seconds while the XP tab is open. */
export let liveTimer = null;
export let queueTimer = null;


export const mount = (meta, host) => {
  unmount();
  const api = (host && host.api) || (globalThis.ossIdle && globalThis.ossIdle.api);

  styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  root = document.createElement('div');
  root.id = 'qs-window';
  root.className = 'qs-fresh';
  root.innerHTML = `
    <div class="qs-head"><span class="qs-title">Queue Strain</span><span class="qs-ver">v${VERSION}</span><span class="qs-key">Alt+Shift+F · Esc</span>${noticeHtml()}${changelogHtml()}${hotfixHtml()}<button class="qs-x" title="Close">✕</button></div>
    <div class="qs-body">
      <div class="qs-top">
        <div class="qs-card" id="qs-now"><div class="qs-h">Strain Status</div><div class="qs-dim">Press <b>Scan queue</b> to read your strain and simulate the queue that is playing.</div></div>
        <div class="qs-card">
          <div class="qs-start" id="qs-start-hint">${TEXT.options.scanToStart}</div>
          <div class="qs-row">
            <span class="qs-dim">${TEXT.options.lookAhead}</span><input id="qs-hours" type="number" min="1" max="24" step="1" inputmode="numeric" value="${SETTINGS.lookAheadHours}"><span class="qs-dim">${TEXT.options.hours}</span>
            <span class="qs-dim" style="margin-left:8px;" title="${esc(TEXT.options.startAtTip)}">${TEXT.options.startAt}</span><input id="qs-start" type="number" min="0" max="420" step="1" placeholder="now"><span class="qs-dim">${TEXT.options.minOfStrain}</span>
            <button class="qs-btn" id="qs-scan" style="margin-left:auto;">${TEXT.options.scan}</button>
          </div>
          <div class="qs-row" style="margin-top:6px;">
            <span class="qs-dim" title="${esc(TEXT.options.runsTip)}">${TEXT.options.runs}</span><input id="qs-runs" type="number" min="1" max="5" step="1" value="${SETTINGS.runsPerPlay}" style="width:44px;">
            <span class="qs-dim" style="margin-left:8px;" title="${esc(tx(TEXT.options.localPlaysTip, { n: SETTINGS.localPlays }))}">${TEXT.options.localPlays}</span><input id="qs-local" type="number" min="1" max="50" step="1" value="${SETTINGS.localPlays}" style="width:44px;">
            <label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(TEXT.options.animationsTip)}"><input id="qs-anim" type="checkbox"${SETTINGS.animations ? ' checked' : ''} style="margin:0;"> ${TEXT.options.animations}</label>
            <label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(tx(TEXT.options.rescanTip, { sec: SETTINGS.rescanWaitSec.maps, min: SETTINGS.quickUpdateMaxMin }))}"><input id="qs-auto" type="checkbox"${SETTINGS.rescanOnQueueChange ? ' checked' : ''} style="margin:0;"> ${TEXT.options.rescan}</label>
            <span class="qs-dim" style="margin-left:auto;" title="${esc(TEXT.options.memoryPlaysTip)}">${TEXT.options.memoryPlays}</span><input id="qs-memplays-top" type="number" min="1" max="40" step="1" value="${SETTINGS.memoryPlays}" style="width:44px;">
          </div>
          <details class="qs-group" id="qs-win-group"><summary>${TEXT.options.windowGroup}</summary>
            <div class="qs-row">
              <label class="qs-dim" style="display:flex; align-items:center; gap:4px;" title="${esc(TEXT.options.fadeTip)}"><input id="qs-fade" type="checkbox" style="margin:0;"> ${TEXT.options.fade}</label>
              <input id="qs-fade-amt" type="range" min="10" max="90" step="10" style="width:90px; accent-color:#9ca3af;" title="${esc(TEXT.options.fadeTip)}"><span id="qs-fade-val" class="qs-dim" style="min-width:30px;"></span>
              <span style="display:inline-flex; align-items:center; gap:6px; margin-left:8px;"><span class="qs-dim" title="${esc(TEXT.options.clickOutsideTip)}">${TEXT.options.clickOutside}</span>
              <select id="qs-outside" style="width:auto;" title="${esc(TEXT.options.clickOutsideTip)}"><option value="close">${TEXT.options.outsideClose}</option><option value="through">${TEXT.options.outsideThrough}</option><option value="stay">${TEXT.options.outsideStay}</option></select></span>
              <span style="display:inline-flex; align-items:center; gap:6px; margin-left:8px;"><span class="qs-dim" title="${esc(TEXT.options.escEditingTip)}">${TEXT.options.escEditing}</span>
              <select id="qs-esc-edit" style="width:auto;" title="${esc(TEXT.options.escEditingTip)}"><option value="addon">${TEXT.options.escAddon}</option><option value="both">${TEXT.options.escBoth}</option></select></span>
              <label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(TEXT.options.modsPassTip)}"><input id="qs-modspass" type="checkbox" style="margin:0;"> ${TEXT.options.modsPass}</label>
              <label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(TEXT.options.optionsPassTip)}"><input id="qs-optspass" type="checkbox" style="margin:0;"> ${TEXT.options.optionsPass}</label>
              <label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(TEXT.options.chatHoleTip)}"><input id="qs-chathole" type="checkbox" style="margin:0;"> ${TEXT.options.chatHole}</label>
            </div>
          </details>
          <div id="qs-status" class="qs-dim" style="margin-top:6px;"></div>
        </div>
      </div>
      <div id="qs-out"></div>
    </div>`;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const nowEl = $('#qs-now'), outEl = $('#qs-out'), statusEl = $('#qs-status'), scanBtn = $('#qs-scan');
  /** The status line under the buttons, with what hovering it explains (nothing by default). */
  const setStatus = (text, tip = '') => { statusEl.textContent = text; statusEl.title = tip; };
  /** The look-ahead as whole hours from 1 to 24 (an old saved 6.5 becomes 7). */
  const wholeHours = (v) => { const n = parseFloat(v); return Math.min(24, Math.max(1, Math.round(Number.isFinite(n) ? n : SETTINGS.lookAheadHours))); };
  const hoursInput = $('#qs-hours'), startInput = $('#qs-start'), runsInput = $('#qs-runs'), memTopInput = $('#qs-memplays-top'), autoBox = $('#qs-auto'), animBox = $('#qs-anim'), localInput = $('#qs-local');
  /** How many of the next plays of each Speed Jam / Memory map to show: set in that tab, 12 at first. */
  let memPlays = SETTINGS.memoryPlays;
  const memPlaysOf = () => memPlays;
  /** The tab shown (Overview on the first scan after the game starts, then the one picked), and how many
   *  plays the Debug tab lists. */
  let activeTab = 'overview';
  /** The Levels tab's display: 'regular' or 'overall' (each skill's lifetime level, as on the profile), each also
   *  with '-route' (upgrades bought along the route add-on's routes); and whether routes are used at all. */
  let levelsView = 'regular', useRoutes = true;
  let debugLimit = 50;
  /** Debug's every-play section: one table of all plays, or one map's plays at a time as a card. */
  let debugView = 'table', debugMap = 0;
  try {
    const saved = JSON.parse(localStorage.getItem('queue-strain:prefs') || '{}');
    if (saved.hours) hoursInput.value = wholeHours(saved.hours);
    if (['regular', 'overall', 'regular-route', 'overall-route'].includes(saved.levelsView)) levelsView = saved.levelsView.startsWith('overall') ? 'overall' : 'regular';
    if (saved.useRoutes !== undefined) useRoutes = !!saved.useRoutes;
    autoBox.checked = saved.autoRescan ?? SETTINGS.rescanOnQueueChange;
    animBox.checked = saved.animations ?? SETTINGS.animations;
    if (saved.localPlays) localInput.value = String(Math.min(50, Math.max(1, Math.round(saved.localPlays))));
    root.classList.toggle('qs-noanim', !animBox.checked);
    if (saved.runsPerPlay2) runsInput.value = String(Math.min(5, Math.max(1, Math.round(saved.runsPerPlay2))));
    if (saved.memPlays) memPlays = Math.min(40, Math.max(1, Math.round(saved.memPlays)));
    memTopInput.value = String(memPlays);
  } catch (_) {}
  // the Window group: fade while the mouse is away, and what a click outside does
  const winGroup = $('#qs-win-group'), fadeBox = $('#qs-fade'), fadeAmt = $('#qs-fade-amt'), fadeVal = $('#qs-fade-val'), outsideSel = $('#qs-outside'), modsBox = $('#qs-modspass'), escSel = $('#qs-esc-edit'), optsBox = $('#qs-optspass'), chatBox = $('#qs-chathole');
  fadeBox.checked = SETTINGS.fadeAway; fadeAmt.value = String(SETTINGS.fadeAmount); outsideSel.value = SETTINGS.clickOutside; modsBox.checked = SETTINGS.modsPassThrough; escSel.value = SETTINGS.escEditing; optsBox.checked = SETTINGS.optionsPassThrough; chatBox.checked = SETTINGS.chatHole;
  try {
    const saved = JSON.parse(localStorage.getItem('queue-strain:prefs') || '{}');
    if (['addon', 'both'].includes(saved.escEditing)) escSel.value = saved.escEditing;
    if (saved.optionsPassThrough !== undefined) optsBox.checked = !!saved.optionsPassThrough;
    if (saved.chatHole !== undefined) chatBox.checked = !!saved.chatHole;
    if (saved.modsPassThrough !== undefined) modsBox.checked = !!saved.modsPassThrough;
    if (saved.fade !== undefined) fadeBox.checked = !!saved.fade;
    if (saved.fadeAmount) fadeAmt.value = String(Math.min(90, Math.max(10, Math.round(saved.fadeAmount / 10) * 10)));
    if (['close', 'through', 'stay'].includes(saved.clickOutside)) outsideSel.value = saved.clickOutside;
    if (saved.windowGroupOpen) winGroup.open = true;
  } catch (_) {}
  let mouseIn = true;
  /** Where the mouse last was anywhere on the page, so opening the window under it counts as the mouse being in. */
  let mouseX = -1, mouseY = -1; // kept by moveListener
  /** See-through while the mouse is away (when that's on), solid otherwise; never before the first scan's results,
   *  while the window is still the small "scan to start" one. */
  const applyFade = () => {
    fadeVal.textContent = `${fadeAmt.value}%`;
    fadeAmt.disabled = !fadeBox.checked && !modsBox.checked;
    // while clicks pass through (mods menu, options menu) it is see-through too, whether or not fading is on
    if (passSeeThrough) { root.style.opacity = String(1 - passSeeThrough / 100); return; }
    let fade = fadeBox.checked && !mouseIn && !root.classList.contains('qs-fresh');
    // while editing the queue (the dock without its source line), stay solid while the mouse works in the queue,
    // to the left of the window, inside a cone that widens from its left edge at 45° (the "safe triangle" of menus,
    // so a slanted move into the queue doesn't count as leaving); fade above or below that cone, or to its right
    if (fade && !document.querySelector('.dock__source') && document.querySelector('.dock')) {
      const r = root.getBoundingClientRect(), d = r.left - mouseX;
      if (d > 0 && mouseY >= r.top - d && mouseY <= r.bottom + d) fade = false;
    }
    root.style.opacity = fade ? String(1 - Number(fadeAmt.value) / 100) : '';
  };
  /** How see-through the window is while clicks pass through it (in %), or 0 while they don't. */
  let passSeeThrough = 0;
  /** Whether the mouse is over the window right now: by the hover state, or by where it last moved. */
  const checkMouse = () => {
    const r = root.getBoundingClientRect();
    mouseIn = root.matches(':hover') || (mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom);
    applyFade();
  };
  root.addEventListener('mouseenter', () => { mouseIn = true; applyFade(); });
  root.addEventListener('mouseleave', () => { mouseIn = false; applyFade(); });
  const savePrefs = () => {
    try { localStorage.setItem('queue-strain:prefs', JSON.stringify({ hours: wholeHours(hoursInput.value), runsPerPlay2: parseInt(runsInput.value, 10) || SETTINGS.runsPerPlay, autoRescan: autoBox.checked, animations: animBox.checked, localPlays: localCount(), memPlays, tab: activeTab, fade: fadeBox.checked, fadeAmount: Number(fadeAmt.value), clickOutside: outsideSel.value, modsPassThrough: modsBox.checked, optionsPassThrough: optsBox.checked, chatHole: chatBox.checked, escEditing: escSel.value, levelsView, useRoutes, windowGroupOpen: winGroup.open })); } catch (_) {}
  };
  modsBox.addEventListener('change', () => { applyFade(); savePrefs(); });
  escSel.addEventListener('change', savePrefs);
  fadeBox.addEventListener('change', () => { applyFade(); savePrefs(); });
  fadeAmt.addEventListener('input', applyFade);
  fadeAmt.addEventListener('change', savePrefs);
  outsideSel.addEventListener('change', savePrefs);
  winGroup.addEventListener('toggle', savePrefs);
  applyFade();
  // look-ahead: whole hours from 1 to 24, digits only (no dot, comma, minus or exponent)
  hoursInput.addEventListener('keydown', (ev) => { if (['.', ',', '-', '+', 'e', 'E'].includes(ev.key)) ev.preventDefault(); });
  hoursInput.addEventListener('change', () => { hoursInput.value = wholeHours(hoursInput.value); savePrefs(); });
  /** The last result, drawn again when a choice changes: no new scan, no calls. */
  let lastResult = null;
  /** Which Speed Jam / Memory map the tab shows: one at a time, paged with ‹ and ›. */
  let svPage = 0;
  /** How many newest plays per map the local estimate uses: the Local plays option. */
  const localCount = () => Math.min(50, Math.max(1, Math.round(parseFloat(localInput.value) || SETTINGS.localPlays)));
  /** The Levels tab's skills opened for detail: kept across redraws. */
  const levelsOpen = new Set();
  /** Whether the XP tab's "Local plays per map" list is open: kept across redraws. */
  let localOpen = false;
  /** The newest real play seen: a newer one redraws the XP tab's local estimate. */
  let liveNewest = 0;
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(async () => {
    // only while the XP tab of a finished scan is on screen; the game's database is local, so this costs no call
    if (!root || !shown() || scanning || !lastResult || activeTab !== 'xp') return;
    const [queue, ctx, , r] = lastResult;
    let newest = 0;
    try {
      const rows = await gameRows('SELECT playedAt FROM score_xp WHERE characterId = ? ORDER BY playedAt DESC LIMIT 1', [ctx.row.id]);
      newest = num(rows && rows[0] && rows[0].playedAt);
    } catch (_) { return; }
    if (!newest || newest <= liveNewest) return;
    const first = !liveNewest;
    liveNewest = newest;
    // the first look only notes where the plays stand, unless one came in since the scan
    if (first && newest <= num(r.scannedAt)) return;
    const local = await localPlaysOf(ctx.row, queue, ctx.rate, localCount(), ctx.mods);
    if (lastResult[3] !== r || scanning) return;
    r.local = local;
    r.localAt = Date.now();
    renderResult(...lastResult);
  }, 2000);
  autoBox.addEventListener('change', () => { savePrefs(); changedKey = null; });
  /** Local plays changed: the local estimate is read again from the game's database and redrawn, with no new scan. */
  localInput.addEventListener('change', async () => {
    localInput.value = String(localCount());
    savePrefs();
    if (!lastResult || scanning) return;
    const [queue, ctx, , r] = lastResult;
    const local = await localPlaysOf(ctx.row, queue, ctx.rate, localCount(), ctx.mods);
    if (lastResult[3] !== r || scanning) return;
    r.local = local;
    renderResult(...lastResult);
  });
  animBox.addEventListener('change', () => { root.classList.toggle('qs-noanim', !animBox.checked); savePrefs(); });

  // ---- the queue, watched: a change of maps, order, rates or repeats scans again by itself ----
  /** The queue the last scan read; null before any. */
  let scanKey = null;
  /** A change waiting to settle: its queue and when it was first seen. */
  let changedKey = null, changedAt = 0;
  /** The character's upgrades and prestiges at the last scan, to rescan when one changes (an upgrade bought). */
  let upgKey = null, upgChar = null, upgCheckAt = 0;
  const upgKeyOf = (row) => SKILLS.map(sk => `${num(row[`${sk}Upgrades`])}/${num(row[`${sk}Prestige`])}`).join(',');
  const watchUpgrades = async () => {
    if (!root || !shown() || !upgKey || upgChar === null || autoPaused || scanning || !autoBox.checked) return;
    const now = Date.now();
    if (now - upgCheckAt < 5000) return;
    upgCheckAt = now;
    const rows = await gameRows('SELECT * FROM character WHERE id = ? LIMIT 1', [upgChar]);
    if (!rows || !rows[0] || scanning) return;
    if (upgKeyOf(rows[0]) !== upgKey) { upgKey = upgKeyOf(rows[0]); void scan(TEXT.status.updating, true); }
  };
  /** A scan the player stopped (or closed the window on) isn't started again by itself until they scan. */
  let autoPaused = false;
  /** How long a change waits before the update: none when only repeats changed, a moment when the maps did. */
  const waitFor = (then, now) => {
    const maps = (key) => key.map(k => k.replace(/x\d+$/, '')).join('|');
    return (maps(then) === maps(now) ? SETTINGS.rescanWaitSec.repeats : SETTINGS.rescanWaitSec.maps) * 1000;
  };
  /** The queue is checked every SETTINGS.queueCheckMs, only while the window is open. */
  const startQueueWatch = () => { if (!queueTimer) queueTimer = setInterval(() => { fitAroundQueue(); updateOverlays(); watchQueue(); void watchUpgrades(); }, SETTINGS.queueCheckMs); };
  const stopQueueWatch = () => { if (queueTimer) { clearInterval(queueTimer); queueTimer = null; } };
  const watchQueue = () => {
    if (!root || !shown() || !scanKey || autoPaused) return;
    const q = readQueue();
    // no dock on screen (main menu, editor): nothing to compare
    if (!q) return;
    const key = queueKey(q.entries);
    const same = key.join('|') === scanKey.join('|') || movedOn(scanKey, key);
    if (same) {
      if (changedKey) {
        changedKey = null;
        if (!scanning && nowEl.dataset.busy === 'Out of date: queue changed') { nowEl.classList.remove('qs-busy'); setStatus(TEXT.status.queueBack); }
      }
      return;
    }
    if (!q.entries.length) return;
    if (!autoBox.checked) {
      if (!changedKey) {
        changedKey = key;
        if (!scanning) { nowEl.classList.add('qs-busy'); nowEl.dataset.busy = 'Out of date: queue changed'; }
        setStatus(TEXT.status.queueChangedOff);
      }
      return;
    }
    const now = Date.now();
    if (!changedKey || changedKey.join('|') !== key.join('|')) {
      changedKey = key;
      changedAt = now;
      if (waitFor(scanKey, key) > 0) { setStatus(TEXT.status.queueChanged); return; }
    }
    if (now - changedAt < waitFor(scanKey, key)) return;
    changedKey = null;
    if (scanning) { scanToken++; setScanning(false); }
    const quick = !!lastResult && lastFullAt > 0 && now - lastFullAt < SETTINGS.quickUpdateMaxMin * 60000;
    void scan(quick ? TEXT.status.updating : TEXT.status.rescanning, quick);
  };

  runsInput.addEventListener('change', () => {
    runsInput.value = String(Math.min(5, Math.max(1, Math.round(parseFloat(runsInput.value) || SETTINGS.runsPerPlay))));
    savePrefs();
    if (lastResult) setStatus(TEXT.status.newRuns);
  });
  /** A new Memory plays count from that tab: only those curves again, mostly from the cache. */
  const setMemPlays = async (value) => {
    memPlays = Math.min(40, Math.max(1, Math.round(parseFloat(value) || SETTINGS.memoryPlays)));
    memTopInput.value = String(memPlays);
    savePrefs();
    if (!lastResult || scanning || !lastResult[3].simulate) return;
    const [queue, ctx, now, r] = lastResult;
    const token = ++scanToken;
    r.useToken(token);
    setScanning(true);
    try {
      r.sv = await svCurves(queue, r, memPlaysOf(), token, () => {
        if (token === scanToken) setStatus(`Checking Speed Jam / Memory maps… ${r.counts().calls} sim calls`);
      });
      saveCache();
      if (token === scanToken) { renderResult(queue, ctx, now, r); setStatus(`Speed Jam / Memory XP over the next ${memPlaysOf()} plays.`); }
    } catch (e) {
      if (!(e && e.message === 'stopped')) setStatus(`Failed: ${e && e.message ? e.message : e}`);
    } finally {
      if (token === scanToken) setScanning(false);
    }
  };

  memTopInput.addEventListener('change', () => void setMemPlays(memTopInput.value));

  /** Put the window in the middle of the screen: once, when the full window opens after the first scan.
   *  It stays wherever it is dragged after that. */
  const center = () => {
    if (!shown()) return;
    const r = root.getBoundingClientRect();
    root.style.left = `${Math.max(0, Math.round((innerWidth - r.width) / 2))}px`;
    root.style.top = `${Math.max(0, Math.round((innerHeight - r.height) / 2))}px`;
    root.style.right = 'auto';
  };
  /** Center the window top to bottom only, keeping where the player put it left to right: when a tab or a new
   *  result changes its height, so it never runs off the bottom of the screen. */
  const centerVertically = () => {
    if (!shown()) return;
    const r = root.getBoundingClientRect();
    root.style.top = `${Math.max(0, Math.round((innerHeight - r.height) / 2))}px`;
  };
  /** While the game's Edit Queue is open (the dock moves to the left column, without its source line), the window
   *  moves out of its way to the right and is centred top to bottom. It goes back to where it was when Edit Queue
   *  closes, unless the player moved it in between. */
  let beforeEdit = null;
  const editQueueOpen = () => !document.querySelector('.dock__source') && !!document.querySelector('.dock');
  const fitAroundQueue = () => {
    if (!shown()) return;
    if (editQueueOpen()) {
      const dock = document.querySelector('.dock').getBoundingClientRect(), r = root.getBoundingClientRect();
      if (beforeEdit || r.left >= dock.right + 8) return;
      beforeEdit = { left: root.style.left, top: root.style.top, right: root.style.right };
      root.style.left = `${Math.max(0, Math.min(Math.round(dock.right + 12), innerWidth - r.width))}px`;
      root.style.right = 'auto';
      centerVertically();
      beforeEdit.placed = { left: root.style.left, top: root.style.top };
    } else if (beforeEdit) {
      // put it back only if it is still where it was moved to
      if (root.style.left === beforeEdit.placed.left && root.style.top === beforeEdit.placed.top) {
        root.style.left = beforeEdit.left; root.style.top = beforeEdit.top; root.style.right = beforeEdit.right;
      }
      beforeEdit = null;
    }
  };
  const show = () => { root.style.display = 'flex'; startQueueWatch(); fitAroundQueue(); checkMouse(); };
  /** Whether a scan is running: the button reads Stop while it is. */
  let scanning = false;
  const setScanning = (on) => {
    scanning = on;
    scanBtn.textContent = on ? 'Stop' : 'Scan queue';
    scanBtn.classList.toggle('qs-stop', on);
  };
  /** Stop the running scan for good: what it found so far is dropped, and nothing resumes it. */
  const stopScan = (why) => {
    if (!scanning) return;
    scanToken++;
    saveCache();
    setScanning(false);
    if (nowEl.classList.contains('qs-busy')) nowEl.dataset.busy = 'Out of date: press Scan queue';
    setStatus(why);
  };
  const hide = () => { closeConsole(); stopQueueWatch(); changedKey = null; if (scanning) autoPaused = true; stopScan(TEXT.status.closed); root.style.display = 'none'; };
  const shown = () => !!root && root.style.display === 'flex';
  $('.qs-x').onclick = hide;
  /** Mark as read, on the warning sign, the changelog and the hotfixes: each turns gray and stays so until its id or text changes. */
  const wireNotice = () => {
    for (const btn of root.querySelectorAll('.qs-notice-read')) {
      btn.onclick = (e) => {
        e.stopPropagation();
        const kind = btn.dataset.kind;
        const [key, id, html] = kind === 'log' ? [LOG_READ_KEY, logId(), changelogHtml] : kind === 'hotfix' ? [HOTFIX_READ_KEY, hotfixId(), hotfixHtml] : [NOTICE_READ_KEY, noticeId(), noticeHtml];
        try { localStorage.setItem(key, id); } catch (_) {}
        btn.closest('.qs-notice').outerHTML = html();
        wireNotice();
      };
    }
  };
  wireNotice();

  // drag by the title bar
  const head = $('.qs-head');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => { root.style.left = `${Math.max(0, ev.clientX - dx)}px`; root.style.top = `${Math.max(0, ev.clientY - dy)}px`; root.style.right = 'auto'; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  /** Whether one of the game's menus is open: the options menu, or the Add-ons page (told by its title). */
  const optionsOpen = () => !!document.querySelector('.options__container.open');
  const addonsPageOpen = () => [...document.querySelectorAll('.page__title')].some(el => el.textContent.trim() === 'Add-ons');
  const gameMenuOpen = () => optionsOpen() || addonsPageOpen();

  // the game's own keys come after: Alt+Shift+F and Esc stop here
  keyListener = (e) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') {
      e.preventDefault();
      e.stopPropagation();
      if (shown()) hide(); else show();
    } else if (e.key === 'Escape' && shown() && (gameMenuOpen() || document.querySelector('.community-chat-container.is-enabled'))) {
      // the game's options menu or chat is open: this Esc is for it, the window stays (the next Esc closes it)
      return;
    } else if (e.key === 'Escape' && shown()) {
      // while editing the queue, "close both" lets this Esc go on to the game, which closes Edit Queue
      if (!consoleEl && escSel.value === 'both' && editQueueOpen()) { hide(); return; }
      e.preventDefault();
      e.stopPropagation();
      if (consoleEl) closeConsole(); else hide();
    }
  };
  window.addEventListener('keydown', keyListener, true);

  // a click outside the window (and its console) closes it; never while Edit Queue is open, since the player is
  // editing the queue this window follows, nor on the button that opens it or the dock it sits in: the window moves
  // out of the way instead (fitAroundQueue)
  const opensEditQueue = (el) => {
    if (el.closest('.dock, [class*="dock__"]')) return true;
    const btn = el.closest('button, a, [role="button"]');
    return !!btn && /edit\s+(the\s+)?queue/i.test(`${btn.textContent} ${btn.getAttribute('title') || ''} ${btn.getAttribute('aria-label') || ''}`);
  };
  outsideListener = (e) => {
    if (!shown() || !(e.target instanceof Element) || editQueueOpen()) return;
    if (root.contains(e.target) || (consoleEl && consoleEl.contains(e.target))) return;
    if (opensEditQueue(e.target)) { setTimeout(fitAroundQueue, 150); return; }
    // clicks meant to go through the window (a menu open under it) or into the open chat are the game's: leave them be
    if (passSeeThrough || e.target.closest('.options__container.open, .community-chat-container.is-enabled')) return;
    if (outsideSel.value === 'stay') return;
    if (outsideSel.value === 'close') {
      // the game doesn't get this click: stop it, and the release and click that follow it
      e.preventDefault(); e.stopPropagation();
      const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      for (const type of ['pointerup', 'mouseup', 'click']) window.addEventListener(type, swallow, { capture: true, once: true });
      setTimeout(() => { for (const type of ['pointerup', 'mouseup', 'click']) window.removeEventListener(type, swallow, { capture: true }); }, 600);
    }
    hide();
  };
  window.addEventListener('pointerdown', outsideListener, true);

  // while editing the queue with its mods menu (.mod-select) up, clicks go through the window to the game, if that's
  // on; checked as the mouse moves, so it follows the menu opening and closing right away
  moveListener = (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    updateOverlays();
  };
  window.addEventListener('pointermove', moveListener, true);
  // a wheel turned over the chat scrolls the chat, even where this window lies over or under it (issue #11)
  root.addEventListener('wheel', (e) => {
    const chat = document.querySelector('.community-chat-container.is-enabled');
    if (!chat) return;
    const c = chat.getBoundingClientRect();
    if (e.clientX < c.left || e.clientX > c.right || e.clientY < c.top || e.clientY > c.bottom) return;
    // the chat's scrolling list under the mouse: the first element below this window that can scroll
    const under = document.elementsFromPoint(e.clientX, e.clientY).find(el => !root.contains(el) && chat.contains(el)) || chat;
    for (let el = under; el && el !== document.body; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        el.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        e.preventDefault();
        return;
      }
      if (el === chat) break;
    }
  }, { passive: false });
  /** The game's menus over or under the window: while the mods menu (in Edit Queue) or the options menu is open,
   *  clicks go through the whole window and it turns see-through; while the chat is open, the part of the window
   *  over it is cut out, so the chat shows and takes clicks there. Run as the mouse moves and with the queue check. */
  const updateOverlays = () => {
    if (!shown()) return;
    if (!mouseIn) applyFade(); // the mouse moving between the queue and the right side changes the fade while editing
    const mods = modsBox.checked && editQueueOpen() && !!document.querySelector('.mod-select');
    const addons = optsBox.checked && addonsPageOpen(), opts = optsBox.checked && optionsOpen();
    const see = addons ? SETTINGS.addonsSeeThrough : opts ? SETTINGS.optionsSeeThrough : mods ? Number(fadeAmt.value) : 0;
    root.style.pointerEvents = see ? 'none' : '';
    if (see !== passSeeThrough) { passSeeThrough = see; root.classList.toggle('qs-passing', !!see); applyFade(); }
    // the chat's hole, in the window's own pixels: only while the mouse is in the chat's area, so the whole window
    // comes back as soon as the mouse is anywhere else (over the window included); nothing when they don't overlap
    const chat = chatBox.checked ? document.querySelector('.community-chat-container.is-enabled') : null;
    let hole = '';
    const inChat = chat && (() => { const c = chat.getBoundingClientRect(); return mouseX >= c.left && mouseX <= c.right && mouseY >= c.top && mouseY <= c.bottom; })();
    if (chat && inChat) {
      const r = root.getBoundingClientRect(), c = chat.getBoundingClientRect();
      const x1 = Math.max(c.left, r.left) - r.left, y1 = Math.max(c.top, r.top) - r.top;
      const x2 = Math.min(c.right, r.right) - r.left, y2 = Math.min(c.bottom, r.bottom) - r.top;
      if (x2 > x1 && y2 > y1) {
        const w = r.width, h = r.height, px = (v) => `${Math.round(v)}px`;
        hole = `polygon(evenodd, 0 0, ${px(w)} 0, ${px(w)} ${px(h)}, 0 ${px(h)}, 0 0, ${px(x1)} ${px(y1)}, ${px(x2)} ${px(y1)}, ${px(x2)} ${px(y2)}, ${px(x1)} ${px(y2)}, ${px(x1)} ${px(y1)})`;
      }
    }
    if (root.style.clipPath !== hole) root.style.clipPath = hole;
  };
  optsBox.addEventListener('change', () => { updateOverlays(); savePrefs(); });
  chatBox.addEventListener('change', () => { updateOverlays(); savePrefs(); });

  /** The state's name over the bar, at the mark where that state begins (Sweet Spot in the middle of its band, the
   *  ends at the bar's ends), with the next play's arrows on the side it heads to (inward at the ends); the name alone is centred. */
  const STATE_AT = { cold: 0, warming: 20, peak: 50, pushing: 80, fatigued: 100 };
  const stateLabel = (c, name) => {
    const at = STATE_AT[c.stage] ?? 50, edge = at <= 0 ? 'left' : at >= 100 ? 'right' : '';
    const tr = c.trend ? `<span class="qs-trend" title="Where the next play pushes it">${arrows(c.trend)}</span>` : '';
    const right = edge === 'left' || (edge !== 'right' && c.trend > 0);
    const nm = `<span style="color:${STAGE_COLOR[c.stage]}">${name}</span>`;
    const pos = edge === 'left' ? 'left:0;' : edge === 'right' ? 'right:0;' : `left:${at}%; transform:translateX(-50%);`;
    return `<span class="qs-state" style="${pos}">${nm}${tr.replace('class="qs-trend"', `class="qs-trend ${right ? 'side-r' : 'side-l'}"`)}</span>`;
  };
  const renderNow = (c) => {
    const [name, hint] = STAGES[c.stage];
    nowEl.innerHTML = `
      <div class="qs-h">Strain Status</div>
      <div><b>${name}</b> - ${hint}</div>
      <div>${minText(c.minutes)} of strain / ${Math.round(c.warm * 100)}% warm / sweet spot from ${Math.round(c.knots[1])} minutes / <span style="color:#f87171">XP cut at ${Math.round(c.knots[3])} minutes</span></div>
      <div class="qs-bar-labels">${stateLabel(c, name)}</div>
      ${barHtml(c.bar, c.ahead)}
      ${c.note ? `<div class="qs-dim">${c.note}</div>` : ''}`;
    wireSlider(nowEl, c.ahead);
  };

  /** While the simulator is busy: until when, and what to say beside the progress. */
  let busyUntil = 0, busyNote = '';
  /** When the last full scan finished: a queue change is updated from its answers until it gets old. */
  let lastFullAt = 0;
  /** A scan. `quick`: after a queue change, from the stored answers (only new maps ask the simulator), with the
   *  last result left on screen until the new one is ready. */
  const scan = async (why = '', quick = false) => {
    const token = ++scanToken;
    autoPaused = false;
    changedKey = null;
    closeConsole();
    $('#qs-start-hint').style.display = 'none';
    // the Strain Status of the last scan is grayed out until this one is done
    if (!quick) {
      nowEl.classList.add('qs-busy');
      nowEl.dataset.busy = 'Scanning…';
      outEl.innerHTML = '';
    }
    setScanning(true);
    setStatus(why);
    const scanStarted = Date.now();
    const fail = (msg) => { logProblem('scan', msg); if (token === scanToken) { outEl.innerHTML = `<div class="qs-err">${esc(msg)}</div>`; setStatus(''); } };
    try {
      if (!api || typeof api.simulate !== 'function') throw new Error('This version of the game hands add-ons no simulator: update oss!idle.');
      let me = null;
      try { me = await api.me(); } catch (_) { me = null; }
      const typed = startInput.value.trim() === '' ? NaN : parseFloat(startInput.value);
      if (!me && !(typed >= 0)) throw new Error('Your fatigue could not be read (a guest character, or offline). Type your strain minutes in "Start at" to estimate from there.');
      const charId = me ? num(me.character_id) : null;
      let rows = charId ? await gameRows('SELECT * FROM character WHERE id = ? LIMIT 1', [charId]) : null;
      if (rows === null) throw new Error('The game has not opened its database yet.');
      if (!rows.length) rows = await gameRows('SELECT * FROM character WHERE current = 1 LIMIT 1');
      const row = rows && rows[0];
      if (row) { upgKey = upgKeyOf(row); upgChar = row.id; }
      if (!row) throw new Error('Your character was not found in the game\'s database.');

      const geneSource = await geneticsFor(row);
      const genes = fatigueGenesOf(geneSource.genetics);
      const gear = num(row.staminaUpgrades);
      const knots = barKnots(gear, genes);
      const startMinutes = typed >= 0 ? Math.min(STRAIN_CAP, typed) : num(me.fatigue && me.fatigue.minutes);
      const barNow = barOf(startMinutes, knots);
      const gameBar = !(typed >= 0) && me.warmup && typeof me.warmup.bar === 'number' ? me.warmup.bar : undefined;
      // a check of the port: the game's own bar for the same minutes
      let note = '';
      if (gameBar !== undefined && Math.abs(gameBar - barNow) > 0.02) {
        note = `The game shows the bar at ${(gameBar * 100).toFixed(0)}%, this add-on at ${(barNow * 100).toFixed(0)}%, so the estimates may be off.`;
      }
      if (typed >= 0) note = `Starting from ${minText(startMinutes)} of strain (typed in).`;
      const now = { minutes: startMinutes, bar: barNow, gameBar, typed: typed >= 0, warm: warmup(startMinutes, gear, genes), stage: stageOf(barNow), knots, note };

      const queue = readQueue();
      if (!queue) throw new Error('No queue found. The add-on reads the queue from the dock at the bottom of the game: start a playlist or queue so the dock shows it. If one is playing and this still shows, a game update has moved the dock and the add-on needs an update.');
      if (!queue.entries.length) throw new Error('The queue is empty.');
      scanKey = queueKey(queue.entries);

      const hours = wholeHours(hoursInput.value);
      const ctx = {
        api, row, genes, geneSource, gear, startMinutes, hours, runs: parseInt(runsInput.value, 10) || SETTINGS.runsPerPlay,
        onRetry: (n, of, pause) => { busyUntil = Date.now() + pause; busyNote = tx(TEXT.status.busyNote, { n, of }); setStatus(tx(TEXT.status.busy, { sec: Math.round(pause / 1000), n, of })); },
        delaySec: Math.max(0, num(setting('autopilotDelay', 30))),
        rate: num(setting('rate', 1)) || 1,
        mods: Array.isArray(setting('mods', [])) ? setting('mods', []) : [],
        quick,
      };
      /** The scan's counts, updated as they go up: maps, plays done, answers reused, new simulator calls. */
      const many = (n, one, more) => `${n} ${n === 1 ? one : more}`;
      const countsLine = ({ plays, calls, fromCache }, estimated = 0) => [
        many(queue.entries.length, 'map in queue', 'maps in queue'), `${plays} play${plays === 1 ? '' : 's'} done`,
        many(fromCache, 'call reused', 'calls reused'), many(calls, 'new call', 'new calls'),
        ...(estimated ? [`${estimated} estimated`] : []),
      ].join(' · ');
      const showCounts = (c) => { if (token === scanToken) setStatus(`${countsLine(c)}${Date.now() < busyUntil ? ` · ${busyNote}` : ''}`, TEXT.status.countsTip); };
      setStatus(TEXT.status.simulating);
      const result = await forecast(queue, ctx, showCounts, token);
      if (token !== scanToken) return;
      svPage = 0;
      result.sv = await svCurves(queue, result, memPlaysOf(), token, () => showCounts({ plays: result.plays.length, ...result.counts() }));
      result.setApprox(false);
      if (token !== scanToken) return;
      saveCache();
      result.local = await localPlaysOf(row, queue, ctx.rate, localCount(), ctx.mods);
      if (token !== scanToken) return;
      result.scannedAt = Date.now();
      if (!quick) lastFullAt = result.scannedAt;
      result.scanMs = result.scannedAt - scanStarted;
      liveNewest = 0;
      renderResult(queue, ctx, now, result);
      // the full window, Strain Status included, once there is a result to show
      const firstResult = root.classList.contains('qs-fresh');
      root.classList.remove('qs-fresh');
      nowEl.classList.remove('qs-busy');
      if (firstResult) center(); else centerVertically();
      // the window grew and may have moved: fade or not by where the mouse is now
      checkMouse();
      setStatus(countsLine({ plays: result.plays.length, ...result.counts() }, result.plays.filter(p => p.approx).length), TEXT.status.countsTip);
    } catch (e) {
      saveCache();
      if (e && e.message === 'stopped') return;
      fail(e && e.message ? e.message : String(e));
    } finally {
      if (token === scanToken) setScanning(false);
      if (root.classList.contains('qs-fresh')) $('#qs-start-hint').style.display = '';
      // stopped or failed: the grayed-out status is the last scan's, so it says so
      if (token === scanToken && nowEl.classList.contains('qs-busy')) nowEl.dataset.busy = 'Out of date: press Scan queue';
    }
  };
  scanBtn.onclick = () => {
    if (scanning) { autoPaused = true; stopScan(TEXT.status.stopped); }
    else void scan();
  };

  // ---- the console: the stored plays and the calibration as tables, over the window ----
  let consoleEl = null;
  let consoleView = 'played';
  /** Whether the console's recent plays follow the game: checked every LIVE_CHECK_MS while it is open. */
  let consoleLive = true;
  let consoleTimer = null;
  const LIVE_CHECK_MS = 2000;
  const closeConsole = () => {
    if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
    if (consoleEl) { consoleEl.remove(); consoleEl = null; }
  };
  /** Rows of plain objects as a table: their keys as the columns, numbers to the right. The first `fresh`
   *  rows are marked new. */
  const consoleTable = (rows, fresh = 0) => {
    if (!rows.length) return '<div class="qs-con-empty">Nothing to show.</div>';
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const isNum = (c) => rows.every(r => r[c] === undefined || r[c] === '' || typeof r[c] === 'number');
    const numCols = new Set(cols.filter(isNum));
    return `<table><thead><tr><th class="qs-con-i">#</th>${cols.map(c => `<th${numCols.has(c) || c === 'Match' ? ' class="n"' : ''}${c === 'Match' ? ` title="${MATCH_HELP}" style="cursor:help;"` : ''}>${esc(c)}${c === 'Match' ? ' ⓘ' : ''}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr${i < fresh ? ' class="qs-con-new"' : ''}><td class="qs-con-i">${i < fresh ? '<span class="qs-con-badge">NEW</span>' : i}</td>${cols.map(c => {
        const v = r[c];
        if (numCols.has(c)) return `<td class="n${v === 0 ? ' z' : ''}">${v === undefined ? '' : esc(typeof v === 'number' ? v.toLocaleString() : v)}</td>`;
        if (c === 'Match') return `<td class="n" style="${v ? `color:${matchColor(parseFloat(v) / 100)}; font-weight:600;` : ''}">${esc(v ?? '')}</td>`;
        return `<td${c === 'Map' ? ' class="qs-map"' : ''}${c === 'Map' ? ` title="${esc(v)}"` : ''}>${esc(v ?? '')}</td>`;
      }).join('')}</tr>`).join('')}
    </tbody></table>`;
  };
  const tsv = (rows) => {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    return [cols.join('\t'), ...rows.map(r => cols.map(c => r[c] ?? '').join('\t'))].join('\n');
  };
  /** Each opening counts: one that finishes loading after a newer one started is dropped, so only one console exists. */
  let consoleSeq = 0;
  const openConsole = async (data) => {
    const seq = ++consoleSeq;
    closeConsole();
    Object.assign(data, await data.loadPlayed());
    if (seq !== consoleSeq) return;
    closeConsole();
    /** How many of the newest plays arrived with the last update: marked until newer ones arrive. */
    data.fresh = 0;
    data.checkedAt = Date.now();
    consoleEl = document.createElement('div');
    consoleEl.className = 'qs-console-pane';
    const clockOf = (t) => new Date(t).toLocaleTimeString();
    const draw = () => {
      const body = consoleEl.querySelector('.qs-con-body');
      const keep = body ? { top: body.scrollTop, left: body.scrollLeft } : null;
      const views = { played: `Recent plays (${data.played.length})`, calib: `Calibration (${data.calibRows.length})`, ...(data.diag ? { diag: 'Diagnostics' } : {}) };
      consoleEl.innerHTML = `
        <div class="qs-con-head">
          <span class="qs-con-title">Console</span>
          ${Object.entries(views).map(([id, label]) => `<button type="button" class="qs-con-view${consoleView === id ? ' on' : ''}" data-view="${id}">${label}</button>`).join('')}
          <span style="flex:1;"></span>
          <button type="button" class="qs-con-live${consoleLive ? ' on' : ''}" title="${consoleLive ? `Checking for new plays every ${LIVE_CHECK_MS / 1000}s. Click to pause.` : 'Paused. Click to follow new plays again.'}">${consoleLive ? '<i></i>Live' : 'Paused'}</button>
          <button type="button" class="qs-plain qs-con-dev" title="Also print these tables to the developer console (Ctrl+Shift+I)">Send to dev console</button>
          <button type="button" class="qs-con-x" title="Close the console (Esc)">✕</button>
        </div>
        <div class="qs-con-body">
          ${data.note ? `<div class="qs-con-line warn">${esc(data.note)}</div>` : ''}
          ${consoleView === 'diag' && data.diag ? `
            <div class="qs-con-line">&gt; diagnostics: what this scan was built from. Copy and send it to Rai if something looks wrong.</div>
            ${data.diag.health.map(([k, state, v]) => `<div class="qs-con-line${state === 'ok' ? '' : ' warn'}">${state === 'ok' ? '✓' : state === 'warn' ? '!' : '✗'} ${esc(k)}: ${esc(v)}</div>`).join('')}
            <pre class="qs-con-pre">${esc(data.diag.text)}</pre>` : consoleView === 'played' ? `
            <div class="qs-con-line">&gt; your last ${data.played.length} plays, as the game stored them (newest first). These should match #logs.</div>
            <div class="qs-con-line">&gt; ${consoleLive ? `live: checked ${clockOf(data.checkedAt)}` : 'paused'}${data.lastNewAt ? ` · ${data.fresh} new play${data.fresh === 1 ? '' : 's'} at ${clockOf(data.lastNewAt)}, marked until newer plays arrive` : ' · no new plays since the console opened'}</div>
            ${consoleTable(data.played, data.fresh)}` : `
            <div class="qs-con-line">&gt; calibration: real plays re-simulated</div>
            ${consoleTable(data.calibRows)}
            <div class="qs-con-line" style="margin-top:10px;">&gt; per skill: Factor = Real ÷ Simulator</div>
            ${consoleTable(data.calibSummary)}`}
        </div>`;
      consoleEl.querySelector('.qs-con-x').onclick = closeConsole;
      consoleEl.querySelector('.qs-con-live').onclick = () => { consoleLive = !consoleLive; follow(); draw(); };
      const newBody = consoleEl.querySelector('.qs-con-body');
      if (keep) { newBody.scrollTop = keep.top; newBody.scrollLeft = keep.left; }
      for (const b of consoleEl.querySelectorAll('.qs-con-view')) b.onclick = () => { consoleView = b.dataset.view; draw(); };
      const devB = consoleEl.querySelector('.qs-con-dev');
      devB.onclick = () => {
        console.groupCollapsed(`[Queue Strain] your last ${data.played.length} plays, as the game stored them`);
        console.table(data.played);
        console.groupEnd();
        if (data.calibRows.length) {
          console.groupCollapsed(`[Queue Strain] calibration: ${data.calibRows.length} real plays, each simulated again as it was played`);
          console.table(data.calibRows);
          console.table(data.calibSummary);
          console.groupEnd();
        }
        if (data.diag) console.log(`[Queue Strain] diagnostics\n${data.diag.text}`);
        devB.textContent = 'Sent';
        setTimeout(() => { if (devB.isConnected) devB.textContent = 'Send to dev console'; }, 1500);
      };
    };
    /** New plays: the game writes each one to its database when it ends; the database is local, so a
     *  look every 2 seconds is cheap. Only the plays newer than the newest shown count as new. */
    let checking = false;
    const check = async () => {
      if (checking || !consoleEl) return;
      checking = true;
      try {
        const next = await data.loadPlayed();
        if (!consoleEl) return;
        data.checkedAt = Date.now();
        const added = next.ats.filter(t => t > data.newest).length;
        if (added > 0) {
          Object.assign(data, next);
          data.fresh = added;
          data.lastNewAt = Date.now();
        }
        draw();
      } catch (_) { /* the next look tries again */ } finally { checking = false; }
    };
    const follow = () => {
      if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
      if (consoleLive) consoleTimer = setInterval(() => void check(), LIVE_CHECK_MS);
    };
    draw();
    follow();
    // no bigger than the game's window; if its size cannot be read, a 1920x1080 screen
    const viewW = window.innerWidth || document.documentElement.clientWidth || 1920;
    const viewH = window.innerHeight || document.documentElement.clientHeight || 1080;
    consoleEl.style.setProperty('--qs-max-w', `${Math.max(320, viewW - 32)}px`);
    consoleEl.style.setProperty('--qs-max-h', `${Math.max(240, viewH - 32)}px`);
    root.appendChild(consoleEl);
  };

  /** Copy text to the clipboard, the old way when the new one is refused. */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed; left:-9999px; top:0;';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      area.remove();
      return ok;
    }
  };

  const renderResult = (queue, ctx, now, r) => {
    // the shifts' place in their 2.4s cycle, so a redraw picks them up where they were
    root.style.setProperty('--qs-phase', `-${Math.round(performance.now() % 2400)}ms`);
    lastResult = [queue, ctx, now, r];
    const endSec = ctx.hours * 3600;
    /** The look-ahead as set in the options: "never in 6 hours", not "5 hours and 58 minutes". */
    const aheadText = `${ctx.hours} hour${ctx.hours === 1 ? '' : 's'}`;
    const medals = r.medals || { ok: false, multiplier: 1 };
    /** A skill's bonus: the medals from the server, or when it couldn't be reached, as learned from the real plays. */
    const genetics = r.genetics || {};
    const geneOf = (skill) => (genetics[skill] ? genetics[skill].total : 1);
    const factorOf = (skill) => (medals.ok ? medals.multiplier : r.calib && r.calib.factors[skill] > 0 ? r.calib.factors[skill] : 1) * geneOf(skill);
    /** A play's XP as the server awards it: the simulator's, less mindblock, times the medals and the skill's genetics. */
    const blockOf = (p, skill) => (MINDBLOCK.has(skill) ? num(p.block ?? 1) : 1);
    const xpOf = (p, skill) => num(p.xp[skill]) * blockOf(p, skill) * factorOf(skill);
    /** A play's XP, every skill together. */
    const totalOf = (p) => SKILLS.reduce((sum, s) => sum + xpOf(p, s), 0);
    const hasXp = r.plays.some(p => Object.keys(p.xp).length);
    const spanH = r.plays.length ? r.plays[r.plays.length - 1].end / 3600 : 0;
    const perHour = (fn, list = r.plays) => {
      if (!list.length) return 0;
      const h = (list[list.length - 1].end - list[0].start) / 3600;
      return h > 0 ? list.reduce((sum, p) => sum + fn(p), 0) / h : 0;
    };
    const facts = (list) => `<div class="qs-facts" style="margin:4px 0 8px;">${list.map(([k, v]) => `<span class="qs-dim">${k}</span><span>${v}</span>`).join('')}</div>`;
    const firstPlay = r.plays[0];
    const last = r.samples[r.samples.length - 1];
    // where it is headed: the next play's arrows by the zone's name, and the forecast on the bar
    renderNow({ ...now, trend: firstPlay ? firstPlay.trend : 0, ahead: { samples: r.samples, hours: ctx.hours } });

    // ---- Overview: where the queue takes the bar, and the plays ----
    const when = (test) => { const s = r.samples.find((x, i) => i > 0 && test(x.bar)); return s ? s.t : undefined; };
    const inPeak = (b) => b >= BAR_ZONES[0] && b < BAR_ZONES[1];
    const outlook = [];
    const nowStage = stageOf(now.bar);
    if (nowStage === 'cold' || nowStage === 'warming') {
      const t = when(b => b >= BAR_ZONES[0]);
      outlook.push(['Sweet Spot', t !== undefined ? `reached in <b>${durWords(t)}</b>` : `<b>not reached</b> in ${aheadText}`]);
    }
    const reach = r.samples.findIndex(s => inPeak(s.bar));
    if (reach >= 0) {
      const leave = r.samples.findIndex((s, i) => i > reach && !inPeak(s.bar));
      outlook.push(['Leaves Sweet Spot', leave >= 0
        ? `<span title="${r.samples[leave].bar >= BAR_ZONES[1] ? 'Pushed past it: easier maps keep you there longer' : 'Cools below it: harder maps keep you there longer'}">in <b>${durWords(r.samples[leave].t)}</b></span>`
        : `<b>never</b> in ${aheadText}`]);
    }
    const fat = when(b => b >= XP_CUT);
    outlook.push(['<span style="color:#f87171">XP cut</span>', now.minutes >= now.knots[3]
      ? '<b style="color:#f87171">already</b>'
      : fat !== undefined
        ? `<b style="color:#f87171">in ${durWords(fat)}</b>`
        : `<b>never</b> in ${aheadText}`]);
    if (r.loopSec) {
      const drift = r.loopDrift;
      outlook.push(['One Loop', `${r.loopPlays} play${r.loopPlays === 1 ? '' : 's'} in ${durWords(r.loopSec)}, ${Math.abs(drift) < 0.5 ? 'strain about even' : `${drift > 0 ? '+' : ''}${drift.toFixed(1)} minutes of strain`} each loop`]);
    }
    outlook.push([`After ${aheadText}`, `<b>${STAGES[stageOf(last.bar)][0]}</b>, ${minText(last.minutes)} of strain (bar ${(last.bar * 100).toFixed(0)}%)`]);
    const fails = r.plays.filter(p => !p.passed).length;
    if (fails) outlook.push(['Fails', `<span style="color:#fca5a5">${fails} of ${r.plays.length} plays fail</span>, each still tiring you for the whole map`]);

    const shownPlays = r.plays.slice(0, Math.min(r.plays.length, Math.max(20, (r.loopPlays || 0) * 2 + 5), 200));
    const playRows = shownPlays.map((p, i) => {
      const e = queue.entries[p.entry];
      return `<tr>
        <td class="qs-dim">${i + 1}</td>
        <td class="qs-map" title="${esc(e.title)}">${esc(e.title)}</td>
        <td class="qs-dim">${clock(p.start)}</td>
        <td>${shortTime(p.strained)} <span class="qs-dim">/ ${shortTime(p.lengthMin)}</span></td>
        <td>${arrows(p.trend)}</td>
        <td><span class="qs-mini"><b style="left:${XP_CUT * 100}%"></b><i style="left:${(p.bar * 100).toFixed(1)}%"></i></span> <span style="color:${STAGE_COLOR[stageOf(p.bar)]}">${(p.bar * 100).toFixed(0)}%</span>${p.passed ? '' : ' <span style="color:#fca5a5">fail</span>'}</td>
      </tr>`;
    }).join('');
    // the three skills this queue gives the most XP to (issue #4)
    const topSkills = SKILLS.map(sk => [sk, r.plays.reduce((t, p) => t + xpOf(p, sk), 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sk]) => SKILL_NAMES[sk]);
    const topSkillsLine = topSkills.length ? `<div style="margin-bottom:6px;"><span class="qs-dim">Trains most:</span> <b>${topSkills.length > 1 ? `${topSkills.slice(0, -1).join(', ')} and ${topSkills[topSkills.length - 1]}` : topSkills[0]}</b></div>` : '';
    const overview = `
      <div class="qs-cols">
        <div class="qs-card">
          <div class="qs-h">Where This Queue Takes You</div>
          ${topSkillsLine}
          ${facts(outlook)}
          ${graphHtml(r.samples, endSec)}
        </div>
        <div class="qs-card">
          <div class="qs-h">Next Plays</div>
          <div class="qs-dim" style="margin-bottom:4px;">Repeats are listed one by one. Strain: how many of the play's minutes strained your physical skills.</div>
          <div class="qs-tablewrap"><table>
            <thead><tr><th>#</th><th>Map</th><th>Starts</th><th>Strain / Length</th><th></th><th>Bar</th></tr></thead>
            <tbody>${playRows}</tbody>
          </table></div>
          ${r.plays.length > shownPlays.length ? `<div class="qs-dim" style="margin-top:4px;">${r.plays.length - shownPlays.length} more plays in the next ${aheadText}.</div>` : ''}
        </div>
      </div>`;

    // ---- XP ----
    let xpTab = '';
    if (hasXp) {
      const lines = [];
      lines.push(['Per hour', `<b>${fmt(perHour(totalOf))}</b> on average`]);
      lines.push(['Total', `<b>${fmt(r.plays.reduce((t, p) => t + totalOf(p), 0))}</b> in the next ${aheadText}`]);
      const matched = r.calib ? Object.entries(r.calib.factors) : [];
      const ignored = r.calib ? Object.keys(r.calib.ignored || {}) : [];
      lines.push(['Medals', medals.ok
        ? (medals.guest ? 'none: a guest character holds no medals' : `<b>×${medals.multiplier.toFixed(3)}</b> · ${medals.held} medal${medals.held === 1 ? '' : 's'}${medals.unknown ? ` <span class="qs-dim" title="Newer than this add-on, so not counted">(${medals.unknown} not counted)</span>` : ''}`)
        : matched.length
          ? `<span style="color:#fca5a5">couldn't reach the server</span>, so learned from your last ${r.calib.plays} play${r.calib.plays === 1 ? '' : 's'} of these maps: ${matched.map(([sk, f]) => `${SKILL_NAMES[sk]} ×${f.toFixed(2)}`).join(', ')}${ignored.length ? `. <span style="color:#fca5a5">Not applied, as they look wrong: ${ignored.map(sk => `${SKILL_NAMES[sk]} ×${r.calib.ignored[sk].toFixed(2)}`).join(', ')}</span> (see Debug)` : ''}`
          : '<span style="color:#fca5a5">couldn\'t reach the server and no recent plays of these maps, so these are the simulator\'s numbers before your medals: likely too low</span>']);
      const blocked = r.plays.filter(p => SKILLS.some(sk => MINDBLOCK.has(sk) && num(p.xp[sk]) > 0));
      if (blocked.length) {
        const avg = blocked.reduce((sum, p) => sum + num(p.block ?? 1), 0) / blocked.length;
        const low = Math.min(...blocked.map(p => num(p.block ?? 1)));
        const skillsHit = SKILLS.filter(sk => MINDBLOCK.has(sk) && blocked.some(p => num(p.xp[sk]) > 0)).map(sk => SKILL_NAMES[sk]);
        const skillsList = skillsHit.length > 1 ? `${skillsHit.slice(0, -1).join(', ')} and ${skillsHit[skillsHit.length - 1]}` : skillsHit[0];
        lines.push([`<span style="cursor:help; border-bottom:1px dotted currentColor;" title="The server cuts XP on maps you played a lot lately: it counts how many of your last 50 plays (within a day) were the same map. Speed, Stamina, Jack Speed, Coordination and Memory are never cut.">Mindblock</span>`,
          avg > 0.995 ? 'none: these maps are few of your recent plays' : `<b>×${avg.toFixed(2)}</b> on average${low < avg - 0.01 ? `, down to ×${low.toFixed(2)}` : ''}, on ${skillsList}`]);
      }
      if (r.loopSec) {
        const loopPlays = r.plays.slice(r.loopStart, r.loopStart + r.loopPlays);
        lines.push(['One Loop', `<b>${fmt(loopPlays.reduce((sum, p) => sum + totalOf(p), 0))}</b> in ${durWords(r.loopSec)}`]);
      }
      const beforeCut = r.plays.filter(p => p.before < now.knots[3]), afterCut = r.plays.filter(p => p.before >= now.knots[3]);
      if (beforeCut.length && afterCut.length) {
        const b = perHour(totalOf, beforeCut), a = perHour(totalOf, afterCut);
        lines.push(['<span style="color:#f87171">Past the XP cut</span>', `<b>${fmt(a)}</b>/h, against ${fmt(b)}/h before it (<span style="color:#f87171">${b > 0 ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : '–'}</span>)`]);
      }
      // three estimates side by side: the simulator alone, with the bonuses, and the local estimate from real plays.
      // The local estimate is of the queue's maps alone, at the rate the queue plays each, from every play
      // its newest SETTINGS.localPlays within the last 24 hours.
      const rateOfEntry = (e) => e.lockedRate ?? ctx.rate;
      const modsOfEntry = (e) => modsText(e.lockedRate === undefined ? ctx.mods : (e.lockedMods || []));
      const queueMaps = queue.entries.filter((e, i, all) => all.findIndex(x => x.beatmapId === e.beatmapId) === i);
      const realAvg = {};
      for (const d of r.local || (r.calib && r.calib.detail) || []) {
        const e = queueMaps.find(x => x.beatmapId === d.beatmapId);
        if (!e || Math.abs(num(d.rate) - rateOfEntry(e)) > 0.001 || modsText(d.mods) !== modsOfEntry(e)) continue;
        const a = realAvg[d.beatmapId] || (realAvg[d.beatmapId] = { n: 0, xp: {}, day: d.day });
        a.n++;
        for (const sk of SKILLS) a.xp[sk] = (a.xp[sk] || 0) + num(d.real[sk]);
      }
      const playsOfMap = (id) => (realAvg[id] ? realAvg[id].n : 0);
      const enough = (id) => playsOfMap(id) > 0;
      const mapsPlayed = queueMaps.filter(e => playsOfMap(e.beatmapId) > 0).length;
      const mapsEnough = queueMaps.filter(e => enough(e.beatmapId)).length;
      const allMaps = mapsEnough === queueMaps.length;
      // the forecast's plays (repeats and loops included) of the maps with a local estimate
      const local = (p) => enough(queue.entries[p.entry].beatmapId);
      const simOf = (p, sk) => num(p.xp[sk]);
      // a real play already carries the fatigue, mindblock and bonuses it was played with
      // Speed Jam and Memory have no local estimate: their XP rises and falls with the map's Tries, so an average
      // of past plays (at other Tries) says nothing about the next ones. The Speed Jam / Memory tab has them play by play.
      const NO_LOCAL = new Set(['speedjam', 'memory']);
      const realOf = (p, sk) => { if (NO_LOCAL.has(sk)) return 0; const a = realAvg[queue.entries[p.entry].beatmapId]; return local(p) ? a.xp[sk] / a.n : 0; };
      const sameOf = (p, sk) => (local(p) && !NO_LOCAL.has(sk) ? xpOf(p, sk) : 0);
      const cmpRows = SKILLS.map(sk => ({ sk, sim: perHour(p => simOf(p, sk)), matched: perHour(p => xpOf(p, sk)), same: perHour(p => sameOf(p, sk)), real: perHour(p => realOf(p, sk)) }))
        .filter(x => x.sim > 0 || x.matched > 0 || x.real > 0);
      const sum = (k) => cmpRows.reduce((t, x) => t + x[k], 0);
      const apart = (a, b) => Math.max(a, b) > 0 && Math.abs(a - b) / Math.max(a, b) > 0.25;
      const realCell = (x, bold) => {
        if (!mapsEnough) return '<td class="n qs-dim">–</td>';
        if (NO_LOCAL.has(x.sk)) return `<td class="n qs-dim" title="${esc(TEXT.xp.noLocal)}">–</td>`;
        // like against like: the same maps' plays with the bonuses
        const off = apart(x.same, x.real);
        const tip = `${x.sk === '' && cmpRows.some(y => NO_LOCAL.has(y.sk)) ? `${TEXT.xp.totalNoLocal} ` : ''}Simulator + Bonuses, the same ${allMaps ? 'plays' : `${mapsEnough} map${mapsEnough === 1 ? '' : 's'}`}: ${fmt(x.same)}/h${off ? ' (more than a quarter apart)' : ''}`;
        const v = bold ? `<b>${fmt(x.real)}</b>` : fmt(x.real);
        return `<td class="n" title="${tip}"${off ? ' style="color:#fb923c; background:rgba(251,146,60,.10);"' : ''}>${v}</td>`;
      };
      const total = { sk: '', sim: sum('sim'), matched: sum('matched'), same: sum('same'), real: sum('real') };
      r.localSummary = { maps: mapsEnough, of: queueMaps.length, plays: queueMaps.reduce((t, e) => t + playsOfMap(e.beatmapId), 0), real: total.real, same: total.same, perMap: Object.fromEntries(queueMaps.map(e => [e.beatmapId, playsOfMap(e.beatmapId)])) };
      const n = queueMaps.length;
      const totalLocal = queueMaps.reduce((t, e) => t + playsOfMap(e.beatmapId), 0);
      const playsText = `${totalLocal} play${totalLocal === 1 ? '' : 's'}`;
      const localLine = !mapsPlayed
        ? '<b style="color:#fca5a5">No queue maps played in 24H</b> at the queue\'s rates.'
        : allMaps
          ? `<b style="color:#4ade80">All ${n} map${n === 1 ? '' : 's'} played in 24H</b> (${playsText}). <span style="color:#fb923c">Orange</span>: over 25% off.`
          : `<b style="color:#facc15">Only ${mapsEnough} out of ${n} maps were played, local estimates will be inaccurate</b> (${playsText}). <span style="color:#fb923c">Orange</span>: over 25% off.`;
      const partial = mapsEnough > 0 && !allMaps;
      const liveNote = `<span style="color:#4ade80;" title="Read again after every new play.${r.localAt ? ` Last updated ${new Date(r.localAt).toLocaleTimeString()}.` : ''}">● Live</span>`;
      const mapList = `<details class="qs-local-list"${localOpen ? ' open' : ''} style="margin-top:4px;"><summary class="qs-dim" style="cursor:pointer;">Local plays per map</summary>
          <table style="margin-top:4px;"><thead><tr><th>Map</th><th class="n">Rate</th><th class="n" title="Your plays of this map at the queue's rate and mods in the last 24 hours.">Plays</th><th title="How many of your newest plays of this map at the queue's rate the estimate averages: the newest, up to ${localCount()} (the Local plays option).">Local estimate</th></tr></thead><tbody>
          ${queueMaps.map(e => { const k = playsOfMap(e.beatmapId), day = realAvg[e.beatmapId] && realAvg[e.beatmapId].day; const dayCell = day ? day : day === 0 || !k ? '<span class="qs-dim">0</span>' : '<span class="qs-dim">–</span>';
            return `<tr><td class="qs-map" title="${esc(e.title)}">${esc(e.title)}</td><td class="n">${rateOfEntry(e)}×</td><td class="n">${dayCell}</td><td>${!k ? '<span style="color:#f87171">Not played yet</span>' : !Object.values(realAvg[e.beatmapId].xp).some(v => v > 0) ? '<span class="qs-dim" title="Played, but this map gives no XP">No XP provided</span>' : k >= localCount() ? `<span style="color:#4ade80">used ${k}</span>` : `<span style="color:#facc15" title="Fewer plays than the Local plays option (${localCount()}): the average is rougher">used ${k}</span>`}</td></tr>`; }).join('')}
          </tbody></table></details>`;
      const cmpTable = `
        <div class="qs-tablewrap" style="margin-top:8px; max-width:560px;"><table>
          <thead><tr><th>Skill XP</th>
            <th class="n" title="The simulator's own numbers, before your genetics, medals and other bonuses.">Simulator</th>
            <th class="n" title="The simulator's XP with mindblock taken off, then your medals and genetics added, the way the server counts it. This is what the rest of the add-on uses.">Simulator + Bonuses</th>
            <th class="n" title="Based on your real plays, not simulated. With few or no plays, it can be inaccurate.">Local Estimation</th></tr></thead>
          <tbody>${cmpRows.map(x => `<tr><td>${SKILL_NAMES[x.sk]}</td><td class="n qs-dim">${fmt(x.sim)}</td><td class="n">${fmt(x.matched)}</td>${realCell(x)}</tr>`).join('')}
            <tr style="border-top:1px solid #2b2b3a;"><td><b>Total</b></td><td class="n qs-dim">${fmt(total.sim)}</td><td class="n"><b>${fmt(total.matched)}</b></td>${realCell(total, true)}</tr></tbody>
        </table></div>
        <div class="qs-dim" style="margin-top:4px; max-width:640px;">${liveNote} · ${localLine}</div>
        ${mapList}`;
      // what the genetics add to each skill, and the XP that comes from it
      const geneRows = SKILLS.filter(sk => genetics[sk]).map(sk => {
        const g = genetics[sk];
        const total = perHour(p => xpOf(p, sk));
        const fromGenes = g.total > 0 ? total - total / g.total : 0;
        const pct = (v) => (v > 0 ? `+${Math.round(v * 100)}%` : '<span class="qs-dim">–</span>');
        return `<tr${g.total > 1 ? '' : ' class="qs-dim"'}><td>${SKILL_NAMES[sk]}</td>
          <td class="n" title="${g.strength ? `strength ${g.strength}: 1 for each pick on this tree, 0.5 for each pick next to it` : 'no pick on or next to this tree'}">${pct(g.fromStrength)}</td>
          <td class="n" title="${g.xpGene} tier${g.xpGene === 1 ? '' : 's'} of the tree's XP gene, at its strength">${pct(g.fromXpGene)}</td>
          <td class="n" title="${g.tiers} tier${g.tiers === 1 ? '' : 's'} held in this tree">${pct(g.fromTiers)}</td>
          <td class="n"><b>×${g.total.toFixed(2)}</b></td>
          <td class="n">${fromGenes >= 0.5 ? `+${fmt(fromGenes)}` : '<span class="qs-dim">–</span>'}</td></tr>`;
      }).join('');
      const anyGenes = SKILLS.some(sk => genetics[sk] && genetics[sk].total > 1);
      const lnNote = genetics.release && genetics.release.lnMaps > 0 ? `<div class="qs-dim" style="margin-top:4px;">LN Specialist adds another +${Math.round(genetics.release.lnMaps * 100)}% Release XP on LN maps. It isn't counted here, as the add-on can't tell which maps are LN maps.</div>` : '';
      const geneCard = `
      <div class="qs-card">
        <div class="qs-h">Genetics</div>
        <div class="qs-dim" style="margin-bottom:6px;">${(() => {
          const from = ctx.geneSource ? ctx.geneSource.from : 'local';
          if (from === 'none') return ctx.row.local ? 'No genetics XP bonus yet: pick a genetic and buy tiers to get one.' : '<span style="color:#fca5a5">Your genetics couldn\'t be read: the server didn\'t answer, so no genetics bonus is counted. Scan again in a moment.</span>';
          const source = from === 'server' ? 'Read from the server.' : 'Read from this computer.';
          return anyGenes ? `Each skill's XP bonus from your genetics, as the game counts it. The simulator leaves it out, so the add-on adds it on top. ${source}` : `No genetics XP bonus yet: pick a genetic and buy tiers to get one. ${source}`;
        })()}</div>
        <div class="qs-tablewrap"><table>
          <thead><tr><th>Skill</th><th class="n" title="10% for each pick on the tree, 5% for each pick next to it">Picks</th><th class="n" title="The tree's first gene: 5% a tier, times the tree's strength">XP gene</th><th class="n" title="5% for each tier held anywhere in the tree">Tiers</th><th class="n">Bonus</th><th class="n" title="XP per hour over the forecast that comes from the genetics">From genetics /h</th></tr></thead>
          <tbody>${geneRows}</tbody>
        </table></div>
        ${lnNote}
      </div>`;
      xpTab = `
      <div class="qs-cols">
      <div class="qs-card">
        <div class="qs-h">XP</div>
        ${facts(lines)}
        ${cmpTable}
      </div>
      ${geneCard}
      </div>`;
    }

    // ---- Speed Jam / Memory: only when the queue has maps that give either ----
    let svTab = '';
    if (r.sv && r.sv.length) {
      const signed = (d) => (Math.abs(d) < 0.5 ? '<span class="qs-dim">±0</span>' : `<span style="color:${d > 0 ? '#4ade80' : '#f87171'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`);
      svPage = Math.min(Math.max(0, svPage), r.sv.length - 1);
      const pages = r.sv.length;
      const { entry, share, start, rows: simRows } = r.sv[svPage];
      // Speed Jam takes each play's mindblock as the forecast plays it; Memory never does
      const rows = simRows.map(x => ({ ...x, speedjam: x.speedjam * num(x.block ?? 1) * factorOf('speedjam'), memory: x.memory * factorOf('memory') }));
      const top = rows.reduce((best, x) => (x.memory > best.memory ? x : best), rows[0]);
      // a peak only when Memory turns down within the plays shown; at the last row it may still be rising
      const peak = top && top.memory > 0 && top !== rows[rows.length - 1] ? top : null;
      const memoryNote = peak ? ` Memory peaks at play #${peak.play}.` : top && top.memory > 0 ? ` Memory is still rising at play #${top.play}.` : '';
      svTab = `
      <div class="qs-card">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="qs-h" style="margin:0;">Speed Jam / Memory XP</div>
          <span class="qs-dim" style="margin-left:auto;" title="How many of your next plays of each map to show">Plays</span><input type="number" class="qs-memplays" min="1" max="40" step="1" value="${memPlaysOf()}" style="width:44px;">
          ${pages > 1 ? `<div class="qs-pager">
            <button type="button" class="qs-page" data-step="-1" ${svPage === 0 ? 'disabled' : ''} title="Previous map">‹</button>
            <span>${svPage + 1}/${pages}</span>
            <button type="button" class="qs-page" data-step="1" ${svPage === pages - 1 ? 'disabled' : ''} title="Next map">›</button>
          </div>` : ''}
        </div>
        <div class="qs-dim" style="margin:2px 0 6px;">Your next ${memPlaysOf()} plays of each map in the queue that gives Speed Jam or Memory XP. Memory rises while a map is being learned and fades once it is known, taking Speed Jam with it.</div>
        <div style="margin:8px 0 4px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(entry.title)}">${esc(entry.title)}</div>
        <div class="qs-dim" style="margin-bottom:3px;">${share >= 0.995 ? 'All' : share < 0.01 ? 'Under 1%' : `${Math.round(share * 100)}%`} of its XP is Speed Jam and Memory. Played about ${start} time${start === 1 ? '' : 's'} so far.${memoryNote}</div>
        <table>
          <thead><tr><th>Play</th><th class="n">Speed Jam</th><th class="n">Change</th><th class="n">Memory</th><th class="n">Change</th><th class="n">Both</th></tr></thead>
          <tbody>${rows.map((x, i) => {
            const prev = rows[i - 1];
            return `<tr${x === peak ? ' style="background:rgba(74,222,128,.07)"' : ''}>
              <td class="qs-dim">#${x.play}</td>
              <td class="n">${fmt(x.speedjam)}</td><td class="n">${prev ? signed(x.speedjam - prev.speedjam) : ''}</td>
              <td class="n">${fmt(x.memory)}</td><td class="n">${prev ? signed(x.memory - prev.memory) : ''}</td>
              <td class="n"><b>${fmt(x.speedjam + x.memory)}</b></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    }

    // ---- Levels: each skill's progress to prestige, its XP, and where that XP comes from ----
    let levelsTab = '';
    if (hasXp) {
      const row0 = ctx.row;
      const spanSec = spanH * 3600;
      const totalPerH = perHour(totalOf);
      const loopSec = r.loopSec || 0;
      const marks = [6, 12, 24].filter(h => h < ctx.hours - 1e-6);
      const MAP_COLORS = SETTINGS.colors.maps;
      // the display: regular or overall (lifetime levels), and with the route add-on's routes when it is installed,
      // routes are on and a '+ route' display is picked
      const routesAll = readRoutes();
      const routesOn = !!routesAll && useRoutes;
      const lifetimeView = levelsView.startsWith('overall');
      const routeView = routesOn && !lifetimeView;
      const viewNow = lifetimeView ? 'overall' : 'regular';
      /** A row of the table: `sk` (a skill, or 'overall'), from level L0 with x0 XP into it, to the goal level
       *  `need` (prestige, or rebirth for overall), earning `gainOf(play)` a play. `lifetime`: the skill's overall
       *  level, whose goal is just its next level. */
      const progressRow = (sk, L0, x0, need, gainOf, lifetime = false) => {
        const start = levelOf(L0, x0);
        const overall = sk === 'overall';
        const cost = xpForLevel(L0);
        // XP from here to the prestige level (0 when there already)
        let toPrestige = 0;
        if (L0 < need) { toPrestige = cost - x0; for (let l = L0 + 1; l < need; l++) toPrestige += xpForLevel(l); }
        // the bar's marks: below 100, 0-20-40-60-80-100 (or 50-60-..-100 from 50) and no prestige level;
        // from 100, a step a level up to prestige (2 when it's 6-10 away), starting at 105 once past it
        const barMarks = (() => {
          const out = [];
          // an overall level past 100: one piece, this level to the next
          if (lifetime && start >= 100) return [L0, L0 + 1];
          // already able to prestige: one full piece up to its prestige level
          if (start >= need) return [need - 1, need];
          if (start < 100) {
            const base = start < 50 ? 0 : 50, step = start < 50 ? 20 : 10;
            for (let m = base; m < 100; m += step) out.push(m);
            out.push(100);
          } else if (overall) {
            // overall levels come slowly: a level a piece, five at a time (100-105, 105-110, 110-115, ...)
            const base = 100 + Math.floor((start - 100) / 5) * 5;
            for (let m = base; m <= base + 5; m++) out.push(m);
          } else {
            const base = start >= 105 ? 105 : 100, span = need - base, step = span <= 5 ? 1 : Math.ceil(span / 5);
            for (let m = base; m < need; m += step) out.push(m);
            out.push(Math.max(need, base + 1));
          }
          return out;
        })();
        const markAt = {};
        // through the forecast: when the next level and the prestige level land, the level at each mark, XP by map
        let cum = 0, readyAt = L0 >= need ? 0 : undefined, nextAt;
        const atMark = [], byMap = new Map();
        let mi = 0;
        for (const p of r.plays) {
          while (mi < marks.length && p.end > marks[mi] * 3600 + 1e-6) { const g = gainLevels(L0, x0, cum); atMark.push(levelOf(g.level, g.xp)); mi++; }
          const gain = gainOf(p);
          cum += gain;
          const id = queue.entries[p.entry].beatmapId;
          byMap.set(id, (byMap.get(id) || 0) + gain);
          const lv = gainLevels(L0, x0, cum).level;
          if (nextAt === undefined && lv > L0) nextAt = p.end;
          if (readyAt === undefined && lv >= need) readyAt = p.end;
          for (const m of barMarks) if (markAt[m] === undefined && m > start && lv >= m) markAt[m] = p.end;
        }
        while (mi < marks.length) { const g = gainLevels(L0, x0, cum); atMark.push(levelOf(g.level, g.xp)); mi++; }
        const gEnd = gainLevels(L0, x0, cum);
        const end = levelOf(gEnd.level, gEnd.xp);
        const perH = perHour(gainOf);
        // past the look-ahead: the same pace, kept up
        const later = (xpLeft) => (perH > 0 ? spanSec + Math.max(0, xpLeft - cum) / perH * 3600 : Infinity);
        const nextSec = nextAt ?? later(cost - x0);
        const readySec = readyAt ?? later(toPrestige);
        return { sk, overall, lifetime, L0, x0, start, need, cost, toPrestige, cum, readyAt, nextSec, readySec, end, perH, atMark, byMap, barMarks, markAt };
      };
      const skillRows = SKILLS.map((sk) => {
        const L0 = Math.floor(num(row0[sk])), x0 = num(row0[`${sk}XP`]), prestige = num(row0[`${sk}Prestige`]);
        // following the route: the upgrades bought on the way, and each play's XP scaled by what they add
        const gene = genetics[sk];
        const sim = routeView ? simulateRoute({ plays: r.plays, gainOf: p => xpOf(p, sk), L0, x0, upgrades: num(row0[`${sk}Upgrades`]), overdrive: num(row0[`${sk}Overdrive`]),
          prestige, route: routesAll[prestige] || [], odPct: gene ? 5 * num(gene.odGene) * num(gene.strength) : 0, need: 100 + prestige, basePerH: perHour(p => xpOf(p, sk)), spanSec }) : null;
        const gainOf = sim ? (p) => xpOf(p, sk) * (sim.ratioOf.get(p) ?? 1) : (p) => xpOf(p, sk);
        let x;
        if (lifetimeView) {
          // the overall level: all the XP the skill ever earned (at least what its level now took)
          const lt = gainLevels(0, 0, Math.max(num(row0[`${sk}LifetimeXp`]), routeCumXp(levelOf(L0, x0))));
          x = progressRow(sk, lt.level, lt.xp, lt.level + 1, gainOf, true);
        } else {
          x = progressRow(sk, L0, x0, 100 + prestige, gainOf);
          if (sim) {
            // the level drops at each upgrade, so where it is and when it gets somewhere come from the route's run
            x.end = sim.endLevel; x.readyAt = sim.readyAt; x.readySec = sim.readySec; x.toPrestige = 0;
            x.markAt = {};
            for (const m of x.barMarks) { const hit = m > x.start ? sim.samples.find(q => q.t > 0 && q.level >= m) : null; if (hit) x.markAt[m] = hit.t; }
            x.atMark = marks.map((h) => { let lv = sim.samples[0].level; for (const q of sim.samples) { if (q.t <= h * 3600 + 1e-6) lv = q.level; else break; } return lv; });
          }
        }
        x.sim = sim;
        return x;
      });
      // the overall level, as rebirth counts it: every skill's lifetime XP together. Rebirth at 110, 10 more a generation.
      const lifetime = SKILLS.reduce((t, sk) => t + num(row0[`${sk}LifetimeXp`]), 0);
      const overallNow = gainLevels(0, 0, lifetime);
      const overallRow = lifetime > 0 ? progressRow('overall', overallNow.level, overallNow.xp, 110 + ((num(row0.generation) || 1) - 1) * 10, totalOf) : null;
      /** A long stretch: up to a day as 8H 05M, past it as ~2D 20H (it assumes the queue keeps going). */
      const longDur = (sec) => {
        if (!isFinite(sec)) return null;
        if (sec < 86400) return sec > spanSec + 1 ? `~${durH(sec, true)}` : durH(sec, true);
        const h = Math.round(sec / 3600), d = Math.floor(h / 24), rest = h - d * 24;
        return `~${unitsHtml(`${d}d${rest ? ` ${rest}h` : ''}`, true)}`;
      };
      /** The bar: one piece between each pair of marks, filled to your level and, fainter, to where this queue takes
       *  you. Under each piece its end mark, with the time if it's reached within the look-ahead. A skill that
       *  reaches prestige within it shifts its last piece's progress to pink. */
      /** A purchase on the route: "Upgrade #4 at Lv 91 · in 2h 10m". */
      const upgradeWhen = (ev) => (ev.at <= 0 ? TEXT.levels.readyNow : ev.at <= spanSec + 1 ? `in ${dur(ev.at)}` : `~${ev.at < 86400 ? dur(ev.at) : `${Math.floor(Math.round(ev.at / 3600) / 24)}d ${Math.round(ev.at / 3600) % 24}h`}`);
      /** The nearest upgrade's time, short, for its label on the bar: now, 2h 10m, ~5d 8h. */
      const upgradeSoon = (ev) => (ev.at <= 0 ? TEXT.levels.upgradeNow : ev.at < 86400 ? `${ev.at > spanSec + 1 ? '~' : ''}${durH(ev.at)}` : `~${unitsHtml(`${Math.floor(Math.round(ev.at / 3600) / 24)}d ${Math.round(ev.at / 3600) % 24}h`)}`);
      const upgradeText = (ev) => `${tx(TEXT.levels.upgradeAt, { k: ev.k, lv: ev.level.toFixed(ev.level % 1 ? 2 : 0) })} · ${upgradeWhen(ev)}`;
      const levelsBar = (x) => {
        const m = x.barMarks, n = m.length - 1;
        const soon = !x.lifetime && x.readyAt !== undefined && x.readyAt > 0;
        const ups = x.sim && !x.lifetime ? x.sim.events : [];
        const next = ups[0];
        let above = false;
        const cells = [];
        for (let k = 0; k < n; k++) {
          const a2 = m[k], b2 = m[k + 1];
          const nowF = Math.max(0, Math.min(1, (x.start - a2) / (b2 - a2)));
          const endF = Math.max(0, Math.min(1, (Math.min(x.end, b2) - a2) / (b2 - a2)));
          const last = k === n - 1;
          const at = x.markAt[b2];
          const goal = !x.lifetime && last && x.start >= 100 && b2 === x.need;
          // only the route's next upgrade, if it's in this piece (the ones after come after a level drop): its line, number and time
          // until it ("#4 2h 10m"), under the bar, or above it when it sits in the first 5% of the bar's first piece (measured like the progress, from its start mark)
          const here = (next ? [next] : []).filter(ev => ev.level > a2 + (k ? 1e-9 : -1e-9) && ev.level <= b2 + 1e-9);
          const leftOf = (ev) => `${((ev.level - a2) / (b2 - a2) * 100).toFixed(2)}%`;
          const upMarks = here.map(ev => `<b class="qs-lv-up" style="left:${leftOf(ev)}" title="${esc(upgradeText(ev))}"></b>`).join('');
          let upLabels = '';
          if (next && here.includes(next)) {
            const f = (next.level - a2) / (b2 - a2);
            above = k === 0 && f < 0.05;
            upLabels = `<span class="qs-lv-uplbl ${above ? 'above' : 'below'}" style="left:${(f * 100).toFixed(2)}%;${k === n - 1 && f > 0.9 ? ' transform:translateX(calc(-100% - 4px));' : ''}" title="${esc(upgradeText(next))}"><span class="k">#${next.k}</span> ${upgradeSoon(next)}</span>`;
          }
          const label = `${b2}${at !== undefined ? ` · ${durH(at)}` : ''}`;
          // a piece this queue completes within the look-ahead: its progress shifts to white (pink when it's the prestige)
          const completes = endF >= 1 && nowF < 1;
          cells.push(`<div class="qs-lv-cell"><div class="qs-lv-seg${last && soon ? ' shift' : completes ? ' complete' : ''}">${endF > nowF ? `<i class="gain" style="left:${nowF * 100}%; width:${(endF - nowF) * 100}%"></i>` : ''}<i style="width:${nowF * 100}%"></i>${upMarks}</div>${upLabels}
            <span class="qs-lv-tk${last ? '' : ' mid'}${goal ? ' goal' : at !== undefined ? ' time' : ''}">${label}</span></div>`);
        }
        // the two upgrades after the next one, faint: each its own line, its number under it (merged into one arrow, or
        // moved over the bar, once drawn: see the pass after rendering)
        const posOf = (lv) => { for (let k = 0; k < n; k++) if (lv > m[k] - 1e-9 && lv <= m[k + 1] + 1e-9) return (k + (lv - m[k]) / (m[k + 1] - m[k])) / n; return null; };
        const leftAt = (X) => `calc((100% - ${(n - 1) * 3}px) * ${X.toFixed(5)} + ${(Math.min(n - 1, Math.floor(X * n)) * 3)}px)`;
        const later = ups.slice(1, 3).map(ev => ({ ev, X: posOf(ev.level) })).filter(o => o.X !== null);
        const marks = later.map(o => `<b class="qs-lv-laterline" style="left:${leftAt(o.X)};" title="${esc(upgradeText(o.ev))}"></b><span class="qs-lv-later side" data-k="${o.ev.k}" style="left:${leftAt(o.X)};" title="${esc(upgradeText(o.ev))}">#${o.ev.k}</span>`).join('');
        return `<div class="qs-lv-bar${above ? ' ups' : ''}"><span class="qs-lv-tk first">${m[0]}</span>${cells.join('')}${marks ? `<div class="qs-lv-laterbox">${marks}</div>` : ''}</div>`;
      };
      const prestigeText = (x) => {
        if (x.readyAt === 0) return `<span class="qs-ready">${TEXT.levels.readyNow}</span>`;
        if (!isFinite(x.readySec)) return '<span class="qs-faint">–</span>';
        return x.readyAt !== undefined ? `<span style="font-weight:600; color:var(--qs-prestige);">${durH(x.readySec)}</span>` : `<span title="${esc(TEXT.levels.keepPlaying)}">${longDur(x.readySec)}</span>`;
      };
      /** The overall rebirth time in words, numbers coloured: "in 3 days and 4 hours". */
      const wordsDur = (sec) => `in ${durWords(sec, true, true)}`;
      const overallText = (x) => {
        if (x.readyAt === 0 || !isFinite(x.readySec)) return prestigeText(x);
        return x.readyAt !== undefined ? `<span style="font-weight:600;">${wordsDur(x.readySec)}</span>` : `<span title="${esc(TEXT.levels.keepPlaying)}">${wordsDur(x.readySec)}</span>`;
      };
      // a skill's share of all the XP per hour (with a route: of the XP as the routes' upgrades make it)
      const allPerH = routeView ? skillRows.reduce((t, x) => t + x.perH, 0) : totalPerH;
      const shareOf = (x) => (allPerH > 0 ? Math.round(x.perH / allPerH * 100) : 0);
      const detailRow = (x) => {
        const ranked = [...x.byMap.entries()].filter(([, v]) => v > 0).sort((a2, b2) => b2[1] - a2[1]);
        const sum = ranked.reduce((t, [, v]) => t + v, 0);
        const titleOf = (id) => (queue.entries.find(e => e.beatmapId === id) || {}).title || `Map ${id}`;
        const parts = ranked.slice(0, 4).map(([id, v], k) => ({ name: titleOf(id), v, c: MAP_COLORS[k] }));
        const rest = ranked.slice(4);
        if (rest.length) parts.push({ name: tx(TEXT.levels.other, { n: rest.length }), v: rest.reduce((t, [, v]) => t + v, 0), c: SETTINGS.colors.otherMaps, tip: rest.map(([id, v]) => `${titleOf(id)} ${Math.round(v / sum * 100)}%`).join(', ') });
        const share = (v) => `${Math.round(v / sum * 100)}%`;
        const bar = sum > 0 ? `<div class="qs-lv-maps">${parts.map(q => `<i style="flex:${q.v}; background:${q.c};" title="${esc(q.name)} ${share(q.v)}"></i>`).join('')}</div>
          <div class="qs-lv-legend">${parts.map(q => `<span title="${esc(q.tip || q.name)}"${q.tip ? ' class="qs-tip"' : ''}><i style="background:${q.c}"></i><span class="qs-lv-name">${esc(q.name)}</span><span class="qs-lv-share">${share(q.v)}</span></span>`).join('')}</div>`
          : `<div class="qs-faint">${TEXT.levels.noXp}</div>`;
        const plays = r.plays.length;
        return `<tr class="qs-lv-detail"><td colspan="4"><div class="qs-lv-dgrid">
          <div><div class="qs-lv-dh">${TEXT.levels.mapsTitle}</div>${bar}</div>
          <div><div class="qs-lv-dh">${TEXT.levels.paceTitle}</div><div class="qs-lv-kv">
            <span class="qs-dim">${TEXT.levels.now}</span><span>${x.start.toFixed(2)}</span>
            ${marks.map((h, k) => `<span class="qs-dim">${tx(TEXT.levels.after, { time: durH(h * 3600) })}</span><span>${x.atMark[k].toFixed(2)}</span>`).join('')}
            <span class="qs-dim">${tx(TEXT.levels.after, { time: durH(spanSec) })}</span><span>${x.end.toFixed(2)}</span>
            <span class="qs-dim">${x.overall ? TEXT.levels.rebirth : x.lifetime ? TEXT.levels.nextLevel : TEXT.levels.prestige}</span><span title="${x.toPrestige ? tx(TEXT.levels.xpToGo, { xp: fmt(x.toPrestige) }) : ''}">${prestigeText(x)}</span>
            ${x.sim ? `<span class="qs-dim">${TEXT.levels.nextUpgrade}</span><span>${x.sim.events.length ? esc(upgradeText(x.sim.events[0])) : x.sim.tracked ? TEXT.levels.routeDone : tx(TEXT.levels.noRoute, { p: x.sim.prestige })}</span>
            <span class="qs-dim">${TEXT.levels.upgradesLeft}</span><span>${x.sim.events.length}</span>` : ''}</div></div>
          <div><div class="qs-lv-dh">${TEXT.levels.xpTitle}</div><div class="qs-lv-kv">
            <span class="qs-dim">${TEXT.levels.perHour}</span><span>${x.perH > 0 ? `${fmt(x.perH)}${x.overall ? '' : ` <span class="qs-faint">${tx(TEXT.levels.queueShare, { pct: shareOf(x) })}</span>`}` : '–'}</span>
            <span class="qs-dim">${TEXT.levels.perPlay}</span><span>${plays ? fmt(x.cum / plays) : '–'}</span>
            ${loopSec ? `<span class="qs-dim">${TEXT.levels.perLoop}</span><span>${fmt(x.perH * loopSec / 3600)}</span>` : ''}
            <span class="qs-dim">${tx(TEXT.levels.within, { time: durH(spanSec) })}</span><span>${fmt(x.cum)}</span>
            <span class="qs-dim">${x.overall ? TEXT.levels.toRebirth : x.lifetime ? TEXT.levels.nextLevel : TEXT.levels.toPrestige}</span><span>${x.toPrestige ? fmt(x.toPrestige) : '–'}</span></div></div>
        </div></td></tr>`;
      };
      // the overall level sits on its own above the skills: one line, then its bar. It doesn't open.
      const overallHtml = overallRow ? `<div class="qs-lv-ov">
          <div class="qs-lv-ovline"><b>${TEXT.levels.overall} Lv ${overallRow.start.toFixed(2)}</b><span class="qs-faint">·</span><span><b>${overallRow.perH > 0 ? fmt(overallRow.perH) : '–'}</b> <span class="qs-dim">${TEXT.levels.xph}</span></span><span class="qs-faint">·</span><span title="${tx(TEXT.levels.rebirthAt, { n: overallRow.need })}${overallRow.toPrestige ? `: ${tx(TEXT.levels.xpToGo, { xp: fmt(overallRow.toPrestige) })}` : ''}"><span class="qs-dim">${TEXT.levels.rebirth}</span> ${overallText(overallRow)}</span></div>
          ${levelsBar(overallRow)}
        </div>` : '';
      const rowsHtml = skillRows.map((x) => {
        const open = levelsOpen.has(x.sk);
        return `<tr class="qs-lv-row${open ? ' open' : ''}${x.overall ? ' qs-lv-overall' : ''}" data-skill="${x.sk}">
          <td class="qs-lv-skill"><span class="qs-lv-caret">${open ? '▾' : '▸'}</span>${x.overall ? TEXT.levels.overall : SKILL_NAMES[x.sk]}<span class="qs-sub">${x.start.toFixed(2)}</span></td>
          <td class="n qs-lv-xph">${x.perH > 0 ? `<b>${fmt(x.perH)}</b>${x.overall ? '' : `<span class="qs-faint"> ${shareOf(x)}%</span>`}` : '<span class="qs-faint">–</span>'}</td>
          <td class="n qs-lv-pres" title="${x.overall ? tx(TEXT.levels.rebirthAt, { n: x.need }) : ''}${x.toPrestige ? `${x.overall ? ': ' : ''}${tx(TEXT.levels.xpToGo, { xp: fmt(x.toPrestige) })}` : ''}">${x.overall ? `<span class="qs-faint">${TEXT.levels.rebirth} </span>` : ''}${prestigeText(x)}</td>
          <td class="qs-lv-barcell">${levelsBar(x)}</td>
        </tr>${open ? detailRow(x) : ''}`;
      }).join('');
      levelsTab = `
      <div class="qs-card">
        <div class="qs-h">${TEXT.levels.title}</div>
        ${overallHtml}
        <div class="qs-row" style="margin-bottom:4px;">
          <span class="qs-dim">${TEXT.levels.display}</span>
          <select id="qs-lv-view" style="width:auto; field-sizing:content;">${[['regular', TEXT.levels.viewRegular], ['overall', TEXT.levels.viewOverall]].map(([v, label]) => `<option value="${v}"${v === viewNow ? ' selected' : ''}>${label}</option>`).join('')}</select>
          ${routesAll ? `<label class="qs-dim" style="display:flex; align-items:center; gap:4px; margin-left:8px;" title="${esc(TEXT.levels.useRoutesTip)}"><input id="qs-lv-routes" type="checkbox"${useRoutes ? ' checked' : ''} style="margin:0;"> ${TEXT.levels.useRoutes}</label>` : ''}
        </div>
        <div class="qs-dim" style="margin-bottom:6px;">${lifetimeView ? TEXT.levels.introOverall : TEXT.levels.intro}${routeView ? ` ${TEXT.levels.introRoute}` : ''}</div>
        <table class="qs-lv">
          <thead><tr><th>${TEXT.levels.skill}</th><th class="n">${TEXT.levels.xph}</th><th class="n">${lifetimeView ? TEXT.levels.nextLevel : TEXT.levels.prestige}</th><th style="padding-left:16px;">${lifetimeView ? TEXT.levels.barOverall : TEXT.levels.bar}</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="qs-legend" style="margin-top:6px;"><span><i class="qs-sw" style="background:var(--qs-now);"></i>${TEXT.levels.legendNow}</span><span><i class="qs-sw" style="background:var(--qs-now); opacity:.45;"></i>${TEXT.levels.legendProgress}</span><span class="qs-lg-complete"><i class="qs-sw qs-sw-complete"></i>${TEXT.levels.legendComplete}</span>${lifetimeView ? '' : `<span><i class="qs-sw qs-sw-shift"></i>${TEXT.levels.legendPrestige}</span>`}${routeView && !lifetimeView ? `<span><i class="qs-sw" style="background:#fbbf24; width:3px;"></i>${TEXT.levels.legendUpgrade}</span>` : ''}</div>
      </div>`;
    }

    // ---- Debug: what the forecast was built from, and every play ----
    const g = ctx.genes || {};
    const genesShown = [g.strainRate ? `Long Sets ${g.strainRate.toFixed(2)}` : '', g.restRate ? `Well Rested ${g.restRate.toFixed(2)}` : '', g.warmRate ? `Quick Warmup ${g.warmRate.toFixed(2)}` : '', g.warmHold ? `Stay Warm ${Math.round(g.warmHold)} min` : ''].filter(Boolean).join(' · ') || 'none';
    const { calls: asked, fromCache: reused } = r.counts();
    const scanPanel = `
      <div class="qs-card"><div class="qs-h">Scan</div><div class="qs-facts">
        <span>Character</span><span>#${num(ctx.row.id)} · generation ${num(ctx.row.generation) || 1}</span>
        <span>Start strain</span><span>${minText(now.minutes)}${now.typed ? ' (typed in)' : now.gameBar !== undefined ? ` (the game's bar ${(now.gameBar * 100).toFixed(0)}%, this add-on's ${(now.bar * 100).toFixed(0)}%)` : ''}</span>
        <span>Stamina gear</span><span>${ctx.gear} upgrade${ctx.gear === 1 ? '' : 's'}</span>
        <span>Genetics</span><span>${ctx.geneSource ? { server: 'from the server', local: 'from this computer', none: 'none found' }[ctx.geneSource.from] : '–'}</span>
        <span>Fatigue genes</span><span>${genesShown}</span>
        <span>Autopilot delay</span><span>${ctx.delaySec}s between plays</span>
        <span>Own rate / mods</span><span>${ctx.rate}× · ${ctx.mods.length ? ctx.mods.join(', ') : 'none'} (locked maps use theirs)</span>
        <span>Simulator</span><span>${asked} new call${asked === 1 ? '' : 's'} · ${reused} reused · ${r.runs || 1} run${(r.runs || 1) === 1 ? '' : 's'} per play</span>
        <span>Medals</span><span>${medals.ok ? `×${medals.multiplier.toFixed(4)} (${medals.held} held${medals.unknown ? `, ${medals.unknown} unknown` : ''})` : 'server not reached'}</span>
        <span>Mindblock</span><span>${num(r.recentStart)} plays in the last day counted at the start</span>
        <span>Tries</span><span>${(() => { const ids = Object.keys(r.triesFrom || {}); const n = ids.filter(id => r.triesFrom[id] === 'server').length; return n === ids.length ? 'from the server' : n ? `from the server for ${n} of ${ids.length} maps, the rest from this computer's plays` : 'from this computer\'s plays (the server didn\'t answer)'; })()}</span>
        <span>Forecast</span><span>${r.plays.length} plays over ${durH(spanH * 3600)}</span>
      </div></div>`;
    const calibSkills = r.calib ? SKILLS.filter(sk => r.calib.sim && r.calib.sim[sk] > 0) : [];
    const factorShown = (sk) => r.calib.factors[sk] ?? r.calib.ignored[sk];
    // with the medals known, the estimate for these plays is the simulator's (mindblock and genetics on it) times the medals
    const estOf = (sk) => (medals.ok ? r.calib.sim[sk] * medals.multiplier : 0);
    const matchCell = (real, est) => (est > 0
      ? `<td class="n" style="color:${matchColor(real / est)}; font-weight:600;" title="${MATCH_HELP}">${matchText(real / est)}</td>`
      : `<td class="n qs-dim" title="Your medals couldn't be read from the server, so the add-on used these plays to stand in for them: there's nothing left to compare.">–</td>`);
    const calibTotal = calibSkills.reduce((t, sk) => ({ real: t.real + r.calib.real[sk], est: t.est + estOf(sk) }), { real: 0, est: 0 });
    const calibPanel = `
      <div class="qs-card"><div class="qs-h">Calibration</div>
        <div class="qs-dim" style="margin-bottom:4px;">Your last plays${r.calib ? ` (${r.calib.plays})` : ''} re-simulated vs real XP. ${medals.ok ? `Factor near ×${medals.multiplier.toFixed(3)} (medals) = accurate.` : 'No server: factors stand in for medals.'}</div>
        ${calibSkills.length ? `<div style="overflow-x:auto;"><table><thead><tr><th>Skill</th><th class="n">Plays</th><th class="n">Real</th><th class="n" title="The add-on's estimate for these same plays: the simulator's XP with mindblock, your genetics and your medals">With bonuses</th><th class="n" title="the lowest and highest single-play factor">Range</th><th class="n" title="Real ÷ the simulator with mindblock and genetics, before medals: close to your medals is right">Factor</th><th class="n" title="${MATCH_HELP}" style="cursor:help;">Match ⓘ</th></tr></thead><tbody>
          ${calibSkills.map(sk => `<tr><td>${SKILL_NAMES[sk]}</td><td class="n">${r.calib.n[sk]}</td><td class="n">${fmt(r.calib.real[sk])}</td><td class="n">${estOf(sk) > 0 ? fmt(estOf(sk)) : '<span class="qs-dim">–</span>'}</td><td class="n qs-dim">${r.calib.low[sk].toFixed(2)}–${r.calib.high[sk].toFixed(2)}</td><td class="n"><b>×${factorShown(sk).toFixed(2)}</b></td>${matchCell(r.calib.real[sk], estOf(sk))}</tr>`).join('')}
          <tr style="border-top:1px solid #2b2b3a;"><td><b>Total</b></td><td></td><td class="n"><b>${fmt(calibTotal.real)}</b></td><td class="n">${calibTotal.est > 0 ? `<b>${fmt(calibTotal.est)}</b>` : '<span class="qs-dim">–</span>'}</td><td></td><td></td>${matchCell(calibTotal.real, calibTotal.est)}</tr>
        </tbody></table></div>` : '<div class="qs-dim" style="color:#fca5a5;">No recent plays of these maps: nothing to match against.</div>'}
      </div>`;
    const queuePanel = `
      <div class="qs-card"><div class="qs-h">Queue as read</div>
        <div class="qs-dim" style="margin-bottom:4px;">From the dock: ${queue.entries.length} map${queue.entries.length === 1 ? '' : 's'}${queue.label ? `, "${esc(queue.label)}"` : ''}.</div>
        <div class="qs-tablewrap" style="max-height:200px;"><table><thead><tr><th>#</th><th>Map</th><th class="n">Id</th><th class="n">Rate</th><th class="n">Repeat</th><th class="n">Tries</th></tr></thead><tbody>
          ${queue.entries.map((e, i) => `<tr><td class="qs-dim">${i + 1}</td><td class="qs-map" title="${esc(e.title)}">${esc(e.title)}</td><td class="n">${e.beatmapId}</td><td class="n">${e.lockedRate ?? `${ctx.rate} (yours)`}×</td><td class="n">${e.repeat}${e.played ? ` (${e.played} started)` : ''}</td><td class="n" title="${r.triesFrom && r.triesFrom[e.beatmapId] === 'server' ? `from the server` : 'counted from this computer\'s plays: the server didn\'t answer'}">${num(r.memory[e.beatmapId]).toFixed(1)}${r.triesFrom && r.triesFrom[e.beatmapId] === 'server' ? '' : ' <span class="qs-dim">local</span>'}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    const debugPlays = debugLimit > 0 ? r.plays.slice(0, debugLimit) : r.plays;
    const debugRows = debugPlays.map((p, i) => {
      const e = queue.entries[p.entry];
      const cells = SKILLS.map(sk => {
        const v = xpOf(p, sk);
        return v > 0 ? `<td class="n" title="simulator: ${fmt(num(p.xp[sk]))}">${fmt(v)}</td>` : '<td class="n z">0</td>';
      }).join('');
      return `<tr>
        <td class="qs-dim">${i + 1}</td><td class="qs-map" title="${esc(e.title)}">${esc(e.title)}</td>
        <td class="n">${clock(p.start)}</td><td class="n" title="simulated at ${p.simStrain} min">${shortTime(p.before)}</td><td class="n" title="simulated at ${p.simTries}">${p.tries.toFixed(1)}</td>
        <td class="n">${shortTime(p.strained)} / ${shortTime(p.lengthMin)}</td><td class="n">${(p.bar * 100).toFixed(0)}%</td>
        <td class="n${num(p.block ?? 1) > 0.995 ? ' qs-dim' : ''}" title="${num(p.recentPlays)} of the last 50 plays">${num(p.recentPlays)} · ×${num(p.block ?? 1).toFixed(2)}</td>
        ${cells}${totalOf(p) > 0 ? `<td class="n"><b>${fmt(totalOf(p))}</b></td>` : '<td class="n qs-dim">0</td>'}
        <td><span class="qs-pill ${p.fresh ? 'new' : 'hit'}">${p.fresh ? 'new' : 'cache'}</span>${p.passed ? '' : ` <span style="color:#fca5a5; font-weight:700;">fail${p.failAt ? ` ${Math.round(p.failAt * 100)}%` : ''}</span>`}${p.ups && p.ups.length ? ` <span class="qs-up" title="Levels up after this play: the next plays are simulated at the new level">${p.ups.map(u => `${SKILL_SHORT[u.skill]} ${u.level}`).join(', ')} ↑</span>` : ''}</td>
      </tr>`;
    }).join('');
    // one map at a time: its plays through the forecast, and its XP per play by skill
    const mapIds = [...new Set(queue.entries.map(e => e.beatmapId))];
    /** One map's card: its XP per play over the forecast, mindblock, bonuses and level-ups. */
    const cardOf = (id) => {
      const entry = queue.entries.find(e => e.beatmapId === id);
      const own = r.plays.map((p, i) => ({ p, i })).filter(({ p }) => queue.entries[p.entry].beatmapId === id);
      const skillsHere = SKILLS.filter(sk => own.some(({ p }) => xpOf(p, sk) > 0));
      const totals = own.map(({ p }) => totalOf(p));
      const sum = totals.reduce((a, b) => a + b, 0);
      const firstT = totals[0] || 0, lastT = totals[totals.length - 1] || 0;
      const change = firstT > 0 ? lastT / firstT - 1 : 0;
      const ups = own.flatMap(({ p }) => p.ups || []);
      // the chart: XP per play over the forecast, a line per skill
      const COLORS = ['#60a5fa', '#f0883e', '#4ade80', '#c084fc', '#facc15', '#f87171', '#22d3ee', '#fb7185', '#a3e635', '#e879f9', '#94a3b8'];
      const Wc = 760, Hc = 90, pad = 4;
      const maxXp = Math.max(1, ...own.flatMap(({ p }) => skillsHere.map(sk => xpOf(p, sk))));
      const xAt = (t) => pad + (t / Math.max(1, spanH * 3600)) * (Wc - 2 * pad);
      const yAt = (v) => Hc - pad - (v / maxXp) * (Hc - 2 * pad - 10);
      const lines = skillsHere.map((sk, k) => {
        const pts = own.map(({ p }) => `${xAt(p.start).toFixed(1)},${yAt(xpOf(p, sk)).toFixed(1)}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="${COLORS[k % COLORS.length]}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
          + (own.length <= 40 ? own.map(({ p }) => `<circle cx="${xAt(p.start).toFixed(1)}" cy="${yAt(xpOf(p, sk)).toFixed(1)}" r="2" fill="${COLORS[k % COLORS.length]}"><title>${SKILL_NAMES[sk]} at ${clock(p.start)}: ${fmt(xpOf(p, sk))}${MINDBLOCK.has(sk) ? ` · mindblock ×${num(p.block ?? 1).toFixed(2)}` : ''}</title></circle>`).join('') : '');
      }).join('');
      const upMarks = own.filter(({ p }) => p.ups && p.ups.length).map(({ p }) => `<line x1="${xAt(p.end).toFixed(1)}" x2="${xAt(p.end).toFixed(1)}" y1="0" y2="${Hc}" stroke="#4ade80" stroke-dasharray="2 3" opacity=".5"><title>${p.ups.map(u => `${SKILL_NAMES[u.skill]} ${u.level}`).join(', ')}</title></line>`).join('');
      const hourLines = [];
      for (let h = 1; h * 3600 < spanH * 3600; h += spanH > 8 ? 2 : 1) hourLines.push(`<line x1="${xAt(h * 3600)}" x2="${xAt(h * 3600)}" y1="0" y2="${Hc}" stroke="#23232f"/><text x="${xAt(h * 3600) + 2}" y="${Hc - 3}" fill="#6b7280" font-size="9">${h}H</text>`);
      const legend = skillsHere.map((sk, k) => `<span style="display:inline-flex; align-items:center; gap:4px; margin-right:10px;"><i style="display:inline-block; width:10px; height:3px; border-radius:2px; background:${COLORS[k % COLORS.length]};"></i>${SKILL_NAMES[sk]}</span>`).join('');
      return `
        <div class="qs-card" style="background:#101018; margin:2px 0 6px 16px;">
          ${own.length ? `
          <div class="qs-facts" style="margin-bottom:8px;">
            <span class="qs-dim">A play</span><span><b>${fmt(sum / own.length)}</b> on average</span>
            <span class="qs-dim">Over time</span><span>${fmt(firstT)} on its first play, ${fmt(lastT)} on its last (<span style="color:${change >= 0 ? '#4ade80' : '#f87171'}">${change >= 0 ? '+' : ''}${Math.round(change * 100)}%</span>)</span>
            ${skillsHere.some(sk => MINDBLOCK.has(sk)) ? `<span class="qs-dim">Mindblock</span><span>×${num(own[0].p.block ?? 1).toFixed(2)} on its first play, ×${num(own[own.length - 1].p.block ?? 1).toFixed(2)} on its last</span>` : ''}
            <span class="qs-dim">Bonuses</span><span>${medals.ok ? `medals ×${medals.multiplier.toFixed(3)}` : 'medals unknown'}${skillsHere.filter(sk => geneOf(sk) > 1).length ? ` · genetics ${skillsHere.filter(sk => geneOf(sk) > 1).map(sk => `${SKILL_SHORT[sk]} ×${geneOf(sk).toFixed(2)}`).join(', ')}` : ''}</span>
            ${ups.length ? `<span class="qs-dim">Level-ups</span><span class="qs-up">${ups.map(u => `${SKILL_NAMES[u.skill]} ${u.level}`).join(', ')}</span>` : ''}
          </div>
          <div class="qs-dim" style="margin-bottom:4px;">${legend}</div>
          <svg viewBox="0 0 ${Wc} ${Hc}" width="100%" height="${Hc}" preserveAspectRatio="none" style="display:block; background:#0b0b11; border-radius:4px; margin-bottom:8px;">${hourLines.join('')}${upMarks}${lines}</svg>
          ` : `<div class="qs-dim">Not played within the next ${durH(spanH * 3600)}.</div>`}
        </div>`;
    };

    // ---- Diagnostics: a health line per input, and everything as text to paste (no character id or name) ----
    const diag = (() => {
      const st = r.simStats || { ms: 0, slowest: 0, busy: 0, failed: 0 };
      const geneFrom = ctx.geneSource ? ctx.geneSource.from : 'none';
      const triesIds = Object.keys(r.triesFrom || {});
      const triesServer = triesIds.filter(id => r.triesFrom[id] === 'server').length;
      const calibSk = r.calib ? SKILLS.filter(sk => r.calib.sim && r.calib.sim[sk] > 0) : [];
      const calibReal = calibSk.reduce((t, sk) => t + r.calib.real[sk], 0);
      const calibEst = medals.ok ? calibSk.reduce((t, sk) => t + r.calib.sim[sk] * medals.multiplier, 0) : 0;
      const match = calibEst > 0 ? calibReal / calibEst : undefined;
      const fromEdit = queue.from && queue.from !== '.dock__source';
      const health = [
        ['Medals', medals.ok ? 'ok' : r.calib && Object.keys(r.calib.factors).length ? 'warn' : 'bad',
          medals.ok ? (medals.guest ? 'guest: none' : `server · ×${medals.multiplier.toFixed(3)}`) : 'server not reached: learned from plays'],
        ['Genetics', geneFrom === 'none' && !ctx.row.local ? 'warn' : 'ok', geneFrom === 'server' ? 'server' : geneFrom === 'local' ? 'this computer' : 'none found'],
        ['Tries', !triesIds.length || triesServer === triesIds.length || ctx.row.local ? 'ok' : 'warn',
          ctx.row.local ? 'this computer (guest)' : triesServer === triesIds.length ? `server, ${triesServer} of ${triesIds.length} maps` : `this computer for ${triesIds.length - triesServer} of ${triesIds.length} maps`],
        ['Queue', 'ok', `${queue.entries.length} maps${fromEdit ? ' (Edit Queue open)' : ''}`],
        ['Simulator', st.failed ? 'bad' : st.busy ? 'warn' : 'ok', `${r.counts().calls} calls${st.busy ? `, ${st.busy} busy (retried)` : ''}${st.failed ? `, ${st.failed} failed` : ''}`],
        ['Bar', now.typed || now.gameBar === undefined ? 'ok' : Math.abs(now.gameBar - now.bar) <= 0.02 ? 'ok' : 'warn',
          now.typed ? 'typed in' : now.gameBar === undefined ? 'no game bar to compare' : Math.abs(now.gameBar - now.bar) <= 0.02 ? 'matches the game' : `${Math.round(Math.abs(now.gameBar - now.bar) * 100)}% off the game`],
        ['Match', match === undefined ? 'warn' : Math.abs(match - 1) <= 0.1 ? 'ok' : Math.abs(match - 1) <= 0.25 ? 'warn' : 'bad',
          match === undefined ? (calibSk.length ? 'medals unknown' : 'no recent plays to compare') : `${Math.round(match * 100)}% overall`],
        ['Problems', diagLog.length ? 'warn' : 'ok', diagLog.length ? `${diagLog.length} this session` : 'none'],
      ];
      const lines = [];
      const device = /electron/i.test(navigator.userAgent) ? 'desktop app' : 'browser';
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      lines.push(`Queue Strain ${VERSION} (${VERSION_ID}) · ${device} · ${innerWidth}×${innerHeight} · animations ${animBox.checked && !reduce ? 'on' : 'off'}${reduce ? ' (reduce motion)' : ''}`);
      lines.push(`Options: look ahead ${dur(ctx.hours * 3600)} · runs ${r.runs || 1} · memory plays ${memPlays} · rescan ${autoBox.checked ? 'on' : 'off'} · rate ${ctx.rate} · autopilot ${ctx.delaySec}s`);
      lines.push(`Character: gen ${num(ctx.row.generation)}${ctx.row.local ? ' · guest' : ''} · ${SKILLS.map(sk => `${SKILL_SHORT[sk]} ${levelOf(Math.floor(num(ctx.row[sk])), num(ctx.row[`${sk}XP`])).toFixed(2)} P${num(ctx.row[`${sk}Prestige`])} U${num(ctx.row[`${sk}Upgrades`])} OD${num(ctx.row[`${sk}Overdrive`])}`).join(' · ')}`);
      lines.push(`Medals: ${medals.ok ? (medals.guest ? 'guest' : `server · ${medals.held} held · ${medals.unknown} unknown · ×${medals.multiplier.toFixed(4)}`) : 'server not reached'}`);
      lines.push(`Genetics: ${geneFrom} · ${SKILLS.filter(sk => genetics[sk] && genetics[sk].total > 1).map(sk => `${SKILL_SHORT[sk]} ×${genetics[sk].total.toFixed(2)}`).join(' · ') || 'no XP bonus'} · fatigue genes ${JSON.stringify(ctx.genes || {})}`);
      lines.push(`Strain: ${now.typed ? 'typed ' : ''}${now.minutes.toFixed(1)} min · add-on bar ${(now.bar * 100).toFixed(1)}%${now.gameBar !== undefined ? ` · game bar ${(now.gameBar * 100).toFixed(1)}%` : ''} · warm ${(now.warm * 100).toFixed(0)}% · ${STAGES[now.stage][0]}`);
      lines.push(`Queue: ${queue.entries.length} maps · read from ${queue.from || '?'}${queue.label ? ` · "${queue.label}"` : ''} · key ${queueKey(queue.entries).join('|')}`);
      for (const id of [...new Set(queue.entries.map(e => e.beatmapId))]) {
        const e = queue.entries.find(x => x.beatmapId === id);
        lines.push(`  ${id} ${e.title.slice(0, 40)} · ×${e.lockedRate ?? ctx.rate}${e.lockedMods && e.lockedMods.length ? ` ${e.lockedMods.join('')}` : ''} · rep ${e.repeat} played ${e.played} · Tries ${num(r.memory[id]).toFixed(1)} (${(r.triesFrom || {})[id] || '?'}) · last day ${num((r.recentByMap || {})[id])} plays · real plays ${num(((r.localSummary || {}).perMap || {})[id])}`);
      }
      lines.push(`Simulator: ${r.counts().calls} new · ${r.counts().fromCache} cached · ${st.busy} busy (retried) · ${st.failed} failed · avg ${r.counts().calls ? Math.round(st.ms / Math.max(1, r.counts().calls)) : 0}ms · slowest ${(st.slowest / 1000).toFixed(1)}s · scan ${((r.scanMs || 0) / 1000).toFixed(1)}s`);
      lines.push(`Forecast: ${r.plays.length} plays over ${dur(spanH * 3600)} · loop ${r.loopSec ? `${r.loopPlays} plays in ${dur(r.loopSec)}` : '–'} · mindblock window ${num(r.recentStart)} plays at start`);
      lines.push(`Calibration: ${calibSk.length ? calibSk.map(sk => `${SKILL_SHORT[sk]} ${r.calib.n[sk]} plays ${calibEst > 0 ? `${Math.round(r.calib.real[sk] / (r.calib.sim[sk] * medals.multiplier) * 100)}%` : `×${(r.calib.factors[sk] ?? r.calib.ignored[sk] ?? 0).toFixed(2)}`}`).join(' · ') : 'no recent plays'}${match !== undefined ? ` · total ${Math.round(match * 100)}%` : ''}`);
      const ls = r.localSummary;
      lines.push(`Local estimate: ${ls ? `${ls.maps} of ${ls.of} maps (${ls.plays} plays) · ${fmt(ls.real)}/h vs ${fmt(ls.same)}/h with bonuses` : '–'}`);
      lines.push(`Problems (last ${diagLog.length}):${diagLog.length ? '' : ' none'}`);
      for (const d of diagLog) lines.push(`  ${new Date(d.at).toLocaleTimeString()} ${d.where}: ${d.msg}`);
      return { health, text: lines.join('\n') };
    })();
    const DOT = { ok: '#4ade80', warn: '#facc15', bad: '#f87171' };
    const diagPanel = `
      <div class="qs-card" style="margin-bottom:10px;">
        <div class="qs-row" style="margin-bottom:6px;"><div class="qs-h" style="margin:0;">Diagnostics</div>
          <span class="qs-dim">Something looks wrong? Copy this and send it to Rai.</span>
          <button type="button" class="qs-plain qs-diag-copy" style="margin-left:auto;" title="Diagnostics, the forecast plays and your recent real plays, in one">Copy Diagnostics</button>
          <button type="button" class="qs-plain qs-diag-console">Open in console</button></div>
        <div class="qs-diag">${diag.health.map(([k, state, v]) => `<span title="${esc(v)}"><i style="background:${DOT[state]}"></i><b>${k}</b> ${esc(v)}</span>`).join('')}</div>
      </div>`;
    const debugTab = `${diagPanel}
      <div class="qs-cols3" style="margin-bottom:10px;">${scanPanel}${calibPanel}${queuePanel}</div>
      <div class="qs-card">
        <div class="qs-row" style="margin-bottom:6px;">
          <div class="qs-h" style="margin:0;">Every play</div>
          <div class="qs-pager" style="margin-left:4px;">
            <button type="button" class="qs-view" data-view="table" style="width:auto; padding:0 8px; font-size:11px;${debugView === 'table' ? ' background:#4f46e5; border-color:#4f46e5;' : ''}">Table</button>
            <button type="button" class="qs-view" data-view="cards" style="width:auto; padding:0 8px; font-size:11px;${debugView === 'cards' ? ' background:#4f46e5; border-color:#4f46e5;' : ''}">Cards</button>
          </div>
          <span class="qs-dim">${'XP with mindblock, medals and genetics. Hover a number for the simulator\'s own; hover strain or Tries for its step.'}</span>
          ${true ? `<span class="qs-dim" style="margin-left:auto;">Show</span>
          <select class="qs-debug-limit"><option value="50"${debugLimit === 50 ? ' selected' : ''}>first 50 plays</option><option value="200"${debugLimit === 200 ? ' selected' : ''}>first 200 plays</option><option value="0"${debugLimit === 0 ? ' selected' : ''}>all ${r.plays.length} plays</option></select>` : '<span style="margin-left:auto;"></span>'}
          <button type="button" class="qs-plain qs-console" title="Your recent plays as the game stored them, and the calibration play by play">Console</button>
        </div>
        ${debugView === 'cards' && mapIds.length ? (() => { debugMap = Math.min(Math.max(0, debugMap), mapIds.length - 1); const e = queue.entries.find(x => x.beatmapId === mapIds[debugMap]); return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><b style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(e.title)}">${esc(e.title)}</b><span class="qs-dim">Id ${e.beatmapId} · ${e.lockedRate ?? `${ctx.rate} (yours)`}× · repeat ${e.repeat} · Tries now ${num(r.memory[e.beatmapId]).toFixed(1)}</span><div class="qs-pager" style="margin-left:auto;"><button type="button" class="qs-map-page" data-step="-1" ${debugMap === 0 ? 'disabled' : ''} title="Previous map">‹</button><span>${debugMap + 1}/${mapIds.length}</span><button type="button" class="qs-map-page" data-step="1" ${debugMap === mapIds.length - 1 ? 'disabled' : ''} title="Next map">›</button></div></div>${cardOf(e.beatmapId)}`; })() : `<div class="qs-tablewrap"><table>
          <thead><tr><th>#</th><th>Map</th><th class="n">Starts</th><th class="n">Strain in</th><th class="n">Tries</th><th class="n">Strain / Length</th><th class="n">Bar after</th><th class="n" title="Mindblock: how many of the last 50 plays were this map, and the XP left on the skills it cuts">Mindblock</th>${SKILLS.map(sk => `<th class="n" title="${SKILL_NAMES[sk]}">${SKILL_SHORT[sk]}</th>`).join('')}<th class="n">Total</th><th>Sim</th></tr></thead>
          <tbody>${debugRows}</tbody>
        </table></div>`}
      </div>`;
    /** The whole Debug tab as tab-separated text, for pasting into a message or a sheet. */
    const debugText = () => {
      const lines = [];
      lines.push(`Queue Strain debug · character #${num(ctx.row.id)} · generation ${num(ctx.row.generation) || 1}`);
      lines.push(`Start strain\t${now.minutes.toFixed(2)} min${now.gameBar !== undefined ? `\tgame bar ${(now.gameBar * 100).toFixed(1)}%\tadd-on bar ${(now.bar * 100).toFixed(1)}%` : ''}`);
      lines.push(`Stamina gear\t${ctx.gear}\tFatigue genes\t${genesShown}\tAutopilot delay\t${ctx.delaySec}s\tRate\t${ctx.rate}\tMods\t${ctx.mods.join(',') || 'none'}`);
      lines.push(`Simulator\t${asked} new\t${reused} reused\tRuns\t${r.runs || 1}\tForecast\t${r.plays.length} plays\t${dur(spanH * 3600)}`);
      lines.push(`Medals\t${medals.ok ? `x${medals.multiplier.toFixed(4)}\t${medals.held} held\t${medals.unknown} unknown` : 'server not reached'}\tRecent plays at start\t${num(r.recentStart)}`);
      lines.push('');
      lines.push(['Calibration', 'Plays', 'Real', 'With bonuses', 'Factor', 'Match'].join('\t'));
      for (const sk of calibSkills) lines.push([SKILL_NAMES[sk], r.calib.n[sk], Math.round(r.calib.real[sk]), Math.round(estOf(sk)), factorShown(sk).toFixed(3), estOf(sk) > 0 ? matchText(r.calib.real[sk] / estOf(sk)) : '-'].join('\t'));
      lines.push('');
      lines.push(['#', 'Map', 'Id', 'Rate', 'Repeat', 'Started', 'Tries', 'Tries from', 'Local Tries'].join('\t'));
      queue.entries.forEach((e, i) => lines.push([i + 1, e.title, e.beatmapId, e.lockedRate ?? ctx.rate, e.repeat, e.played, num(r.memory[e.beatmapId]).toFixed(2), (r.triesFrom || {})[e.beatmapId] || '', num((r.memoryLocal || {})[e.beatmapId]).toFixed(2)].join('\t')));
      lines.push('');
      lines.push(['#', 'Map', 'Starts', 'Strain in (min)', 'Simulated at (min)', 'Tries', 'Simulated at', 'Strained (min)', 'Length (min)', 'Bar after %', 'Recent plays', 'Mindblock', ...SKILLS.map(sk => SKILL_NAMES[sk]), 'Total', 'Sim', 'Passed', 'Levels up'].join('\t'));
      r.plays.forEach((p, i) => lines.push([i + 1, queue.entries[p.entry].title, clock(p.start), p.before.toFixed(2), p.simStrain, p.tries.toFixed(2), p.simTries, p.strained.toFixed(3), p.lengthMin.toFixed(2), (p.bar * 100).toFixed(1), num(p.recentPlays), num(p.block ?? 1).toFixed(3), ...SKILLS.map(sk => Math.round(xpOf(p, sk))), Math.round(totalOf(p)), p.fresh ? 'new' : 'cache', p.passed ? 'yes' : `no${p.failAt ? ` (${Math.round(p.failAt * 100)}%)` : ''}`, (p.ups || []).map(u => `${SKILL_NAMES[u.skill]} ${u.level}`).join(', ')].join('\t')));
      return lines.join('\n');
    };

    // ---- the tabs ----
    const available = TABS.filter(([id]) => (id === 'xp' || id === 'levels' ? hasXp : id === 'sv' ? !!svTab : true));
    if (!available.some(([id]) => id === activeTab)) activeTab = 'overview';
    const content = { overview, xp: xpTab, sv: svTab, levels: levelsTab, debug: debugTab }[activeTab];
    outEl.innerHTML = `
      <div class="qs-tabs">${available.map(([id, label]) => `<button type="button" data-tab="${id}" class="${id === activeTab ? 'on' : ''}">${label}</button>`).join('')}</div>
      ${content}`;

    // the next upgrade's label under a bar: when it would cover one of the bar's level marks (the 100 at its start,
    // say), it moves above the bar instead
    // the next upgrade's label: its number centred on its line, the time running on to the right
    for (const lbl of outEl.querySelectorAll('.qs-lv-uplbl')) { const k = lbl.querySelector('.k'); if (k && !lbl.style.transform) lbl.style.marginLeft = `-${(k.getBoundingClientRect().width / 2).toFixed(1)}px`; }
    for (const lbl of outEl.querySelectorAll('.qs-lv-uplbl.below')) {
      const bar = lbl.closest('.qs-lv-bar'), r = lbl.getBoundingClientRect();
      const hits = [...bar.querySelectorAll('.qs-lv-tk')].some(t => { const q = t.getBoundingClientRect(); return q.width && r.left < q.right + 2 && r.right > q.left - 2; });
      if (hits) { lbl.classList.replace('below', 'above'); bar.classList.add('ups'); }
    }
    // the faint later upgrades, now that they're drawn: two within 30px of each other merge into one arrow under
    // the bar; a number that covers something (a level mark, the next upgrade's label, the other number) moves
    // over the bar, its line staying where it is
    for (const bar of outEl.querySelectorAll('.qs-lv-bar')) {
      const box = bar.querySelector('.qs-lv-laterbox');
      if (!box) continue;
      const lines = [...box.querySelectorAll('.qs-lv-laterline')], lbls = [...box.querySelectorAll('.qs-lv-later')];
      if (lines.length === 2) {
        const [a, b] = lines.map(l => l.getBoundingClientRect());
        if (a.width && Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 30) {
          const mid = ((a.left + a.right + b.left + b.right) / 4) - box.getBoundingClientRect().left;
          const nums = lbls.map(l => Number(l.dataset.k)).sort((x1, x2) => x1 - x2).map(k => `#${k}`).join(', ');
          const tip = lbls.map(l => l.title).join('\n');
          box.innerHTML = `<span class="qs-lv-later down" style="left:${mid.toFixed(1)}px;" title="${esc(tip)}"><i>▲</i>${nums}</span>`;
        }
      }
      const others = [...bar.querySelectorAll('.qs-lv-tk, .qs-lv-uplbl')].map(t => t.getBoundingClientRect()).filter(q => q.width);
      const placed = [];
      for (const lbl of box.querySelectorAll('.qs-lv-later')) {
        const r = lbl.getBoundingClientRect();
        const hits = [...others, ...placed].some(q => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom && r.bottom > q.top);
        if (hits) {
          const merged = lbl.classList.contains('down');
          lbl.classList.remove('down', 'side');
          lbl.classList.add('up');
          if (merged) lbl.innerHTML = `${lbl.textContent.replace('▲', '')}<i>▼</i>`;
          bar.classList.add('ups');
        }
        placed.push(lbl.getBoundingClientRect());
      }
    }
    for (const tr of outEl.querySelectorAll('.qs-lv-row')) {
      tr.onclick = () => { const k = tr.dataset.skill; if (levelsOpen.has(k)) levelsOpen.delete(k); else levelsOpen.add(k); renderResult(...lastResult); centerVertically(); };
    }
    const viewSel = outEl.querySelector('#qs-lv-view');
    if (viewSel) viewSel.onchange = () => { if (!viewSel.value) return; levelsView = viewSel.value; savePrefs(); renderResult(...lastResult); };
    const routesBox = outEl.querySelector('#qs-lv-routes');
    if (routesBox) routesBox.onchange = () => { useRoutes = routesBox.checked; if (useRoutes) levelsView = 'regular'; savePrefs(); renderResult(...lastResult); };
    const localList = outEl.querySelector('.qs-local-list');
    if (localList) localList.addEventListener('toggle', () => { localOpen = localList.open; centerVertically(); });
    for (const btn of outEl.querySelectorAll('.qs-tabs button')) {
      btn.onclick = () => { activeTab = btn.dataset.tab; savePrefs(); renderResult(...lastResult); centerVertically(); };
    }
    const playsBox = outEl.querySelector('.qs-memplays');
    if (playsBox) playsBox.addEventListener('change', () => void setMemPlays(playsBox.value));
    for (const btn of outEl.querySelectorAll('.qs-page')) {
      btn.onclick = () => { svPage += Number(btn.dataset.step); renderResult(...lastResult); };
    }
    for (const btn of outEl.querySelectorAll('.qs-view')) btn.onclick = () => { debugView = btn.dataset.view; renderResult(...lastResult); };
    for (const btn of outEl.querySelectorAll('.qs-map-page')) btn.onclick = () => { debugMap += Number(btn.dataset.step); renderResult(...lastResult); };
    const limitBox = outEl.querySelector('.qs-debug-limit');
    if (limitBox) limitBox.onchange = () => { debugLimit = Number(limitBox.value) || 0; renderResult(...lastResult); };
    const titles = Object.fromEntries(queue.entries.map(e => [e.beatmapId, e.title]));
    // maps outside the queue: their names from the game's catalog

    /** The character's last 100 plays as the game stored them, newest first. */
    const loadPlayed = async () => {
      for (const [id, t] of Object.entries(await mapNames())) if (!titles[id]) titles[id] = t;
      let rows = [];
      let note = '';
      try {
        rows = (await gameRows('SELECT x.playedAt AS playedAt, x.beatmapId AS beatmapId, x.gains AS gains, s.rate AS rate, s.mods AS mods, s.accuracy AS accuracy, s.pp AS pp FROM score_xp x LEFT JOIN score s ON s.id = x.scoreId WHERE x.characterId = ? ORDER BY x.playedAt DESC LIMIT 100', [num(ctx.row.id)])) || [];
      } catch (e) {
        note = `The game keeps no per-play XP here (${e && e.message ? e.message : e}).`;
      }
      const ats = rows.map(x => num(x.playedAt));
      const played = rows.map(x => {
        const g = parseGains(x.gains);
        return {
          Time: new Date(num(x.playedAt)).toLocaleString(), Map: `#${x.beatmapId}${titles[x.beatmapId] ? ` ${titles[x.beatmapId]}` : ''}`, Rate: num(x.rate) || 1, Mods: x.mods || '',
          'Acc %': x.accuracy !== null && x.accuracy !== undefined ? `${(num(x.accuracy) * (num(x.accuracy) <= 1 ? 100 : 1)).toFixed(2)}%` : '', pp: Math.round(num(x.pp)),
          ...Object.fromEntries(SKILLS.map(sk => [SKILL_NAMES[sk], Math.round(num(g[sk]))])),
        };
      });
      return { played, ats, note, newest: ats.length ? Math.max(...ats) : 0 };
    };
    const consoleBtn = outEl.querySelector('.qs-console');
    if (consoleBtn) {
      consoleBtn.onclick = async () => {
        const calibRows = r.calib && r.calib.detail.length ? r.calib.detail.map(d => ({
          Time: new Date(d.playedAt).toLocaleString(), Map: d.title, Rate: d.rate, Mods: d.mods, 'Tries then': +d.tries.toFixed(2), 'Recent then': d.recentThen, Mindblock: +num(d.block ?? 1).toFixed(3),
          ...Object.fromEntries(SKILLS.filter(sk => r.calib.detail.some(x => num(x.real[sk]) > 0 || num(x.sim[sk]) > 0)).flatMap(sk => [[`${SKILL_SHORT[sk]} real`, Math.round(num(d.real[sk]))], [`${SKILL_SHORT[sk]} sim`, Math.round(num(d.sim[sk]))]])),
        })) : [];
        const calibSummary = r.calib ? Object.keys(r.calib.n).map(sk => ({
          Skill: SKILL_NAMES[sk], Plays: r.calib.n[sk], Real: Math.round(r.calib.real[sk]), 'With bonuses': medals.ok ? Math.round(r.calib.sim[sk] * medals.multiplier) : '',
          Factor: +((r.calib.factors[sk] ?? r.calib.ignored[sk]) || 0).toFixed(3), Match: medals.ok && r.calib.sim[sk] > 0 ? matchText(r.calib.real[sk] / (r.calib.sim[sk] * medals.multiplier)) : '',
        })) : [];
        void openConsole({ loadPlayed, calibRows, calibSummary, diag });
      };
    }
    const diagCopy = outEl.querySelector('.qs-diag-copy');
    if (diagCopy) {
      diagCopy.onclick = async () => {
        const recent = await loadPlayed();
        const text = `${diag.text}

== Forecast plays ==
${debugText()}

== Recent real plays ==
${recent.note ? `${recent.note}
` : ''}${tsv(recent.played)}`;
        diagCopy.textContent = (await copyText(text)) ? 'Copied' : 'Copy failed';
        setTimeout(() => { if (diagCopy.isConnected) diagCopy.textContent = 'Copy Diagnostics'; }, 1500);
      };
    }
    const diagConsole = outEl.querySelector('.qs-diag-console');
    if (diagConsole && consoleBtn) diagConsole.onclick = () => { consoleView = 'diag'; consoleBtn.onclick(); };
  };
};

export const unmount = () => {
  scanToken++;
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  saveCache();
  if (keyListener) {
    window.removeEventListener('keydown', keyListener, true);
    keyListener = null;
  }
  if (outsideListener) {
    window.removeEventListener('pointerdown', outsideListener, true);
    outsideListener = null;
  }
  if (moveListener) {
    window.removeEventListener('pointermove', moveListener, true);
    moveListener = null;
  }
  if (root) { root.remove(); root = null; }
  if (styleEl) { styleEl.remove(); styleEl = null; }
  const stale = document.getElementById('qs-window');
  if (stale) stale.remove();
};
