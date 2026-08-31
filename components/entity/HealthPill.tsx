import Link from "next/link";
import { VERDICT_LABEL, type Health, type Severity } from "@/lib/entityHealth";

const DOT: Record<Severity, string> = {
  critical: "critical",
  warning: "warning",
  good: "good",
  neutral: "neutral",
};

/** The verdict, as one small pill. Never a number — see lib/entityHealth.ts. */
export function HealthPill({ health, size = "md" }: { health: Health; size?: "sm" | "md" }) {
  return (
    <span className={`health-pill ${DOT[health.verdict]} ${size}`} title={health.summary}>
      <span className="hp-dot" aria-hidden />
      {VERDICT_LABEL[health.verdict]}
    </span>
  );
}

/**
 * The signals behind the verdict, always shown.
 *
 * A verdict without its reasons is an opinion the screen cannot defend, and
 * this codebase's rule is that anything on a dashboard traces to a record.
 * Each row names the record and, where there is one, links to it.
 */
export function HealthSignals({ health, limit }: { health: Health; limit?: number }) {
  const rows = limit ? health.signals.slice(0, limit) : health.signals;
  if (!rows.length) return null;
  return (
    <ul className="health-signals">
      {rows.map((s) => (
        <li key={s.key} className={s.severity}>
          <span className="hs-dot" aria-hidden />
          <span className="hs-body">
            <span className="hs-label">
              {s.href ? (
                <Link href={s.href} className="inline-link">
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
            </span>
            <span className="hs-detail">{s.detail}</span>
          </span>
        </li>
      ))}
      {limit && health.signals.length > limit && (
        <li className="hs-more">+{health.signals.length - limit} more</li>
      )}
    </ul>
  );
}
