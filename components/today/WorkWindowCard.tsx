"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimeAt } from "@/lib/clock";
import type { DayPlan } from "@/lib/dayPlan";
import type { WorkWindow } from "@/lib/workday";

/**
 * The hours, and the day built inside them.
 *
 * This sits at the top of Today because it is the first thing done in the
 * morning and it governs everything below it. The card holds three moves in
 * one place — state the hours, see what fits, put it on the calendar —
 * because splitting them across three screens is how a daily habit dies.
 *
 * The plan is fetched rather than passed down. The server render deliberately
 * skips the Google Calendar round trip so a third-party outage can never take
 * the dashboard with it; this card asks for the booked-aware version once it
 * is on screen, and says so when the calendar could not be read.
 */

const SOURCE_NOTE: Record<WorkWindow["source"], string> = {
  manual: "set for today",
  wake: "from when you woke up",
  pattern: "your usual day",
  default: "default — set your hours",
};

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function WorkWindowCard({
  window: initialWindow,
  plan: initialPlan,
  tzOffset,
  calendarConnected,
}: {
  window: WorkWindow;
  plan: DayPlan;
  tzOffset: number;
  calendarConnected: boolean;
}) {
  const router = useRouter();
  const [win, setWin] = useState(initialWindow);
  const [plan, setPlan] = useState(initialPlan);
  const [start, setStart] = useState(initialWindow.start);
  const [end, setEnd] = useState(initialWindow.end);
  const [alsoPattern, setAlsoPattern] = useState(false);
  const [editing, setEditing] = useState(initialWindow.source === "default");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const time = (iso: string) => formatTimeAt(iso, tzOffset);

  const refreshPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/plan", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.plan) setPlan(data.plan);
    } catch {
      // The server-rendered plan is already on screen and is correct about
      // everything except bookings. Failing quietly here is better than an
      // error banner about a refresh the person never asked for.
    }
  }, []);

  useEffect(() => {
    if (calendarConnected) refreshPlan();
  }, [calendarConnected, refreshPlan]);

  async function save() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/workday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, alsoPattern }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save those hours");
      setWin(data.window);
      setEditing(false);
      setNote(alsoPattern ? "Saved, and this is your usual day now." : "Hours set for today.");
      await refreshPlan();
      // The schedule panel, the capacity card and the greeting all read the
      // same window on the server — they have to be re-rendered, not left
      // showing a day that no longer exists.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those hours");
    } finally {
      setSaving(false);
    }
  }

  async function push() {
    setPushing(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/plan/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: plan.dateISO }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't reach Google Calendar");
      setNote(
        `${data.segments} block${data.segments === 1 ? "" : "s"} and ${data.tasks} task${data.tasks === 1 ? "" : "s"} on your calendar` +
          (data.removed ? `, replacing ${data.removed} from the last push` : "") +
          (data.unplaced ? `. ${data.unplaced} didn't fit.` : ".")
      );
      if (data.plan) setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach Google Calendar");
    } finally {
      setPushing(false);
    }
  }

  const taskCount = plan.segments.reduce((n, s) => n + s.tasks.length, 0);
  const shown = expanded ? plan.segments : plan.segments.filter((s) => s.tasks.length).slice(0, 2);

  return (
    <section className="card ww-card">
      <div className="ww-head">
        <div className="ww-hours">
          <span className="ww-label">Working today</span>
          {editing ? (
            <div className="ww-edit">
              <input
                type="time"
                className="ww-time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label="Work start time"
              />
              <span className="ww-dash">to</span>
              <input
                type="time"
                className="ww-time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                aria-label="Work end time"
              />
              <label className="ww-usual">
                <input type="checkbox" checked={alsoPattern} onChange={(e) => setAlsoPattern(e.target.checked)} />
                Make this my usual day
              </label>
              <button className="btn-save" onClick={save} disabled={saving} type="button">
                {saving ? "Saving…" : "Save"}
              </button>
              {win.source !== "default" && (
                <button
                  className="btn-discard"
                  type="button"
                  onClick={() => {
                    setStart(win.start);
                    setEnd(win.end);
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div className="ww-show">
              <strong className="ww-range">
                {win.start} – {win.end}
              </strong>
              <span className={`ww-source${win.source === "pattern" || win.source === "default" ? " soft" : ""}`}>
                {SOURCE_NOTE[win.source]}
              </span>
              <button className="link-btn" type="button" onClick={() => setEditing(true)}>
                Change
              </button>
            </div>
          )}
        </div>

        {!editing && (
          <div className="ww-actions">
            <button className="btn-save" type="button" onClick={push} disabled={pushing || !taskCount}>
              {pushing ? "Sending…" : "Put on Google Calendar"}
            </button>
          </div>
        )}
      </div>

      {win.over && !editing && (
        <p className="ww-warn">
          Your hours ended at {win.end}. Nothing new will be planned today until you set a later finish.
        </p>
      )}

      <div className="ww-summary">
        {taskCount ? (
          <>
            <strong>{taskCount}</strong> task{taskCount === 1 ? "" : "s"} across{" "}
            <strong>{plan.segments.filter((s) => s.kind !== "reset").length}</strong> block
            {plan.segments.filter((s) => s.kind !== "reset").length === 1 ? "" : "s"} ·{" "}
            {hoursLabel(plan.minutesPlanned)} planned, {hoursLabel(plan.minutesFree)} spare
            {plan.unplaced.length > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="ww-over" title={plan.unplaced.slice(0, 8).map((t) => t.title).join("\n")}>
                  {plan.unplaced.length} didn&apos;t fit
                </span>
              </>
            )}
          </>
        ) : (
          <span className="ww-empty">
            Nothing to plan — either there are no open tasks, or your hours have no room left in them.
          </span>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="ww-segments">
          {shown.map((seg) => (
            <li key={seg.id} className={`ww-seg ${seg.kind}`}>
              <div className="ww-seg-head">
                <span className="ww-seg-time">
                  {time(seg.start)} – {time(seg.end)}
                </span>
                <span className="ww-seg-label">{seg.label}</span>
                {seg.planets.length > 0 && <span className="ww-seg-planet">{seg.planets.join("/")} hora</span>}
              </div>
              {seg.kind === "reset" ? (
                <p className="ww-seg-reason">{seg.reason}</p>
              ) : (
                <ul className="ww-seg-tasks">
                  {seg.tasks.map((t) => (
                    <li key={t.id}>
                      <span className="ww-t-time">{time(t.start)}</span>
                      <span className="ww-t-title">{t.title}</span>
                      {t.urgency === "overdue" && <span className="ww-t-flag late">late</span>}
                      {t.projectName && <span className="ww-t-project">{t.projectName}</span>}
                    </li>
                  ))}
                  {!seg.tasks.length && <li className="ww-t-empty">Open — nothing allocated here</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {plan.segments.length > shown.length && (
        <button className="link-btn ww-more" type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show all ${plan.segments.length} blocks`}
        </button>
      )}

      {plan.busy.filter((b) => !b.ours).length > 0 && (
        <p className="ww-busy">
          Planned around {plan.busy.filter((b) => !b.ours).length} thing
          {plan.busy.filter((b) => !b.ours).length === 1 ? "" : "s"} already on your calendar:{" "}
          {plan.busy
            .filter((b) => !b.ours)
            .slice(0, 3)
            .map((b) => `${time(b.start)} ${b.label}`)
            .join(", ")}
        </p>
      )}

      {plan.busyUnknown && (
        <p className="ww-warn">
          {calendarConnected
            ? "Couldn't read your calendar just now, so this plan doesn't account for anything already booked."
            : "Google Calendar isn't connected yet — add your service account on Settings → Integrations and this will plan around your meetings."}
        </p>
      )}

      {note && <p className="ww-note">{note}</p>}
      {error && <p className="ww-error">{error}</p>}
    </section>
  );
}
