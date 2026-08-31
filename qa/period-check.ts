// Period boundaries and the comparison behind every delta on the Finance page.
//
// Date arithmetic is where quiet wrongness lives. A month boundary off by one
// day, a "last month" that includes the 1st of this one, a comparison against
// a full month when the current one is nine days old — none of them throw,
// all of them print a plausible number, and a plausible wrong number on a
// finance screen is worse than no number.

import { movement, resolvePeriod, within, byCategory } from "../lib/financePeriod";

let pass = 0;
let fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ok  " : "  FAIL"} ${l}${d ? " — " + d : ""}`);
};

const TODAY = "2026-08-14";

/* ------------------------------------------------------------------ */
console.log("--- boundaries ---");
/* ------------------------------------------------------------------ */
const month = resolvePeriod("month", TODAY);
ok("this month starts on the 1st", month.from === "2026-08-01", String(month.from));
ok("and ends today, not at the end of the month", month.to === TODAY, month.to);
ok("the comparison is the SAME DAYS last month, not all of it",
  month.prevFrom === "2026-07-01" && month.prevTo === "2026-07-14",
  `${month.prevFrom}..${month.prevTo}`);

const last = resolvePeriod("last", TODAY);
ok("last month is the whole of it", last.from === "2026-07-01" && last.to === "2026-07-31",
  `${last.from}..${last.to}`);
ok("and never bleeds into this one", last.to < month.from!, `${last.to} < ${month.from}`);
ok("its comparison is the month before that",
  last.prevFrom === "2026-06-01" && last.prevTo === "2026-06-30", `${last.prevFrom}..${last.prevTo}`);

const q = resolvePeriod("quarter", TODAY);
ok("three months means three whole months back", q.from === "2026-06-01", String(q.from));
const year = resolvePeriod("year", TODAY);
ok("this year starts in January", year.from === "2026-01-01", String(year.from));
ok("and compares against the same point last year",
  year.prevFrom === "2025-01-01" && year.prevTo === "2025-08-14", `${year.prevFrom}..${year.prevTo}`);

const all = resolvePeriod("all", TODAY);
ok("all time has no start", all.from === null);
ok("and no comparison, rather than an invented one", all.prevFrom === null && all.prevLabel === null);
ok("an unknown period falls back to this month", resolvePeriod("nonsense", TODAY).key === "month");
ok("so does a missing one", resolvePeriod(undefined, TODAY).key === "month");

// January is the case that breaks naive month maths.
const jan = resolvePeriod("month", "2026-01-09");
ok("January's previous month is last December",
  jan.prevFrom === "2025-12-01" && jan.prevTo === "2025-12-09", `${jan.prevFrom}..${jan.prevTo}`);
const janLast = resolvePeriod("last", "2026-01-09");
ok("and 'last month' in January is all of December",
  janLast.from === "2025-12-01" && janLast.to === "2025-12-31", `${janLast.from}..${janLast.to}`);

// The 31st against a 30-day month. Date.UTC(2026, 3, 31) is April 31st, which
// JavaScript rolls forward to May 1st — so the "previous" window would have
// swallowed a day of the CURRENT month and double-counted it.
const longMonth = resolvePeriod("month", "2026-05-31");
ok("the 31st compares against April 30th, not May 1st",
  longMonth.prevTo === "2026-04-30", String(longMonth.prevTo));
ok("and the two windows never overlap", longMonth.prevTo! < longMonth.from!,
  `${longMonth.prevTo} < ${longMonth.from}`);
// The same trap a year back: 29 Feb exists in 2028 and not in 2027.
const leap = resolvePeriod("year", "2028-02-29");
ok("a leap day compares against Feb 28th the year before",
  leap.prevTo === "2027-02-28", String(leap.prevTo));

/* ------------------------------------------------------------------ */
console.log("\n--- filtering ---");
/* ------------------------------------------------------------------ */
const rows = [
  { amount: 100, date: "2026-08-01" },
  { amount: 200, date: "2026-08-14" },
  { amount: 400, date: "2026-08-15" }, // tomorrow
  { amount: 800, date: "2026-07-14" },
  { amount: 1600, date: "" },          // undated
  { amount: 3200 },                    // no date at all
];
const inMonth = within(rows, month.from, month.to);
ok("the boundary days are included", inMonth.length === 2, `${inMonth.length} rows`);
ok("tomorrow is not", !inMonth.some((r) => r.amount === 400));
ok("undated rows are excluded rather than silently counted",
  !inMonth.some((r) => r.amount >= 1600), inMonth.map((r) => r.amount).join(","));
ok("all-time includes everything dated", within(rows, null, "2026-12-31").length === 4);

/* ------------------------------------------------------------------ */
console.log("\n--- the comparison ---");
/* ------------------------------------------------------------------ */
const m = movement(rows, month);
ok("this period totals correctly", m.total === 300, String(m.total));
ok("the previous period is measured on the same days", m.previous === 800, String(m.previous));
ok("and the change is signed", m.changePct !== null && m.changePct < 0, `${m.changePct?.toFixed(1)}%`);

const fromNothing = movement([{ amount: 500, date: "2026-08-02" }], month);
ok("a rise from zero reports no percentage rather than infinity",
  fromNothing.total === 500 && fromNothing.previous === 0 && fromNothing.changePct === null,
  String(fromNothing.changePct));
ok("all-time has no previous at all", movement(rows, all).previous === null);

/* ------------------------------------------------------------------ */
console.log("\n--- where it went ---");
/* ------------------------------------------------------------------ */
const cats = byCategory(
  [
    { amount: 100, category: "Rent" },
    { amount: 300, category: "Software" },
    { amount: 100, category: "Rent" },
    { amount: 50, category: undefined },
  ],
  "category"
);
ok("biggest first", cats[0].name === "Software", cats.map((c) => c.name).join(","));
ok("same category is added up", cats.find((c) => c.name === "Rent")?.total === 200);
ok("a missing category is named, not dropped", cats.some((c) => c.name === "Uncategorised"));
ok("shares add to 100", Math.round(cats.reduce((s, c) => s + c.share, 0)) === 100,
  String(Math.round(cats.reduce((s, c) => s + c.share, 0))));

console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
process.exit(fail ? 1 : 0);
