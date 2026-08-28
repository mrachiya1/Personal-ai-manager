"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScheduledBlock } from "@/lib/dashboard";
import { formatTimeAt } from "@/lib/clock";

/**
 * Today's plan, on the clock.
 *
 * Notion tasks carry a due date, not a time, so the times here are allocated
 * rather than stored: each task drops into the next favourable, unblocked
 * planetary hour. That makes the schedule defensible — every row can say
 * which hour it sits in and why that hour was free — and it means the plan
 * re-flows as the day is spent instead of going stale at 9am.
 *
 * Checkboxes write straight through to Notion and roll back on failure. A
 * checkbox that lies about having saved is worse than no checkbox.
 */
export default function SchedulePanel({
  blocks,
  live,
  tzOffset,
}: {
  blocks: ScheduledBlock[];
  /** False once the day's favourable windows have passed — the plan is then
   *  a record of how the day was shaped rather than a plan for it. */
  live: boolean;
  tzOffset: number;
}) {
  const [rows, setRows] = useState(blocks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const time = (iso: string) => formatTimeAt(iso, tzOffset);
  const done = rows.filter((r) => r.done).length;

  async function toggle(block: ScheduledBlock) {
    // Project deadlines appear here too, but they aren't tasks and have no
    // status to flip — better to show them and not pretend they're tickable.
    if (block.id.startsWith("project:")) return;
    const next = !block.done;
    const before = rows;
    setBusy(block.id);
    setError(null);
    setRows((prev) => prev.map((r) => (r.id === block.id ? { ...r, done: next } : r)));
    try {
      const res = await fetch(`/api/tasks/${block.id}`, {
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

  return (
    <div className="card section-card">
      <div className="sc-head">
        <div>
          <h2>
            Follow up today&rsquo;s plan to achieve your <b>Goals</b>
          </h2>
          <div className="section-sub">
            {live
              ? "Allocated into today\u2019s favourable hours, around the blocked windows"
              : "Today\u2019s windows have passed \u2014 this is how the day was laid out"}
          </div>
        </div>
        <span className="count-chip">
          {done}/{rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty-line">
          Nothing due today. Pull the nearest deadline forward, or add a task in Notion with today&rsquo;s date.
        </div>
      ) : (
        <div className="plan-rows">
          {rows.map((block) => {
            const fixed = block.id.startsWith("project:");
            return (
              <div className={`plan-row${block.done ? " done" : ""}`} key={block.id}>
                <button
                  className={`plan-check${block.done ? " on" : ""}${fixed ? " fixed" : ""}`}
                  onClick={() => toggle(block)}
                  disabled={busy === block.id || fixed}
                  aria-pressed={block.done}
                  aria-label={fixed ? `${block.title} — project deadline` : `Mark ${block.title} ${block.done ? "not done" : "done"}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </button>

                <div className="plan-main">
                  <div className="plan-title-row">
                    <span className="plan-title">{block.title}</span>
                    {block.milestone === "late" && <span className="badge overdue">Past deadline</span>}
                    {block.milestone === "today" && <span className="badge high">Deadline today</span>}
                  </div>
                  {block.projectName && <div className="plan-project">{block.projectName}</div>}
                  <div className="plan-vision">{block.vision}</div>
                </div>

                <div className="plan-when">
                  {/* A project deadline has no duration — it is a moment, not
                      a block. Printing "6:22 PM – 6:22 PM" for it looked like
                      a bug, because it reads like one. */}
                  <span className="pw-range">{fixed ? "Due today" : `${time(block.start)} – ${time(block.end)}`}</span>
                  {block.planet && !fixed && <span className="pw-hora">{block.planet} hora</span>}
                  {fixed && <span className="pw-hora">Project deadline</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
