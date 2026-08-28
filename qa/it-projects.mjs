import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5416";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
const sent = [];
p.on("request", (r) => {
  if (["POST", "PATCH", "DELETE"].includes(r.method())) sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData()||"").slice(0,90)}`);
});

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(700);

console.log("--- SIX METRIC CARDS ---");
const cards = await p.locator(".pm-grid .pm-card").all();
console.log("count:", cards.length, "(want 6)");
for (const c of cards) {
  const label = await c.locator(".pm-label").innerText();
  const val = await c.locator(".pm-value").innerText().catch(() => "(donut)");
  const splits = (await c.locator(".pm-split").allInnerTexts()).map((s) => s.replace(/\n/g, " ")).join(", ");
  console.log(`  ${label}: ${val.replace(/\n/g, " ")}${splits ? ` [${splits}]` : ""}`);
}

console.log("\n--- DONUT ---");
console.log("arcs:", await p.locator(".donut-arc").count(), "legend rows:", await p.locator(".donut-legend li").count());
console.log("centre:", (await p.locator(".donut-centre").innerText()).replace(/\n/g, " · "));
console.log("legend:", (await p.locator(".donut-legend li").allInnerTexts()).map((s) => s.replace(/\n/g, " ")).join(" | "));
console.log("hit arcs:", await p.locator(".donut-hit").count());
if (await p.locator(".donut-hit").count()) {
  // Hover the widened hit arc at a point ON the ring, not the SVG centre.
  const box = await p.locator(".donut-figure").boundingBox();
  await p.mouse.move(box.x + box.width / 2 + box.width * 0.42, box.y + box.height / 2);
  await p.waitForTimeout(300);
  console.log("on hover centre:", (await p.locator(".donut-centre").innerText()).replace(/\n/g, " · "));
  await p.locator(".donut-legend li").nth(1).hover();
  await p.waitForTimeout(250);
  console.log("on legend hover:", (await p.locator(".donut-centre").innerText()).replace(/\n/g, " · "));
  await p.mouse.move(0, 0);
}

console.log("\n--- SECTIONS ---");
for (const s of await p.locator(".pt-section").all()) {
  const t = await s.locator(".pt-section-title h2").innerText();
  const sub = await s.locator(".pt-section-sub").innerText();
  const rows = await s.locator(".pt-row").count();
  console.log(`  ${t} — ${sub} (${rows} rows)${(await s.getAttribute("class")).includes("personal") ? " [personal]" : ""}`);
}

console.log("\n--- COLLAPSE A SECTION ---");
const before = await p.locator(".pt-row").count();
await p.locator(".pt-caret.big").first().click();
await p.waitForTimeout(400);
console.log(`  rows ${before} -> ${await p.locator(".pt-row").count()}`);
await p.locator(".pt-caret.big").first().click();
await p.waitForTimeout(400);

console.log("\n--- EXPAND A PROJECT (nested tasks) ---");
const caret = p.locator(".pt-row .pt-caret").first();
await caret.click();
await p.waitForTimeout(500);
console.log("  detail rows:", await p.locator(".pt-detail-row").count(), "sub-tasks:", await p.locator(".pt-task").count());
console.log("  head:", await p.locator(".pt-detail-head").first().innerText().catch(() => "-"));

console.log("\n--- PROGRESS BARS ---");
const widths = await p.locator(".pt-progress i").evaluateAll((els) => els.slice(0, 5).map((e) => e.style.width));
console.log("  first five:", widths.join(" "));

console.log("\n--- SUB-TASK TOGGLE recalculates progress ---");
const task = p.locator(".pt-task .pt-check").first();
if (await task.count()) {
  const wBefore = await p.locator(".pt-progress i").first().evaluate((e) => e.style.width);
  const n = sent.length;
  await task.click();
  await p.waitForTimeout(1500);
  const wAfter = await p.locator(".pt-progress i").first().evaluate((e) => e.style.width);
  console.log(`  sent: ${sent.slice(n).join(", ") || "NOTHING"} · progress ${wBefore} -> ${wAfter}`);
}

console.log("\n--- INLINE TEXT EDIT (debounced) ---");
const nameCell = p.locator('.pt-name-text [data-cell-col="0"]').first();
await nameCell.click();
await p.waitForTimeout(250);
const n1 = sent.length;
await p.locator(".ed-input").first().fill("QA renamed project");
await p.waitForTimeout(700);   // past the 400ms debounce
console.log("  after debounce:", sent.slice(n1).join(", ") || "NOTHING");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);

console.log("\n--- STATUS DROPDOWN ---");
const statusCell = p.locator('[data-cell-col="6"]').first();
await statusCell.click();
await p.waitForTimeout(300);
console.log("  popover:", await p.locator(".ed-pop").count(), "options:", await p.locator(".ed-opt").count());
const planning = p.locator(".ed-opt", { hasText: "Planning" }).first();
if (await planning.count()) {
  const n2 = sent.length;
  await planning.click();
  await p.waitForTimeout(1400);
  console.log("  picked Planning ->", sent.slice(n2).join(", ") || "NOTHING", "| cell now:", (await statusCell.innerText()).trim());
}

console.log("\n--- KEYBOARD NAVIGATION ---");
await p.locator('[data-cell-row="0"][data-cell-col="0"]').first().focus();
const trail = [];
for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
  await p.keyboard.press(key);
  await p.waitForTimeout(150);
  trail.push(await p.evaluate(() => {
    const el = document.activeElement;
    return el ? `r${el.getAttribute("data-cell-row")}c${el.getAttribute("data-cell-col")}` : "none";
  }));
}
console.log("  start r0c0 ->", trail.join(" -> "));
await p.keyboard.press("Tab");
await p.waitForTimeout(150);
console.log("  Tab lands on:", await p.evaluate(() => {
  const el = document.activeElement;
  return el ? `r${el.getAttribute("data-cell-row")}c${el.getAttribute("data-cell-col")}` : "none";
}));
await p.keyboard.press("Enter");
await p.waitForTimeout(300);
console.log("  Enter opened an editor/popover:", (await p.locator(".ed-input").count()) + (await p.locator(".ed-pop").count()));
await p.keyboard.press("Escape");

console.log("\n--- COMPLETION FEEDBACK ---");
await p.waitForTimeout(300);
const done = p.locator(".pt-name .pt-check").first();
await done.click();
await p.waitForTimeout(500);
console.log("  modal:", await p.locator(".cf-modal").count(), "options:", await p.locator(".cf-option").count());
if (await p.locator(".cf-option").count()) {
  await p.locator(".cf-option", { hasText: "Heavy friction" }).click();
  await p.locator("#cf-note").fill("QA: scope crept twice");
  const n3 = sent.length;
  await p.locator(".cf-modal button[type=submit]").click();
  await p.waitForTimeout(1600);
  console.log("  saved ->", sent.slice(n3).join(" | ") || "NOTHING");
}

console.log("\n--- RESOURCES MODAL ---");
await p.locator(".pt-res").first().click();
await p.waitForTimeout(500);
console.log("  modal:", await p.locator(".modal").count(), "drop area:", await p.locator(".pw-drop").count());
await p.keyboard.press("Escape");

console.log("\nerrors:", errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "none");
await b.close();
