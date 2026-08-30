import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5419";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: "dark" });
const p = await ctx.newPage();
const rowFor = (n) => p.locator("tr.pt-row", { hasText: n }).first();
async function menu(n) {
  const r = rowFor(n); await r.scrollIntoViewIfNeeded(); await r.hover();
  await r.locator(".pt-menu-btn").first().click(); await p.waitForTimeout(200);
}
await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(900);

for (const [name, colour] of [["Studio Reel 2026", "Urgent"], ["Northwind — Brand Relaunch Film", "Winning"], ["Lumen — Product Explainer", "Waiting"]]) {
  await menu(name);
  await p.locator(".ed-pop .ed-opt", { hasText: /^highlight/i }).first().click();
  await p.waitForTimeout(180);
  await p.locator(".ed-pop .ed-opt.hl", { hasText: colour }).first().click();
  await p.waitForTimeout(1100);
}
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(900);
await rowFor("Studio Reel 2026").hover();
await p.waitForTimeout(200);
await p.screenshot({ path: "/tmp/pj-table.png", clip: { x: 250, y: 300, width: 1240, height: 640 } });

await menu("Studio Reel 2026");
await p.locator(".ed-pop .ed-opt", { hasText: /open details/i }).first().click();
await p.waitForTimeout(500);
await p.locator(".dp-notes-field").fill("Client approved the slower logo sting. Reshoot the turntable once the new material lands — Dinesh has the file.");
await p.waitForTimeout(1400);
await p.locator(".dp-modal").screenshot({ path: "/tmp/pj-panel.png" });
await p.keyboard.press("Escape");
await p.waitForTimeout(400);

await p.getByRole("button", { name: /new project/i }).first().click();
await p.waitForTimeout(600);
await p.locator(".pf-modal input").first().fill("Orexstudios — 2027 Showreel");
await p.locator(".pf-modal .pf-cat").nth(0).click();
await p.waitForTimeout(200);
await p.locator(".pf-modal").screenshot({ path: "/tmp/pj-form.png" });
console.log("shots written");
await b.close();
