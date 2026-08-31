// How a company or a client is actually doing, from records only.
//
// The company page showed "Revenue this month vs. target $0 / $850,000" and a
// progress bar at zero, and that was the whole of its opinion. It is a fact
// and it is not an answer: a studio can be at zero on the 3rd and fine, or at
// zero on the 28th and in trouble, and the screen said the same thing either
// way.
//
// So health here is a small number of SIGNALS, each one pointing at a record
// you can go and look at — an overdue invoice, a project past its deadline, a
// month with nothing invoiced. CLAUDE.md's rule for this codebase is that
// anything on a dashboard traces to a calculation or a record; a "health
// score" with a secret formula behind it is the exact opposite of that, so
// there isn't one. There is a worst-signal verdict and the list that produced
// it, and the list is always shown.

import type { Payment, Project } from "./types";

export type Severity = "critical" | "warning" | "good" | "neutral";

export interface Signal {
  /** Stable key, so a test can assert on a specific signal. */
  key: string;
  severity: Severity;
  /** The headline — short enough to read in a row. */
  label: string;
  /** The record behind it, in words. Never a claim without one. */
  detail: string;
  /** Where to go and look. */
  href?: string;
}

export interface Health {
  verdict: Severity;
  /** One line, chosen from the signals — never invented. */
  summary: string;
  signals: Signal[];
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, neutral: 2, good: 3 };

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(`${toISO}T00:00:00Z`).getTime() - new Date(`${fromISO}T00:00:00Z`).getTime()) / 86400000
  );
}

export interface HealthInput {
  projects: Project[];
  payments: Payment[];
  todayISO: string;
  /** Monthly revenue target, when the entity has one. */
  monthlyTarget?: number;
  /** Money actually received this month. */
  revenueThisMonth?: number;
  /** Currency formatter, so the caller owns symbol and locale. */
  money: (n: number) => string;
  /** Link prefix for "go and look" — differs between a company and a client. */
  hrefs?: { projects?: string; payments?: string };
}

/**
 * The signals, worst first.
 *
 * Every branch below is a filter over records the caller already has. Nothing
 * is weighted, averaged or scored, because a weighting is a judgement the
 * screen cannot show its working for.
 */
export function assessHealth(input: HealthInput): Health {
  const { projects, payments, todayISO, money } = input;
  const signals: Signal[] = [];
  const live = projects.filter((p) => p.status !== "Delivered");

  /* ---------- money that is late ---------- */
  const overdue = payments.filter((p) => p.status === "Overdue");
  const overdueTotal = overdue.reduce((s, p) => s + (p.amount || 0), 0);
  if (overdue.length) {
    const oldest = overdue
      .map((p) => p.dueDate)
      .filter(Boolean)
      .sort()[0];
    signals.push({
      key: "overdue",
      severity: "critical",
      label: `${money(overdueTotal)} overdue`,
      detail:
        overdue.length === 1
          ? `${overdue[0].label || "One invoice"}${oldest ? `, ${daysBetween(oldest, todayISO)} days past due` : ""}`
          : `${overdue.length} invoices${oldest ? `, the oldest ${daysBetween(oldest, todayISO)} days past due` : ""}`,
      href: input.hrefs?.payments,
    });
  }

  /* ---------- work that is late ---------- */
  const late = live.filter((p) => p.deadline && p.deadline < todayISO);
  if (late.length) {
    const worst = [...late].sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))[0];
    signals.push({
      key: "late-projects",
      severity: "critical",
      label: `${late.length} project${late.length === 1 ? "" : "s"} past deadline`,
      detail: `${worst.name} was due ${worst.deadline}, ${daysBetween(worst.deadline!, todayISO)} days ago`,
      href: input.hrefs?.projects,
    });
  }

  /* ---------- work that is about to be late ---------- */
  const soon = live.filter(
    (p) => p.deadline && p.deadline >= todayISO && daysBetween(todayISO, p.deadline) <= 7
  );
  if (soon.length) {
    const next = [...soon].sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))[0];
    signals.push({
      key: "due-soon",
      severity: "warning",
      label: `${soon.length} due within a week`,
      detail: `${next.name} lands ${next.deadline}`,
      href: input.hrefs?.projects,
    });
  }

  /* ---------- money that has not been asked for ---------- */
  const uninvoiced = live.filter(
    (p) => (p.value || 0) > 0 && !payments.some((pay) => pay.projectId === p.id)
  );
  if (uninvoiced.length) {
    const total = uninvoiced.reduce((s, p) => s + (p.value || 0), 0);
    signals.push({
      key: "uninvoiced",
      severity: "warning",
      label: `${money(total)} not invoiced`,
      detail: `${uninvoiced.length} live project${uninvoiced.length === 1 ? "" : "s"} carrying a value with no payment raised — usually means someone forgot to bill`,
      href: input.hrefs?.payments,
    });
  }

  /* ---------- revenue against the target ---------- */
  if (input.monthlyTarget && input.monthlyTarget > 0) {
    const got = input.revenueThisMonth ?? 0;
    const pct = (got / input.monthlyTarget) * 100;
    // How far through the month we are, so "0% on the 3rd" is not treated the
    // same as "0% on the 28th". Pace is the only fair comparison mid-month.
    const day = Number(todayISO.slice(8, 10));
    const daysInMonth = new Date(
      Date.UTC(Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)), 0, 12)
    ).getUTCDate();
    const monthPct = (day / daysInMonth) * 100;
    const behind = monthPct - pct;
    signals.push({
      key: "target",
      severity: pct >= monthPct ? "good" : behind > 40 ? "critical" : "warning",
      label: `${money(got)} of ${money(input.monthlyTarget)} this month`,
      detail:
        pct >= monthPct
          ? `${pct.toFixed(0)}% of target with ${monthPct.toFixed(0)}% of the month gone — ahead of pace`
          : `${pct.toFixed(0)}% of target with ${monthPct.toFixed(0)}% of the month gone — ${behind.toFixed(0)} points behind pace`,
    });
  }

  /* ---------- nothing happening at all ---------- */
  if (!live.length && projects.length) {
    signals.push({
      key: "no-live-work",
      severity: "neutral",
      label: "No live projects",
      detail: `All ${projects.length} project${projects.length === 1 ? " is" : "s are"} delivered`,
      href: input.hrefs?.projects,
    });
  }
  if (!projects.length) {
    signals.push({
      key: "no-work",
      severity: "neutral",
      label: "No projects yet",
      detail: "Nothing has been filed here",
      href: input.hrefs?.projects,
    });
  }

  /* ---------- the good case, stated rather than implied ---------- */
  if (live.length && !late.length && !overdue.length) {
    signals.push({
      key: "on-track",
      severity: "good",
      label: `${live.length} project${live.length === 1 ? "" : "s"} running`,
      detail: "Nothing past a deadline and nothing overdue on the money",
      href: input.hrefs?.projects,
    });
  }

  signals.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const worst = signals[0];
  return {
    verdict: worst?.severity ?? "neutral",
    summary: worst ? `${worst.label} — ${worst.detail}` : "Nothing to report",
    signals,
  };
}

export const VERDICT_LABEL: Record<Severity, string> = {
  critical: "Needs attention",
  warning: "Watch",
  good: "On track",
  neutral: "Quiet",
};
