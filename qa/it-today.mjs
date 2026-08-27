import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5407";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });

const posts = [];
p.on("request", (r) => { if (r.method() === "POST" || r.method() === "PATCH") posts.push(`${r.method()} ${new URL(r.url()).pathname}`); });

await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(600);

console.log("--- HEADER ---");
console.log("greeting:", (await p.locator(".greet-line").innerText()).replace(/\n/g, " "));
console.log("sub:", await p.locator(".greet-sub").innerText());
console.log("lead:", await p.locator(".exec-lead").innerText());

console.log("\n--- METRICS ---");
for (const card of await p.locator(".metric-card").all()) {
  const label = await card.locator(".mx-label").innerText();
  const value = (await card.locator(".mx-value").innerText()).replace(/\n/g, " ");
  console.log(`  ${label}: ${value}`);
}

console.log("\n--- DUAL BARS ---");
const items = await p.locator(".hub-item").all();
console.log("items with two bars:", (await Promise.all(items.map(async (i) => (await i.locator(".dual-track").count()) === 2))).filter(Boolean).length, "of", items.length);
for (const i of items.slice(0, 3)) {
  const widths = await i.locator(".dual-track i").evaluateAll((els) => els.map((e) => e.style.width));
  console.log(`  ${await i.locator(".hi-name").innerText()} -> ${widths.join(" / ")}`);
}

console.log("\n--- QUICK ADD ---");
for (const [tab, value] of [["Mastery", "QA skill probe"], ["Goal", "QA goal probe"], ["Idea vault", "QA idea probe"]]) {
  await p.getByRole("tab", { name: tab }).click();
  await p.waitForTimeout(250);
  await p.locator(".hub-form input").first().fill(value);
  if (tab === "Goal") await p.locator(".hub-pair input").first().fill("5000");
  const before = posts.length;
  await p.locator(".hub-form button[type=submit]").click();
  await p.waitForTimeout(1400);
  console.log(`  ${tab}: sent ${posts.slice(before).join(", ") || "NOTHING"} · note "${await p.locator(".hub-note").innerText().catch(() => "-")}"`);
}

console.log("\n--- TASK CHECKBOX ---");
const check = p.locator(".vt-check").first();
if (await check.count()) {
  const before = posts.length;
  const box = await check.boundingBox();
  await check.click();
  await p.waitForTimeout(1400);
  console.log(`  visual size ${Math.round(box.width)}x${Math.round(box.height)}, hit area extends via ::after`);
  console.log(`  sent: ${posts.slice(before).join(", ") || "NOTHING"} · now checked: ${await p.locator(".vt-check.on").count()}`);
} else {
  console.log("  no tasks due today in fixtures");
}

// Does the enlarged hit area actually receive a click 14px outside the box?
const hit = await p.evaluate(() => {
  const el = document.querySelector(".vt-check");
  if (!el) return "no checkbox";
  const r = el.getBoundingClientRect();
  const target = document.elementFromPoint(r.left - 8, r.top + r.height / 2);
  return target === el ? "yes — 8px outside still hits the button" : `no — hits ${target?.className || target?.tagName}`;
});
console.log("  hit area 8px left of the box:", hit);

console.log("\nerrors:", errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "none");
await b.close();
