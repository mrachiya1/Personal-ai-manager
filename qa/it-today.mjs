import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5412";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
const sent = [];
p.on("request", (r) => { if (r.method() === "POST" || r.method() === "PATCH") sent.push(`${r.method()} ${new URL(r.url()).pathname}`); });

await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(600);

console.log("--- HEADER ---");
console.log("date  :", await p.locator(".th-date").innerText());
console.log("greet :", await p.locator(".th-greeting").innerText());
console.log("clock :", await p.locator(".live-clock").innerText());
console.log("banner:", (await p.locator(".good-banner").innerText()).replace(/\n/g, " | "));

console.log("\n--- SYNTHESIS ---");
console.log("pill    :", await p.locator(".synth-pill").innerText());
console.log("headline:", await p.locator(".synth-headline").innerText());
console.log("meta    :", await p.locator(".synth-meta").innerText());
console.log("tags    :", (await p.locator(".synth-tag").allInnerTexts()).join(" / ") || "(none)");
console.log("reasons :", await p.locator(".synth-list li").count());
console.log("overall :", (await p.locator(".synth-overall-lead").innerText()));
console.log("facts   :", (await p.locator(".synth-facts dd").allInnerTexts()).join(" | "));

console.log("\n--- TRANSIT STRIP ---");
for (const i of await p.locator(".ts-item").all()) {
  console.log("  " + (await i.innerText()).replace(/\n/g, " · "));
}

console.log("\n--- SIX METRIC CARDS ---");
const cards = await p.locator(".metric-grid .metric-card").all();
console.log("count:", cards.length, "(want 6)");
for (const c of cards) {
  const label = await c.locator(".mx-label").innerText();
  const value = await c.locator(".mx-value").innerText();
  const splits = (await c.locator(".mx-split").allInnerTexts()).map((s) => s.replace(/\n/g, " ")).join(", ");
  console.log(`  ${label}: ${value}${splits ? `  [${splits}]` : ""}`);
}

console.log("\n--- REST BANNER ---");
console.log((await p.locator(".rest-banner").innerText().catch(() => "(missing)")).replace(/\n/g, " | ").slice(0, 200));

console.log("\n--- SCHEDULE ---");
const rows = await p.locator(".plan-row").all();
console.log("blocks:", rows.length);
for (const r of rows) {
  console.log(`  ${(await r.locator(".plan-title").innerText())} @ ${(await r.locator(".pw-range").innerText())} · ${await r.locator(".pw-hora").innerText().catch(() => "—")}`);
}

console.log("\n--- FINANCE GOALS ---");
for (const g of await p.locator(".goal-row").all()) {
  console.log("  " + (await g.innerText()).replace(/\n/g, " | "));
}

console.log("\n--- LEARNING ---");
for (const l of await p.locator(".learn-row").all()) {
  const w = await l.locator(".learn-track i").evaluate((e) => e.style.width);
  console.log(`  ${await l.locator(".learn-name").innerText()} — ${await l.locator(".learn-pct").innerText()} (bar ${w})`);
}

console.log("\n--- INTERACTIONS ---");
const check = p.locator(".plan-row .plan-check:not(.fixed)").first();
if (await check.count()) {
  const before = sent.length;
  await check.click();
  await p.waitForTimeout(1400);
  console.log(`  task checkbox -> ${sent.slice(before).join(", ") || "NOTHING"} · checked=${await p.locator(".plan-check.on").count()}`);
}
const lcheck = p.locator(".learn-row .plan-check").first();
if (await lcheck.count()) {
  const before = sent.length;
  await lcheck.click();
  await p.waitForTimeout(1400);
  console.log(`  learning checkbox -> ${sent.slice(before).join(", ") || "NOTHING"}`);
}
for (const lane of ["Ideas", "Research", "Learning"]) {
  await p.getByRole("tab", { name: lane, exact: true }).click();
  await p.waitForTimeout(250);
  await p.locator(".qa-input").fill(`QA ${lane} probe`);
  const before = sent.length;
  await p.locator(".qa-form button[type=submit]").click();
  await p.waitForTimeout(1400);
  console.log(`  quick-add ${lane} -> ${sent.slice(before).join(", ") || "NOTHING"} · "${await p.locator(".hub-note").innerText().catch(() => "-")}"`);
}
const hit = await p.evaluate(() => {
  const el = document.querySelector(".plan-check");
  if (!el) return "no checkbox";
  const r = el.getBoundingClientRect();
  return document.elementFromPoint(r.left - 8, r.top + r.height / 2) === el ? "yes" : "no";
});
console.log("  checkbox hit area 8px outside:", hit);

console.log("\nerrors:", errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "none");
await b.close();
