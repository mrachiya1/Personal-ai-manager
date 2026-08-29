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
  if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData()||"").slice(0,90)}`);
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
console.log("  sub-task rows:", await p.locator("tr.pt-sub").count(), "· add rows:", await p.locator("tr.pt-addrow").count());
console.log("  deepest level shown:", await p.locator("tr.pt-sub").last().getAttribute("data-depth").catch(() => "-"));

console.log("\n--- PROGRESS BARS ---");
const widths = await p.locator(".pt-progress i").evaluateAll((els) => els.slice(0, 5).map((e) => e.style.width));
console.log("  first five:", widths.join(" "));

console.log("\n--- SUB-TASK TOGGLE recalculates progress ---");
const task = p.locator("tr.pt-sub .pt-check.sub").first();
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

console.log("\n--- FIGMA COLUMN DETAILS ---");
{
  const row = p.locator(".pt-row").first();
  console.log("  start date format:", (await row.locator("td").nth(1).innerText()).trim());
  console.log("  deadline cell    :", (await row.locator("td").nth(2).innerText()).replace(/\n/g, " "));
  console.log("  assignee dots    :", await p.locator(".pt-dot").count(), "· avatars:", await p.locator(".pt-assign .av").count());
  console.log("  resources link   :", (await p.locator(".pt-res").first().innerText()).trim());
  console.log("  budget cell      :", (await p.locator(".pt-row").first().locator("td").nth(11).innerText()).trim());
  console.log("  payment cell     :", (await p.locator(".pt-row").first().locator("td").nth(12).innerText()).trim());
  console.log("  section titles   :", (await p.locator(".pt-section-title h2").allInnerTexts()).join(" | "));
  console.log("  status badges    :", (await p.locator('[data-cell-col="6"] .badge').allInnerTexts()).join(", "));
}

console.log("\n--- NEXT TASK IS CLICKABLE ---");
{
  const next = p.locator(".pt-next").first();
  if (await next.count()) {
    const openBefore = await p.locator("tr.pt-sub").count();
    await next.click();
    await p.waitForTimeout(400);
    console.log(`  clicking it expanded the row: ${openBefore} -> ${await p.locator("tr.pt-sub").count()} sub-task rows`);
  } else console.log("  no next-task button on screen");
}

console.log("\n--- INLINE ADD TASK ---");
{
  const opener = p.locator(".pt-add-open").first();
  if (await opener.count()) {
    await opener.click();
    await p.waitForTimeout(300);
    const fields = await p.locator("tr.pt-addrow.open input, tr.pt-addrow.open select").count();
    await p.locator("tr.pt-addrow.open td.pt-addrow-name input").first().fill("QA milestone");
    await p.locator('tr.pt-addrow.open input[type="date"]').last().fill("2026-09-15");
    const n = sent.length;
    await p.locator('tr.pt-addrow.open .pt-inline-actions button').first().click();
    await p.waitForTimeout(1500);
    console.log(`  fields: ${fields} · sent: ${sent.slice(n).join(" | ") || "NOTHING"}`);
  } else console.log("  add-task button missing");
}

console.log("\n--- NEW PROJECT MODAL ---");
{
  await p.getByRole("button", { name: "New Project", exact: true }).first().click();
  await p.waitForTimeout(600);
  const labels = await p.locator(".modal .form-field label").allInnerTexts();
  console.log("  fields:", labels.join(" · "));
  const companyOpts = await p.locator(".modal .form-field", { hasText: "Company" }).locator("option").allInnerTexts();
  console.log("  workspace selector:", companyOpts.join(", "));
  console.log("  category chips:", await p.locator(".modal .form-field", { hasText: "Category" }).locator(".form-chip").count());
  const add = p.locator(".draft-add");
  if (await add.count()) {
    for (let i = 0; i < 3; i++) { await add.click(); await p.waitForTimeout(120); }
    console.log("  milestone rows after 3 clicks:", await p.locator(".draft-task").count());
    const inputs = p.locator(".draft-task input:first-child");
    for (let i = 0; i < 3; i++) await inputs.nth(i).fill(`QA milestone ${i + 1}`);
    await p.locator(".modal input").first().fill("QA seeded project");
    const n = sent.length;
    await p.locator('.modal button[type="submit"]').click();
    await p.waitForTimeout(6000);
    console.log("  sent:", sent.slice(n).map((x) => x.split(" ").slice(0, 2).join(" ")).join(" | ") || "NOTHING");
  } else console.log("  milestone creator missing");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

console.log("\n--- CUSTOM COLUMNS FROM NOTION ---");
{
  const heads = await p.locator(".pt-table thead th").allInnerTexts();
  console.log("  headers:", heads.filter(Boolean).join(" | "));
  console.log("  add-property button:", await p.locator(".ap-btn").count());
  // Custom columns sort alphabetically: Invoiced (checkbox) then Staging URL.
  const check = p.locator('.pt-check.standalone').first();
  const url = p.locator('.pt-linked').first();
  console.log("  url cell present:", await url.count(), "· checkbox cells:", await p.locator(".pt-check.standalone").count());
  console.log("  url value:", (await url.innerText().catch(() => "-")).trim().slice(0, 44));
  if (await check.count()) {
    const n = sent.length;
    await check.click();
    await p.waitForTimeout(1500);
    console.log("  toggling the checkbox sent:", sent.slice(n).join(" | ") || "NOTHING");
  }
}

console.log("\n--- ADD PROPERTY POPOVER ---");
{
  // The first button in the DOM can belong to a section this run collapsed
  // earlier, or to a project the stand-in has since persisted — either way it
  // is legitimately not clickable. Take the first one actually on screen, and
  // close any editable-cell popover first: its backdrop covers the whole page
  // and swallows the click, which reads as "the button is broken".
  // A reload rather than a hunt for whatever overlay is open: earlier blocks
  // leave editable-cell popovers behind, and their full-screen backdrop
  // swallows this click in a way that reads as "the button is broken".
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.locator(".ap-btn:visible").first().click();
  await p.waitForTimeout(350);
  const types = await p.locator(".ap-type-name").allInnerTexts();
  console.log("  types offered:", types.join(", "));
  await p.locator(".ap-type", { hasText: "URL" }).first().click();
  await p.waitForTimeout(250);
  await p.locator(".ap-name input").fill("QA Demo Link");
  const n = sent.length;
  await p.locator('.ap-name button[type="submit"]').click();
  await p.waitForTimeout(1800);
  console.log("  sent:", sent.slice(n).join(" | ") || "NOTHING");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

console.log("\n--- RESOURCES MODAL: LINKS + FILES ---");
await p.locator(".pt-res").first().click();
await p.waitForTimeout(600);
{
  console.log("  tabs:", (await p.locator(".rm-tab").allInnerTexts()).map((t) => t.replace(/\n/g, " ")).join(" | "));
  await p.locator(".rm-url").fill("https://figma.com/file/abc/Design");
  await p.locator(".rm-label").fill("Design file");
  const n = sent.length;
  await p.locator('.rm-form button[type="submit"]').click();
  await p.waitForTimeout(1600);
  console.log("  attach link sent:", sent.slice(n).join(" | ") || "NOTHING");
  console.log("  link rows:", await p.locator(".rm-item").count(), "· icon kind:", await p.locator(".rm-icon").first().getAttribute("class"));
  await p.locator(".rm-tab", { hasText: "Files" }).click();
  await p.waitForTimeout(300);
  console.log("  files tab drop area:", await p.locator(".pw-drop").count());
}
await p.keyboard.press("Escape");
await p.waitForTimeout(400);

console.log("\n--- DELETE WITH CONFIRMATION ---");
{
  const rowsBefore = await p.locator(".pt-row").count();
  await p.locator(".pt-menu-btn").first().click();
  await p.waitForTimeout(300);
  console.log("  menu items:", (await p.locator(".ed-opt").allInnerTexts()).join(" | "));
  await p.locator(".ed-opt", { hasText: "Delete project" }).click();
  await p.waitForTimeout(400);
  console.log("  confirm modal:", await p.locator(".cd-modal").count());
  console.log("  warning:", (await p.locator(".cd-warning").innerText()).replace(/\n/g, " ").slice(0, 150));
  console.log("  buttons:", (await p.locator(".cd-modal .form-actions button").allInnerTexts()).join(" | "));
  const n = sent.length;
  await p.locator(".btn-danger").click();
  await p.waitForTimeout(2000);
  console.log(`  sent: ${sent.slice(n).join(" | ") || "NOTHING"} · rows ${rowsBefore} -> ${await p.locator(".pt-row").count()}`);
  console.log("  toast:", await p.locator(".pt-toast").innerText().catch(() => "-"));
}

console.log("\nerrors:", errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "none");
await b.close();
