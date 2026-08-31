// The health signals behind every company and client verdict.
//
// The temptation with a "health score" is a weighted formula. This has none,
// on purpose: every signal is a filter over records, and the screen shows the
// list that produced the verdict. So what needs testing is that each filter
// catches what it claims to, that the worst signal wins, and — the one that
// matters most — that a target at 0% is judged against how much of the month
// has actually gone, not against 100%.

import { assessHealth, VERDICT_LABEL, type Severity } from "../lib/entityHealth";
import type { Payment, Project } from "../lib/types";

let pass = 0;
let fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ok  " : "  FAIL"} ${l}${d ? " — " + d : ""}`);
};

const money = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;
const TODAY = "2026-08-15"; // half way through a 31-day month

const P = (over: Partial<Project> = {}): Project =>
  ({
    id: over.id || "p1",
    name: over.name || "A project",
    companyId: "co1",
    category: [],
    status: over.status || "Production",
    assignedTo: [],
    reviewedBy: [],
    files: [],
    ...over,
  }) as Project;

const PAY = (over: Partial<Payment> = {}): Payment =>
  ({ id: over.id || "pay1", label: over.label || "Invoice", amount: over.amount ?? 1000, status: over.status || "Pending", ...over }) as Payment;

const has = (h: { signals: { key: string }[] }, key: string) => h.signals.some((s) => s.key === key);
const sig = (h: { signals: { key: string; severity: Severity; label: string; detail: string }[] }, key: string) =>
  h.signals.find((s) => s.key === key);

/* ------------------------------------------------------------------ */
console.log("--- money that is late ---");
/* ------------------------------------------------------------------ */
const overdue = assessHealth({
  projects: [P()],
  payments: [PAY({ status: "Overdue", amount: 240000, dueDate: "2026-07-16", label: "Film balance" })],
  todayISO: TODAY,
  money,
});
ok("an overdue invoice is critical", sig(overdue, "overdue")?.severity === "critical");
ok("it says how much", overdue.signals[0].label.includes("240,000"), overdue.signals[0].label);
ok("and how late, from the due date", /30 days past due/.test(sig(overdue, "overdue")!.detail),
  sig(overdue, "overdue")!.detail);
ok("the verdict is the worst signal", overdue.verdict === "critical");
ok("and the summary quotes it rather than inventing a phrase",
  overdue.summary.startsWith(overdue.signals[0].label), overdue.summary);

/* ------------------------------------------------------------------ */
console.log("\n--- work that is late, and nearly late ---");
/* ------------------------------------------------------------------ */
const late = assessHealth({
  projects: [P({ name: "Brand film", deadline: "2026-08-01" }), P({ id: "p2", name: "Renders", deadline: "2026-08-19" })],
  payments: [],
  todayISO: TODAY,
  money,
});
ok("a passed deadline is critical", sig(late, "late-projects")?.severity === "critical");
ok("it names the worst one and how late", /Brand film was due 2026-08-01, 14 days ago/.test(sig(late, "late-projects")!.detail),
  sig(late, "late-projects")!.detail);
ok("a deadline inside a week is a warning, not a crisis", sig(late, "due-soon")?.severity === "warning");
ok("and a project that is late is not also counted as due soon",
  !sig(late, "due-soon")!.detail.includes("Brand film"), sig(late, "due-soon")!.detail);
ok("a delivered project is never late",
  !has(assessHealth({ projects: [P({ status: "Delivered", deadline: "2020-01-01" })], payments: [], todayISO: TODAY, money }), "late-projects"));

/* ------------------------------------------------------------------ */
console.log("\n--- money nobody asked for ---");
/* ------------------------------------------------------------------ */
const unbilled = assessHealth({
  projects: [P({ id: "p1", value: 92000 }), P({ id: "p2", value: 0 })],
  payments: [],
  todayISO: TODAY,
  money,
});
ok("a live project with a value and no invoice is flagged", sig(unbilled, "uninvoiced")?.severity === "warning");
ok("and only the ones actually worth something", sig(unbilled, "uninvoiced")!.label.includes("92,000"),
  sig(unbilled, "uninvoiced")!.label);
ok("an invoiced project is not flagged",
  !has(assessHealth({ projects: [P({ id: "p1", value: 92000 })], payments: [PAY({ projectId: "p1" })], todayISO: TODAY, money }), "uninvoiced"));

/* ------------------------------------------------------------------ */
console.log("\n--- the target, judged against the calendar ---");
/* ------------------------------------------------------------------ */
// The whole point. 0% of target is not the same fact on the 3rd as on the 28th.
const early = assessHealth({ projects: [P()], payments: [], todayISO: "2026-08-03", monthlyTarget: 850000, revenueThisMonth: 0, money });
const lateMonth = assessHealth({ projects: [P()], payments: [], todayISO: "2026-08-28", monthlyTarget: 850000, revenueThisMonth: 0, money });
ok("zero revenue on the 3rd is a warning, not a crisis", sig(early, "target")?.severity === "warning",
  sig(early, "target")?.severity);
ok("zero revenue on the 28th is a crisis", sig(lateMonth, "target")?.severity === "critical",
  sig(lateMonth, "target")?.severity);
ok("and the reason names both percentages", /% of target with \d+% of the month gone/.test(sig(lateMonth, "target")!.detail),
  sig(lateMonth, "target")!.detail);

const ahead = assessHealth({ projects: [P()], payments: [], todayISO: TODAY, monthlyTarget: 100000, revenueThisMonth: 90000, money });
ok("ahead of pace is good", sig(ahead, "target")?.severity === "good", sig(ahead, "target")?.detail);
ok("no target means no target signal",
  !has(assessHealth({ projects: [P()], payments: [], todayISO: TODAY, money }), "target"));
ok("a zero target is not divided by",
  !has(assessHealth({ projects: [P()], payments: [], todayISO: TODAY, monthlyTarget: 0, revenueThisMonth: 0, money }), "target"));

/* ------------------------------------------------------------------ */
console.log("\n--- the quiet cases ---");
/* ------------------------------------------------------------------ */
const empty = assessHealth({ projects: [], payments: [], todayISO: TODAY, money });
ok("nothing filed reads as quiet, not as broken", empty.verdict === "neutral" && has(empty, "no-work"));
ok("and still says something", empty.summary.length > 0, empty.summary);
const allDone = assessHealth({ projects: [P({ status: "Delivered" })], payments: [], todayISO: TODAY, money });
ok("everything delivered is quiet too", has(allDone, "no-live-work"));

const fine = assessHealth({ projects: [P({ deadline: "2026-12-01" })], payments: [PAY({ status: "Paid" })], todayISO: TODAY, money });
ok("a healthy entity says so explicitly", sig(fine, "on-track")?.severity === "good");
ok("rather than showing an empty list", fine.signals.length > 0);
ok("and its verdict is good", fine.verdict === "good", fine.verdict);
ok("every severity has a label a person can read",
  (["critical", "warning", "good", "neutral"] as Severity[]).every((s) => VERDICT_LABEL[s]?.length > 0));

/* ------------------------------------------------------------------ */
console.log("\n--- ordering ---");
/* ------------------------------------------------------------------ */
const mixed = assessHealth({
  projects: [P({ deadline: "2026-08-19" })],
  payments: [PAY({ status: "Overdue", amount: 5000, dueDate: "2026-08-01" })],
  todayISO: TODAY,
  monthlyTarget: 100000,
  revenueThisMonth: 99000,
  money,
});
ok("the worst signal is first", mixed.signals[0].severity === "critical", mixed.signals.map((s) => s.severity).join(","));
ok("and the good news is last", mixed.signals[mixed.signals.length - 1].severity === "good",
  mixed.signals.map((s) => s.key).join(","));
ok("but the good news is still there", mixed.signals.some((s) => s.severity === "good"));

console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
process.exit(fail ? 1 : 0);
