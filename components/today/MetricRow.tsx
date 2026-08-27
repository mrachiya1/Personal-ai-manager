import type { CashFlow, ExecutionLoad, RevenuePulse } from "@/lib/dashboard";
import type { DayEnergy } from "@/lib/dayEnergy";
import { formatLocalTime } from "@/lib/timezone";

function money(amount: number, currency = "USD") {
  const symbol = currency === "LKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  if (Math.abs(amount) >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 10_000) return `${symbol}${Math.round(amount / 1000)}k`;
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

/**
 * Two bars on one track: how much is in the bank, and how much is booked but
 * not yet collected. The thin pace marker is where you'd be if the month were
 * being earned evenly — being behind it early in the month is normal, being
 * behind it on the 25th is the thing worth seeing.
 */
function RevenueBar({ pulse }: { pulse: RevenuePulse }) {
  const ceiling = Math.max(pulse.predicted, pulse.target, 1);
  const collectedPct = Math.min(100, (pulse.collected / ceiling) * 100);
  const bookedPct = Math.min(100 - collectedPct, (pulse.outstanding / ceiling) * 100);

  return (
    <div className="mx-bar" role="img" aria-label={`${money(pulse.collected, pulse.currency)} collected of ${money(pulse.predicted, pulse.currency)} predicted`}>
      <span className="mx-bar-fill" style={{ width: `${collectedPct}%` }} />
      <span className="mx-bar-booked" style={{ width: `${bookedPct}%` }} />
      {pulse.target > 0 && (
        <span className="mx-bar-mark" style={{ left: `${Math.min(100, (pulse.target / ceiling) * 100)}%` }} title="Monthly target" />
      )}
      <span className="mx-bar-pace" style={{ left: `${Math.min(100, pulse.monthElapsed * 100)}%` }} title="Month elapsed" />
    </div>
  );
}

export default function MetricRow({
  pulse,
  load,
  cash,
  energy,
  energyLevel,
}: {
  pulse: RevenuePulse;
  load: ExecutionLoad;
  cash: CashFlow;
  energy: DayEnergy;
  energyLevel?: string;
}) {
  const remaining = Math.max(0, (pulse.target || pulse.predicted) - pulse.collected);
  const shipCount = load.dueToday.length + load.shippingToday.length;
  const clashing = cash.meetings.filter((m) => m.clash).length;

  return (
    <section className="metric-row">
      {/* 1 — revenue */}
      <article className="card metric-card">
        <header>
          <span className="mx-label">Monthly revenue pulse</span>
          {pulse.overdue > 0 && <span className="badge overdue">{money(pulse.overdue, pulse.currency)} overdue</span>}
        </header>
        <div className="mx-value">
          {money(pulse.collected, pulse.currency)}
          <span className="mx-of">of {money(pulse.predicted, pulse.currency)} predicted</span>
        </div>
        <RevenueBar pulse={pulse} />
        <footer className="mx-foot">
          {remaining > 0
            ? `${money(remaining, pulse.currency)} left to ${pulse.target ? "hit target" : "collect"}`
            : "Target cleared for the month"}
          {pulse.outstanding > 0 && ` · ${money(pulse.outstanding, pulse.currency)} invoiced, unpaid`}
        </footer>
      </article>

      {/* 2 — execution load */}
      <article className="card metric-card">
        <header>
          <span className="mx-label">Daily execution load</span>
          {load.slipped.length > 0 && <span className="badge overdue">{load.slipped.length} slipped</span>}
        </header>
        <div className="mx-value">
          {shipCount}
          <span className="mx-of">{shipCount === 1 ? "thing ships today" : "things ship today"}</span>
        </div>
        <div className="mx-split">
          <span>
            <b>{load.dueToday.length}</b> {load.dueToday.length === 1 ? "task due" : "tasks due"}
          </span>
          <span>
            <b>{load.shippingToday.length}</b>{" "}
            {load.shippingToday.length === 1 ? "project deadline" : "project deadlines"}
          </span>
          <span>
            <b>{load.thisWeek.length}</b> inside 7 days
          </span>
        </div>
        <footer className="mx-foot">
          {shipCount === 0
            ? load.thisWeek.length
              ? "Nothing due today — pull the nearest deadline forward."
              : "Clear runway. Good day to build ahead."
            : "Clear these before anything new opens."}
        </footer>
      </article>

      {/* 3 — cash flow + meetings */}
      <article className="card metric-card">
        <header>
          <span className="mx-label">Cash in &amp; meetings</span>
          {clashing > 0 && <span className="badge med">{clashing} in a blocked window</span>}
        </header>
        <div className="mx-value">
          {cash.inbound.length ? (
            cash.inbound.map((row) => (
              <span key={row.currency} className="mx-stack">
                {money(row.amount, row.currency)}
              </span>
            ))
          ) : (
            <span className="mx-stack">—</span>
          )}
          <span className="mx-of">inbound in 14 days</span>
        </div>
        {cash.nextIn && (
          <div className={`mx-next${cash.nextIn.overdue ? " late" : ""}`}>
            {cash.nextIn.overdue ? "Chase" : "Next"}: <b>{money(cash.nextIn.amount, cash.nextIn.currency)}</b> —{" "}
            {cash.nextIn.client || cash.nextIn.label}
            {cash.nextIn.dueDate ? (cash.nextIn.overdue ? ` · was due ${cash.nextIn.dueDate}` : ` · due ${cash.nextIn.dueDate}`) : ""}
          </div>
        )}
        <footer className="mx-foot">
          {cash.meetings.length === 0
            ? "No meetings on the calendar today."
            : cash.meetings
                .slice(0, 2)
                .map((m) => `${m.allDay ? "All day" : formatLocalTime(m.start)} ${m.summary}${m.clash ? ` ⚠ ${m.clash}` : ""}`)
                .join(" · ")}
        </footer>
      </article>

      {/* 4 — energy + windows */}
      <article className="card metric-card">
        <header>
          <span className="mx-label">Energy &amp; deep work</span>
          <span className={`badge ${energy.score >= 70 ? "paid" : energy.score >= 50 ? "pending" : "med"}`}>{energy.verdict}</span>
        </header>
        <div className="mx-value">
          {energy.deepWork ? formatLocalTime(energy.deepWork.start) : "—"}
          <span className="mx-of">
            {energy.deepWork ? `→ ${formatLocalTime(energy.deepWork.end)} deep work` : "sunrise data unavailable"}
          </span>
        </div>
        <div className="mx-windows">
          <span className="mx-window deep">
            <b>Deep</b> {energy.deepWork ? energy.deepWork.planets.join(" + ") : "—"}
          </span>
          <span className="mx-window rest">
            <b>Reset</b>{" "}
            {energy.rest ? `${formatLocalTime(energy.rest.start)}–${formatLocalTime(energy.rest.end)}` : "—"}
          </span>
        </div>
        <footer className="mx-foot">
          {energy.currentHora ? `Now: ${energy.currentHora.planet} hora` : "Hora data unavailable"}
          {energyLevel ? ` · logged energy ${energyLevel.toLowerCase()}` : ""}
        </footer>
      </article>
    </section>
  );
}
