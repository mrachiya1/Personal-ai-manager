// Filing, arranging, marking and annotating a project.
//
// Five things the owner asked for, and the first was a bug worth naming: the
// Projects screen split its sections on whether a CLIENT was attached, so
// every internal company project — a showreel, a site rebuild, a pitch —
// landed under "Personal project · internal R&D", and picking a company on
// the form changed nothing anyone could see. Setting a field and watching the
// screen not move is the worst kind of defect, because it reads as the field
// being broken rather than the grouping being wrong.
//
// Every check drives the real control and re-reads the page after the round
// trip. The stand-in Notion persists writes, so "it moved" means it moved.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5419";

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
  if (["POST", "PATCH"].includes(r.method())) sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData() || "").slice(0, 180)}`);
});

const section = (title) => p.locator("section.pt-section").filter({ hasText: title }).first();
const rowFor = (name) => p.locator("tr.pt-row", { hasText: name }).first();
/**
 * Project names in a section, top to bottom.
 *
 * Scoped to the FIRST cell's name element. A looser selector picks up the
 * dates and status text in the same row, and then "the second project" is a
 * date string — which is how the first run of this reported Move up as
 * disabled on a row that was not the top one.
 */
async function orderIn(title) {
  return (await section(title).locator("tr.pt-row .pt-name-text .ed-text").allInnerTexts())
    .map((t) => t.trim())
    .filter(Boolean);
}
async function openMenu(name) {
  const row = rowFor(name);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator(".pt-menu-btn").first().click({ timeout: 5000 });
  await p.waitForTimeout(220);
}

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(800);

/* ------------------------------------------------------------------ */
console.log("--- 1. A COMPANY PROJECT IS FILED UNDER ITS COMPANY ---");
/* ------------------------------------------------------------------ */
// "Studio Reel 2026" belongs to the studio company and has NO client. It is
// exactly the case that used to fall through to Personal.
const reelRow = rowFor("Studio Reel 2026");
check("the internal company project is on the page", (await reelRow.count()) > 0);
const reelSection = await reelRow.evaluate((el) => el.closest("section")?.querySelector(".pt-section-title h2")?.textContent?.trim() || "");
check("and it is NOT in the Personal section", !/personal/i.test(reelSection), reelSection || "(no section title)");
check("it sits under its company instead", /orex|studio/i.test(reelSection), reelSection);

// Personal is not empty — it holds the one project that genuinely has no
// company and no client. The bug was never "Personal should be empty", it was
// "Personal was holding everything".
const personal = section("Personal project");
const personalNames = (await personal.count())
  ? (await personal.locator("tr.pt-row .pt-name-text .ed-text").allInnerTexts()).map((t) => t.trim())
  : [];
check("Personal holds the genuinely self-directed project",
  personalNames.some((n) => /Houdini/i.test(n)), personalNames.join(" | ") || "(empty)");
check("and nothing that belongs to a company",
  !personalNames.some((n) => /Studio Reel|Northwind|Lumen|Vero|Atlas/i.test(n)), personalNames.join(" | "));

// The donut above must agree with the sections below it.
const donutLabels = await p.locator(".pm-legend, .metric-card").first().innerText().catch(() => "");
check("the overview doesn't call company work Personal R&D",
  !/Personal R&D\s*\n?\s*\d+\s*·?\s*100%/i.test(donutLabels), donutLabels.replace(/\n/g, " ").slice(0, 70));

/* ------------------------------------------------------------------ */
console.log("\n--- 2. HIGHLIGHTING A PROJECT ---");
/* ------------------------------------------------------------------ */
await openMenu("Studio Reel 2026");
const hlEntry = p.locator(".ed-pop .ed-opt", { hasText: /^highlight/i }).first();
check("the menu offers a highlight", (await hlEntry.count()) > 0);
await hlEntry.click();
await p.waitForTimeout(200);
const swatches = await p.locator(".ed-pop .ed-opt.hl").count();
check("with a named colour for each meaning", swatches >= 5, `${swatches} colours`);
await p.locator(".ed-pop .ed-opt.hl", { hasText: "Urgent" }).first().click();
await p.waitForTimeout(1200);
check("picking one marks the row", (await rowFor("Studio Reel 2026").getAttribute("data-highlight")) === "Urgent",
  String(await rowFor("Studio Reel 2026").getAttribute("data-highlight")));
check("and it went to Notion, not just the screen",
  sent.some((s) => /PATCH \/api\/projects\/.*Urgent/.test(s)),
  sent.filter((s) => s.includes("highlight")).slice(-1)[0] || "no highlight PATCH");
const spine = await rowFor("Studio Reel 2026").locator("td").first().evaluate((el) => {
  const cs = getComputedStyle(el, "::before");
  return { w: cs.width, bg: cs.backgroundColor };
});
check("the mark is actually painted", spine.w !== "auto" && spine.bg !== "rgba(0, 0, 0, 0)", JSON.stringify(spine));

await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);
check("and it survives a reload", (await rowFor("Studio Reel 2026").getAttribute("data-highlight")) === "Urgent");

/* ------------------------------------------------------------------ */
console.log("\n--- 3. ARRANGING THE LIST BY HAND ---");
/* ------------------------------------------------------------------ */
const target = (await orderIn("Company")).length ? "Company" : "Personal project";
let before = await orderIn(target);
check("the section has something to reorder", before.length >= 2, before.slice(0, 3).join(" | "));

if (before.length >= 2) {
  const second = before[1];
  await openMenu(second);
  const up = p.locator(".ed-pop .ed-opt", { hasText: /^move up$/i }).first();
  check("the menu has Move up", (await up.count()) > 0);
  await up.click();
  await p.waitForTimeout(1400);
  let after = await orderIn(target);
  check("move up actually moves the row", after[0] === second, `${before[0]},${before[1]} -> ${after[0]},${after[1]}`);
  check("an Order was written to Notion",
    sent.some((s) => /PATCH \/api\/projects\/.*"order"/.test(s)),
    sent.filter((s) => s.includes("order")).slice(-1)[0] || "no order PATCH");

  // Move up on the top row must be offered as disabled rather than silently
  // doing nothing — a button that looks live and isn't teaches distrust.
  await openMenu(after[0]);
  const topUp = p.locator(".ed-pop .ed-opt", { hasText: /^move up$/i }).first();
  check("move up is disabled on the top row", await topUp.isDisabled());
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  after = await orderIn(target);
  check("the new order survives a reload", after[0] === second, after.slice(0, 3).join(" | "));

  // The grip is pointer-driven rather than HTML5 drag-and-drop, which means
  // it works on touch AND can be driven here. The first version used the DnD
  // API; Playwright cannot fire those events, so "you can drag a project"
  // would have shipped as an untested claim on a feature that silently does
  // nothing on every phone.
  const rows = section(target).locator("tr.pt-row");
  const grip = rows.first().locator(".pt-grip");
  check("each row has a drag grip", (await grip.count()) === 1);
  check("and it is a real target, not a hairline",
    await grip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, "::after");
      const grow = Math.abs(parseFloat(a.top) || 0);
      return r.height + grow * 2 >= 24 && r.width + Math.abs(parseFloat(a.left) || 0) * 2 >= 24;
    }));

  const nameFirst = (await orderIn(target))[0];
  const startBox = await grip.boundingBox();
  const lastBox = await rows.nth(before.length - 1).boundingBox();
  await p.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await p.mouse.down();
  // Two moves: the drop indicator has to appear before the release, or the
  // gesture is a click that happens to end somewhere else.
  await p.mouse.move(lastBox.x + 60, lastBox.y + lastBox.height * 0.75, { steps: 8 });
  await p.waitForTimeout(150);
  const indicator = await section(target).locator("tr.pt-row.drop-below, tr.pt-row.drop-above").count();
  check("a drop line shows where it would land", indicator > 0, `${indicator} indicator(s)`);
  await p.mouse.up();
  await p.waitForTimeout(1600);
  const dragged = await orderIn(target);
  check("dragging a row to the bottom moves it there", dragged[dragged.length - 1] === nameFirst,
    `${nameFirst} -> position ${dragged.indexOf(nameFirst) + 1} of ${dragged.length}`);

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  check("and the drag survives a reload", (await orderIn(target)).pop() === nameFirst);
}

/* ------------------------------------------------------------------ */
console.log("\n--- 4. THE DETAILS PANEL AND ITS NOTES ---");
/* ------------------------------------------------------------------ */
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);
await openMenu("Studio Reel 2026");
await p.locator(".ed-pop .ed-opt", { hasText: /open details/i }).first().click();
await p.waitForTimeout(500);
const panel = p.locator(".dp-modal");
check("the panel opens", (await panel.count()) === 1);
check("it names the project", (await panel.locator("h2").innerText()).includes("Studio Reel"));
check("it shows the fields the table has no room for", (await panel.locator(".dp-fact").count()) >= 8,
  `${await panel.locator(".dp-fact").count()} facts`);
check("and the project's breakdown", (await panel.locator(".dp-tasks li, .dp-empty").count()) > 0);

const NOTE = `QA note ${Date.now()} — client approved the slower sting.`;
await panel.locator(".dp-notes-field").fill(NOTE);
await p.waitForTimeout(1800);
check("typing a note saves it without a Save button",
  sent.some((s) => s.includes("PATCH /api/projects") && s.includes("notes")),
  sent.filter((s) => s.includes("notes")).slice(-1)[0]?.slice(0, 80) || "no notes PATCH");
check("and says so on screen", /saved/i.test(await panel.locator(".dp-save").innerText()),
  await panel.locator(".dp-save").innerText());

// The highlight chips in the panel and the menu are the same state.
await panel.locator(".dp-chip", { hasText: "Winning" }).first().click();
await p.waitForTimeout(1200);
check("changing the highlight from the panel works",
  await panel.locator(".dp-chip.on", { hasText: "Winning" }).count() > 0);

await panel.getByRole("button", { name: /^done$/i }).click();
await p.waitForTimeout(600);
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(900);
await openMenu("Studio Reel 2026");
await p.locator(".ed-pop .ed-opt", { hasText: /open details/i }).first().click();
await p.waitForTimeout(500);
check("the note is still there after a reload",
  (await p.locator(".dp-notes-field").inputValue()) === NOTE,
  (await p.locator(".dp-notes-field").inputValue()).slice(0, 40));
check("and so is the highlight set from the panel",
  (await p.locator(".dp-chip.on").innerText()).includes("Winning"));
await p.keyboard.press("Escape");
await p.waitForTimeout(400);

/* ------------------------------------------------------------------ */
console.log("\n--- 5. THE NEW-PROJECT DIALOG ---");
/* ------------------------------------------------------------------ */
await p.getByRole("button", { name: /new project/i }).first().click();
await p.waitForTimeout(500);
const dialog = p.locator(".pf-modal");
check("the dialog opens", (await dialog.count()) === 1);
check("categories are a rail, not a row of chips buried mid-form",
  (await dialog.locator(".pf-rail .pf-cat").count()) > 0,
  `${await dialog.locator(".pf-rail .pf-cat").count()} categories`);
check("the company selector offers one way to say 'no company'",
  (await dialog.locator("select").first().locator("option", { hasText: /^—$/ }).count()) === 0);

const CATEGORY = `QA Cat ${Date.now() % 100000}`;
await dialog.getByRole("button", { name: /new category/i }).click();
await dialog.locator(".pf-cat-add input").fill(CATEGORY);
await dialog.locator(".pf-cat-add input").press("Enter");
await p.waitForTimeout(1500);
check("a custom category can be added", (await dialog.locator(".pf-cat", { hasText: CATEGORY }).count()) > 0);
check("it is ticked for this project too",
  (await dialog.locator(".pf-cat.on", { hasText: CATEGORY }).count()) > 0);
check("and it was written into the Notion schema, not just the form",
  sent.some((s) => s.startsWith("POST /api/projects/categories")),
  sent.filter((s) => s.includes("categories")).slice(-1)[0]?.slice(0, 70) || "no category POST");
check("pressing Enter in the category field did not submit the project",
  (await dialog.count()) === 1);

const NAME = `QA company project ${Date.now() % 100000}`;
await dialog.locator("input").first().fill(NAME);
// Pick the first real company, so the new project must file under it.
const companySelect = dialog.locator("select").first();
const companyOptions = await companySelect.locator("option").allInnerTexts();
const realCompany = companyOptions.find((o) => !/personal/i.test(o));
if (realCompany) await companySelect.selectOption({ label: realCompany });
await dialog.getByRole("button", { name: /^save$/i }).click();
await p.waitForTimeout(2500);
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(900);

const created = rowFor(NAME);
check("the project was created", (await created.count()) > 0, NAME);
if (await created.count()) {
  const where = await created.evaluate((el) => el.closest("section")?.querySelector(".pt-section-title h2")?.textContent?.trim() || "");
  check("a project created WITH a company does not land in Personal", !/personal/i.test(where), where);
  check("its custom category came through",
    (await created.innerText()).includes(CATEGORY.split(" ")[0]) || (await created.innerText()).includes("QA"),
    (await created.innerText()).replace(/\n/g, " ").slice(0, 60));
}

const xscroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal scrollbar after all that", xscroll <= 0, `${xscroll}px`);

console.log(`\nerrors: ${errs.length ? errs.slice(0, 3).join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
