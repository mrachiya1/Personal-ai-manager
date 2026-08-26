import { getSleepLogs, getOpenSleepLog, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import SleepButtons from "@/components/SleepButtons";
import DeleteSleepLogButton from "@/components/DeleteSleepLogButton";

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

  const withDuration = logs.filter((l) => l.durationHours != null);
  const avg = withDuration.length
    ? withDuration.reduce((s, l) => s + (l.durationHours || 0), 0) / withDuration.length
    : null;

  return (
    <>
      <section className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 16 }}>
        <div className="card stat-tile">
          <span className="stat-label">Status</span>
          <div className="stat-value" style={{ fontSize: 18 }}>{open ? "Asleep" : "Awake"}</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Avg. Duration (last {withDuration.length})</span>
          <div className="stat-value">{avg !== null ? `${avg.toFixed(1)}h` : "—"}</div>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">Last Wake Time</span>
          <div className="stat-value" style={{ fontSize: 15 }}>
            {logs.find((l) => l.wakeTime)?.wakeTime
              ? new Date(logs.find((l) => l.wakeTime)!.wakeTime!).toLocaleString()
              : "—"}
          </div>
        </div>
      </section>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <h2>Log It</h2>
        <div className="section-sub">One tap each way — writes straight to Notion</div>
        <SleepButtons hasOpenLog={Boolean(open)} />
      </div>

      <div className="card section-card">
        <h2>Recent Sleep</h2>
        <div className="section-sub">Last {logs.length} entries</div>
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
                <td colSpan={5} style={{ color: "var(--ink-muted)" }}>No sleep logs yet — tap "Went to Sleep" above.</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.sleepTime ? new Date(log.sleepTime).toLocaleString() : "—"}</td>
                <td>{log.wakeTime ? new Date(log.wakeTime).toLocaleString() : "—"}</td>
                <td>{log.durationHours != null ? `${log.durationHours}h` : "—"}</td>
                <td>{log.notes || "—"}</td>
                <td><DeleteSleepLogButton id={log.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
