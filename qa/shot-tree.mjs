import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.QA_BASE || "http://localhost:5414";
fs.mkdirSync("/tmp/shots", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, w, h, theme] of [["desktop-dark", 1440, 1100, "dark"], ["desktop-light", 1440, 1100, "light"], ["laptop-dark", 1180, 900, "dark"], ["phone-dark", 390, 900, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
  const p = await ctx.newPage();
  await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
  await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await p.waitForTimeout(400);
  // Open the first project and one nested branch, so a shot shows the tree.
  const caret = p.locator("tr.pt-row .pt-caret").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(400);
  const deep = p.locator('tr.pt-sub[data-depth="1"] .pt-caret.sm[aria-expanded="false"]').first();
  if (await deep.count()) { await deep.click(); await p.waitForTimeout(350); }
  await p.screenshot({ path: `/tmp/shots/tree-${name}.png`, fullPage: false });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}: overflow ${over}px`);
  await ctx.close();
}
await b.close();
