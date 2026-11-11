// Formatting and the small pieces of the window: bars, graphs, the notice and changelog buttons.

import { CHANGELOG, NOTICE, TEXT } from '../config.js';
import { BAR_ZONES, XP_CUT } from '../rules/fatigue.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** A play's start, as a table column: 1:05. */
export const clock = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
/** A stretch of time: 8H 05M, 44M under an hour, <1M under a minute. */
export const dur = (sec) => {
  if (!(sec >= 60)) return '<1M';
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
  return h ? `${h}H ${String(m).padStart(2, '0')}M` : `${m}M`;
};
export const minText = (m) => (m < 1 ? `${Math.round(m * 60)} s` : `${m < 10 ? m.toFixed(1) : Math.round(m)} min`);
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

/** Where the bar is at each hour of the forecast, and which of those get a label: every other one and the
 *  last, none closer than 4% to the one before it. */
export const hourMarks = (samples, hours) => {
  const step = hours > 12 ? 2 : 1;
  const marks = [];
  for (let h = step; h <= hours + 1e-9; h += step) {
    const s = samples.find(x => x.t >= h * 3600) || samples[samples.length - 1];
    marks.push({ h, bar: s.bar, label: false });
  }
  const want = marks.filter((m, i) => i % 2 === 0 || i === marks.length - 1);
  const placed = [];
  for (const m of [...want].reverse()) {
    if (placed.every(p => Math.abs(p.bar - m.bar) > 0.04)) { m.label = true; placed.push(m); }
  }
  return marks;
};

/** The warm-up bar, as the game draws it: zones, where it is, and where the forecast takes it (a faint band
 *  over the range it moves through and a ring where it is at each hour). */
export const barHtml = (bar, ahead) => {
  let future = '';
  if (ahead && ahead.samples.length > 1) {
    const later = ahead.samples.slice(1).map(s => s.bar);
    const lo = Math.min(...later), hi = Math.max(...later);
    future += `<div class="qs-band" style="left:${(lo * 100).toFixed(2)}%; width:${Math.max(0.6, (hi - lo) * 100).toFixed(2)}%" title="The range the forecast moves through"></div>`;
    for (const m of hourMarks(ahead.samples, ahead.hours)) {
      future += `<div class="qs-hour" style="left:${(m.bar * 100).toFixed(2)}%" title="After ${dur(m.h * 3600)}: ${(m.bar * 100).toFixed(0)}%"></div>`;
      if (m.label) future += `<div class="qs-hour-label" style="left:${(m.bar * 100).toFixed(2)}%">${m.h}H</div>`;
    }
  }
  return `
  <div class="qs-bar">
    <div class="qs-track"></div>
    <div class="qs-tick" style="left:${BAR_ZONES[0] * 100}%"></div>
    <div class="qs-tick" style="left:${BAR_ZONES[1] * 100}%"></div>
    <div class="qs-cut" style="left:${XP_CUT * 100}%" title="300 min of strain: XP gains start being cut"></div>
    <div class="qs-cut-label" style="left:${XP_CUT * 100}%">300 min · XP cut</div>
    ${future}
    <div class="qs-needle" style="left:${(bar * 100).toFixed(2)}%"></div>
  </div>`;
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
