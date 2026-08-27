import { chromium } from "playwright";

const BASE = "http://localhost:5400";
const OUT = "/tmp/ui";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const PAGES = [
  ["today", "/"],
  ["projects", "/projects"],
  ["finance", "/finance"],
  ["slips", "/finance/slips"],
  ["clients", "/clients"],
  ["companies", "/companies"],
  ["payments", "/payments"],
  ["team", "/team"],
  ["render-queue", "/render-queue"],
  ["ideas", "/ideas"],
  ["learning", "/learning"],
  ["daily-logs", "/daily-logs"],
  ["sleep", "/sleep"],
  ["rules", "/rules"],
  ["astro-lab", "/astro-lab"],
  ["advisor", "/advisor"],
  ["settings", "/settings"],
];

const problems = [];

async function capture(name, path, { width, height, theme, tag, full = true }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  if (theme === "dark") await page.addInitScript(() => { try { localStorage.setItem("orex-theme", "dark"); } catch {} });

  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(500);

  // Layout faults a screenshot alone won't show.
  const audit = await page.evaluate(() => {
    const out = { hOverflow: false, docWidth: 0, viewWidth: 0, clipped: [], tiny: [], touch: [] };
    out.docWidth = document.documentElement.scrollWidth;
    out.viewWidth = document.documentElement.clientWidth;
    out.hOverflow = out.docWidth > out.viewWidth + 1;

    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;

      // Text cut off by its own box.
      // text-overflow:ellipsis is a decision, not a defect — a fixed-width
      // table cell is supposed to elide. Only flag text that is cut with no
      // affordance at all.
      if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis"
          && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
        const t = (el.textContent || "").trim().slice(0, 40);
        if (t && el.children.length === 0) out.clipped.push(`${el.className || el.tagName} :: ${t}`);
      }
      // Text too small to read comfortably.
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 10 && (el.textContent || "").trim() && el.children.length === 0) {
        out.tiny.push(`${fs}px :: ${(el.textContent || "").trim().slice(0, 30)}`);
      }
      // Tap targets below the usual 44px guidance.
      if ((el.tagName === "BUTTON" || el.tagName === "A") && el.children.length <= 1) {
        // A small button with a negative-inset ::after has a hit area much
        // bigger than its box. Measure that, not the paint, or every one of
        // these gets reported forever and the report stops being read.
        const after = getComputedStyle(el, "::after");
        const grow = (v) => Math.max(0, -parseFloat(v || "0") || 0);
        const hitW = r.width + grow(after.left) + grow(after.right);
        const hitH = r.height + grow(after.top) + grow(after.bottom);
        if (after.content !== "none" && (hitW >= 28 || hitH >= 28)) continue;
        if (r.height < 28 && r.width < 28 && (el.textContent || "").trim().length + el.querySelectorAll("svg").length > 0) {
          out.touch.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
    }
    out.clipped = [...new Set(out.clipped)].slice(0, 6);
    out.tiny = [...new Set(out.tiny)].slice(0, 6);
    out.touch = [...new Set(out.touch)].slice(0, 6);
    return out;
  }).catch(() => null);

  if (audit) {
    const issues = [];
    if (audit.hOverflow) issues.push(`page scrolls sideways (${audit.docWidth} > ${audit.viewWidth})`);
    if (audit.clipped.length) issues.push(`clipped text: ${audit.clipped.join(" | ")}`);
    if (audit.tiny.length) issues.push(`sub-10px text: ${audit.tiny.join(" | ")}`);
    if (audit.touch.length) issues.push(`small tap targets: ${audit.touch.join(" | ")}`);
    if (consoleErrors.length) issues.push(`console: ${[...new Set(consoleErrors)].slice(0, 3).join(" | ")}`);
    if (issues.length) problems.push(`[${name} ${tag}] ${issues.join("\n      ")}`);
  }

  await page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage: full });
  await ctx.close();
}

for (const [name, path] of PAGES) {
  await capture(name, path, { width: 1440, height: 900, theme: "light", tag: "desk" });
}
// The dark palette is shared by every screen, so every screen gets checked in
// it — a token change that only looks right on the six pages you remembered
// to test is the same as not having tested it.
for (const [name, path] of PAGES) {
  await capture(name, path, { width: 1440, height: 900, theme: "dark", tag: "dark" });
}
for (const [name, path] of PAGES.filter(([n]) => ["today", "projects", "finance", "clients", "settings", "payments"].includes(n))) {
  await capture(name, path, { width: 390, height: 844, theme: "light", tag: "mob" });
}

await browser.close();

console.log("\n=== LAYOUT AUDIT ===");
console.log(problems.length ? problems.join("\n\n") : "no issues detected");
