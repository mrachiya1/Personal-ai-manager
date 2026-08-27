"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FinanceGoal, Idea, LearningTopic } from "@/lib/types";

type Tab = "idea" | "learning" | "goal";

const IDEA_TAGS = ["Product", "Client", "Studio", "Pipeline", "Content", "Personal"];
const SKILL_SEEDS = ["SMC", "Procedural Shading", "Python", "Houdini", "Nuke", "Sales"];

/** Days between two ISO dates, positive when `b` is later. */
function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

/**
 * Two bars, two different questions.
 *
 * Progress alone flatters you: 40% done sounds fine until you notice 80% of
 * the time is gone. Putting elapsed time directly underneath is the whole
 * point — when the lower bar overtakes the upper one, the item is behind,
 * and the bar turns to say so without needing a label.
 */
function DualBars({
  progress,
  elapsed,
  progressLabel,
  elapsedLabel,
}: {
  progress: number;
  elapsed: number | null;
  progressLabel: string;
  elapsedLabel: string;
}) {
  const behind = elapsed !== null && elapsed > progress + 8;
  return (
    <div className="dual">
      <div className="dual-row">
        <span className="dual-key">Progress</span>
        <span className="dual-track">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
        <span className="dual-val">{progressLabel}</span>
      </div>
      <div className={`dual-row time${behind ? " behind" : ""}`}>
        <span className="dual-key">{elapsed === null ? "No deadline" : "Time"}</span>
        <span className="dual-track">
          <i style={{ width: `${elapsed === null ? 0 : Math.max(0, Math.min(100, elapsed))}%` }} />
        </span>
        <span className="dual-val">{elapsedLabel}</span>
      </div>
    </div>
  );
}

function money(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function GrowthHub({
  goals,
  learning,
  ideas,
  todayISO,
}: {
  goals: FinanceGoal[];
  learning: LearningTopic[];
  ideas: Idea[];
  todayISO: string;
}) {
  const [tab, setTab] = useState<Tab>("idea");
  const [text, setText] = useState("");
  const [tag, setTag] = useState(IDEA_TAGS[0]);
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setNote(null);

    const endpoint = tab === "idea" ? "/api/ideas" : tab === "learning" ? "/api/learning" : "/api/finance-goals";
    const body =
      tab === "idea"
        ? { idea: text.trim(), priority: "Later", tags: [tag] }
        : tab === "learning"
          ? { topic: text.trim(), progress: "In Progress", description: tag }
          : { goal: text.trim(), targetAmount: Number(amount) || 0, deadline: deadline || undefined, type: "Company" };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that");
      setText("");
      setAmount("");
      setDeadline("");
      setNote({ text: "Saved to Notion" });
      router.refresh();
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Couldn't save that", err: true });
    } finally {
      setSaving(false);
    }
  }

  const activeGoals = goals.filter((g) => g.currentAmount < g.targetAmount || !g.targetAmount).slice(0, 4);
  const activeLearning = learning.filter((t) => t.progress !== "Completed").slice(0, 4);

  return (
    <div className="side-stack">
      <div className="card section-card">
        <div className="sc-head">
          <div>
            <h2>Capture</h2>
            <div className="section-sub">Straight into Notion, no page change</div>
          </div>
        </div>

        <div className="hub-tabs" role="tablist">
          {(
            [
              ["idea", "Idea vault"],
              ["learning", "Mastery"],
              ["goal", "Goal"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`hub-tab${tab === key ? " on" : ""}`}
              onClick={() => {
                setTab(key);
                setNote(null);
                setTag(key === "learning" ? SKILL_SEEDS[0] : IDEA_TAGS[0]);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="hub-form">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              tab === "idea"
                ? "What's the idea?"
                : tab === "learning"
                  ? "Skill or topic to master"
                  : "Goal — what are you aiming at?"
            }
          />

          {tab !== "goal" && (
            <div className="hub-chips">
              {(tab === "idea" ? IDEA_TAGS : SKILL_SEEDS).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`form-chip${tag === t ? " on" : ""}`}
                  onClick={() => setTag(t)}
                  aria-pressed={tag === t}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {tab === "goal" && (
            <div className="hub-pair">
              <input
                type="number"
                min="0"
                placeholder="Target amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          )}

          <div className="hub-actions">
            {note && <span className={`hub-note${note.err ? " err" : ""}`}>{note.text}</span>}
            <button type="submit" className="btn-save" disabled={saving || !text.trim()}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </form>

        {ideas.length > 0 && (
          <div className="hub-recent">
            {ideas.slice(0, 5).map((idea) => (
              <span className="idea-tag" key={idea.id}>
                {idea.idea}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card section-card">
        <div className="sc-head">
          <div>
            <h2>Goals in flight</h2>
            <div className="section-sub">Money raised against time spent</div>
          </div>
          <span className="count-chip">{activeGoals.length}</span>
        </div>

        {activeGoals.length === 0 ? (
          <div className="empty-line">No open goals. Add one above and it appears here.</div>
        ) : (
          activeGoals.map((goal) => {
            const progress = goal.targetAmount ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
            // Elapsed runs from the day the goal was created — Notion gives us
            // that for free — so the clock is real rather than assumed.
            let elapsed: number | null = null;
            let elapsedLabel = "Open-ended";
            if (goal.deadline) {
              const from = goal.createdTime?.slice(0, 10) || todayISO;
              const total = daysBetween(from, goal.deadline);
              const gone = daysBetween(from, todayISO);
              elapsed = total > 0 ? (gone / total) * 100 : 100;
              const left = Math.round(daysBetween(todayISO, goal.deadline));
              elapsedLabel = left < 0 ? `${Math.abs(left)}d over` : `${left}d left`;
            }
            return (
              <div className="hub-item" key={goal.id}>
                <div className="hub-item-top">
                  <span className="hi-name">{goal.goal}</span>
                  <span className="hi-meta">
                    {money(goal.currentAmount)} / {money(goal.targetAmount)}
                  </span>
                </div>
                <DualBars
                  progress={progress}
                  elapsed={elapsed}
                  progressLabel={`${Math.round(progress)}%`}
                  elapsedLabel={elapsedLabel}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="card section-card">
        <div className="sc-head">
          <div>
            <h2>Mastery in progress</h2>
            <div className="section-sub">Skill depth against time invested</div>
          </div>
          <span className="count-chip">{activeLearning.length}</span>
        </div>

        {activeLearning.length === 0 ? (
          <div className="empty-line">Nothing in progress. Add a skill above.</div>
        ) : (
          activeLearning.map((topic) => {
            // A "Completion" column is used when the workspace has one;
            // otherwise the status is all we honestly know, so say so.
            const exact = typeof topic.completion === "number";
            const progress = exact ? topic.completion! : topic.progress === "In Progress" ? 50 : 0;

            let elapsed: number | null = null;
            let elapsedLabel = "No target date";
            const from = topic.createdTime?.slice(0, 10);
            if (from) {
              // No target date set? Measure against a 90-day mastery window,
              // which is long enough to mean something and short enough to
              // stop a topic sitting open for a year unnoticed.
              const end =
                topic.targetDate ||
                new Date(new Date(from).getTime() + 90 * 86400000).toISOString().slice(0, 10);
              const total = daysBetween(from, end);
              elapsed = total > 0 ? (daysBetween(from, todayISO) / total) * 100 : 100;
              const left = Math.round(daysBetween(todayISO, end));
              elapsedLabel = topic.targetDate
                ? left < 0
                  ? `${Math.abs(left)}d over`
                  : `${left}d left`
                : `day ${Math.max(1, Math.round(daysBetween(from, todayISO)))}/90`;
            }

            return (
              <div className="hub-item" key={topic.id}>
                <div className="hub-item-top">
                  <span className="hi-name">{topic.topic}</span>
                  <span className="hi-meta">{exact ? `${Math.round(progress)}%` : topic.progress}</span>
                </div>
                <DualBars
                  progress={progress}
                  elapsed={elapsed}
                  progressLabel={exact ? `${Math.round(progress)}%` : "est."}
                  elapsedLabel={elapsedLabel}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
