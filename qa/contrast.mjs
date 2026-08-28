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
console.log(fails ? `\n${fails} pair(s) below AA` : "\nevery pair meets AA");
