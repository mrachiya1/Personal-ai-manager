// Finance, Companies, and the two profiles — as screens a person uses.
//
// The unit tests already cover the maths (period boundaries, health signals,
// currency grouping). What they cannot see is the thing that was actually
// wrong with these pages: a metric strip clipped mid-number on a phone, three
// tables running off the right edge with no scrollbar, a 1500px page rendering
// one narrow column, and a stray "0" printed by `target && ...`. Those are all
// layout, and layout has to be measured in a browser.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5421";

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

/** Anything clipping its own text, which is what a "responsive" bug looks like. */
async function clipped(selector) {
  return p.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
        out.push(`${(el.className || "").toString().split(" ")[0]}: "${(el.textContent || "").trim().slice(0, 24)}"`);
      }
    }
    return [...new Set(out)];
  }, selector);
}

/* ================================================================== */
console.log("--- 1. FINANCE: THE PERIOD GOVERNS THE PAGE ---");
/* ================================================================== */
await p.goto(BASE + "/finance", { waitUntil: "networkidle" });
await p.waitForTimeout(700);

check("there is a period control", (await p.locator(".period-chip").count()) >= 4,
  `${await p.locator(".period-chip").count()} periods`);
check("this month is the default", (await p.locator(".period-chip.on").innerText()).trim() === "This month",
  (await p.locator(".period-chip.on").innerText()).trim());

const monthIn = (await p.locator(".fin-stat", { hasText: "Money in" }).locator(".fin-stat-value").innerText()).trim();
const monthRows = await p.locator(".fin-table-card", { hasText: "Money in" }).locator("tbody tr").count();
await p.locator(".period-chip", { hasText: "All time" }).click();
await p.waitForTimeout(1200);
check("switching period actually changes the page",
  (await p.locator(".period-chip.on").innerText()).trim() === "All time");
const allIn = (await p.locator(".fin-stat", { hasText: "Money in" }).locator(".fin-stat-value").innerText()).trim();
const allRows = await p.locator(".fin-table-card", { hasText: "Money in" }).locator("tbody tr").count();
check("and the tables move with the headline, not independently of it",
  allIn !== monthIn && allRows > monthRows, `${monthIn}/${monthRows} rows → ${allIn}/${allRows} rows`);
check("all time offers no invented comparison",
  /no earlier period|no comparison/i.test(await p.locator(".fin-stat", { hasText: "Money in" }).innerText()),
  (await p.locator(".fin-stat", { hasText: "Money in" }).innerText()).replace(/\n/g, " ").slice(0, 70));

await p.locator(".period-chip", { hasText: "This month" }).click();
await p.waitForTimeout(1000);
const inStat = await p.locator(".fin-stat", { hasText: "Money in" }).innerText();
check("a real comparison names the period it compares against",
  /same days last month/i.test(inStat), inStat.replace(/\n/g, " ").slice(0, 80));
check("and shows a direction, not just a total", (await p.locator(".fin-delta").count()) >= 1);

/* ================================================================== */
console.log("\n--- 2. FINANCE: MONEY IS NEVER FABRICATED ---");
/* ================================================================== */
// Accounts are held in LKR and USD. Summing them into one "Rs" figure counted
// $4,820 as Rs 4,820 — roughly a fifteenth of its value — on the largest
// number on the page.
const worth = await p.locator(".fin-worth").innerText();
check("net worth does not fold two currencies into one figure",
  /\$/.test(worth) && /Rs/.test(worth), worth.replace(/\n/g, " ").slice(0, 90));
check("and says so", /not converted/i.test(worth));

const wrapped = await p.evaluate(() =>
  [...document.querySelectorAll(".fin-stat-value, .fin-worth-value, .fin-card-total, td.money")]
    .filter((el) => el.getClientRects().length > 1)
    .map((el) => el.textContent.trim().slice(0, 20))
);
check("no figure wraps across two lines", wrapped.length === 0, wrapped.slice(0, 3).join(" | "));
check("nothing prints a sign inside the symbol",
  !/[A-Za-z$]-\d/.test(await p.locator("body").innerText()));

/* ================================================================== */
console.log("\n--- 3. COMPANIES: A PORTFOLIO ---");
/* ================================================================== */
await p.goto(BASE + "/companies", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
check("the group is summarised before any single company", (await p.locator(".pf-stat").count()) >= 4,
  `${await p.locator(".pf-stat").count()} portfolio stats`);

// The layout bug: each company used to get its own three-column grid holding
// one card, so three companies rendered as one narrow column down the left.
const cardBoxes = await p.locator(".co-card").evaluateAll((els) =>
  els.map((el) => Math.round(el.getBoundingClientRect().left))
);
check("company cards share one grid rather than one column each",
  new Set(cardBoxes).size > 1, `${cardBoxes.length} cards at ${new Set(cardBoxes).size} x-positions`);
const widest = await p.locator(".co-grid").evaluate((el) => el.getBoundingClientRect().width);
check("and the grid uses the width it has", widest > 900, `${Math.round(widest)}px`);

check("every card carries a verdict", (await p.locator(".co-card .health-pill").count()) === cardBoxes.length);
check("and the reasons behind it", (await p.locator(".co-card .health-signals li").count()) > 0);
check("a company that needs attention sorts to the front",
  ["critical", "warning"].some((c) => (p.locator(".co-card").first().locator(`.health-pill.${c}`))) &&
    (await p.locator(".co-card").first().locator(".health-pill.critical, .health-pill.warning").count()) > 0);

// `{target && ...}` renders the number 0 when target is 0. React prints it.
const strayZero = await p.evaluate(() =>
  [...document.querySelectorAll(".co-card")].some((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === "0")
  )
);
check("no stray 0 from a falsy && render", !strayZero);
check("an unparseable start date is not printed raw",
  !/since -\d|since undefined|since NaN/i.test(await p.locator(".co-grid").innerText()));

/* ================================================================== */
console.log("\n--- 4. THE COMPANY PROFILE IS ONE SCREEN ---");
/* ================================================================== */
const href = await p.locator("a[href^='/companies/']").first().getAttribute("href");
await p.goto(BASE + href, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
check("no tab bar hiding four fifths of it", (await p.locator(".detail-tabs, .tab-btn").count()) === 0);
for (const [label, sel] of [
  ["the money", ".cp-money"],
  ["what needs attention", ".cp-panel .health-signals"],
  ["projects", ".cp-panel table"],
  ["clients and team", ".cp-list"],
]) {
  check(`${label} is on the page without a click`, (await p.locator(sel).first().isVisible().catch(() => false)));
}
check("the verdict is in the header", (await p.locator(".cp-head .health-pill").count()) === 1);
check("a target is judged against how much of the month has gone",
  /% of the month gone/.test(await p.locator(".cp-money").innerText()),
  (await p.locator(".cp-money").innerText()).replace(/\n/g, " ").slice(-60));
check("and the bar carries a pace marker", (await p.locator(".pf-pace").count()) > 0);
const netCell = await p.locator(".cp-money-side").innerText();
check("a negative net reads as -$x, never $-x", !/\$-/.test(netCell), netCell.replace(/\n/g, " ").slice(0, 60));

/* ================================================================== */
console.log("\n--- 5. THE CLIENT PROFILE GOT THE SAME TREATMENT ---");
/* ================================================================== */
await p.goto(BASE + "/clients", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
check("a one-tab tab bar is gone", (await p.locator(".detail-tabs").count()) === 0);
check("there is a verdict", (await p.locator(".cl-verdict .health-pill").count()) === 1);
check("with its reasons", (await p.locator(".health-signals li").count()) > 0);
check("the money is one row of facts", (await p.locator(".cl-money dd").count()) >= 6,
  `${await p.locator(".cl-money dd").count()} figures`);
// Projects used to be found by walking PAYMENTS, so a project with a client
// set but nothing invoiced appeared nowhere.
const projText = await p.locator(".subsection", { hasText: "Projects" }).first().innerText();
check("projects are found by their client, not via an invoice",
  !/linked via payments/i.test(projText) && /\d{4}|—/.test(projText),
  projText.replace(/\n/g, " ").slice(0, 70));
check("last activity never reports something that has not happened",
  !/last activity upcoming/i.test(await p.locator(".client-detail").innerText()));

/* ================================================================== */
console.log("\n--- 6. ALL OF IT ON A PHONE ---");
/* ================================================================== */
await p.setViewportSize({ width: 390, height: 844 });
for (const [route, name] of [["/finance", "finance"], ["/companies", "companies"], ["/clients", "clients"]]) {
  await p.goto(BASE + route, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name} does not scroll sideways`, over <= 1, `${over}px`);
  const cut = await clipped(".fin-stat-value, .fin-worth-value, .co-facts dd, .cl-money dd, .pf-stat .fin-stat-value");
  check(`${name} clips no figure`, cut.length === 0, cut.slice(0, 2).join(" | "));
}

// The one that mattered: the Accounts table put Balance, Updated and the
// Update button off the right edge of a 390px screen with nothing to say so.
await p.goto(BASE + "/finance", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const acct = p.locator(".fin-table-card", { hasText: "Accounts" }).first();
await acct.scrollIntoViewIfNeeded();
const shape = await acct.locator("table.mini tbody tr").nth(1).evaluate((el) => {
  const cs = getComputedStyle(el);
  return { display: cs.display, cols: cs.gridTemplateColumns.split(" ").length };
});
check("account rows become cards, not a hidden horizontal scroll",
  shape.display === "grid", JSON.stringify(shape));
const balanceVisible = await acct.locator("td[data-label='Balance']").first().isVisible();
check("so the balance is actually on screen", balanceVisible);
const labelled = await acct.locator("td[data-label]:visible").count();
check("and every field carries its own label", labelled >= 4, `${labelled} labelled cells`);

const tableOverflow = await p.evaluate(() =>
  [...document.querySelectorAll("table.mini.stacks")].filter((t) => t.scrollWidth > t.clientWidth + 2).length
);
check("no stacked table overflows its card", tableOverflow === 0, `${tableOverflow} overflowing`);

console.log(`\nerrors: ${errs.length ? errs.slice(0, 3).join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
