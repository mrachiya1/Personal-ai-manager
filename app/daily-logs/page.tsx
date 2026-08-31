import { redirect } from "next/navigation";
import { currentRole } from "@/auth";
import { getDailyLogs, notionConnected } from "@/lib/notion";
import ConnectPrompt from "@/components/ConnectPrompt";
import DailyLogCapture from "@/components/DailyLogCapture";

export default async function DailyLogsPage() {
  const role = await currentRole();
  if (role === "member") redirect("/companies");

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self · Mood &amp; Energy</div>
          <h1 className="brand-serif">Daily Logs</h1>
        </div>
      </div>

      {!(await notionConnected()) ? (
        <ConnectPrompt />
      ) : (
        <>
          <div className="card section-card" style={{ marginBottom: 16 }}>
            <h2>Log Today</h2>
            <div className="section-sub">This is what the advisor reads to understand how you actually feel</div>
            <DailyLogCapture />
          </div>
          <DailyLogsBody />
        </>
      )}
      <div className="footnote">Orex OS — Daily Logs · live data from Notion</div>
    </>
  );
}

async function DailyLogsBody() {
  const logs = await getDailyLogs(30);
  return (
    <div className="card section-card">
      <h2>Recent Logs</h2>
      <div className="section-sub">Last {logs.length} entries</div>
      <table className="mini">
        <tbody>
          <tr>
            <th>Date</th>
            <th>Mood</th>
            <th>Energy</th>
            <th>Notes</th>
          </tr>
          {logs.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "var(--ink-muted)" }}>No logs yet — log today above.</td>
            </tr>
          )}
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{log.date}</td>
              <td>{log.moodScore ?? "—"}</td>
              <td>{log.energyLevel ?? "—"}</td>
              <td>{log.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
