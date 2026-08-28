// The chart palette lives in globals.css; this asserts it still passes the
// six categorical checks in both themes. Colour drift is silent otherwise —
// somebody nudges a hue for looks and two slices stop being distinguishable.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SKILL = process.env.DATAVIZ_DIR;
if (!SKILL) {
  console.log("set DATAVIZ_DIR to the dataviz skill directory to run this");
  process.exit(0);
}
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function chart(block) {
  const m = [...block.matchAll(/--chart-(\d):\s*(#[0-9a-f]{6})/gi)];
  return m.sort((a, b) => a[1] - b[1]).map((x) => x[2]);
}
const light = chart(css.slice(css.indexOf("--chart-1"), css.indexOf("html[data-theme=\"dark\"]{\n  --chart-1")));
const darkAt = css.indexOf('html[data-theme="dark"]{\n  --chart-1');
const dark = chart(css.slice(darkAt, darkAt + 400));

let bad = 0;
for (const [mode, palette, surface] of [["light", light, "#fdfbf6"], ["dark", dark, "#201d19"]]) {
  const out = execFileSync("node", [
    `${SKILL}/scripts/validate_palette.js`, palette.join(","), "--mode", mode, "--surface", surface,
  ], { encoding: "utf8" });
  const failed = /FAILED/.test(out);
  if (failed) bad++;
  console.log(`${mode}: ${palette.join(",")}`);
  console.log(out.split("\n").filter((l) => /\[(PASS|WARN|FAIL)\]|→/.test(l)).join("\n"));
}
process.exit(bad ? 1 : 0);
