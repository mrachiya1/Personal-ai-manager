// Multi-level sub-tasks, rollup progress, thumbnails, and — the point of this
// round — that a sub-task's cells sit under the parent table's own headers.
//
// The alignment checks measure pixel centres rather than reading class names.
// "The status cell has the right class" and "the status cell is under the word
// Status" are different claims, and only the second one is what was wrong.
//
// The stand-in Notion persists writes, so every assertion re-reads the rendered
// page after a round trip rather than trusting a response body.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5414";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 200));
});
const sent = [];
p.on("request", (r) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) {
    sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData() || "").slice(0, 160)}`);
  }
});

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(600);

const rowFor = (name) => p.locator("tr.pt-row", { hasText: name }).first();
/**
 * The sub-task row whose NAME is `title`.
 *
 * Matching on the whole row would find the wrong one: a parent's "Next task"
 * cell holds its first open child's name, so `hasText("Lighting & Shading")`
 * matches the Shot 01 row — which sits earlier in the DOM and wins `.first()`.
 */
const subRow = (title) =>
  p.locator("tr.pt-sub").filter({ has: p.locator(".pt-sub-title", { hasText: title }) }).first();

async function expandProject(name) {
  const caret = rowFor(name).locator(".pt-caret").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(400);
}
/** Opens one sub-task if it isn't already — a blind click would close it. */
async function openNode(title) {
  const caret = subRow(title).locator(".pt-caret.sm").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(300);
}

/* ------------------------------------------------------------------ */
console.log("--- 1. NO HORIZONTAL SCROLLBAR ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");

const pageOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("the page itself does not scroll sideways", pageOverflow <= 0, `${pageOverflow}px`);

// The rule now: the table is exactly as wide as its frame, always. Every
// column is a share of 100% under a fixed layout and the wrapper has no
// overflow-x at all, so a horizontal scrollbar cannot appear even if a
// future change gets the sums wrong.
// What produces a visible scrollbar is an element that is BOTH scrollable in x
// and wider than its box. Measuring scrollWidth alone flags an overflow:visible
// wrapper whose child pokes out by six pixels — true, and invisible to the
// person looking at the screen. This checks the thing they can actually see.
const scrollables = await p.evaluate(() =>
  [...document.querySelectorAll("*")]
    .filter((el) => {
      const ox = getComputedStyle(el).overflowX;
      return (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60))
);
check("nothing on the page has a horizontal scrollbar", scrollables.length === 0, scrollables.join(" | "));

const tables = await p.$$eval("table.pt-table", (els) =>
  els.map((t) => ({ table: Math.round(t.getBoundingClientRect().width), frame: t.closest(".pt-scroll").clientWidth }))
);
check("every table is exactly as wide as its frame",
  tables.every((t) => Math.abs(t.table - t.frame) <= 1),
  tables.map((t) => `${t.table}/${t.frame}`).join(" "));
check("the wrapper cannot scroll sideways at all",
  await p.$$eval(".pt-scroll", (els) => els.every((el) => getComputedStyle(el).overflowX === "visible")));
check("no table carries a min-width", await p.evaluate(() =>
  [...document.querySelectorAll("table.pt-table")].every((t) => {
    const mw = getComputedStyle(t).minWidth;
    return !t.style.minWidth && (mw === "0px" || mw === "auto");
  })));

// Relations and computed properties are not columns — those were the empty
// ones pushing the width out.
const colHeads = await p.$eval("table.pt-table thead tr", (tr) => [...tr.children].map((th) => th.textContent.trim()));
check("no back-relation columns are rendered",
  !colHeads.some((h) => ["Goals", "Ideas", "Payments", "Tasks"].includes(h)), colHeads.join(" | "));
check("the client column is gone, folded into the project cell",
  !colHeads.includes("Client") && (await rowFor("Brand Relaunch Film").locator(".pt-subline .pt-client").count()) === 1,
  colHeads.join(" | "));
check("budget and payment are on the sub-line, not two columns",
  !colHeads.includes("Budget") && !colHeads.includes("Payment") &&
    (await rowFor("Brand Relaunch Film").locator(".pt-subline .pt-pay-dot").count()) === 1);
check("custom properties are not columns",
  !colHeads.includes("Invoiced") && !colHeads.includes("Staging URL"), colHeads.join(" | "));
check("exactly the ten columns the spec names", colHeads.length === 10, `${colHeads.length}: ${colHeads.join(" | ")}`);

/* ---- the seamless surface ---- */
const surfaces = await p.$$eval(".pt-section", (els) =>
  els.map((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow };
  })
);
check("no section is a card — no background of its own",
  surfaces.every((s2) => s2.bg === "rgba(0, 0, 0, 0)" || s2.bg === "transparent"),
  surfaces.map((s2) => s2.bg).join(" | "));
check("no section border or shadow",
  surfaces.every((s2) => s2.border === "0px" && s2.shadow === "none"),
  surfaces.map((s2) => `${s2.border}/${s2.shadow}`).join(" | "));
check("the table itself is transparent",
  (await p.$eval("table.pt-table", (t) => getComputedStyle(t).backgroundColor)) === "rgba(0, 0, 0, 0)");

/* ------------------------------------------------------------------ */
console.log("\n--- 2. SUB-TASKS SHARE THE PARENT'S COLUMN GRID ---");
/* ------------------------------------------------------------------ */
const headerCells = await p.$eval("table.pt-table thead tr", (tr) =>
  [...tr.children].reduce((n, th) => n + (th.colSpan || 1), 0)
);
const parentCells = await rowFor("Brand Relaunch Film").evaluate((tr) =>
  [...tr.children].reduce((n, td) => n + (td.colSpan || 1), 0)
);
const subCells = await subRow("Shot 01 Animation").evaluate((tr) =>
  [...tr.children].reduce((n, td) => n + (td.colSpan || 1), 0)
);
check("a sub-task row spans the same number of columns as the header", subCells === headerCells, `${subCells} vs ${headerCells}`);
check("and the same as its parent row", subCells === parentCells, `${subCells} vs ${parentCells}`);
check("sub-tasks are direct rows of the table, not a nested panel",
  (await p.locator("tr.pt-sub").first().evaluate((el) => el.parentElement.tagName)) === "TBODY");
check("the old full-width detail panel is gone", (await p.locator(".pt-detail-row, .pt-detail").count()) === 0);

/** Centre-x of a column, from a header cell and from a sub-task cell. */
async function centre(locator) {
  const box = await locator.boundingBox();
  return box ? Math.round(box.x + box.width / 2) : null;
}
for (const [label, headerText] of [
  ["Start", "Start"],
  ["Deadline", "Deadline"],
  ["Status", "Status"],
  ["Priority", "Priority"],
  ["Category", "Category"],
]) {
  const head = await centre(p.locator("table.pt-table thead th", { hasText: new RegExp(`^${headerText}$`) }).first());
  const cell = await centre(subRow("Shot 01 Animation").locator(`td[data-label="${label}"]`).first());
  check(
    `a sub-task's ${label} sits under the ${headerText} header`,
    head !== null && cell !== null && Math.abs(head - cell) <= 2,
    `header ${head} · cell ${cell}`
  );
}

/* ------------------------------------------------------------------ */
console.log("\n--- 3. INDENT, BRANCH LINE AND NESTING ---");
/* ------------------------------------------------------------------ */
const depth0 = await p.locator('tr.pt-sub[data-depth="0"]').count();
check("milestones render at depth 0", depth0 >= 3, String(depth0));
check("top-level milestones start expanded",
  (await subRow("Shot 01 Animation").locator(".pt-caret.sm").getAttribute("aria-expanded")) === "true");

const depth1 = await p.locator('tr.pt-sub[data-depth="1"]').count();
check("its sub-tasks render at depth 1", depth1 === 4, String(depth1));

check("a deeper node starts collapsed",
  (await subRow("Lighting & Shading").locator(".pt-caret.sm").getAttribute("aria-expanded")) === "false");
await openNode("Lighting & Shading");
const depth2 = await p.locator('tr.pt-sub[data-depth="2"]').count();
check("its own sub-items render at depth 2", depth2 === 2, String(depth2));

const padAt = (d) =>
  p.locator(`tr.pt-sub[data-depth="${d}"] .pt-sub-name`).first().evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
const [p0, p1, p2] = [await padAt(0), await padAt(1), await padAt(2)];
check("each level indents further than the one above", p2 > p1 && p1 > p0, `${p0} < ${p1} < ${p2}`);
check("a branch line is drawn on nested rows",
  await p.locator('tr.pt-sub[data-depth="2"] .pt-branch').first().evaluate((el) => getComputedStyle(el).display !== "none"));
check("and not on the top level",
  await p.locator('tr.pt-sub[data-depth="0"] .pt-branch').first().evaluate((el) => getComputedStyle(el).display === "none"));
check("a leaf has no caret button",
  (await subRow("Turntable pass").locator(".pt-caret.sm:not(.placeholder)").count()) === 0);

/* ------------------------------------------------------------------ */
console.log("\n--- 4. THE PROGRESS TRACK CLOSES THE GROUP ---");
/* ------------------------------------------------------------------ */
// Showreel leaves: tk1, tk2, tk3a, tk3b, tk3c1, tk3c2, tk3d, tk4 = 8.
// Done: tk1, tk2, tk3a, tk3b, tk3c1 = 5.  ->  5/8 = 63%
const bar = p.locator('tr.pt-progress-row.open .pt-progress i').first();
check("the bar reflects the leaf fraction (63%)", /63%/.test((await bar.getAttribute("style")) || ""), await bar.getAttribute("style"));
const barY = (await bar.boundingBox()).y;
const lastSubY = (await subRow("Final render + grade").boundingBox()).y;
check("and sits below the last sub-task rather than above them", barY > lastSubY, `${Math.round(barY)} > ${Math.round(lastSubY)}`);
check("it spans the full table width",
  (await p.locator("tr.pt-progress-row.open td").first().evaluate((td) => td.colSpan)) === headerCells);

const shotRoll = await subRow("Shot 01 Animation").locator(".pt-sub-count").innerText();
check("the milestone rolls up its whole branch (3/5)", shotRoll.trim() === "3/5", shotRoll.trim());
check("its sub-task rolls up its own two items (1/2)",
  (await subRow("Lighting & Shading").locator(".pt-sub-count").innerText()).trim() === "1/2");

/* ------------------------------------------------------------------ */
console.log("\n--- 5. SECTION GROUPINGS ---");
/* ------------------------------------------------------------------ */
const heads = await p.$$eval(".pt-section-head", (els) =>
  els.map((el) => ({
    eyebrow: el.querySelector(".pt-section-eyebrow")?.textContent?.trim() || "",
    title: el.querySelector("h2")?.textContent?.trim() || "",
  }))
);
check("client sections carry a 'Client project' eyebrow",
  heads.filter((h) => h.eyebrow === "Client project").length >= 2,
  heads.map((h) => `${h.eyebrow || "-"}/${h.title}`).join(" | "));
check("the personal section has no client eyebrow",
  heads.some((h) => h.title === "Personal project" && !h.eyebrow));
check("the personal section shows the same ten columns", await p.evaluate(() => {
  const sec = [...document.querySelectorAll(".pt-section")].find((s) => s.querySelector("h2")?.textContent?.includes("Personal"));
  const ths = [...sec.querySelectorAll("thead th")].map((t) => t.textContent.trim());
  return ths.length === 10 && !ths.includes("Client") && !ths.includes("Budget");
}));

/* ------------------------------------------------------------------ */
console.log("\n--- 6. TICKING THE LAST LEAF AUTO-COMPLETES ITS PARENT ---");
/* ------------------------------------------------------------------ */
await expandProject("Packaging Renders");
check("the parent starts open", (await subRow("Asset build").locator(".pt-caret.sm").getAttribute("aria-expanded")) === "true");
check("one of its two items is done", (await subRow("Asset build").locator(".pt-sub-count").innerText()).trim() === "1/2");

await subRow("Turntable renders").locator(".pt-check.sub").click();
await p.waitForTimeout(1800);
check("a toast explains the parent completed", /completed/i.test(await p.locator(".pt-toast").first().innerText().catch(() => "")),
  (await p.locator(".pt-toast").first().innerText().catch(() => "")).replace(/\n/g, " ").slice(0, 90));
check("the child PATCH went out", sent.some((s) => /PATCH \/api\/tasks\/tk6.*Done/.test(s)),
  sent.filter((s) => s.includes("/api/tasks/")).slice(-2).join(" || "));

await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
check("after a reload the parent really is Done in Notion",
  (await subRow("Asset build").locator('td[data-label="Status"] .ed-cell').innerText()).trim() === "Done",
  (await subRow("Asset build").locator('td[data-label="Status"] .ed-cell').innerText()).trim());
check("and its rollup reads 2/2", (await subRow("Asset build").locator(".pt-sub-count").innerText()).trim() === "2/2");

/* ------------------------------------------------------------------ */
console.log("\n--- 7. RE-OPENING A LEAF RE-OPENS THE PARENT ---");
/* ------------------------------------------------------------------ */
await subRow("Turntable renders").locator(".pt-check.sub").click();
await p.waitForTimeout(1800);
await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
check("the parent is no longer Done",
  (await subRow("Asset build").locator('td[data-label="Status"] .ed-cell').innerText()).trim() !== "Done",
  (await subRow("Asset build").locator('td[data-label="Status"] .ed-cell').innerText()).trim());

/* ------------------------------------------------------------------ */
console.log("\n--- 8. TICKING A PARENT TAKES ITS BRANCH ---");
/* ------------------------------------------------------------------ */
await subRow("Asset build").locator(".pt-check.sub").click();
await p.waitForTimeout(2200);
check("one PATCH carries the whole branch", sent.some((s) => /PATCH \/api\/tasks\/tk5 .*Done/.test(s)),
  sent.filter((s) => s.includes("/api/tasks/tk5")).slice(-1)[0] || "(none)");
check("the toast says how many went with it", /nested item/.test(await p.locator(".pt-toast").first().innerText().catch(() => "")),
  (await p.locator(".pt-toast").first().innerText().catch(() => "")).replace(/\n/g, " ").slice(0, 90));

await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
check("status and rollup now agree",
  (await subRow("Asset build").locator('td[data-label="Status"] .ed-cell').innerText()).trim() === "Done" &&
    (await subRow("Asset build").locator(".pt-sub-count").innerText()).trim() === "2/2");

/* ------------------------------------------------------------------ */
console.log("\n--- 9. THE INLINE ADD-TASK ROW ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");
await openNode("Shot 01 Animation");
await openNode("Lighting & Shading");

// Each project keeps ONE standing add row, at its foot. The version of this
// that put a permanent "+ Add sub-task" under every expanded branch produced
// six near-identical buttons in a column six levels down, with nothing to say
// which one added where. The + on each row replaced it: it sits against the
// task it acts on, and it is one click instead of two.
check("the project keeps one standing add row, at its foot",
  (await p.locator('tr.pt-addrow[data-parent=""]').count()) >= 1);
check("and it says 'Add task'",
  (await p.locator('tr.pt-addrow[data-parent=""]').first().locator(".pt-add-open").innerText()).trim() === "Add task");
check("no wall of add rows under the open branches",
  (await p.locator("tr.pt-addrow:not(.open)").count()) <= (await p.locator("tr.pt-row").count()),
  `${await p.locator("tr.pt-addrow:not(.open)").count()} add rows`);

await subRow("Lighting & Shading").hover();
await subRow("Lighting & Shading").locator(".pt-add-btn").first().click();
await p.waitForTimeout(300);
const deep = p.locator('tr.pt-addrow[data-parent="tk3c"]').first();
check("the + opens an add row nested under Lighting & Shading", (await deep.count()) === 1);
check("it is a row of the table, not a floating form",
  (await deep.evaluate((el) => el.tagName)) === "TR" &&
    (await deep.evaluate((el) => [...el.children].reduce((n, td) => n + (td.colSpan || 1), 0))) === headerCells);

const openAdder = p.locator('tr.pt-addrow.open[data-parent="tk3c"]').first();
// The name input must land in the Project column, not in a form below.
const nameCentre = await centre(openAdder.locator("td.pt-addrow-name"));
const projHead = await centre(p.locator("table.pt-table thead th").first());
check("the name input opens in the Project column", Math.abs(nameCentre - projHead) <= 3, `${nameCentre} vs ${projHead}`);

await openAdder.locator("td.pt-addrow-name input").fill("QA fourth-level item");
await openAdder.locator('.pt-inline-actions button:has-text("Add")').click();
await p.waitForTimeout(1700);
check("the POST carries a parentTaskId",
  /parentTaskId/.test(sent.filter((s) => s.startsWith("POST /api/tasks")).pop() || ""),
  (sent.filter((s) => s.startsWith("POST /api/tasks")).pop() || "").slice(0, 140));

await p.reload({ waitUntil: "networkidle" });
await expandProject("Brand Relaunch Film");
await openNode("Shot 01 Animation");
await openNode("Lighting & Shading");
check("it survived the round trip", (await subRow("QA fourth-level item").count()) === 1);
check("and sits under Lighting & Shading, not at the top",
  (await subRow("QA fourth-level item").getAttribute("data-depth")) === "2",
  await subRow("QA fourth-level item").getAttribute("data-depth"));
check("the branch rollup grew to 1/3",
  (await subRow("Lighting & Shading").locator(".pt-sub-count").innerText()).trim() === "1/3",
  (await subRow("Lighting & Shading").locator(".pt-sub-count").innerText()).trim());

/* ------------------------------------------------------------------ */
console.log("\n--- 10. AN ORPHAN IS SHOWN, NOT SWALLOWED ---");
/* ------------------------------------------------------------------ */
await expandProject("Studio Reel 2026");
check("a task whose parent is missing still renders", (await subRow("Orphaned grade pass").count()) === 1);
check("at the top level", (await subRow("Orphaned grade pass").getAttribute("data-depth")) === "0");
check("flagged rather than silently re-parented", (await subRow("Orphaned grade pass").locator(".pt-flag").count()) === 1);

/* ------------------------------------------------------------------ */
console.log("\n--- 11. THUMBNAILS ---");
/* ------------------------------------------------------------------ */
const projThumb = rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb").first();
check("the project name has a thumbnail cell", (await projThumb.count()) === 1);
check("it starts as a category placeholder", (await projThumb.locator(".thumb-ph svg").count()) === 1);
check("every sub-task row has one too", (await p.locator("tr.pt-sub .thumb").count()) > 0,
  String(await p.locator("tr.pt-sub .thumb").count()));

await projThumb.evaluate(async (el) => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVQI12P4//8/AzYEEwAAQIYDATtQvUUAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "qa-paste.png", { type: "image/png" }));
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
});
await p.waitForTimeout(1800);
check("a paste PUTs a downscaled data URL, not the raw file",
  /"thumb":"data:image\/jpeg;base64/.test(sent.filter((s) => s.includes("thumbnails")).slice(-1)[0] || ""));
check("the cell now shows an image", (await projThumb.locator("img").count()) === 1);

await p.reload({ waitUntil: "networkidle" });
check("the preview survives a reload", (await rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb img").count()) === 1);
await rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb").first().click();
await p.waitForTimeout(700);
check("clicking it opens a lightbox", (await p.locator(".lightbox img").count()) === 1);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("Escape closes it", (await p.locator(".lightbox").count()) === 0);

/* ------------------------------------------------------------------ */
console.log("\n--- 12. DELETING A BRANCH TAKES ITS CHILDREN ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");
const target = subRow("Shot 01 Animation");
await target.hover();
await target.locator(".pt-menu-btn").click();
await p.waitForTimeout(250);
check("the sub-task menu offers rename, add sub-task and delete",
  (await p.locator(".ed-pop .ed-opt").allInnerTexts()).join(" | ").includes("Rename"),
  (await p.locator(".ed-pop .ed-opt").allInnerTexts()).join(" | "));
await p.locator(".ed-pop .ed-opt.danger").click();
await p.waitForTimeout(1900);
check("the toast names how many nested items went",
  /nested item/.test(await p.locator(".pt-toast").first().innerText().catch(() => "")),
  (await p.locator(".pt-toast").first().innerText().catch(() => "")).replace(/\n/g, " ").slice(0, 90));
check("a DELETE was sent", sent.some((s) => s.startsWith("DELETE /api/tasks/tk3")));
await p.reload({ waitUntil: "networkidle" });
await expandProject("Brand Relaunch Film");
check("the branch is gone after a reload", (await subRow("Lighting & Shading").count()) === 0);
check("its siblings are untouched", (await subRow("Final render + grade").count()) === 1);

/* ------------------------------------------------------------------ */
console.log("\n--- 13. PHONE LAYOUT ---");
/* ------------------------------------------------------------------ */
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(500);
const phoneOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no sideways scroll on a phone", phoneOverflow <= 1, `${phoneOverflow}px`);
await expandProject("Studio Reel 2026");
// A card on the same two-column grid the project card above it uses. It was
// `display:block` with the cells as inline-blocks, which reflowed into a
// ragged run of label/value pairs — it read as a table that had come apart.
check("sub-tasks still render as labelled cards",
  (await p.locator("tr.pt-sub").first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.display === "grid" && cs.gridTemplateColumns.split(" ").length === 2;
  })));
check("and carry their own field labels",
  (await p.locator('tr.pt-sub td[data-label="Status"]').first().evaluate((el) =>
    getComputedStyle(el, "::before").content
  )).toLowerCase().includes("status"));

/* ------------------------------------------------------------------ */
console.log("\n--- 14. DROPDOWNS ARE REACHABLE ANYWHERE ON THE PAGE ---");
/* ------------------------------------------------------------------ */
// The reported bug: a status dropdown on the last row of the last section
// opened into an ancestor with overflow:hidden. The panel rendered and was
// clipped, so the options could not be clicked. This opens the very last one
// on the page and picks from it.
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(500);

const lastStatus = p.locator('tr.pt-row td[data-label="Status"] .ed-cell').last();
await lastStatus.scrollIntoViewIfNeeded();
const wasStatus = (await lastStatus.innerText()).trim();
await lastStatus.click();
await p.waitForTimeout(350);

const pop = p.locator(".ed-pop").first();
check("the panel opens", (await pop.count()) === 1);
check("it is a child of <body>, not of the cell",
  (await pop.evaluate((el) => el.parentElement?.tagName)) === "BODY");

const box = await pop.boundingBox();
const vp = p.viewportSize();
check("it is fully inside the viewport",
  box !== null && box.y >= 0 && box.x >= 0 && box.y + box.height <= vp.height + 1 && box.x + box.width <= vp.width + 1,
  box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} in ${vp.width}x${vp.height}` : "no box");
check("no ancestor clips it", await pop.evaluate((el) => {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const o = getComputedStyle(n).overflow;
    if (o.includes("hidden") || o.includes("clip")) return false;
    n = n.parentElement;
  }
  return true;
}));

const opts = pop.locator(".ed-opt");
check("its options are there", (await opts.count()) > 1, String(await opts.count()));
// The real test: click one and see the value change.
const pick = opts.filter({ hasText: /Delivered|Production|Planning|Idea/ }).first();
const wanted = (await pick.innerText()).trim();
await pick.click();
await p.waitForTimeout(1400);
const nowStatus = (await lastStatus.innerText()).trim();
check(`picking "${wanted}" actually changes the cell`, nowStatus.startsWith(wanted), `${wasStatus} -> ${nowStatus}`);
check("a PATCH went out", sent.some((s2) => s2.includes("/api/projects/") && s2.includes(wanted)),
  sent.filter((s2) => s2.includes("/api/projects/")).slice(-1)[0] || "(none)");

// And the same for a section card, which is what actually had the clip.
check("no projects section clips its children",
  await p.$$eval(".pt-section", (els) => els.every((el) => !getComputedStyle(el).overflow.includes("hidden"))));

/* ---- an empty cell reads as empty, not as a repeated column label ---- */
const placeholders = await p.$$eval("tr.pt-row .ed-cell.empty", (els) => els.map((el) => el.textContent.trim()));
check("empty cells show an em dash, not the column's name",
  !placeholders.some((t) => /^(Start|Deadline|Tag|Assign)/.test(t)),
  [...new Set(placeholders)].join(" | "));

console.log(`\nerrors: ${errs.length ? errs.join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
