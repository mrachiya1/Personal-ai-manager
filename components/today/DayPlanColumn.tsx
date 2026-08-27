"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MeetingSlot } from "@/lib/dashboard";
import { formatTimeAt } from "@/lib/clock";

export interface PlanTask {
  id: string;
  title: string;
  done: boolean;
  projectName?: string;
  /** Why shipping this matters, drawn from the project record. */
  vision: string;
  /** "today" for a deadline landing today, "late" for one already past. */
  milestone: "today" | "late" | "week" | null;
  due?: string;
}

export interface PlanSlot {
  start: string;
  end: string;
  title: string;
  kind: "deep" | "rest" | "meeting" | "blocked";
  note?: string;
}

/**
 * The left column: what the day looks like on a clock, then what has to be
 * true by the end of it.
 *
 * Checkboxes write straight through to Notion and roll back on failure —
 * a checkbox that lies about having saved is worse than no checkbox.
 */
export default function DayPlanColumn({
  slots,
  tasks,
  meetings,
  tzOffset,
}: {
  slots: PlanSlot[];
  tasks: PlanTask[];
  meetings: MeetingSlot[];
  /** The user's UTC offset, resolved on the server — a client component can't
   *  read the settings store, and the browser's own timezone is not
   *  necessarily the one they work in. */
  tzOffset: number;
}) {
  const time = (iso: string) => formatTimeAt(iso, tzOffset);
  const [rows, setRows] = useState(tasks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle(task: PlanTask) {
    const next = !task.done;
    setBusy(task.id);
    setError(null);
    const before = rows;
    setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: next } : t)));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "Done" : "In Progress" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that");
      router.refresh();
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  const doneCount = rows.filter((t) => t.done).length;

  return (
    <div className="side-stack">
      <div className="card section-card">
        <div className="sc-head">
          <div>
            <h2>Today on the clock</h2>
            <div className="section-sub">Horas, meetings and blocked windows, in your timezone</div>
          </div>
        </div>

        {slots.length === 0 ? (
          <div className="empty-line">Sunrise data unavailable — no time blocks to lay out.</div>
        ) : (
          <ol className="tl">
            {slots.map((slot, i) => (
              <li key={i} className={`tl-row ${slot.kind}`}>
                <span className="tl-time">
                  {time(slot.start)}
                  <i>{time(slot.end)}</i>
                </span>
                <span className="tl-rail" aria-hidden />
                <span className="tl-body">
                  <span className="tl-title">{slot.title}</span>
                  {slot.note && <span className="tl-note">{slot.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        {meetings.length > 0 && (
          <div className="tl-meetings">
            {meetings.map((m) => (
              <div key={m.id} className={`tl-meeting${m.clash ? " clash" : ""}`}>
                <span className="tm-time">{m.allDay ? "All day" : time(m.start)}</span>
                <span className="tm-name">{m.summary}</span>
                {m.attendees > 0 && <span className="tm-people">{m.attendees}</span>}
                {m.clash && <span className="badge overdue">{m.clash}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card section-card">
        <div className="sc-head">
          <div>
            <h2>Ships today</h2>
            <div className="section-sub">Each one tied to what it actually buys</div>
          </div>
          <span className="count-chip">
            {doneCount}/{rows.length}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-line">Nothing due today. Pull tomorrow&rsquo;s nearest deadline forward.</div>
        ) : (
          <div>
            {rows.map((task) => (
              <div className={`vt${task.done ? " done" : ""}`} key={task.id}>
                <button
                  className={`vt-check${task.done ? " on" : ""}`}
                  onClick={() => toggle(task)}
                  disabled={busy === task.id}
                  aria-pressed={task.done}
                  aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </button>
                <div className="vt-body">
                  <div className="vt-top">
                    <span className="vt-title">{task.title}</span>
                    {task.milestone === "late" && <span className="badge overdue">Past deadline</span>}
                    {task.milestone === "today" && <span className="badge high">Deadline today</span>}
                    {task.milestone === "week" && task.due && <span className="badge pending">Due {task.due}</span>}
                  </div>
                  {task.projectName && <div className="vt-project">{task.projectName}</div>}
                  <div className="vt-vision">{task.vision}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}
