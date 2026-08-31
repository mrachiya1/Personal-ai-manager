// Which slice of the ledger the Finance page is showing, and what it means.
//
// The page used to say "This Month's Income" above tables that listed
// everything ever logged, with no control to change either. Two different
// spans of time on one screen, neither of them chosen, and no way to tell
// whether Rs 25,100 net is a good month or a bad one — a number with no
// comparison is a number nobody can act on.
//
// So the period is explicit, it governs the whole page, and every figure is
// shown against the SAME period immediately before it. That comparison is the
// only thing that turns a total into a direction.

export type PeriodKey = "month" | "last" | "quarter" | "year" | "all";

export interface Period {
  key: PeriodKey;
  label: string;
  /** Inclusive ISO dates. `from` is null for "all time". */
  from: string | null;
  to: string;
  /** The same length of time immediately before, for the comparison. */
  prevFrom: string | null;
  prevTo: string | null;
  /** What to call the comparison on screen. Null when there isn't one. */
  prevLabel: string | null;
}

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "quarter", label: "3 months" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Month arithmetic on UTC noon, so a DST shift can never move a boundary. */
const at = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day, 12));

/**
 * The same day-of-month in another month, clamped to that month's length.
 *
 * `Date.UTC(2026, 3, 31)` is April 31st, which JavaScript rolls forward to
 * May 1st. Comparing "the 31st of May so far" against "April 1st to May 1st"
 * counts a day of the CURRENT month inside the previous period — a silent
 * double-count that only appears in months with 31 days, and only against a
 * shorter one.
 */
function sameDayIn(y: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0, 12)).getUTCDate();
  return at(y, monthIndex, Math.min(day, lastDay));
}

export function resolvePeriod(key: string | undefined, todayISO: string): Period {
  const k: PeriodKey = (PERIODS.find((p) => p.key === key)?.key ?? "month") as PeriodKey;
  const [Y, M, D] = todayISO.split("-").map(Number);
  const label = PERIODS.find((p) => p.key === k)!.label;

  // "To" is today, not the end of the month: a month-to-date total compared
  // against a full previous month would show every month falling off a cliff
  // on the 1st. The comparison window is clipped to the same day-of-month.
  const dayOfMonth = D;

  switch (k) {
    case "month": {
      const from = at(Y, M - 1, 1);
      const prevFrom = at(Y, M - 2, 1);
      const prevTo = sameDayIn(Y, M - 2, dayOfMonth);
      return {
        key: k, label, from: iso(from), to: todayISO,
        prevFrom: iso(prevFrom), prevTo: iso(prevTo),
        prevLabel: "same days last month",
      };
    }
    case "last": {
      const from = at(Y, M - 2, 1);
      const to = at(Y, M - 1, 0); // day 0 of this month = last day of the previous one
      const prevFrom = at(Y, M - 3, 1);
      const prevTo = at(Y, M - 2, 0);
      return {
        key: k, label, from: iso(from), to: iso(to),
        prevFrom: iso(prevFrom), prevTo: iso(prevTo),
        prevLabel: "the month before",
      };
    }
    case "quarter": {
      const from = at(Y, M - 3, 1);
      const prevFrom = at(Y, M - 6, 1);
      const prevTo = at(Y, M - 3, 0);
      return {
        key: k, label, from: iso(from), to: todayISO,
        prevFrom: iso(prevFrom), prevTo: iso(prevTo),
        prevLabel: "the three months before",
      };
    }
    case "year": {
      const from = at(Y, 0, 1);
      const prevFrom = at(Y - 1, 0, 1);
      const prevTo = sameDayIn(Y - 1, M - 1, dayOfMonth);
      return {
        key: k, label, from: iso(from), to: todayISO,
        prevFrom: iso(prevFrom), prevTo: iso(prevTo),
        prevLabel: "the same point last year",
      };
    }
    default:
      // Nothing precedes all of time, so there is no comparison to show — and
      // inventing one would be worse than the honest absence.
      return { key: "all", label, from: null, to: todayISO, prevFrom: null, prevTo: null, prevLabel: null };
  }
}

export interface Dated {
  amount: number;
  date?: string;
}

export function within<T extends Dated>(rows: T[], from: string | null, to: string): T[] {
  return rows.filter((r) => {
    const d = (r.date || "").slice(0, 10);
    if (!d) return false;
    return (from === null || d >= from) && d <= to;
  });
}

const sum = (rows: Dated[]) => rows.reduce((s, r) => s + (r.amount || 0), 0);

export interface Movement {
  total: number;
  count: number;
  /** The same figure for the previous period; null when there isn't one. */
  previous: number | null;
  /** Signed percentage change, null when the previous total was zero. */
  changePct: number | null;
}

/**
 * One line of the ledger, this period against the last.
 *
 * `changePct` is null rather than 0 or Infinity when the previous total was
 * zero. "Up 100%" from nothing is not a fact about the business, and a screen
 * that prints it teaches people to ignore the whole row.
 */
export function movement<T extends Dated>(rows: T[], period: Period): Movement {
  const now = within(rows, period.from, period.to);
  const total = sum(now);
  if (period.prevFrom === null || period.prevTo === null) {
    return { total, count: now.length, previous: null, changePct: null };
  }
  const previous = sum(within(rows, period.prevFrom, period.prevTo));
  return {
    total,
    count: now.length,
    previous,
    changePct: previous === 0 ? null : ((total - previous) / Math.abs(previous)) * 100,
  };
}

/** Where the money went, biggest first. */
export function byCategory<T extends Dated & { category?: string; source?: string }>(
  rows: T[],
  field: "category" | "source"
): { name: string; total: number; share: number }[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const name = (r[field] as string) || "Uncategorised";
    acc.set(name, (acc.get(name) || 0) + (r.amount || 0));
  }
  const total = [...acc.values()].reduce((s, v) => s + v, 0) || 1;
  return [...acc.entries()]
    .map(([name, value]) => ({ name, total: value, share: (value / total) * 100 }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

/**
 * Balances grouped by the currency they are actually held in.
 *
 * Net worth was being computed as a plain sum across accounts and printed
 * with an "Rs" in front of it — so a USD account worth $4,820 was being
 * counted as Rs 4,820, roughly a fifteenth of its value, and the headline
 * figure on the Finance page was simply wrong.
 *
 * Converting would need a live rate, and a headline number that depends on a
 * third-party API being reachable is a headline number that will one day be
 * silently stale. CLAUDE.md's rule for this codebase is that a value which
 * cannot be derived honestly shows the gap instead: two currencies means two
 * figures, side by side, and nobody is misled about which is which.
 *
 * Largest first, so the dominant holding leads.
 */
export function groupByCurrency(
  rows: { balance: number; currency?: string; type?: string }[],
  defaultCurrency = "LKR"
): CurrencyTotal[] {
  const acc = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const cur = (r.currency || defaultCurrency).toUpperCase();
    // A credit card balance is money owed, so it subtracts from what you have.
    const value = r.type === "Credit Card" ? -r.balance : r.balance;
    const at2 = acc.get(cur) ?? { total: 0, count: 0 };
    at2.total += value;
    at2.count += 1;
    acc.set(cur, at2);
  }
  return [...acc.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.count - a.count || Math.abs(b.total) - Math.abs(a.total));
}
