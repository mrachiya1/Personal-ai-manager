import type { EntitySlice, ProjectsMetrics } from "@/lib/projectsAnalytics";
import Donut from "./Donut";

function money(n: number, currency = "USD") {
  const symbol = currency === "LKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${symbol}${Math.round(n / 1000)}k`;
  return `${symbol}${Math.round(n).toLocaleString()}`;
}

function Splits({ splits, format }: { splits: EntitySlice[]; format?: (n: number) => string }) {
  if (!splits.length) return null;
  return (
    <div className="pm-splits">
      {splits.slice(0, 3).map((s) => (
        <span className="pm-split" key={s.key}>
          <span className="ps-name">{s.label}</span>
          <span className="ps-val">{format ? format(s.value) : s.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Six cards. The first is a chart because "how is the work distributed" is a
 * shape question; the other five are single numbers, and a single number is a
 * stat tile, never a one-bar chart.
 */
export default function ProjectsMetricsRow({
  metrics,
  currency,
}: {
  metrics: ProjectsMetrics;
  currency: string;
}) {
  const fmt = (n: number) => money(n, currency);

  return (
    <section className="pm-grid">
      <article className="card pm-card pm-chart">
        <span className="pm-label">Project overview</span>
        <Donut slices={metrics.distribution} total={metrics.distributionTotal} />
      </article>

      <article className="card pm-card">
        <span className="pm-label">Ongoing project value</span>
        <div className="pm-value">{money(metrics.ongoingValue, currency)}</div>
        <Splits splits={metrics.ongoingValueSplit} format={fmt} />
        <footer className="pm-foot">Everything not yet delivered</footer>
      </article>

      <article className="card pm-card">
        <span className="pm-label">Total projects</span>
        <div className="pm-value">{String(metrics.total).padStart(2, "0")}</div>
        <Splits splits={metrics.totalSplit} />
        <footer className="pm-foot">Across every status, including delivered</footer>
      </article>

      <article className={`card pm-card${metrics.overdue ? " critical" : ""}`}>
        <span className="pm-label">Nearby deadlines</span>
        <div className="pm-value">{String(metrics.nearDeadlines).padStart(2, "0")}</div>
        <Splits splits={metrics.nearSplit} />
        <footer className="pm-foot">
          {metrics.overdue
            ? `Due inside 7 days · ${metrics.overdue} already past deadline`
            : "Due inside the next 7 days"}
        </footer>
      </article>

      <article className="card pm-card">
        <span className="pm-label">Upcoming projects</span>
        <div className="pm-value">{String(metrics.upcoming).padStart(2, "0")}</div>
        <Splits splits={metrics.upcomingSplit} />
        <footer className="pm-foot">Accepted or planned, not in production yet</footer>
      </article>

      <article className="card pm-card">
        <span className="pm-label">Monthly output</span>
        <div className="pm-value">
          {metrics.monthlyDelivered}
          <span className="pm-of">/ {metrics.monthlyDue} due</span>
        </div>
        <div className="pm-meter" aria-hidden>
          <i style={{ width: `${metrics.monthlyDue ? Math.min(100, (metrics.monthlyDelivered / metrics.monthlyDue) * 100) : 0}%` }} />
        </div>
        <footer className="pm-foot">
          {metrics.monthlyDue === 0
            ? "Nothing scheduled to land this month"
            : `${metrics.monthlyDue - metrics.monthlyDelivered} still to ship this month`}
        </footer>
      </article>
    </section>
  );
}
