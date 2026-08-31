import type { Movement, Period } from "@/lib/financePeriod";

/**
 * One money figure, and which way it is going.
 *
 * The delta is the whole point. A total on its own — "Rs 25,100 net" — is not
 * something anyone can act on; the same total against the same days last
 * month is. Where there is no honest comparison (all-time, or a previous
 * period of zero) the row says so instead of printing a number that would
 * read as fact.
 *
 * `intent` says which direction is GOOD, because it differs by row: expenses
 * rising is bad, income rising is good, and colouring both green for "up"
 * would be actively misleading on the one screen where that matters most.
 */
export default function MoneyStat({
  label,
  value,
  movement,
  period,
  format,
  intent = "up-good",
  tone,
  foot,
}: {
  label: string;
  value: number;
  movement?: Movement;
  period: Period;
  format: (n: number) => string;
  intent?: "up-good" | "up-bad" | "neutral";
  /** Overrides the automatic colour — used for Net, which is good when positive. */
  tone?: "good" | "bad" | "flat";
  foot?: string;
}) {
  const pct = movement?.changePct ?? null;
  const rising = pct !== null && pct > 0.5;
  const falling = pct !== null && pct < -0.5;

  let deltaTone: "good" | "bad" | "flat" = "flat";
  if (intent !== "neutral" && (rising || falling)) {
    const good = intent === "up-good" ? rising : falling;
    deltaTone = good ? "good" : "bad";
  }

  return (
    <div className="card fin-stat">
      <span className="fin-stat-label">{label}</span>
      <div className={`fin-stat-value${tone ? ` ${tone}` : ""}`}>{format(value)}</div>
      {movement && (
        <div className="fin-stat-delta">
          {pct === null ? (
            <span className="fin-delta flat">
              {period.prevLabel
                ? movement.previous === 0
                  ? `Nothing ${period.prevLabel}`
                  : "No comparison"
                : "No earlier period"}
            </span>
          ) : (
            <span className={`fin-delta ${deltaTone}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {rising ? <path d="M7 14l5-5 5 5" /> : falling ? <path d="M7 10l5 5 5-5" /> : <path d="M6 12h12" />}
              </svg>
              {Math.abs(pct) >= 999 ? ">999" : Math.abs(pct).toFixed(0)}%
            </span>
          )}
          {/* Only when there is a percentage to sit beside. With a previous
              total of zero the branch above already says "Nothing same days
              last month", and printing "Rs 0 same days last month" underneath
              it says the same thing twice, in two different ways. */}
          {pct !== null && period.prevLabel && movement.previous !== null && (
            <span className="fin-delta-vs">
              {format(movement.previous)} {period.prevLabel}
            </span>
          )}
        </div>
      )}
      {foot && <div className="fin-stat-foot">{foot}</div>}
    </div>
  );
}
