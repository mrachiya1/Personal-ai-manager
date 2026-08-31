import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5420";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [w, h, tag] of [[1500, 1100, "desk"], [390, 900, "phone"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
  const p = await ctx.newPage();
  for (const [route, name] of [["/finance", "finance"], ["/companies", "companies"], ["/clients", "clients"]]) {
    await p.goto(BASE + route, { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `/tmp/x-${name}-${tag}.png`, fullPage: tag === "desk" });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${name} ${tag} — x-overflow ${over}px`);
  }
  // The company profile too — navigated directly. Clicking the card is what a
  // person does, but on a phone the card can be below the fold and Playwright
  // will not click something outside the viewport.
  await p.goto(BASE + "/companies", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const href = await p.locator("a[href^='/companies/']").first().getAttribute("href").catch(() => null);
  if (href) {
    await p.goto(BASE + href, { waitUntil: "networkidle" });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `/tmp/x-profile-${tag}.png`, fullPage: tag === "desk" });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`profile ${tag} — x-overflow ${over}px`);
  } else {
    console.log(`profile ${tag} — no company link found`);
  }
  await ctx.close();
}
await b.close();
