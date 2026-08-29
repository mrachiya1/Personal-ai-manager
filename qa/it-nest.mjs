// Breaking one task into many, and those into many more.
//
// The screen already rendered a tree correctly. What it could not do was let
// anyone BUILD one: the ··· menu that carries "Add sub-task" was revealed by
// `.pt-row:hover`, and `.pt-row` is the project row — sub-task rows are
// `.pt-sub`, so on every task in the app the button sat at opacity 0 forever.
// Behind it, the inline add row only rendered for a task that ALREADY had
// children, so the one action the menu offered would have done nothing.
//
// Every check here drives the real control and then re-reads the page. A test
// that asserts the menu contains the words "Add sub-task" would have passed
// throughout the entire period the feature was unusable.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5417";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
const sent = [];
p.on("request", (r) => {
  if (["POST", "PATCH", "DELETE"].includes(r.method()))
    sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData() || "").slice(0, 200)}`);
});

const rowFor = (name) => p.locator("tr.pt-row", { hasText: name }).first();
const subRow = (title) =>
  p.locator("tr.pt-sub").filter({ has: p.locator(".pt-sub-title", { hasText: title }) }).first();

async function expandProject(name) {
  const caret = rowFor(name).locator(".pt-caret").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(500);
}

/** Open a task row's ··· menu the way a person does: hover, then click. */
async function openRowMenu(title) {
  const row = subRow(title);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await p.waitForTimeout(120);
  const btn = row.locator(".pt-menu-btn").first();
  const opacity = await btn.evaluate((el) => getComputedStyle(el).opacity).catch(() => "0");
  await btn.click({ timeout: 4000 });
  await p.waitForTimeout(200);
  return parseFloat(opacity);
}

/** Add a sub-task through the + on the row — one click, the primary path. */
async function addViaPlus(parent, title) {
  const row = subRow(parent);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator(".pt-add-btn").first().click({ timeout: 4000 });
  await p.waitForTimeout(350);
  const input = p.locator("tr.pt-addrow.open input.pt-inline-input").first();
  if (!(await input.isVisible().catch(() => false))) return { appeared: false, created: false };
  await input.fill(title);
  await input.press("Enter");
  await p.waitForTimeout(900);
  return { appeared: true, created: (await subRow(title).count()) > 0 };
}

/**
 * Add a sub-task under `parent` through the menu, and return whether the row
 * came back rendered underneath it.
 */
async function addSubTask(parent, title) {
  await openRowMenu(parent);
  // Scoped to the open menu on purpose. An unscoped "Add sub-task" also
  // matches the inline add row sitting under an expanded parent, which is
  // underneath the menu's backdrop — the click then times out against the
  // backdrop and reads like a positioning bug that isn't there.
  await p.locator(".ed-pop .ed-opt", { hasText: /add sub-task/i }).first().click({ timeout: 5000 });
  await p.waitForTimeout(350);
  const input = p.locator("tr.pt-addrow.open input.pt-inline-input").first();
  const appeared = await input.isVisible().catch(() => false);
  if (!appeared) return { appeared: false, created: false };
  await input.fill(title);
  await input.press("Enter");
  await p.waitForTimeout(900);
  return { appeared: true, created: (await subRow(title).count()) > 0 };
}

const depthOf = async (title) => Number(await subRow(title).getAttribute("data-depth"));

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(700);

/* ------------------------------------------------------------------ */
console.log("--- 1. THE MENU ON A TASK ROW IS ACTUALLY THERE ---");
/* ------------------------------------------------------------------ */
await expandProject("Studio Reel 2026");
const leaf = subRow("Cut selects");
check("a task with no sub-tasks is on the page", (await leaf.count()) > 0);
await leaf.hover();
await p.waitForTimeout(150);
const menuBtn = leaf.locator(".pt-menu-btn").first();
check("its ··· button exists", (await menuBtn.count()) > 0);
const vis = await menuBtn.evaluate((el) => getComputedStyle(el).opacity).catch(() => "0");
check("and is visible when the row is hovered", parseFloat(vis) > 0.9, `opacity ${vis}`);
const box = await menuBtn.boundingBox();
check("with a hit target a finger can land on", box && box.width >= 20 && box.height >= 20,
  box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "no box");

/* ------------------------------------------------------------------ */
console.log("\n--- 2. A LEAF TASK CAN TAKE A SUB-TASK ---");
/* ------------------------------------------------------------------ */
const first = await addSubTask("Cut selects", "Smartphone pop animation");
check("Add sub-task opens an input", first.appeared);
check("and the sub-task is created under it", first.created);
if (first.created) {
  check("nested one level below its parent", (await depthOf("Smartphone pop animation")) === (await depthOf("Cut selects")) + 1,
    `parent d${await depthOf("Cut selects")} → child d${await depthOf("Smartphone pop animation")}`);
  check("the POST carried the parent id", sent.some((s) => s.startsWith("POST /api/tasks") && /parentTaskId/.test(s)),
    sent.filter((s) => s.startsWith("POST /api/tasks")).slice(-1)[0] || "none");
}

/* ------------------------------------------------------------------ */
console.log("\n--- 3. THE REAL SHAPE: FOUR LEVELS OF BREAKDOWN ---");
/* ------------------------------------------------------------------ */
// Cut selects > Smartphone pop animation > 3D model > Materials > Turntable
const deep = await addViaPlus("Smartphone pop animation", "3D model the phone");
check("the + on a row opens the add line under it", deep.appeared);
check("a sub-task takes a sub-task of its own", deep.created);
const deeper = await addViaPlus("3D model the phone", "Materials & shaders");
check("and that one takes another", deeper.created);
const deepest = await addViaPlus("Materials & shaders", "Turntable render");
check("four levels below the project", deepest.created);
if (deepest.created) {
  check("depth is carried all the way down", (await depthOf("Turntable render")) === (await depthOf("Cut selects")) + 4,
    `d${await depthOf("Turntable render")}`);
}

/* ------------------------------------------------------------------ */
console.log("\n--- 4. ADDING SIBLINGS IS FAST ---");
/* ------------------------------------------------------------------ */
// The add row stays open after each Enter so a breakdown is one burst of
// typing, not five trips through the menu.
const openInput = p.locator("tr.pt-addrow.open input.pt-inline-input").first();
check("the input stayed open after adding", await openInput.isVisible().catch(() => false));
if (await openInput.isVisible().catch(() => false)) {
  check("and kept focus", await openInput.evaluate((el) => el === document.activeElement));
  for (const t of ["Animate the pop", "Comp & grade"]) {
    await openInput.fill(t);
    await openInput.press("Enter");
    await p.waitForTimeout(800);
  }
  check("two more siblings went in without reopening anything",
    (await subRow("Animate the pop").count()) > 0 && (await subRow("Comp & grade").count()) > 0);
  await openInput.press("Escape");
  await p.waitForTimeout(200);
}

/* ------------------------------------------------------------------ */
console.log("\n--- 4b. THE BREAKDOWN IS NOT BURIED IN ITS OWN CHROME ---");
/* ------------------------------------------------------------------ */
// One closed "+ Add task" per project, at the foot. The earlier version put a
// permanent add row under every expanded branch: six levels deep that was six
// near-identical buttons in a column, and no way to tell which added where.
const closedAdders = await p.locator("tr.pt-addrow:not(.open)").count();
const projectsShown = await p.locator("tr.pt-row").count();
check("at most one standing add row per project", closedAdders <= projectsShown,
  `${closedAdders} add rows, ${projectsShown} projects`);
const deepTitles = await p.evaluate(() =>
  [...document.querySelectorAll("tr.pt-sub")].map((tr) => {
    const t = tr.querySelector(".pt-sub-title");
    const cell = tr.querySelector(".pt-sub-name");
    const inner = tr.querySelector(".pt-sub-inner");
    if (!t || !cell || !inner) return null;
    const used = [...inner.children].reduce((s2, el) => s2 + el.getBoundingClientRect().width, 0);
    return { depth: +tr.getAttribute("data-depth"), free: Math.round(cell.getBoundingClientRect().width - used - 14) };
  }).filter(Boolean)
);
const squeezed = deepTitles.filter((r) => r.free < 0);
check("the name column still has room at every depth", squeezed.length === 0,
  squeezed.length ? `depth ${squeezed[0].depth} is ${squeezed[0].free}px over` : `deepest d${Math.max(...deepTitles.map((r) => r.depth))}, ${Math.min(...deepTitles.map((r) => r.free))}px spare`);

/* ------------------------------------------------------------------ */
console.log("\n--- 5. THE ROLLUP COUNTS THE LEAVES ---");
/* ------------------------------------------------------------------ */
const count = await subRow("Cut selects").locator(".pt-sub-count").first().innerText().catch(() => "");
check("the parent shows how much of its branch is done", /^\d+\/\d+$/.test(count.trim()), count.trim() || "no count");

/* ------------------------------------------------------------------ */
console.log("\n--- 6. NOTHING FELL OUT OF THE COLUMN GRID ---");
/* ------------------------------------------------------------------ */
const drift = await p.evaluate(() => {
  const head = [...document.querySelectorAll("table.pt-table thead th")].map((th) => {
    const r = th.getBoundingClientRect();
    return r.left + r.width / 2;
  });
  const bad = [];
  for (const tr of document.querySelectorAll("tr.pt-sub")) {
    const cells = [...tr.children];
    if (cells.length !== head.length) continue;
    cells.forEach((td, i) => {
      const r = td.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - head[i]);
      if (d > 2) bad.push(`col ${i} off by ${Math.round(d)}px`);
    });
  }
  return [...new Set(bad)];
});
check("every sub-task cell is centred under its header", drift.length === 0, drift.slice(0, 3).join(" | "));
const xscroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal scrollbar at 1440", xscroll <= 0, `${xscroll}px`);

/* ------------------------------------------------------------------ */
console.log("\n--- 7. THE SAME FLOW ON A PHONE ---");
/* ------------------------------------------------------------------ */
await p.setViewportSize({ width: 390, height: 844 });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);
await expandProject("Studio Reel 2026");
const phoneMenu = subRow("Cut selects").locator(".pt-menu-btn").first();
const pv = await phoneMenu.evaluate((el) => getComputedStyle(el).opacity).catch(() => "0");
check("the menu is visible without a hover", parseFloat(pv) > 0.9, `opacity ${pv}`);
const pbox = await phoneMenu.boundingBox();
check("its tap target is at least 24px", pbox && pbox.width >= 24 && pbox.height >= 24,
  pbox ? `${Math.round(pbox.width)}x${Math.round(pbox.height)}` : "no box");
const phonePlus = subRow("Cut selects").locator(".pt-add-btn").first();
const ppb = await phonePlus.boundingBox();
check("the + is a real tap target too", ppb && ppb.width >= 24 && ppb.height >= 24,
  ppb ? `${Math.round(ppb.width)}x${Math.round(ppb.height)}` : "no box");
const phoneAdd = await addSubTask("Cut selects", "Phone-added sub-task");
check("a sub-task can be added on a phone", phoneAdd.created);
// The card is a card, not a table that came apart: label/value pairs on the
// same two-column grid the project card above it uses.
const cardShape = await p.evaluate(() => {
  const tr = document.querySelector("tr.pt-sub");
  if (!tr) return null;
  const cs = getComputedStyle(tr);
  const cols = cs.gridTemplateColumns.split(" ").length;
  // Hidden cells report left:0 — Updated and Next task are display:none at
  // this width — and counting them makes a correct two-column card look like
  // a three-column one.
  const labelled = [...tr.children].filter(
    (td) => td.hasAttribute("data-label") && td.getBoundingClientRect().width > 0
  );
  const lefts = new Set(labelled.map((td) => Math.round(td.getBoundingClientRect().left)));
  return { display: cs.display, cols, distinctLefts: lefts.size };
});
check("a sub-task renders as a two-column card", cardShape?.display === "grid" && cardShape.cols === 2,
  cardShape ? `${cardShape.display}, ${cardShape.cols} cols` : "no row");
check("its fields line up in two columns, not a ragged run", (cardShape?.distinctLefts ?? 9) <= 2,
  `${cardShape?.distinctLefts} distinct left edges`);
const pscroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal scrollbar at 390", pscroll <= 1, `${pscroll}px`);

console.log(`\nerrors: ${errs.length ? errs.join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
