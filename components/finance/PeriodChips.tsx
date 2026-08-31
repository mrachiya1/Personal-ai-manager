import Link from "next/link";
import { PERIODS, type Period } from "@/lib/financePeriod";

/**
 * The period the whole page is showing.
 *
 * Links rather than buttons, and the period lives in the URL. The page is
 * server-rendered from Notion, so a client-side filter would mean shipping
 * the entire ledger to the browser to hide most of it. It also means a period
 * can be linked to and comes back on reload, which a piece of component state
 * cannot do.
 */
export default function PeriodChips({ current, basePath = "/finance" }: { current: Period; basePath?: string }) {
  return (
    <nav className="period-chips" aria-label="Reporting period">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={p.key === "month" ? basePath : `${basePath}?period=${p.key}`}
          className={`period-chip${current.key === p.key ? " on" : ""}`}
          aria-current={current.key === p.key ? "true" : undefined}
          scroll={false}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
