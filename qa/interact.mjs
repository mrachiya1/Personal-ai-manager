import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });

await p.goto("http://localhost:5400/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(500);

console.log("--- FOLDERS TAB ---");
await p.getByRole("button", { name: "Folders", exact: true }).click();
await p.waitForTimeout(600);

const rows = p.locator(".pw-tree-row");
console.log("tree rows:", await rows.count());
for (let i = 0; i < Math.min(await rows.count(), 8); i++) {
  console.log(`  [${i}] ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
}

// Click a leaf (project) row and see whether the detail pane follows.
const leaves = p.locator(".pw-tree-row.lvl2");
console.log("project rows:", await leaves.count());
if (await leaves.count() > 1) {
  const before = await p.locator(".panel").nth(1).locator(".panel-title").innerText();
  await leaves.nth(1).click();
  await p.waitForTimeout(500);
  const after = await p.locator(".panel").nth(1).locator(".panel-title").innerText();
  console.log(`  detail before: "${before}"`);
  console.log(`  detail after : "${after}"`);
  console.log(`  SELECTION ${before === after ? "DID NOT CHANGE  <-- broken" : "changed  <-- works"}`);
  console.log(`  row marked selected: ${await p.locator(".pw-tree-row.on").count()}`);
}

// Collapse a company branch.
const branch = p.locator(".pw-tree-row.lvl0").first();
const beforeRows = await rows.count();
await branch.click();
await p.waitForTimeout(400);
const afterRows = await rows.count();
console.log(`  collapse: ${beforeRows} rows -> ${afterRows} rows ${beforeRows === afterRows ? "<-- broken" : "<-- works"}`);

console.log("\n--- INLINE PICKERS (All projects tab) ---");
await p.getByRole("button", { name: "All projects", exact: true }).click();
await p.waitForTimeout(500);

// Assignee first, untouched by any prior interaction.
const assignFirst = p.locator("table.dt tbody tr").first().locator("td").nth(2).locator(".pw-cell");
console.log("assignee cell found:", await assignFirst.count(), "text:", (await assignFirst.innerText()).trim());
await assignFirst.click();
await p.waitForTimeout(500);
console.log("assignee popover (isolated):", await p.locator(".pw-pop").count());
if (await p.locator(".pw-pop").count()) {
  const before = await p.locator(".pw-pop .pw-opt.on").count();
  await p.locator(".pw-pop .pw-opt").nth(3).click();
  await p.waitForTimeout(800);
  const stillOpen = await p.locator(".pw-pop").count();
  const after = await p.locator(".pw-pop .pw-opt.on").count();
  console.log(`  picked one: popover still open=${stillOpen} (want 1), selected ${before} -> ${after}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

// Status cell: open the popover, pick a different value, confirm it sticks.
const statusCell = p.locator("table.dt tbody tr").first().locator("td").nth(5).locator(".pw-cell");
await statusCell.click();
await p.waitForTimeout(400);
const popCount = await p.locator(".pw-pop").count();
console.log("status popover opened:", popCount);
if (popCount) {
  const opts = p.locator(".pw-pop .pw-opt");
  console.log("options:", await opts.count());
  const target = p.locator(".pw-pop .pw-opt", { hasText: "Planning" }).first();
  if (await target.count()) {
    await target.click();
    await p.waitForTimeout(900);
    console.log("cell now reads:", (await statusCell.innerText()).trim());
    console.log("popover still open:", await p.locator(".pw-pop").count());
  }
}

// Assignee: a multi-pick, where remount-on-render bites hardest.
const assignCell = p.locator("table.dt tbody tr").first().locator("td").nth(2).locator(".pw-cell");
await assignCell.click();
await p.waitForTimeout(400);
console.log("assignee popover opened:", await p.locator(".pw-pop").count());
const person = p.locator(".pw-pop .pw-opt").first();
if (await person.count()) {
  await person.click();
  await p.waitForTimeout(800);
  console.log("assignee popover still open after picking:", await p.locator(".pw-pop").count(), "(should stay open for multi-select)");
}

console.log("\n--- MULTI-PICK: can it take a SECOND value? ---");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
{
  const cell = p.locator("table.dt tbody tr").first().locator("td").nth(2).locator(".pw-cell");
  await cell.click();
  await p.waitForTimeout(400);
  const picks = [];
  for (const i of [0, 2, 4]) {
    const opt = p.locator(".pw-pop .pw-opt").nth(i);
    if (!(await opt.count())) break;
    await opt.click();
    await p.waitForTimeout(700);
    picks.push(`after pick ${picks.length + 1}: open=${await p.locator(".pw-pop").count()} selected=${await p.locator(".pw-pop .pw-opt.on").count()}`);
    if (!(await p.locator(".pw-pop").count())) break;
  }
  picks.forEach((l) => console.log("  " + l));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  console.log("  assignee cell now:", (await cell.innerText()).trim().replace(/\n/g, " "));
}

console.log("\n--- SEARCH BOX SURVIVES A PICK ---");
{
  const cell = p.locator("table.dt tbody tr").nth(1).locator("td").nth(2).locator(".pw-cell");
  await cell.click();
  await p.waitForTimeout(400);
  const search = p.locator(".pw-pop-search");
  if (await search.count()) {
    await search.fill("a");
    await p.waitForTimeout(300);
    const shown = await p.locator(".pw-pop .pw-opt").count();
    await p.locator(".pw-pop .pw-opt").first().click();
    await p.waitForTimeout(800);
    const kept = (await p.locator(".pw-pop-search").count()) ? await p.locator(".pw-pop-search").inputValue() : "(popover closed)";
    console.log(`  filtered to ${shown} options; search box after picking: "${kept}" (want "a")`);
  } else {
    console.log("  no search box found");
  }
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

console.log("\n--- NEW PROJECT MODAL: can you file it into a folder? ---");
await p.getByRole("button", { name: "New Project", exact: true }).first().click();
await p.waitForTimeout(600);
{
  const modal = p.locator(".modal");
  console.log("modal open:", await modal.count());
  const labels = await modal.locator(".form-field label").allInnerTexts();
  console.log("fields:", labels.join(" · "));
  const clientSel = modal.locator(".form-field", { hasText: "Client folder" }).locator("select");
  if (await clientSel.count()) {
    const opts = await clientSel.locator("option").allInnerTexts();
    console.log(`  client select: ${opts.length} options -> ${opts.slice(0, 5).join(", ")}`);
    if (opts.length > 1) {
      await clientSel.selectOption({ index: 1 });
      await p.waitForTimeout(200);
      const chosen = await clientSel.locator("option:checked").innerText();
      console.log(`  selected: "${chosen}" ${chosen === opts[1] ? "<-- works" : "<-- BROKEN"}`);
    }
  } else {
    console.log("  NO client select in the form  <-- broken");
  }
  const chips = modal.locator(".form-chip");
  console.log("  assignee chips:", await chips.count());
  if (await chips.count() > 1) {
    await chips.nth(0).click();
    await chips.nth(1).click();
    await p.waitForTimeout(300);
    console.log(`  chips selected after two clicks: ${await modal.locator(".form-chip.on").count()} (want 2)`);
  }
  // Save it and confirm the row lands under the chosen client.
  await modal.locator("input").first().fill("QA smoke project");
  await modal.locator("button[type=submit]").click();
  await p.waitForTimeout(1500);
  console.log("  modal closed after save:", (await p.locator(".modal").count()) === 0);
}

console.log("\nerrors:", errs.length ? errs.slice(0, 5).join(" | ") : "none");
await b.close();
