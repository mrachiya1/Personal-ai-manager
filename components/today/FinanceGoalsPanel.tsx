import Link from "next/link";
import type { FinanceGoal } from "@/lib/types";

function amount(n: number, currency: string) {
  const symbol = currency === "LKR" ? "LKR " : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

/**
 * Goals with the gap named.
 *
 * A single "62%" reads as progress; "needs LKR 500,000 more" reads as a thing
 * to do this month. Both are here, with the remainder given the emphasis,
 * because that is the number that changes behaviour.
 */
export default function FinanceGoalsPanel({
  goals,
  currency,
  todayISO,
}: {
  goals: FinanceGoal[];
  currency: string;
  todayISO: string;
}) {
  const open = goals.filter((g) => !g.targetAmount || g.currentAmount < g.targetAmount).slice(0, 4);

  return (
    <div className="card section-card">
      <div className="sc-head">
        <div>
          <h2>Finance goals</h2>
          <div className="section-sub">Target, raised, and what is still missing</div>
        </div>
        <Link href="/finance" className="sc-link">
          All goals
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>

      {open.length === 0 ? (
        <div className="empty-line">No open goals. Add one in the capture panel and it appears here.</div>
      ) : (
        <div className="goal-rows">
          {open.map((goal) => {
            const pct = goal.targetAmount ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
            const missing = Math.max(0, goal.targetAmount - goal.currentAmount);
            const daysLeft = goal.deadline
              ? Math.round((new Date(goal.deadline).getTime() - new Date(todayISO).getTime()) / 86400000)
              : null;
            const late = daysLeft !== null && daysLeft < 0;

            return (
              <Link className="goal-row" key={goal.id} href="/finance">
                <div className="goal-top">
                  <span className="goal-name">{goal.goal}</span>
                  <span className="goal-target">{amount(goal.targetAmount, currency)}</span>
                </div>
                <div className="goal-track">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="goal-foot">
                  <span>Current {amount(goal.currentAmount, currency)}</span>
                  {daysLeft !== null && (
                    <span className={`goal-when${late ? " late" : ""}`}>
                      {late ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
                    </span>
                  )}
                  <span className="goal-missing">Need {amount(missing, currency)} more</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
