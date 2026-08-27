"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LearningTopic } from "@/lib/types";

/**
 * The skills ladder, with a checkbox that actually writes back.
 *
 * Ticking marks the topic Completed in Notion and unticking returns it to In
 * Progress. Where the workspace has a "Completion" number column the exact
 * figure is shown; where it doesn't, the status is all that is honestly known
 * and the row says so rather than inventing a percentage.
 */
export default function LearningPanel({ topics }: { topics: LearningTopic[] }) {
  const [rows, setRows] = useState(topics);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle(topic: LearningTopic) {
    const next = topic.progress === "Completed" ? "In Progress" : "Completed";
    const before = rows;
    setBusy(topic.id);
    setError(null);
    setRows((prev) => prev.map((t) => (t.id === topic.id ? { ...t, progress: next } : t)));
    try {
      const res = await fetch(`/api/learning/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: next }),
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

  const active = rows.filter((t) => t.progress !== "Completed");
  const recentlyDone = rows.filter((t) => t.progress === "Completed").slice(0, 2);
  const shown = [...active, ...recentlyDone];

  return (
    <div className="card section-card">
      <div className="sc-head">
        <div>
          <h2>Learn for your next step</h2>
          <div className="section-sub">Skills in progress, and how far each one is</div>
        </div>
        <span className="count-chip">{active.length}</span>
      </div>

      {shown.length === 0 ? (
        <div className="empty-line">Nothing on the ladder. Add a skill in the capture panel.</div>
      ) : (
        <div className="learn-rows">
          {shown.map((topic) => {
            const done = topic.progress === "Completed";
            const exact = typeof topic.completion === "number";
            const pct = done ? 100 : exact ? topic.completion! : topic.progress === "In Progress" ? 50 : 0;
            return (
              <div className={`learn-row${done ? " done" : ""}`} key={topic.id}>
                <button
                  className={`plan-check${done ? " on" : ""}`}
                  onClick={() => toggle(topic)}
                  disabled={busy === topic.id}
                  aria-pressed={done}
                  aria-label={`Mark ${topic.topic} ${done ? "in progress" : "complete"}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </button>
                <div className="learn-main">
                  <div className="learn-top">
                    <span className="learn-name">{topic.topic}</span>
                    <span className="learn-pct">{exact || done ? `${Math.round(pct)}%` : topic.progress}</span>
                  </div>
                  <div className="learn-track">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  {topic.description && <div className="learn-note">{topic.description}</div>}
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
