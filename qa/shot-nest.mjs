// Builds the user's own shape — Showreel > phone pop > model > materials >
// animate > render — and photographs it at three widths, plus a width probe
// on the title so "it fits" is a number rather than an impression.

import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:5417";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: "dark" });
const p = await ctx.newPage();

const rowFor = (n) => p.locator("tr.pt-row", { hasText: n }).first();
const subRow = (t) => p.locator("tr.pt-sub").filter({ has: p.locator(".pt-sub-title", { hasText: t }) }).first();

await p.goto(BASE + "/projects", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
const caret = rowFor("Studio Reel 2026").locator(".pt-caret").first();
if ((await caret.getAttribute("aria-expanded")) !== "true") await caret.click();
await p.waitForTimeout(500);

async function addUnder(parent, title) {
  const row = subRow(parent);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator(".pt-add-btn").first().click();
  await p.waitForTimeout(350);
  const input = p.locator("tr.pt-addrow.open input.pt-inline-input").first();
  await input.fill(title);
  await input.press("Enter");
  await p.waitForTimeout(850);
  await input.press("Escape").catch(() => {});
  await p.waitForTimeout(150);
}

const chain = [
  ["Cut selects", "Smartphone pop animation"],
  ["Smartphone pop animation", "3D model the phone"],
  ["3D model the phone", "Materials and shaders"],
  ["Materials and shaders", "Animate the pop"],
  ["Animate the pop", "Final render and denoise"],
];
for (const [parent, child] of chain) await addUnder(parent, child);

// A couple of siblings so the branch reads as a breakdown, not a chain.
await addUnder("3D model the phone", "UV unwrap");
await addUnder("3D model the phone", "Hard-surface details");

await p.waitForTimeout(500);
const measure = await p.evaluate(() => {
  // Measure what the person actually experiences: does the title's own text
  // fit in the space the cell leaves it, and how much room is left over.
  //
  // An earlier version compared the title WRAPPER's scrollWidth to its
  // clientWidth and reported every row as truncated, including ones with
  // 80px of slack — the wrapper is a flex item sized to its content, so that
  // comparison is always true and says nothing. The text node is the thing
  // that gets cut.
  const cellWidth = document.querySelector("tr.pt-sub .pt-sub-name")?.getBoundingClientRect().width;
  const out = [{ depth: "—", name: "[name column]", textPx: Math.round(cellWidth || 0), freePx: 0, cut: false }];
  for (const tr of document.querySelectorAll("tr.pt-sub")) {
    const wrap = tr.querySelector(".pt-sub-title");
    const inner = wrap?.querySelector(".ed-cell, .ed-text") || wrap?.firstElementChild || wrap;
    if (!wrap || !inner) continue;
    const cell = tr.querySelector(".pt-sub-name");
    const row = tr.querySelector(".pt-sub-inner");
    const used = [...row.children].reduce((s2, el) => s2 + el.getBoundingClientRect().width, 0);
    const free = Math.round(cell.getBoundingClientRect().width - used - 14 - parseFloat(getComputedStyle(tr).getPropertyValue("--pt-indent") || "0"));
    out.push({
      depth: tr.getAttribute("data-depth"),
      name: (wrap.textContent || "").trim().slice(0, 30),
      textPx: Math.round(inner.scrollWidth),
      freePx: free,
      cut: inner.scrollWidth > inner.clientWidth + 1,
    });
  }
  return out;
});
console.table(measure);

// Nothing in the row's last cell may be cut: a truncated "Check here" reads
// as a broken link rather than a narrow column.
const cutBits = await p.evaluate(() => {
  // The direct definition of "this text is being cut": an element that clips
  // its overflow and whose content is wider than its box. Measuring the <td>
  // instead misses it, because the ellipsis is applied by an inner element and
  // the cell itself never overflows — that is how "Updat…" and "08/10/20…"
  // both measured as fitting.
  const out = [];
  for (const el of document.querySelectorAll("table.pt-table th, table.pt-table td, table.pt-table td *")) {
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflowX)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const t = (el.textContent || "").trim();
    if (!t) continue;
    // Long free text in a narrow column is MEANT to ellipse — a task title, the
    // next-task preview, a client name. Flagging those buries the ones that
    // matter. And a few pixels of overshoot is the inner cell's own padding,
    // not a cut character.
    if (/ed-text|pt-next-title|pt-sub-title|pt-inherit|proj-client/.test(el.className || "")) continue;
    if (el.scrollWidth - el.clientWidth <= 8) continue;
    out.push(`${(el.className || el.tagName).toString().split(" ")[0]}: "${t.slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  return [...new Set(out)];
});
console.log(cutBits.length ? "CLIPPED:\n  " + cutBits.join("\n  ") : "nothing clipped");

// The table that holds the breakdown, not whichever table is first on the
// page — there is one per section and the reel is not in the first.
await subRow("Cut selects").scrollIntoViewIfNeeded();
await p.waitForTimeout(200);
await p.locator("table.pt-table").filter({ has: p.locator(".pt-sub-title", { hasText: "Cut selects" }) })
  .first().screenshot({ path: "/tmp/nest-desktop.png" });
await ctx.close();

for (const [w, h, name] of [[820, 1100, "tablet"], [390, 900, "phone"]]) {
  const c2 = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
  const q = await c2.newPage();
  await q.goto(BASE + "/projects", { waitUntil: "networkidle" });
  await q.waitForTimeout(800);
  const cr = q.locator("tr.pt-row", { hasText: "Studio Reel 2026" }).locator(".pt-caret").first();
  if ((await cr.getAttribute("aria-expanded")) !== "true") await cr.click();
  await q.waitForTimeout(600);
  // Open the whole chain so the deep cards are actually in the picture.
  for (let i = 0; i < 6; i++) {
    const shut = q.locator("tr.pt-sub .pt-caret.sm[aria-expanded=false]");
    if (!(await shut.count())) break;
    await shut.first().click().catch(() => {});
    await q.waitForTimeout(250);
  }
  await q.waitForTimeout(300);
  await q.locator("table.pt-table").filter({ has: q.locator(".pt-sub-title", { hasText: "Cut selects" }) })
    .first().screenshot({ path: `/tmp/nest-${name}.png` });
  const over = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name} ${w}px — x-overflow ${over}px`);
  await c2.close();
}
await b.close();
