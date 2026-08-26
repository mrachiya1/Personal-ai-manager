import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const problems = [];

for (const [tag, theme, w, h] of [["light", "light", 1440, 950], ["dark", "dark", 1440, 950], ["mob", "light", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  if (theme === "dark") await p.addInitScript(() => { try { localStorage.setItem("orex-theme", "dark"); } catch {} });
  await p.goto("http://localhost:5402/projects", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const btn = p.getByRole("button", { name: "New Project", exact: true }).first();
  if (await btn.count()) {
    await btn.click();
    await p.waitForTimeout(500);
    const audit = await p.evaluate(() => {
      const m = document.querySelector(".modal");
      if (!m) return { missing: true };
      const r = m.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        viewH: window.innerHeight,
        scrolls: m.scrollHeight > m.clientHeight + 2,
        overflowY: getComputedStyle(m).overflowY,
        cutOff: r.bottom > window.innerHeight + 1 || r.top < -1,
      };
    });
    problems.push(`[${tag}] ${JSON.stringify(audit)}`);
    await p.screenshot({ path: `/tmp/ui/modal-${tag}.png` });
  }
  await ctx.close();
}
await b.close();
console.log(problems.join("\n"));
