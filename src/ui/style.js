// The window's styles.

import { SETTINGS } from '../config.js';

// =====================================================================
// 5. THE WINDOW
// =====================================================================
export const CSS = `
#qs-window { --qs-now:${SETTINGS.colors.now}; --qs-prestige:${SETTINGS.colors.prestige}; --qs-shift:${SETTINGS.colors.prestigeShift}; --qs-complete:${SETTINGS.colors.levelComplete}; }
#qs-window { position:fixed; top:40px; right:24px; width:1240px; max-width:calc(100vw - 32px); max-height:calc(100vh - 70px); display:none; flex-direction:column;
  background:#0f0f16; border:1px solid #2b2b3a; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,.6); color:#e5e7eb;
  font:12px/1.4 system-ui, sans-serif; z-index:10010; }
#qs-window * { box-sizing:border-box; }
/* until the first scan: the controls alone, in a window no wider than they need */
/* the Levels tab */
#qs-window table.qs-lv td { vertical-align:top; padding-top:5px; padding-bottom:4px; }
#qs-window .qs-lv-row { cursor:pointer; }
#qs-window .qs-lv-row:hover td { background:#17171f; }
#qs-window .qs-lv-row.open td, #qs-window .qs-lv-detail td { background:#171722; }
#qs-window .qs-lv-row.open td { border-bottom:none; }
#qs-window .qs-lv-skill { width:130px; font-weight:600; font-size:12px; }
#qs-window .qs-lv-skill .qs-sub { padding-left:12px; font-variant-numeric:tabular-nums; }
#qs-window .qs-lv-caret { display:inline-block; width:12px; color:#6b7280; font-weight:400; }
#qs-window .qs-lv-xph { width:110px; }
#qs-window .qs-lv-barcell { width:100%; padding-left:16px !important; padding-right:8px !important; }
#qs-window .qs-lv-pres { width:100px; }
#qs-window .qs-lv-xph b { font-size:12px; }
#qs-window .qs-sub { display:block; font-size:10.5px; color:#9ca3af; font-weight:400; }
#qs-window .qs-faint { color:#6b7280; }
#qs-window .qs-ready { color:#4ade80; font-weight:600; }
#qs-window small.qs-u { font-size:.8em; color:#9ca3af; font-weight:400; margin-left:1px; }
/* Levels: digits coloured by unit (under a minute, minutes, hours, days, months and years) */
#qs-window .qs-num.hot { font-weight:600; }
#qs-window .qs-num.u-s { color:#4ade80; }
#qs-window .qs-num.u-m { color:#facc15; }
#qs-window .qs-num.u-h { color:#fb923c; }
#qs-window .qs-num.u-d { color:#f87171; }
#qs-window .qs-num.u-mo, #qs-window .qs-num.u-y { color:#c084fc; }
/* the levels bar: a piece per pair of marks, the end mark (and when you reach it) under each */
#qs-window .qs-lv-bar { position:relative; display:flex; gap:3px; padding-top:3px; min-width:0; }
#qs-window .qs-lv-cell { flex:1; min-width:0; display:flex; flex-direction:column; }
#qs-window .qs-lv-seg { position:relative; height:9px; background:#1d1d28; border-radius:2px; overflow:hidden; }
#qs-window .qs-lv-cell:first-of-type .qs-lv-seg { border-top-left-radius:5px; border-bottom-left-radius:5px; }
#qs-window .qs-lv-cell:last-child .qs-lv-seg { border-top-right-radius:5px; border-bottom-right-radius:5px; }
#qs-window .qs-lv-seg > i { position:absolute; top:0; bottom:0; left:0; background:var(--qs-now); }
#qs-window .qs-lv-seg > i.gain { opacity:.45; }
#qs-window .qs-lv-tk { align-self:flex-end; font-size:10px; color:#6b7280; white-space:nowrap; margin-top:2px; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
#qs-window .qs-lv-tk.time { color:#c7d2fe; }
#qs-window .qs-lv-tk.goal { color:var(--qs-prestige); }
#qs-window .qs-lv-tk.first { position:absolute; left:0; top:14px; margin-top:0; }
/* a mark between two pieces starts under the next piece, the level it begins (the gap is 3px) */
#qs-window .qs-lv-tk.mid { transform:translateX(calc(100% + 3px)); }
/* reaching prestige within the look-ahead: the last piece's progress shifts to a dark version of the game's pink */
#qs-window .qs-lv-seg.shift > i.gain, #qs-window .qs-sw-shift { animation:qs-shift 2.4s ease-in-out infinite; }
@keyframes qs-shift { 0%, 100% { background:var(--qs-now); opacity:.45; } 50% { background:var(--qs-shift); opacity:.95; } }
#qs-window .qs-sw-shift { background:var(--qs-shift); }
/* a piece completed within the look-ahead: the same shift, to white */
#qs-window .qs-lv-seg.complete > i.gain, #qs-window .qs-sw-complete { animation:qs-complete 2.4s ease-in-out infinite; }
@keyframes qs-complete { 0%, 100% { background:var(--qs-now); opacity:.45; } 50% { background:var(--qs-complete); opacity:.75; } }
/* the Levels shifts run on one clock (--qs-phase), so redrawing the tab, like opening a skill, doesn't restart them */
#qs-window .qs-lv-seg.shift > i.gain, #qs-window .qs-lv-seg.complete > i.gain, #qs-window .qs-sw-shift, #qs-window .qs-sw-complete { animation-delay:var(--qs-phase, 0ms); }
#qs-window .qs-sw-complete { background:var(--qs-complete); }
/* animations off (the Animations option, or the system's reduce motion): everything holds still */
#qs-window.qs-noanim *, #qs-window.qs-noanim *::before, #qs-window.qs-noanim *::after { animation:none !important; transition:none !important; }
#qs-window.qs-noanim .qs-lv-seg.shift > i.gain { background:var(--qs-shift); opacity:.9; }
/* without animations, a completed piece keeps the plain progress colour (only the prestige piece stays pink) */
#qs-window.qs-noanim .qs-lg-complete { display:none; }
#qs-window .qs-lv-ov { padding:4px 8px 16px; margin-bottom:8px; border-bottom:1px solid #2b2b3a; }
#qs-window .qs-lv-ovline { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; font-size:12px; margin-bottom:2px; font-variant-numeric:tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  #qs-window *, #qs-window *::before, #qs-window *::after { animation:none !important; transition:none !important; }
  #qs-window .qs-lv-seg.shift > i.gain { background:var(--qs-shift); opacity:.9; }
  #qs-window .qs-lv-seg.complete > i.gain { background:var(--qs-complete); opacity:.7; }
}
#qs-window .qs-lv-detail td { padding:2px 8px 12px; }
#qs-window .qs-lv-dgrid { display:grid; grid-template-columns:minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); gap:18px; padding-left:20px; }
#qs-window .qs-lv-dgrid > div { min-width:0; }
#qs-window .qs-lv-dh { font-size:11px; color:#9ca3af; font-weight:600; margin-bottom:4px; }
#qs-window .qs-lv-kv { display:grid; grid-template-columns:auto auto; gap:2px 12px; justify-content:start; font-variant-numeric:tabular-nums; }
#qs-window .qs-lv-maps { display:flex; gap:2px; height:10px; max-width:340px; }
#qs-window .qs-lv-maps > i { border-radius:3px; min-width:3px; }
#qs-window .qs-lv-legend { display:flex; flex-direction:column; gap:2px; margin-top:5px; color:#9ca3af; font-size:11px; max-width:420px; }
#qs-window .qs-lv-legend > span { display:flex; align-items:center; min-width:0; white-space:nowrap; }
#qs-window .qs-lv-legend .qs-lv-name { overflow:hidden; text-overflow:ellipsis; min-width:0; }
#qs-window .qs-lv-legend .qs-lv-share { flex:none; margin-left:6px; color:#e5e7eb; font-variant-numeric:tabular-nums; }
#qs-window .qs-lv-legend i { flex:none; display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; }
#qs-window .qs-lv-legend .qs-tip .qs-lv-name { cursor:help; border-bottom:1px dotted #6b7280; }
#qs-window .qs-legend { display:flex; gap:14px; color:#9ca3af; font-size:11px; }
#qs-window .qs-sw { display:inline-block; width:14px; height:8px; border-radius:4px; margin-right:4px; vertical-align:-1px; }
#qs-window.qs-fresh { width:560px; }
#qs-window.qs-fresh .qs-top { grid-template-columns:minmax(0, 1fr); }
#qs-window.qs-fresh #qs-now { display:none; }
/* a new scan running: the last Strain Status stays in its place, grayed out, until the new one is ready */
#qs-window #qs-now.qs-busy { position:relative; pointer-events:none; user-select:none; }
#qs-window #qs-now.qs-busy > * { opacity:.25; filter:grayscale(1); }
#qs-window #qs-now.qs-busy::after { content:attr(data-busy); position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; color:#c7d2fe; letter-spacing:.3px; }
#qs-window .qs-start { font-weight:700; color:#c7d2fe; font-size:13px; margin-bottom:6px; }
/* The game hides the system cursor and draws its own at z-index 100000 (--z-cursor): this window stays
   below that layer, so the game's cursor shows over it. */
#qs-window .qs-head { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #23232f; cursor:move; user-select:none; }
#qs-window .qs-title { font-weight:700; font-size:13px; color:#c7d2fe; }
#qs-window .qs-ver { font-size:10px; color:#6b7280; margin-left:-4px; }
#qs-window .qs-key { font-size:9px; background:#2a2544; color:#a5b4fc; padding:1px 5px; border-radius:3px; border:1px solid #3d3560; }
#qs-window .qs-notice { position:relative; display:inline-flex; }
#qs-window .qs-notice button { display:inline-flex; align-items:center; justify-content:center; width:22px; height:20px; padding:0; border-radius:4px; cursor:pointer;
  background:transparent; border:1px solid #3f3f5a; color:#6b7280; }
#qs-window .qs-notice svg { width:13px; height:13px; }
#qs-window .qs-notice.info button { color:#f59e0b; border-color:#b45309; background:rgba(245,158,11,.12); }
#qs-window .qs-notice.new > button { color:#4ade80; border-color:#16a34a; background:rgba(74,222,128,.12); animation:qs-glow 1.8s ease-in-out infinite; }
#qs-window .qs-notice.new .qs-notice-pop b { color:#4ade80; }
/* the hotfixes button glows orange instead */
#qs-window .qs-notice.qs-hotfix.new > button { color:#fb923c; border-color:#c2410c; background:rgba(251,146,60,.12); animation:qs-glow-orange 1.8s ease-in-out infinite; }
#qs-window .qs-notice.qs-hotfix.new .qs-notice-pop b { color:#fb923c; }
@keyframes qs-glow-orange {
  0%, 100% { box-shadow:0 0 0 0 rgba(251,146,60,0); background:rgba(251,146,60,.10); }
  50% { box-shadow:0 0 10px 2px rgba(251,146,60,.5); background:rgba(251,146,60,.28); }
}
@keyframes qs-glow {
  0%, 100% { box-shadow:0 0 0 0 rgba(74,222,128,0); background:rgba(74,222,128,.10); }
  50% { box-shadow:0 0 10px 2px rgba(74,222,128,.5); background:rgba(74,222,128,.28); }
}
#qs-window .qs-notice.urgent button { color:#f87171; border-color:#dc2626; background:rgba(239,68,68,.15); animation:qs-breathe 1.8s ease-in-out infinite; }
@keyframes qs-breathe {
  0%, 100% { box-shadow:0 0 0 0 rgba(239,68,68,.0); background:rgba(239,68,68,.12); }
  50% { box-shadow:0 0 10px 2px rgba(239,68,68,.55); background:rgba(239,68,68,.35); }
}
#qs-window .qs-notice-pop::before { content:''; position:absolute; left:0; right:0; top:-8px; height:8px; }
#qs-window .qs-notice-foot { display:block; margin-top:8px; padding-top:6px; border-top:1px solid #2b2b3a; color:#9ca3af; white-space:normal; }
#qs-window .qs-notice-pop button.qs-notice-read { width:auto; height:auto; padding:2px 10px; font-size:11px; font-weight:600; color:#fff; background:#2b2b3a; border:1px solid #3f3f5a; border-radius:3px; animation:none; box-shadow:none; }
#qs-window .qs-notice-pop button.qs-notice-read:hover { background:#3f3f5a; }
#qs-window .qs-notice-pop { display:none; position:absolute; top:26px; left:0; width:320px; z-index:5; padding:8px 10px; border-radius:6px;
  background:#1a1a24; border:1px solid #3f3f5a; box-shadow:0 8px 24px rgba(0,0,0,.5); font-size:11px; line-height:1.45; white-space:pre-line; cursor:default; }
#qs-window .qs-notice:hover .qs-notice-pop, #qs-window .qs-notice:focus-within .qs-notice-pop { display:block; }
#qs-window .qs-notice-pop b { display:block; margin-bottom:3px; font-size:12px; }
#qs-window .qs-notice.none .qs-notice-pop b { color:#d1d5db; }
#qs-window .qs-notice.info .qs-notice-pop b { color:#fbbf24; }
#qs-window .qs-notice.urgent .qs-notice-pop b { color:#f87171; }
/* the console: its own panel over the game, as big as its tables, never past the game window (--qs-max-w/h) */
#qs-window .qs-console-pane { position:fixed; left:50%; top:50%; transform:translate(-50%, -50%); z-index:20; display:flex; flex-direction:column;
  width:max-content; min-width:520px; max-width:var(--qs-max-w, calc(100vw - 32px)); max-height:var(--qs-max-h, calc(100vh - 32px));
  background:#08080c; border:1px solid #3f3f5a; border-radius:8px; box-shadow:0 16px 60px rgba(0,0,0,.75); }
#qs-window .qs-console-pane td.qs-map { max-width:none; }
#qs-window .qs-con-head { display:flex; align-items:center; gap:6px; padding:8px 12px; border-bottom:1px solid #23232f; }
#qs-window .qs-con-title { font-weight:700; color:#c7d2fe; margin-right:8px; font-family:ui-monospace, Consolas, monospace; }
#qs-window .qs-con-view { background:none; border:1px solid #2b2b3a; color:#9ca3af; border-radius:4px; padding:2px 10px; font-size:11px; font-weight:600; cursor:pointer; }
#qs-window .qs-con-view.on { background:#1f1f2c; color:#fff; border-color:#4f46e5; }
#qs-window .qs-con-x { background:none; border:none; color:#9ca3af; font-size:15px; cursor:pointer; margin-left:4px; }
#qs-window .qs-con-body { flex:1; overflow:auto; padding:8px 12px 12px; font-family:ui-monospace, Consolas, monospace; font-size:11px; }
#qs-window .qs-con-body table { font-family:inherit; }
#qs-window .qs-con-body th { background:#08080c; }
#qs-window .qs-con-line { color:#9ca3af; margin:2px 0 6px; }
#qs-window .qs-con-line.warn { color:#fbbf24; }
#qs-window .qs-con-i { color:#4b5563; width:28px; }
#qs-window .qs-con-empty { color:#6b7280; padding:6px 0; }
#qs-window .qs-con-new td { background:rgba(74,222,128,.07); }
#qs-window .qs-con-badge { font-size:8.5px; font-weight:800; color:#052e16; background:#4ade80; padding:0 4px; border-radius:3px; letter-spacing:.03em; }
#qs-window .qs-con-live { display:inline-flex; align-items:center; gap:6px; background:none; border:1px solid #3f3f5a; color:#9ca3af; border-radius:4px; padding:2px 10px; font-size:11px; font-weight:600; cursor:pointer; }
#qs-window .qs-con-live.on { color:#4ade80; border-color:#166534; }
#qs-window .qs-con-live i { width:7px; height:7px; border-radius:50%; background:#4ade80; animation:qs-live 1.6s ease-in-out infinite; }
@keyframes qs-live { 0%, 100% { opacity:1; } 50% { opacity:.25; } }
#qs-window .qs-x { margin-left:auto; background:none; border:none; color:#9ca3af; font-size:16px; cursor:pointer; }
#qs-window .qs-body { overflow-y:auto; padding:10px 12px 12px; display:flex; flex-direction:column; gap:10px; }
#qs-window .qs-top, #qs-window .qs-cols { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.25fr); gap:10px; align-items:start; }
#qs-window .qs-con-pre { margin:8px 0 0; white-space:pre-wrap; word-break:break-word; font:11px/1.5 ui-monospace, Consolas, monospace; color:#d1d5db; }
#qs-window .qs-diag { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:4px 14px; font-size:11px; }
#qs-window .qs-diag > span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#9ca3af; }
#qs-window .qs-diag b { color:#e5e7eb; font-weight:600; margin-right:4px; }
#qs-window .qs-diag i { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:0; }
#qs-window .qs-cols3 { display:grid; grid-template-columns:minmax(0, 0.85fr) minmax(0, 1.2fr) minmax(0, 1.15fr); gap:10px; align-items:start; }
#qs-window .qs-cols3 th, #qs-window .qs-cols3 td { padding:3px 4px; }
#qs-window .qs-cols3 td.qs-map { max-width:170px; }
@media (max-width: 1000px) { #qs-window .qs-top, #qs-window .qs-cols, #qs-window .qs-cols3 { grid-template-columns:minmax(0, 1fr); } }
#qs-window .qs-tabs { display:flex; gap:4px; border-bottom:1px solid #2b2b3a; margin-bottom:10px; }
#qs-window .qs-tabs button { background:none; border:1px solid transparent; border-bottom:none; color:#9ca3af; font-weight:700; font-size:12px; padding:5px 14px; border-radius:5px 5px 0 0; cursor:pointer; }
#qs-window .qs-tabs button:hover { color:#e5e7eb; }
#qs-window .qs-tabs button.on { background:#1f1f2c; color:#fff; border-color:#2b2b3a; }
#qs-window .qs-card { background:#14141c; border:1px solid #23232f; border-radius:6px; padding:9px 11px; min-width:0; }
#qs-window .qs-h { font-weight:700; color:#fff; margin-bottom:2px; }
#qs-window .qs-dim { color:#9ca3af; font-size:11px; }
#qs-window .qs-bar { position:relative; height:24px; margin:22px 2px 26px; }
#qs-window .qs-bar-labels { display:flex; justify-content:flex-end; align-items:baseline; gap:8px; font-weight:700; font-size:14px; margin-top:6px; }
#qs-window .qs-bar-labels .qs-trend { font-size:13px; letter-spacing:-2px; }
#qs-window .qs-track { position:absolute; left:0; right:0; top:10px; height:6px; border-radius:3px;
  background:linear-gradient(90deg, #4f9cf5 0%, #6fb8c9 22%, #d9c64b 40%, #e8c147 60%, #f0883e 80%, #b48cff 100%); }
#qs-window .qs-tick { position:absolute; top:5px; width:2px; height:16px; background:#e5e7eb; border-radius:1px; }
#qs-window .qs-cut { position:absolute; top:3px; width:3px; height:20px; margin-left:-1.5px; background:#ef4444; border-radius:1px; box-shadow:0 0 4px rgba(239,68,68,.7); }
#qs-window .qs-cut-label { position:absolute; top:-12px; transform:translateX(-50%); font-size:9px; font-weight:700; color:#f87171; white-space:nowrap; }
/* where the forecast goes: a faint band over its range, and an arrow above the bar from now to where it ends */
#qs-window .qs-band { position:absolute; top:7px; height:12px; border-radius:6px; background:rgba(255,255,255,.12); }
#qs-window .qs-arrow { position:absolute; left:0; top:-11px; width:100%; height:10px; overflow:visible; filter:drop-shadow(0 0 1px rgba(0,0,0,.9)); }
#qs-window .qs-endline { position:absolute; top:-6px; height:32px; width:0; margin-left:-0.5px; border-left:1px dashed rgba(255,255,255,.45); pointer-events:none; }
/* when the arrow reaches the XP cut it moves up, to make room under it for the XP lost at each hour */
#qs-window .qs-bar.lossy { margin-top:42px; }
#qs-window .qs-bar.lossy .qs-arrow { top:-23px; }
#qs-window .qs-bar.lossy .qs-hour-label { top:-35px; }
#qs-window .qs-bar.lossy .qs-endline { top:-18px; height:44px; }
#qs-window .qs-loss-label { position:absolute; top:-12px; transform:translateX(-50%); font-size:9px; font-weight:600; white-space:nowrap; }
/* the time slider under the strain bar, and the ghost needle it moves */
#qs-window .qs-slide { display:flex; align-items:center; gap:8px; margin:0 2px 8px; font-size:11px; }
#qs-window .qs-slide-in { flex:0 1 220px; min-width:80px; accent-color:#9ca3af; height:14px; margin:0; }
#qs-window .qs-slide-text { margin-left:6px; white-space:nowrap; font-variant-numeric:tabular-nums; }
#qs-window .qs-at { position:absolute; top:4px; width:3px; height:18px; margin-left:-1.5px; background:rgba(255,255,255,.55); border-radius:2px; box-shadow:0 0 3px #000; z-index:1; pointer-events:none; }
#qs-window .qs-hour-label { position:absolute; top:-23px; transform:translateX(-50%); font-size:9px; color:rgba(229,231,235,.8); white-space:nowrap; }
#qs-window .qs-arrow-label { position:absolute; top:30px; transform:translateX(-50%); font-size:10px; color:rgba(229,231,235,.8); white-space:nowrap; }
#qs-window .qs-needle { position:absolute; top:2px; width:4px; height:22px; margin-left:-2px; background:#fff; border-radius:2px; box-shadow:0 0 4px #000; z-index:1; }
#qs-window .qs-needle::after { content:''; position:absolute; left:-4px; top:22px; border:6px solid transparent; border-bottom:8px solid #fff; border-top:none; }
#qs-window .qs-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
/* the Window group in the options: folds open and shut; the fade eases in and out */
#qs-window .qs-group { margin-top:6px; }
#qs-window .qs-group > summary { cursor:pointer; color:#9ca3af; font-size:11px; user-select:none; }
#qs-window .qs-group > summary:hover { color:#e5e7eb; }
#qs-window .qs-group > .qs-row { margin-top:4px; }
#qs-window .qs-group select { background:#0f0f15; color:#e5e7eb; border:1px solid #2b2b3a; border-radius:4px; font-size:11px; padding:1px 4px; }
#qs-window { transition:opacity .2s ease; }
#qs-window.qs-noanim { transition:none; }
#qs-window select { background:#1a1a24; border:1px solid #3f3f5a; border-radius:3px; color:#fff; font-size:11px; padding:1px 2px; outline:none; }
#qs-window .qs-pager { margin-left:6px; display:flex; align-items:center; gap:6px; font-size:11px; color:#e5e7eb; font-weight:600; }
#qs-window .qs-pager button { width:22px; height:20px; padding:0; background:#2b2b3a; color:#fff; border:1px solid #3f3f5a; border-radius:3px; font-size:14px; line-height:16px; cursor:pointer; }
#qs-window .qs-pager button:disabled { opacity:.35; cursor:default; }
#qs-window .qs-xpgrid { display:grid; grid-template-columns:repeat(8, auto); gap:3px 14px; font-size:11px; margin-top:8px; justify-content:start; }
#qs-window input[type=number] { width:56px; background:#1a1a24; border:1px solid #3f3f5a; border-radius:3px; color:#fff; font-size:11px; padding:2px 4px; outline:none; }
#qs-window button.qs-btn { background:#4f46e5; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-weight:700; font-size:11px; cursor:pointer; }
#qs-window button.qs-btn:disabled { opacity:.6; cursor:default; }
#qs-window button.qs-btn.qs-stop { background:#b91c1c; }
#qs-window button.qs-plain { background:#2b2b3a; color:#fff; border:1px solid #3f3f5a; border-radius:3px; padding:2px 10px; font-size:11px; cursor:pointer; }
#qs-window .qs-err { color:#fca5a5; background:rgba(239,68,68,.12); border:1px solid #7f1d1d; border-radius:4px; padding:6px 8px; font-size:11px; }
#qs-window .qs-facts { display:grid; grid-template-columns:auto 1fr; gap:3px 12px; font-size:11px; }
#qs-window .qs-facts b { color:#fff; font-weight:600; }
#qs-window table { width:100%; border-collapse:collapse; font-size:11px; }
#qs-window th { text-align:left; color:#9ca3af; font-weight:600; padding:3px 5px; border-bottom:1px solid #2b2b3a; position:sticky; top:0; background:#14141c; z-index:2; white-space:nowrap; }
#qs-window td { padding:3px 5px; border-bottom:1px solid #1c1c28; white-space:nowrap; }
#qs-window th.n, #qs-window td.n { text-align:right; font-variant-numeric:tabular-nums; }
#qs-window td.z { color:#3f3f50; }
#qs-window td.qs-map { max-width:260px; overflow:hidden; text-overflow:ellipsis; }
#qs-window .qs-mini { display:inline-block; width:60px; height:5px; border-radius:3px; position:relative; vertical-align:middle;
  background:linear-gradient(90deg, #4f9cf5, #d9c64b 40%, #e8c147 60%, #f0883e 80%, #b48cff); }
#qs-window .qs-mini i { position:absolute; top:-3px; width:2px; height:11px; background:#fff; margin-left:-1px; }
#qs-window .qs-mini b { position:absolute; top:-2px; width:2px; height:9px; margin-left:-1px; background:#ef4444; }
#qs-window .qs-tablewrap { max-height:420px; overflow:auto; }
#qs-window .qs-pill { font-size:9px; padding:0 5px; border-radius:3px; font-weight:700; }
#qs-window .qs-pill.new { background:rgba(99,102,241,.25); color:#c7d2fe; }
#qs-window .qs-pill.hit { background:rgba(74,222,128,.15); color:#86efac; }
#qs-window .qs-up { color:#4ade80; font-size:10px; }
`;
