import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5415";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
const sent = [];
p.on("request", async (r) => {
  if (r.method() === "POST" || r.method() === "PATCH" || r.method() === "DELETE") {
    sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData() || "").slice(0, 120)}`);
  }
});

await p.goto(BASE + "/sleep", { waitUntil: "networkidle" });
await p.waitForTimeout(500);

console.log("--- TILES ---");
for (const t of await p.locator(".stat-tile").all()) {
  console.log("  " + (await t.innerText()).replace(/\n/g, " · "));
}

console.log("\n--- MANUAL FORM ---");
console.log("form present:", await p.locator(".sleep-manual").count());
await p.getByRole("button", { name: "Last night" }).click();
await p.waitForTimeout(300);
const sleepVal = await p.locator('.sleep-manual input[type="datetime-local"]').first().inputValue();
const wakeVal = await p.locator('.sleep-manual input[type="datetime-local"]').nth(1).inputValue();
console.log(`  Last night -> ${sleepVal} → ${wakeVal}`);
console.log("  duration shows:", await p.locator(".sm-duration").first().innerText());

// Reversed times must be refused rather than stored as a negative night.
await p.locator('.sleep-manual input[type="datetime-local"]').nth(1).fill(sleepVal.slice(0, 11) + "20:00");
await p.waitForTimeout(300);
console.log("  reversed times ->", await p.locator(".sm-duration").first().innerText(),
  "| submit disabled:", await p.locator('.sleep-manual button[type="submit"]').isDisabled());

// Back to a valid night and save.
await p.locator('.sleep-manual input[type="datetime-local"]').nth(1).fill(wakeVal);
await p.locator('.sleep-manual input[type="text"]').fill("QA manual probe");
await p.waitForTimeout(200);
const before = sent.length;
await p.locator('.sleep-manual button[type="submit"]').click();
await p.waitForTimeout(1600);
console.log("  saved ->", sent.slice(before).join(" | ") || "NOTHING");
console.log("  note:", await p.locator(".sleep-manual .hub-note").innerText().catch(() => "-"));

console.log("\n--- ROW EDIT ---");
const edit = p.getByRole("button", { name: "Edit" }).first();
if (await edit.count()) {
  await edit.click();
  await p.waitForTimeout(400);
  console.log("  editor open:", await p.locator("tr.sleep-editing").count());
  const inputs = p.locator("tr.sleep-editing input[type='datetime-local']");
  console.log("  prefilled:", await inputs.first().inputValue(), "→", await inputs.nth(1).inputValue());
  const before2 = sent.length;
  await p.locator("tr.sleep-editing input[type='text']").fill("QA edited note");
  await p.getByRole("button", { name: "Save", exact: true }).click();
  await p.waitForTimeout(1600);
  console.log("  saved ->", sent.slice(before2).join(" | ") || "NOTHING");
}

console.log("\nerrors:", errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "none");
await b.close();
