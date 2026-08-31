import { getSleepLogs, getOpenSleepLog, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import SleepButtons from "@/components/SleepButtons";
import SleepManualForm from "@/components/SleepManualForm";
import SleepLogRow from "@/components/SleepLogRow";
import { formatLocalTime, tzOffset } from "@/lib/timezone";
import { formatDateTimeAt } from "@/lib/clock";

export default async function SleepPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self · Sleep Cycle</div>
          <h1 className="brand-serif">Sleep Cycle</h1>
        </div>
      </div>

      {!(await notionConnected()) ? <ConnectPrompt /> : <SleepBody />}
      <div className="footnote">Orex OS — Sleep Cycle · live data from Notion</div>
    </>
  );
}

async function SleepBody() {
  const [logs, open] = await Promise.all([getSleepLogs(14), getOpenSleepLog()]);
  const offset = tzOffset();

  const withDuration = logs.filter((l) => l.durationHours != null);
  const avg = withDuration.length
    ? withDuration.reduce((s, l) => s + (l.durationHours || 0), 0) / withDuration.length
    : null;
  const lastWake = logs.find((l) => l.wakeTime)?.wakeTime;

  // Nights missing from the last fortnight — the reason manual entry exists.
  // Counted by distinct wake dates rather than rows, so two naps in a day
  // don't read as two nights covered.
  const covered = new Set(
    logs
      .filter((l) => l.wakeTime)
      .map((l) => new Date(new Date(l.wakeTime!).getTime() + offset * 3600_000).toISOString().slice(0, 10))
  );
  const today = new Date(Date.now() + offset * 3600_000);
  let missing = 0;
  for (let i = 1; i <= 14; i++) {
    const day = new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10);
    if (!covered.has(day)) missing += 1;
  }

  return (
    <>
      <section className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
        <div className="card stat-tile">
          <span className="stat-label">Status</span>
          <div className="stat-value" style={{ fontSize: 18 }}>{open ? "Asleep" : "Awake"}</div>
          <div className="stat-delta flat">
            {open && open.sleepTime ? `Since ${formatLocalTime(open.sleepTime, offset)}` : "No open entry"}
          </div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Average night</span>
          <div className="stat-value">{avg !== null ? `${avg.toFixed(1)}h` : "—"}</div>
          <div className="stat-delta flat">Across {withDuration.length} logged nights</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Last wake time</span>
          <div className="stat-value" style={{ fontSize: 15 }}>
            {lastWake ? formatDateTimeAt(lastWake, offset) : "—"}
          </div>
          <div className="stat-delta flat">From your most recent entry</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Nights not logged</span>
          <div className="stat-value">{missing}</div>
          <div className={`stat-delta ${missing > 3 ? "down" : "flat"}`}>
            {missing === 0 ? "Last 14 nights all covered" : "In the last 14 — add them below"}
          </div>
        </div>
      </section>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <h2>Log it</h2>
        <div className="section-sub">One tap each way — writes straight to Notion</div>
        <SleepButtons hasOpenLog={Boolean(open)} />
      </div>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <h2>Add a night manually</h2>
        <div className="section-sub">
          For the nights you forgot to tap — set the times yourself and it lands in the same history
        </div>
        <SleepManualForm tzOffset={offset} />
      </div>

      <div className="card section-card">
        <h2>Recent sleep</h2>
        <div className="section-sub">Last {logs.length} entries · edit any row to correct it</div>
        <table className="mini">
          <tbody>
            <tr>
              <th>Slept</th>
              <th>Woke</th>
              <th>Duration</th>
              <th>Notes</th>
              <th></th>
            </tr>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-muted)" }}>
                  No sleep logs yet — tap &ldquo;Went to Sleep&rdquo; above, or add a past night manually.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <SleepLogRow key={log.id} log={log} tzOffset={offset} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
