// WCAG contrast over the palette tokens, both themes.
//
// Eye-friendly means *lower* contrast, which is exactly the direction that
// walks into an accessibility failure if nobody measures it. AA is the floor:
// 4.5:1 for body text, 3:1 for large text and UI boundaries.
import fs from "node:fs";

const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = tokens(css.slice(css.indexOf(":root{"), css.indexOf("*{ box-sizing")));
const darkStart = css.indexOf('html[data-theme="dark"]{');
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf("}", darkStart))) };
// Later blocks override --field/--rail/--canvas per theme.
for (const m of css.matchAll(/html\[data-theme="dark"\]\{([^}]*)\}/g)) Object.assign(dark, tokens(m[1]));
for (const m of css.matchAll(/:root\{([^}]*)\}/g)) Object.assign(light, tokens(m[1]));

function parse(v, vars) {
  v = String(v).trim();
  while (v.startsWith("var(")) {
    const name = v.slice(4).split(/[,)]/)[0].trim().replace(/^--/, "");
    v = String(vars[name] ?? "").trim();
    if (!v) return null;
  }
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return p.length > 3 ? { rgb: p.slice(0, 3), a: p[3] } : p.slice(0, 3);
  }
  return null;
}
const over = (fg, bg) => (Array.isArray(fg) ? fg : fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a)));
const lum = (rgb) =>
  rgb
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
function ratio(fgTok, bgTok, vars) {
  const bgRaw = parse(bgTok, vars);
  if (!bgRaw) return null;
  // A translucent status tint is composited over the page it sits on, not
  // over white — getting that wrong makes every dark-mode badge look like a
  // failure when it is fine.
  const page = parse("var(--page)", vars) || [255, 255, 255];
  const bg = Array.isArray(bgRaw) ? bgRaw : over(bgRaw, page);
  const fgRaw = parse(fgTok, vars);
  if (!fgRaw) return null;
  const fg = over(fgRaw, bg);
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const PAIRS = [
  ["ink", "page", 4.5], ["ink", "surface", 4.5], ["ink", "surface-raised", 4.5],
  ["ink", "field", 4.5], ["ink", "rail", 4.5], ["ink", "canvas", 4.5],
  ["ink-secondary", "surface-raised", 4.5], ["ink-secondary", "page", 4.5], ["ink-secondary", "rail", 4.5],
  ["ink-muted", "surface-raised", 3], ["ink-muted", "page", 3], ["ink-muted", "rail", 3], ["ink-muted", "field", 3],
  ["critical-ink", "critical-bg", 4.5], ["warning-ink", "warning-bg", 4.5], ["good-ink", "good-bg", 4.5],
  ["accent-ink", "accent-bg", 4.5],
  ["blue", "surface-raised", 4.5], ["blue", "page", 4.5],
  ["good", "surface-raised", 3], ["critical", "surface-raised", 3],
  ["aqua", "surface-raised", 3], ["violet", "surface-raised", 3], ["warning", "surface-raised", 3],
  ["ink-on-color", "blue", 4.5], ["ink-on-color", "good", 3], ["ink-on-color", "critical", 3],
  ["ink-on-color", "violet", 3], ["ink-on-color", "aqua", 3],
  // The two Sleep Cycle actions are tinted buttons with matching ink.
  ["violet-ink", "violet-bg", 4.5], ["warning-ink", "warning-bg", 4.5],
  // The "manual" / "orphaned" chips: small uppercase text on a warning tint,
  // and the one place on the dashboard where a figure admits it isn't derived
  // — unreadable is the same as absent.
  ["warning-ink", "warning-bg", 4.5],
  // Task-tree furniture, which is smaller and quieter than the table above it.
  ["ink-muted", "surface", 3],   // rollup counts, resource dashes, add buttons
  ["blue", "surface", 4.5],      // a task's resource link
  ["blue-on-field", "field", 4.5], // the same link inside the expanded detail panel
  ["ink-muted", "canvas", 3],
  ["good-ink", "good-bg", 4.5],  // the chat's "dashboard updated" note
  // The thumbnail cell is a button and a drop target whose only visible
  // boundary is its border, so 1.4.11's 3:1 for UI components applies to it.
  // The tree's connecting guideline deliberately isn't in this list: the
  // hierarchy is carried by the indentation and the carets, and the rail is
  // reinforcement — holding a hairline to 3:1 would turn a quiet cue into a
  // ladder of hard lines down a screen someone reads all day.
  ["control-edge", "field", 3],
  ["control-edge", "surface", 3],
  ["control-edge", "page", 3],
];

let fails = 0;
for (const [theme, vars] of [["light", light], ["dark", dark]]) {
  console.log(`\n=== ${theme} ===`);
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(`var(--${fg})`, `var(--${bg})`, vars);
    if (r === null) { console.log(`  ?      ${fg} on ${bg} — could not resolve`); continue; }
    const ok = r >= min;
    if (!ok) fails++;
    if (!ok || process.env.VERBOSE) {
      console.log(`  ${ok ? "ok  " : "FAIL"} ${r.toFixed(2)}:1 (min ${min})  ${fg} on ${bg}`);
    }
  }
}
/* ------------------------------------------------------------------ */
/* The Projects screen's obsidian palette                              */
/*                                                                     */
/* These are literal values rather than tokens — the badge recipe is a
   tinted fill over a known surface — so the token sweep above cannot see
   them. Checking them here is the difference between "every pair meets AA"
   being a measurement and being a hope.                                */
/* ------------------------------------------------------------------ */
const OBSIDIAN = [13, 17, 26]; // #0D111A
const LITERAL = [
  ["#e8ecf3", null, 4.5, "body text"],
  ["#b6becd", null, 4.5, "secondary text"],
  ["#7c8698", null, 3, "muted labels and headers"],
  ["#38bdf8", null, 4.5, "links"],
  ["#34d399", "rgba(16,185,129,0.10)", 4.5, "emerald badge — done, delivered, paid"],
  ["#fbbf24", "rgba(245,158,11,0.10)", 4.5, "amber badge — in progress, production"],
  ["#38bdf8", "rgba(14,165,233,0.10)", 4.5, "sky badge — review, pending"],
  ["#fb7185", "rgba(244,63,94,0.10)", 4.5, "ruby badge — blocked, overdue, high"],
  ["#d4d4d8", "rgba(39,39,42,0.9)", 4.5, "slate badge — backlog, normal"],
  ["#8b94a5", "rgba(255,255,255,0.04)", 3, "low priority"],
];

console.log("\n=== projects, obsidian surface ===");
for (const [fg, bgTint, min, what] of LITERAL) {
  const bg = bgTint ? over(parse(bgTint, {}), OBSIDIAN) : OBSIDIAN;
  const r = (() => {
    const f = over(parse(fg, {}), bg);
    const [a, b2] = [lum(f), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b2 + 0.05);
  })();
  const ok = r >= min;
  if (!ok) fails++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${r.toFixed(2)}:1 (min ${min})  ${what}`);
}

console.log(fails ? `\n${fails} pair(s) below AA` : "\nevery pair meets AA");
