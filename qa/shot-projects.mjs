import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function shot(file, w, h, tab, expand) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5400/projects", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  if (tab) { await p.getByRole("button", { name: tab, exact: true }).click(); await p.waitForTimeout(500); }
  if (expand) { await p.locator(".pw-expand").first().click(); await p.waitForTimeout(400); }
  await p.screenshot({ path: file, fullPage: false });
  await ctx.close();
}
await shot("/tmp/ui/pr-table.png", 1440, 900, null, false);
await shot("/tmp/ui/pr-expanded.png", 1440, 1100, null, true);
await shot("/tmp/ui/pr-folders.png", 1440, 950, "Folders", false);
await b.close();
console.log("ok");
