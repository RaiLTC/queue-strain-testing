// Formatting and the small pieces of the window: bars, graphs, the notice and changelog buttons.

import { CHANGELOG, NOTICE, TEXT } from '../config.js';
import { BAR_ZONES, STAGES, XP_CUT, fatigueLevel, fatigueXp, stageOf } from '../rules/fatigue.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** A play's start, as a table column: 1:05. */
export const clock = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
/** A stretch of time as plain text, for copies and hover tips: 8h 05m, 44m under an hour, <1m under a minute. */
export const dur = (sec) => {
  if (!(sec >= 60)) return '<1m';
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
/** Short time text for the window: the numbers stand out, the unit letters are small and dim.
 *  `hot` colours the numbers by unit too (the Levels panel); "<1m" counts as seconds. */
export const unitsHtml = (text, hot) => esc(text).replace(/(&lt;)?(\d+)([a-z]+)/g, (all, lt, n, u) => `${lt || ''}<span class="qs-num${hot ? ` hot u-${lt ? 's' : u}` : ''}">${n}</span><small class="qs-u">${u}</small>`);
const UNIT_CLASS = { year: 'y', month: 'mo', day: 'd', hour: 'h', minute: 'm' };
export const durH = (sec, hot) => unitsHtml(dur(sec), hot);
/** A stretch of time in words: "1 hour and 30 minutes", "1 year, 2 months, 5 days and 1 minute".
 *  Units that are zero are left out; a month is 30 days, a year 365. With `html`, the numbers are marked (`hot` colours them). */
export const durWords = (sec, html, hot) => {
  let m = Math.max(1, Math.round(sec / 60));
  const parts = [];
  for (const [name, size] of [['year', 525600], ['month', 43200], ['day', 1440], ['hour', 60], ['minute', 1]]) {
    const n = Math.floor(m / size);
    m -= n * size;
    if (n) parts.push(`${html ? `<span class="qs-num${hot ? ` hot u-${UNIT_CLASS[name]}` : ''}">${n}</span>` : n} ${name}${n === 1 ? '' : 's'}`);
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
};
export const minText = (m) => { const s = Math.round(m * 60), v = m < 10 ? m.toFixed(1) : String(Math.round(m)); return m < 1 ? `${s} second${s === 1 ? '' : 's'}` : `${v} minute${v === '1.0' || v === '1' ? '' : 's'}`; };
/** Minutes, short: 1s, 1.4m, 1.2h. */
export const shortTime = (m) => {
  const sec = m * 60;
  if (sec < 59.5) return `${Math.round(sec)}s`;
  if (m < 59.95) return `${m.toFixed(1)}m`;
  return `${(m / 60).toFixed(1)}h`;
};
export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : n >= 1000 ? `${(n / 1e3).toFixed(2)}k` : `${Math.round(n)}`);
export const SKILL_NAMES = { accuracy: 'Accuracy', speed: 'Speed', stamina: 'Stamina', jackspeed: 'Jack Speed', coordination: 'Coordination', release: 'Release', reading: 'Technical', consistency: 'Consistency', concentration: 'Concentration', speedjam: 'Speed Jam', memory: 'Memory' };
export const SKILL_SHORT = { accuracy: 'Acc', speed: 'Spd', stamina: 'Sta', jackspeed: 'Jck', coordination: 'Crd', release: 'Rel', reading: 'Tec', consistency: 'Con', concentration: 'Cnc', speedjam: 'SJ', memory: 'Mem' };
export const STAGE_COLOR = { cold: '#4f9cf5', warming: '#4f9cf5', peak: '#e8c147', pushing: '#f0883e', fatigued: '#c084fc' };
export const arrows = (trend) => (trend > 0 ? `<span style="color:#f0883e">${'›'.repeat(trend)}</span>` : trend < 0 ? `<span style="color:#4f9cf5">${'‹'.repeat(-trend)}</span>` : '<span class="qs-dim">·</span>');

/** A zone's colour on the bar: white below the sweet spot, yellow in it, orange past it, red past the XP cut. */
const zoneColor = (b) => (b < BAR_ZONES[0] ? '#e5e7eb' : b < BAR_ZONES[1] ? '#facc15' : b < XP_CUT ? '#fb923c' : '#f87171');

/** How much of the physical skills' XP the strain cut leaves at this many minutes of strain, and its colour:
 *  white while none is lost, then yellow, orange and red as more is. */
const xpKept = (minutes) => fatigueXp(fatigueLevel(minutes));
const keptColor = (k) => (k >= 0.995 ? '#fff' : k >= 0.7 ? '#facc15' : k >= 0.3 ? '#fb923c' : '#ef4444');

/** The warm-up bar, as the game draws it: zones and where it is now. Over it, where the forecast takes it:
 *  a faint band over the range it moves through, and an arrow from now to where it ends, coloured by the zones it crosses. */
export const barHtml = (bar, ahead) => {
  let future = '';
  // the XP cut's text, centred on its line; left out when the arrow comes close to it or past it (the red line says enough)
  let cutText = 'center', pastCut = false;
  if (ahead && ahead.samples.length > 1) {
    const later = ahead.samples.slice(1).map(s => s.bar);
    const lo = Math.min(...later), hi = Math.max(...later);
    const end = later[later.length - 1];
    const hours = `${ahead.hours} hour${ahead.hours === 1 ? '' : 's'}`;
    future += `<div class="qs-band" style="left:${(lo * 100).toFixed(2)}%; width:${Math.max(0.6, (hi - lo) * 100).toFixed(2)}%" title="Where it moves in the next ${hours}: ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}%"></div>`;
    const a = bar * 100, e = end * 100, dir = e >= a ? 1 : -1;
    const cut = XP_CUT * 100, reach = Math.max(a, e);
    if (Math.abs(e - a) >= 1) { cutText = reach >= cut - 12 ? 'none' : 'center'; pastCut = reach >= cut; }
    /** Whether an hour label at x would run into the XP cut's text. */
    const hitsCut = (x) => cutText === 'center' && Math.abs(x - cut) < 9;
    if (Math.abs(e - a) >= 1) {
      // the line's colour follows the zones it passes through
      const stops = [];
      for (let k = 0; k <= 20; k++) { const o = k / 20; stops.push(`<stop offset="${o}" stop-color="${zoneColor((a + (e - a) * o) / 100)}"/>`); }
      const id = `qs-arrow-${Math.random().toString(36).slice(2, 8)}`;
      // a small mark where the bar is after some of the hours (the end is the arrowhead), its hour written above it
      let marks = '';
      // which hours get a mark, most useful first: 2h, 1h, 3h, then every 6th, every 3rd, the rest. As many as the
      // arrow has room for (about one per 7% of the bar it spans, at least one), none crowding another
      const room = Math.max(1, Math.floor(Math.abs(e - a) / 7));
      const all = Array.from({ length: Math.max(0, Math.ceil(ahead.hours) - 1) }, (_, i) => i + 1);
      const rank = (h) => (h === 2 ? 0 : h === 1 ? 1 : h === 3 ? 2 : h % 6 === 0 ? 3 : h % 3 === 0 ? 4 : 5);
      const tried = [...all].sort((p, q) => rank(p) - rank(q) || p - q);
      const chosen = [];
      for (const h of tried) {
        if (chosen.length >= room) break;
        const s = ahead.samples.find(x => x.t >= h * 3600);
        if (!s) continue;
        const x = s.bar * 100, kept = xpKept(s.minutes);
        if (hitsCut(x) || chosen.some(c => Math.abs(c.x - x) < (c.kept < 0.995 && kept < 0.995 ? 7 : 4))) continue;
        chosen.push({ h, s, x, kept });
      }
      chosen.sort((p, q) => p.h - q.h);
      for (const { h, s } of chosen) {
        const x = s.bar * 100, kept = xpKept(s.minutes), color = keptColor(kept);
        const tip = `After ${h} hour${h === 1 ? '' : 's'}: ${Math.round(s.bar * 100)}%${kept < 0.995 ? ` · physical XP kept ×${kept.toFixed(2)}` : ''}`;
        future += `<div class="qs-hour-label" style="left:${x.toFixed(2)}%; color:${color};" title="${tip}">${h}<small class="qs-u">h</small></div>`;
        // past the cut, how much physical XP is lost there, under the arrow (a label with it needs more room: see above)
        if (kept < 0.995) future += `<div class="qs-loss-label" style="left:${x.toFixed(2)}%; color:${color};" title="${tip}">-${Math.round((1 - kept) * 100)}%</div>`;
        marks += `<line x1="${(s.bar * 100).toFixed(2)}" x2="${(s.bar * 100).toFixed(2)}" y1="2.2" y2="7.8" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity=".9"><title>${tip}</title></line>`;
      }
      future += `<svg class="qs-arrow" viewBox="0 0 100 10" preserveAspectRatio="none"><title>After ${hours}: ${Math.round(e)}%</title><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${a.toFixed(2)}" x2="${e.toFixed(2)}" y1="0" y2="0">${stops.join('')}</linearGradient></defs><line x1="${a.toFixed(2)}" x2="${(e - dir * 1.2).toFixed(2)}" y1="5" y2="5" stroke="url(#${id})" stroke-width="1.6" vector-effect="non-scaling-stroke"/><path d="M${e.toFixed(2)} 5 L${(e - dir * 1.4).toFixed(2)} 1.8 L${(e - dir * 1.4).toFixed(2)} 8.2 Z" fill="${zoneColor(end)}"/>${marks}</svg>`;
    }
    // a faded line straight down from where it ends, through the bar
    if (Math.abs(e - a) >= 1) future += `<div class="qs-endline" style="left:${e.toFixed(2)}%"></div>`;
    future += `<div class="qs-arrow-label" style="left:${e.toFixed(2)}%" title="After ${hours}: ${Math.round(e)}%">${Math.abs(e - a) < 1 ? 'steady' : 'in'} ${ahead.hours}<small class="qs-u">h</small></div>`;
  }
  return `
  <div class="qs-bar${pastCut ? ' lossy' : ''}">
    <div class="qs-track"></div>
    ${future}
    <div class="qs-tick" style="left:${BAR_ZONES[0] * 100}%"></div>
    <div class="qs-tick" style="left:${BAR_ZONES[1] * 100}%"></div>
    <div class="qs-cut" style="left:${XP_CUT * 100}%" title="300 min of strain: XP gains start being cut"></div>
    ${cutText === 'none' ? '' : `<div class="qs-cut-label" style="left:${XP_CUT * 100}%">300 min · XP cut</div>`}
    <div class="qs-needle" style="left:${(bar * 100).toFixed(2)}%"></div>
    ${ahead && ahead.samples.length > 1 ? '<div class="qs-at"></div>' : ''}
  </div>
  ${ahead && ahead.samples.length > 1 ? `<div class="qs-slide"><span class="qs-dim">now</span><input type="range" class="qs-slide-in" min="0" max="${Math.round(ahead.hours * 3600)}" step="${ahead.hours > 12 ? 3600 : 1800}"><span class="qs-dim">${ahead.hours}<small class="qs-u">h</small></span><span class="qs-slide-text"></span></div>` : ''}`;
};

/** Where the forecast is at `t` seconds from now: the bar and the minutes of strain, between the two samples around it. */
const aheadAt = (ahead, t) => {
  const s = ahead.samples;
  const i = s.findIndex(x => x.t >= t);
  if (i <= 0) return i === 0 ? s[0] : s[s.length - 1];
  const p = s[i - 1], q = s[i], f = (t - p.t) / Math.max(1, q.t - p.t);
  return { bar: p.bar + (q.bar - p.bar) * f, minutes: p.minutes + (q.minutes - p.minutes) * f };
};
/** The slider's time, kept while the same forecast is redrawn and set back to 2 hours for a new one. */
let slideSec = 0, slideFor = null;
/** Wires the time slider under a bar drawn by barHtml: dragging it moves a ghost needle to where the bar is then,
 *  and says so next to it. */
export const wireSlider = (box, ahead) => {
  const input = box.querySelector('.qs-slide-in'), ghost = box.querySelector('.qs-at'), text = box.querySelector('.qs-slide-text');
  if (!input || !ghost || !ahead) return;
  if (slideFor !== ahead) { slideFor = ahead; slideSec = Math.min(7200, ahead.hours * 3600); }
  input.value = String(slideSec);
  const update = () => {
    slideSec = Number(input.value);
    const at = aheadAt(ahead, slideSec), kept = xpKept(at.minutes);
    ghost.style.left = `${(at.bar * 100).toFixed(2)}%`;
    ghost.style.display = slideSec > 0 ? '' : 'none';
    text.innerHTML = slideSec > 0
      ? `After ${durH(slideSec)}: <b>${Math.round(at.bar * 100)}%</b> · ${STAGES[stageOf(at.bar)][0]}${kept < 0.995 ? ` · <span style="color:${keptColor(kept)}">-${Math.round((1 - kept) * 100)}% physical XP</span>` : ''}`
      : 'Now';
  };
  input.addEventListener('input', update);
  update();
};

/** The bar over the forecast: the zones as bands and the bar as a line. */
export const graphHtml = (samples, endSec) => {
  const W = 576, H = 120;
  const x = (t) => (t / endSec) * W;
  const y = (b) => H - b * H;
  const pts = samples.map(s => `${x(Math.min(s.t, endSec)).toFixed(1)},${y(s.bar).toFixed(1)}`).join(' ');
  const hoursMarks = [];
  const step = endSec > 8 * 3600 ? 2 : 1;
  for (let h = step; h * 3600 < endSec; h += step) hoursMarks.push(`<line x1="${x(h * 3600)}" x2="${x(h * 3600)}" y1="0" y2="${H}" stroke="#23232f"/><text x="${x(h * 3600) + 2}" y="${H - 3}" fill="#6b7280" font-size="9">${h}H</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block; background:#0b0b11; border-radius:4px;">
    <rect x="0" y="${y(BAR_ZONES[1])}" width="${W}" height="${y(BAR_ZONES[0]) - y(BAR_ZONES[1])}" fill="rgba(232,193,71,.16)"/>
    <rect x="0" y="0" width="${W}" height="${y(BAR_ZONES[2])}" fill="rgba(192,132,252,.10)"/>
    ${hoursMarks.join('')}
    <text x="3" y="${y(BAR_ZONES[1]) + 10}" fill="#e8c147" font-size="9" opacity=".8">sweet spot</text>
    <line x1="0" x2="${W}" y1="${y(XP_CUT)}" y2="${y(XP_CUT)}" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="3" y="${y(XP_CUT) - 3}" fill="#f87171" font-size="9">300 min: XP cut</text>
    <polyline points="${pts}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
};

/** Which notice this is: a new mode or text is a new notice, unread again. */
export const NOTICE_READ_KEY = 'queue-strain:notice-read';
export const noticeId = () => {
  let h = 0;
  for (const c of `${NOTICE.id ?? ''}|${NOTICE.mode}|${NOTICE.text}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return String(h);
};
export const noticeRead = () => {
  try { return localStorage.getItem(NOTICE_READ_KEY) === noticeId(); } catch (_) { return false; }
};

/** The warning sign in the title bar, as NOTICE at the top of the file sets it: gray once marked as read. */
export const noticeHtml = () => {
  const mode = ['none', 'info', 'urgent'].includes(NOTICE.mode) ? NOTICE.mode : 'none';
  const read = mode !== 'none' && noticeRead();
  const heading = { none: 'No known issues', info: 'Heads up', urgent: 'Known issue, being worked on' }[mode];
  return `<span class="qs-notice ${read ? 'none' : mode}">
    <button type="button" aria-label="${heading}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg></button>
    <span class="qs-notice-pop"><b>${heading}</b>${esc(NOTICE.text || '')}${mode === 'none' ? '' : read
      ? '<span class="qs-notice-foot">Marked as read.</span>'
      : '<span class="qs-notice-foot"><button type="button" class="qs-notice-read">Mark as read</button></span>'}</span>
  </span>`;
};

/** The changelog button, as CHANGELOG at the top of the file sets it: glowing green until marked as read, then gray. */
export const LOG_READ_KEY = 'queue-strain:changelog-read';
export const logId = () => `${CHANGELOG.id ?? ''}|${CHANGELOG.text}`;
export const logRead = () => {
  try { return localStorage.getItem(LOG_READ_KEY) === logId(); } catch (_) { return false; }
};
export const changelogHtml = () => {
  const read = logRead();
  return `<span class="qs-notice qs-log ${read ? 'none' : 'new'}">
    <button type="button" aria-label="Changelog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/></svg></button>
    <span class="qs-notice-pop"><b>What's new</b>${esc(CHANGELOG.text || '')}${read
      ? '<span class="qs-notice-foot">Marked as read.</span>'
      : '<span class="qs-notice-foot"><button type="button" class="qs-notice-read" data-kind="log">Mark as read</button></span>'}</span>
  </span>`;
};

/** Match: what the real plays earned against the add-on's estimate for those same plays (with the bonuses). */
export const MATCH_HELP = TEXT.matchHelp;
export const matchColor = (m) => (Math.abs(m - 1) <= 0.1 ? '#4ade80' : Math.abs(m - 1) <= 0.25 ? '#facc15' : '#fb923c');
export const matchText = (m) => `${Math.round(m * 100)}%`;

export const TABS = Object.entries(TEXT.tabs);
