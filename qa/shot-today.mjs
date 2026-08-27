import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5404";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const problems = [];

async function shot(tag, { width, height, theme }) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 180)); });
  if (theme === "dark") await p.addInitScript(() => { try { localStorage.setItem("orex-theme", "dark"); } catch {} });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);

  const audit = await p.evaluate(() => {
    const out = { hOverflow: false, clipped: [], tiny: [], touch: [], missing: [] };
    out.hOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    for (const sel of [".th-greeting", ".live-clock", ".good-banner", ".synth-vibe", ".synth-reasoning", ".synth-overall", ".transit-strip .ts-item", ".metric-grid .metric-card", ".rest-banner", ".today-split", ".plan-row", ".goal-row", ".learn-row", ".qa-tab", ".qa-input"]) {
      if (!document.querySelector(sel)) out.missing.push(sel);
    }
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // text-overflow:ellipsis is a decision, not a defect — a fixed-width
      // table cell is supposed to elide. Only flag text that is cut with no
      // affordance at all.
      if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis"
          && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && el.children.length === 0) {
        const t = (el.textContent || "").trim().slice(0, 40);
        if (t) out.clipped.push(`${el.className || el.tagName} :: ${t}`);
      }
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 10 && (el.textContent || "").trim() && el.children.length === 0) out.tiny.push(`${fs}px :: ${(el.textContent||"").trim().slice(0,26)}`);
      if ((el.tagName === "BUTTON" || el.tagName === "A") && el.children.length <= 1) {
        // A small button with a negative-inset ::after has a hit area much
        // bigger than its box. Measure that, not the paint, or every one of
        // these gets reported forever and the report stops being read.
        const after = getComputedStyle(el, "::after");
        const grow = (v) => Math.max(0, -parseFloat(v || "0") || 0);
        const hitW = r.width + grow(after.left) + grow(after.right);
        const hitH = r.height + grow(after.top) + grow(after.bottom);
        if (after.content !== "none" && (hitW >= 28 || hitH >= 28)) continue;
        if (r.height < 28 && r.width < 28) out.touch.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    out.clipped = [...new Set(out.clipped)].slice(0, 6);
    out.tiny = [...new Set(out.tiny)].slice(0, 6);
    out.touch = [...new Set(out.touch)].slice(0, 6);
    return out;
  });

  const issues = [];
  if (audit.missing.length) issues.push(`MISSING: ${audit.missing.join(", ")}`);
  if (audit.hOverflow) issues.push("page scrolls sideways");
  if (audit.clipped.length) issues.push(`clipped: ${audit.clipped.join(" | ")}`);
  if (audit.tiny.length) issues.push(`sub-10px: ${audit.tiny.join(" | ")}`);
  if (audit.touch.length) issues.push(`small taps: ${audit.touch.join(" | ")}`);
  if (errs.length) issues.push(`console: ${[...new Set(errs)].slice(0,3).join(" | ")}`);
  problems.push(`[${tag}] ${issues.length ? issues.join("\n      ") : "clean"}`);

  await p.screenshot({ path: `/tmp/ui/today-${tag}.png`, fullPage: true });
  await ctx.close();
}

await shot("desk", { width: 1440, height: 950, theme: "light" });
await shot("dark", { width: 1440, height: 950, theme: "dark" });
await shot("mob", { width: 390, height: 844, theme: "light" });
await shot("mid", { width: 1024, height: 900, theme: "light" });
await shot("wide", { width: 1680, height: 1000, theme: "dark" });
await shot("tab", { width: 780, height: 1000, theme: "dark" });
await b.close();
console.log(problems.join("\n"));
