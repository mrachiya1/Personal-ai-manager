"use client";

import { useState } from "react";

interface PlanBlock {
  time: string;
  durationMinutes: number;
  title: string;
  note?: string;
}

function blockToTimes(dateISO: string, block: PlanBlock): { start: string; end: string } {
  const [h, m] = block.time.split(":").map(Number);
  const start = new Date(`${dateISO}T00:00:00`);
  start.setHours(h || 0, m || 0, 0, 0);
  const end = new Date(start.getTime() + (block.durationMinutes || 30) * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function CalendarBlockButton({ dateISO, block }: { dateISO: string; block: PlanBlock }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setState("saving");
    setMsg(null);
    const { start, end } = blockToTimes(dateISO, block);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: block.title, description: block.note, date: dateISO, startTime: start, endTime: end }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setState("done");
    } catch (err: any) {
      setState("error");
      setMsg(err.message);
    }
  }

  if (state === "done") return <span style={{ fontSize: 11, color: "var(--good, #0a6b0a)" }}>✓ Added</span>;
  return (
    <span>
      <button className="link-btn" onClick={sync} type="button" disabled={state === "saving"}>
        {state === "saving" ? "Adding…" : "📅 Add"}
      </button>
      {state === "error" && <div style={{ fontSize: 10.5, color: "var(--critical)", maxWidth: 160 }}>{msg}</div>}
    </span>
  );
}

export default function DayPlanCard() {
  const [plan, setPlan] = useState<PlanBlock[] | null>(null);
  const [dateISO, setDateISO] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/day-plan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate a plan");
      setPlan(data.plan);
      setDateISO(data.dateISO);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card section-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>AI Day Plan</h2>
          <div className="section-sub">
            Time-blocked from your rules, tasks, and Rahu Kalam/Yamagandam windows
          </div>
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading} type="button">
          {loading ? "Thinking…" : plan ? "Regenerate" : "Generate Today's Plan"}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!plan && !loading && !error && (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          Pulls your active projects, tasks due today, and inauspicious windows into one prompt and asks the model
          for a realistic 8am–8pm schedule. Nothing is written anywhere until you click &ldquo;Add&rdquo; on a block.
        </div>
      )}
      {plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {plan.map((block, i) => (
            <div
              key={i}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {block.time} <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>· {block.title}</span>
                </div>
                {block.note && <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>{block.note}</div>}
              </div>
              <CalendarBlockButton dateISO={dateISO} block={block} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
