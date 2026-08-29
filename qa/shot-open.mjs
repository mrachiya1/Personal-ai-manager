import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.QA_BASE || "http://localhost:5414";
fs.mkdirSync("/tmp/shots", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, theme] of [["dark", "dark"], ["light", "light"]]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, colorScheme: theme });
  const p = await ctx.newPage();
  await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
  await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await p.waitForTimeout(400);
  // The last status cell on the page — the one that used to open into nothing.
  const cell = p.locator('tr.pt-row td[data-label="Status"] .ed-cell').last();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/shots/open-${name}.png` });
  console.log(`${name}: panel ${JSON.stringify(await p.locator(".ed-pop").first().boundingBox())}`);
  await ctx.close();
}
await b.close();
