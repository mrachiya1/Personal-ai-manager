// Multi-level sub-tasks, rollup progress and thumbnails, driven in a browser.
//
// The stand-in Notion persists writes, so every assertion here re-reads the
// rendered page after a round trip rather than trusting the response body. That
// matters most for the rollup: "the API said it cascaded" and "the milestone row
// now shows Done" are different claims, and only the second one is the feature.

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
const ctx = await b.newContext({ viewport: { width: 1560, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 200));
});
const sent = [];
p.on("request", (r) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) {
    sent.push(`${r.method()} ${new URL(r.url()).pathname} ${(r.postData() || "").slice(0, 150)}`);
  }
});

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(600);

/** The project row whose name cell contains `name`. */
const rowFor = (name) => p.locator("tr.pt-row", { hasText: name }).first();
async function expandProject(name) {
  const row = rowFor(name);
  const caret = row.locator(".pt-caret").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(350);
}

/**
 * Opens one node inside a tree, if it isn't already.
 *
 * Top-level nodes start expanded, so a blind click closes them — which is
 * exactly the bug this helper exists to stop the test from writing.
 */
async function openNode(scope, title) {
  const row = scope.locator(".tt-row", { hasText: title }).first();
  const caret = row.locator(".tt-caret").first();
  if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
  await p.waitForTimeout(300);
  return row;
}

/* ------------------------------------------------------------------ */
console.log("--- 1. SCHEMA SYNC ---");
/* ------------------------------------------------------------------ */
const notes = (await p.locator(".pt-schema-note").allInnerTexts()).join(" | ");
check("no Tasks-schema warning", !/Couldn.t sync the Tasks schema/.test(notes), notes.slice(0, 120) || "(no notes)");

/* ------------------------------------------------------------------ */
console.log("\n--- 2. FOUR LEVELS OF NESTING ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");
const tree = p.locator(".tt").first();
check("the breakdown panel opened", (await tree.count()) === 1);
check("it says how deep the work goes", (await tree.locator(".tt-depth-note").innerText()).includes("levels"),
  await tree.locator(".tt-depth-note").innerText().catch(() => ""));

// Level 0 rows are visible; the deeper ones need their carets.
const depth0 = await tree.locator('.tt-row[data-depth="0"]').count();
check("milestones render at depth 0", depth0 >= 3, String(depth0));

const shot = tree.locator(".tt-row", { hasText: "Shot 01 Animation" }).first();
check("a milestone with children has a caret", (await shot.locator(".tt-caret:not(.placeholder)").count()) === 1);
check("top-level milestones start expanded", (await shot.locator(".tt-caret").getAttribute("aria-expanded")) === "true");
const depth1 = await tree.locator('.tt-row[data-depth="1"]').count();
check("its sub-tasks render at depth 1", depth1 === 4, String(depth1));

const lighting = tree.locator('.tt-row[data-depth="1"]', { hasText: "Lighting & Shading" }).first();
check("a deeper node starts collapsed", (await lighting.locator(".tt-caret").getAttribute("aria-expanded")) === "false");
await lighting.locator(".tt-caret").click();
await p.waitForTimeout(300);
const depth2 = await tree.locator('.tt-row[data-depth="2"]').count();
check("its own sub-items render at depth 2", depth2 === 2, String(depth2));
check("the third level is indented further than the second",
  (await tree.locator('.tt-row[data-depth="2"]').first().evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))) >
    (await tree.locator('.tt-row[data-depth="1"]').first().evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))));
check("a connecting guideline is drawn on nested rows",
  await tree.locator('.tt-row[data-depth="2"] .tt-rail').first().evaluate((el) => getComputedStyle(el).display !== "none"));
check("and not on the top level",
  await tree.locator('.tt-row[data-depth="0"] .tt-rail').first().evaluate((el) => getComputedStyle(el).display === "none"));
check("a leaf has no caret button", (await tree.locator('.tt-row[data-depth="2"]', { hasText: "Turntable pass" }).first().locator(".tt-caret:not(.placeholder)").count()) === 0);

/* ------------------------------------------------------------------ */
console.log("\n--- 3. ROLLUP MATHS ON SCREEN ---");
/* ------------------------------------------------------------------ */
// Showreel leaves: tk1, tk2, tk3a, tk3b, tk3c1, tk3c2, tk3d, tk4 = 8.
// Done: tk1, tk2, tk3a, tk3b, tk3c1 = 5.  ->  5/8 = 63%
const headCount = await tree.locator(".pt-detail-count").innerText();
check("the panel counts leaves, not rows", headCount.trim() === "5/8 done", headCount.trim());

// The progress row is the sibling immediately after this project's row, not
// whichever one happens to be first in the table.
const width = await p
  .locator('tr.pt-row:has-text("Brand Relaunch Film") + tr.pt-progress-row .pt-progress i')
  .first()
  .getAttribute("style");
check("the project bar reflects the leaf fraction (63%)", /63%/.test(width || ""), width || "");

const shotRoll = await tree.locator(".tt-row", { hasText: "Shot 01 Animation" }).first().locator(".tt-roll-num").innerText();
check("the milestone rolls up its whole branch (3/5)", shotRoll.trim() === "3/5", shotRoll.trim());
const lightingRoll = await lighting.locator(".tt-roll-num").innerText();
check("its sub-task rolls up its own two items (1/2)", lightingRoll.trim() === "1/2", lightingRoll.trim());

/* ------------------------------------------------------------------ */
console.log("\n--- 4. TICKING THE LAST LEAF AUTO-COMPLETES ITS PARENT ---");
/* ------------------------------------------------------------------ */
await expandProject("Packaging Renders");
const packTree = p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".tt").first();
const assetBuild = packTree.locator(".tt-row", { hasText: "Asset build" }).first();
check("the parent starts open", (await assetBuild.locator(".tt-caret").getAttribute("aria-expanded")) === "true");
const before = await assetBuild.locator(".tt-roll-num").innerText();
check("one of its two items is done", before.trim() === "1/2", before.trim());

await packTree.locator(".tt-row", { hasText: "Turntable renders" }).first().locator(".tt-check").click();
await p.waitForTimeout(1800);

const cascadeToast = await p.locator(".pt-toast, .toast").first().innerText().catch(() => "");
check("a toast explains the parent completed", /completed/i.test(cascadeToast), cascadeToast.replace(/\n/g, " ").slice(0, 90));
check("the child PATCH went out", sent.some((s) => /PATCH \/api\/tasks\/tk6.*Done/.test(s)),
  sent.filter((s) => s.includes("/api/tasks/")).slice(-2).join(" || "));

await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
const afterTree = p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".tt").first();
const afterParent = afterTree.locator(".tt-row", { hasText: "Asset build" }).first();
check("after a reload the parent really is Done in Notion",
  (await afterParent.locator(".tt-status .ed-cell").innerText()).trim() === "Done",
  (await afterParent.locator(".tt-status .ed-cell").innerText()).trim());
check("and its rollup reads 2/2", (await afterParent.locator(".tt-roll-num").innerText()).trim() === "2/2");
check("the project bar moved with it",
  /100%/.test((await p.locator("tr.pt-row", { hasText: "Packaging Renders" }).locator("..").locator(".pt-progress i").first().getAttribute("style")) || "") ||
    (await p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".pt-detail-count").innerText()).includes("2/2"));

/* ------------------------------------------------------------------ */
console.log("\n--- 5. RE-OPENING A LEAF RE-OPENS THE PARENT ---");
/* ------------------------------------------------------------------ */
await afterTree.locator(".tt-row", { hasText: "Turntable renders" }).first().locator(".tt-check").click();
await p.waitForTimeout(1800);
await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
const reopened = p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".tt").first().locator(".tt-row", { hasText: "Asset build" }).first();
check("the parent is no longer Done",
  (await reopened.locator(".tt-status .ed-cell").innerText()).trim() !== "Done",
  (await reopened.locator(".tt-status .ed-cell").innerText()).trim());

/* ------------------------------------------------------------------ */
console.log("\n--- 5b. TICKING A PARENT TAKES ITS BRANCH ---");
/* ------------------------------------------------------------------ */
// Otherwise the row reads "Done" directly above its own rollup reading 1/2.
const parentTree = p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".tt").first();
await parentTree.locator(".tt-row", { hasText: "Asset build" }).first().locator(".tt-check").click();
await p.waitForTimeout(2200);
check("one PATCH carries the whole branch", sent.some((s) => /PATCH \/api\/tasks\/tk5 .*Done/.test(s)),
  sent.filter((s) => s.includes("/api/tasks/tk5")).slice(-1)[0] || "(none)");
const branchToast = await p.locator(".pt-toast").first().innerText().catch(() => "");
check("the toast says how many went with it", /nested item/.test(branchToast), branchToast.replace(/\n/g, " ").slice(0, 90));

await p.reload({ waitUntil: "networkidle" });
await expandProject("Packaging Renders");
const branchTree = p.locator(".pt-detail-row", { hasText: "Turntable renders" }).locator(".tt").first();
const branchParent = branchTree.locator(".tt-row", { hasText: "Asset build" }).first();
check("status and rollup now agree",
  (await branchParent.locator(".tt-status .ed-cell").innerText()).trim() === "Done" &&
    (await branchParent.locator(".tt-roll-num").innerText()).trim() === "2/2",
  `${(await branchParent.locator(".tt-status .ed-cell").innerText()).trim()} · ${(await branchParent.locator(".tt-roll-num").innerText()).trim()}`);
const childStatuses = await branchTree.locator('.tt-row[data-depth="1"] .tt-status .ed-cell').allInnerTexts();
check("every child came with it", childStatuses.every((s) => s.trim() === "Done"), childStatuses.join(" | "));

/* ------------------------------------------------------------------ */
console.log("\n--- 6. ADDING A SUB-TASK AT DEPTH ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");
const showTree = p.locator(".pt-detail-row", { hasText: "Shot 01 Animation" }).locator(".tt").first();
await openNode(showTree, "Shot 01 Animation");
await openNode(showTree, "Lighting & Shading");

// The add form nested under Lighting & Shading — the deepest one on screen.
const addButtons = showTree.locator(".tt-add-open");
check("every level offers its own add button", (await addButtons.count()) >= 3, String(await addButtons.count()));
const deepWrap = showTree.locator('.tt-add-wrap[data-depth="2"]').first();
check("the deepest one is nested under Lighting & Shading", (await deepWrap.getAttribute("data-parent")) === "tk3c",
  await deepWrap.getAttribute("data-parent"));
check("and says 'Add sub-task'", (await deepWrap.locator(".tt-add-open").innerText()).trim() === "Add sub-task",
  (await deepWrap.locator(".tt-add-open").innerText()).trim());
check("the top-level one still says 'Add task'",
  (await showTree.locator('.tt-add-wrap[data-depth="0"] .tt-add-open').innerText()).trim() === "Add task");
await deepWrap.locator(".tt-add-open").click();
await deepWrap.locator(".tt-add-name").fill("QA fourth-level item");
await deepWrap.locator('.tt-add button[type="submit"]').click();
await p.waitForTimeout(1600);

const postBody = sent.filter((s) => s.startsWith("POST /api/tasks")).pop() || "";
check("the POST carries a parentTaskId", /parentTaskId/.test(postBody), postBody.slice(0, 140));
await p.reload({ waitUntil: "networkidle" });
await expandProject("Brand Relaunch Film");
const reTree = p.locator(".pt-detail-row", { hasText: "Shot 01 Animation" }).locator(".tt").first();
await openNode(reTree, "Shot 01 Animation");
await openNode(reTree, "Lighting & Shading");
const added = reTree.locator(".tt-row", { hasText: "QA fourth-level item" }).first();
check("it survived the round trip", (await added.count()) === 1);
check("and sits under Lighting & Shading, not at the top", (await added.getAttribute("data-depth")) === "2",
  await added.getAttribute("data-depth"));
check("the branch rollup grew to 1/3", (await reTree.locator('.tt-row[data-depth="1"]', { hasText: "Lighting & Shading" }).first().locator(".tt-roll-num").innerText()).trim() === "1/3",
  (await reTree.locator('.tt-row[data-depth="1"]', { hasText: "Lighting & Shading" }).first().locator(".tt-roll-num").innerText()).trim());

/* ------------------------------------------------------------------ */
console.log("\n--- 7. AN ORPHAN IS SHOWN, NOT SWALLOWED ---");
/* ------------------------------------------------------------------ */
await expandProject("Studio Reel 2026");
const orphanTree = p.locator(".pt-detail-row", { hasText: "Cut selects" }).locator(".tt").first();
const orphan = orphanTree.locator(".tt-row", { hasText: "Orphaned grade pass" }).first();
check("a task whose parent is missing still renders", (await orphan.count()) === 1);
check("at the top level", (await orphan.getAttribute("data-depth")) === "0");
check("flagged rather than silently re-parented", (await orphan.locator(".tt-detached").count()) === 1);

/* ------------------------------------------------------------------ */
console.log("\n--- 8. THUMBNAILS ---");
/* ------------------------------------------------------------------ */
const projThumb = rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb").first();
check("the project name has a thumbnail cell", (await projThumb.count()) === 1);
check("it starts as a category placeholder", (await projThumb.locator(".thumb-ph svg").count()) === 1);
check("it is a rounded square", await projThumb.evaluate((el) => {
  const cs = getComputedStyle(el);
  return parseFloat(cs.borderRadius) >= 6 && Math.abs(el.clientWidth - el.clientHeight) <= 1 && el.clientWidth >= 32;
}));
const taskThumbs = await p.locator(".tt-thumb .thumb").count();
check("every task row has one too", taskThumbs > 0, String(taskThumbs));

// A real paste: a 4x4 PNG through a synthetic ClipboardEvent, which is the
// same path Ctrl+V takes.
const pasted = await projThumb.evaluate(async (el) => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVQI12P4//8/AzYEEwAAQIYDATtQvUUAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const file = new File([bytes], "qa-paste.png", { type: "image/png" });
  const dt = new DataTransfer();
  dt.items.add(file);
  const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return true;
});
check("a paste event was dispatched at the cell", pasted);
await p.waitForTimeout(1800);
check("it PUT the image to the thumbnail store", sent.some((s) => s.startsWith("PUT /api/thumbnails/")),
  sent.filter((s) => s.includes("thumbnails")).slice(-1)[0] || "(none)");
check("the request carried a downscaled data URL, not the raw file",
  /"thumb":"data:image\/jpeg;base64/.test(sent.filter((s) => s.includes("thumbnails")).slice(-1)[0] || ""));
check("the cell now shows an image", (await projThumb.locator("img").count()) === 1);

await p.reload({ waitUntil: "networkidle" });
check("the preview survives a reload", (await rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb img").count()) === 1);

await rowFor("Brand Relaunch Film").locator(".pt-thumb .thumb").first().click();
await p.waitForTimeout(700);
check("clicking it opens a lightbox", (await p.locator(".lightbox").count()) === 1);
check("the lightbox shows the full image", (await p.locator(".lightbox img").count()) === 1);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("Escape closes it", (await p.locator(".lightbox").count()) === 0);

/* ------------------------------------------------------------------ */
console.log("\n--- 9. DELETING A BRANCH TAKES ITS CHILDREN ---");
/* ------------------------------------------------------------------ */
await expandProject("Brand Relaunch Film");
const delTree = p.locator(".pt-detail-row", { hasText: "Shot 01 Animation" }).locator(".tt").first();
const target = delTree.locator(".tt-row", { hasText: "Shot 01 Animation" }).first();
await target.hover();
await target.locator(".tt-del").click();
await p.waitForTimeout(1800);
const delToast = await p.locator(".pt-toast, .toast").first().innerText().catch(() => "");
check("the toast names how many nested items went", /nested item/.test(delToast), delToast.replace(/\n/g, " ").slice(0, 90));
check("a DELETE was sent", sent.some((s) => s.startsWith("DELETE /api/tasks/tk3")), sent.filter((s) => s.startsWith("DELETE")).join(" || "));
await p.reload({ waitUntil: "networkidle" });
await expandProject("Brand Relaunch Film");
const gone = p.locator(".pt-detail-row").first();
check("the branch is gone after a reload", (await gone.locator(".tt-row", { hasText: "Lighting & Shading" }).count()) === 0);
check("its siblings are untouched", (await gone.locator(".tt-row", { hasText: "Final render + grade" }).count()) === 1);

console.log(`\nerrors: ${errs.length ? errs.join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
