"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { localInputToISO } from "@/lib/clock";

/**
 * Logging a night you forgot to tap through.
 *
 * The two buttons only work if you remember to press them at both ends, and
 * a missed night leaves a hole that quietly drags the average down — which
 * then feeds the deep-work capacity figure on the dashboard. This closes
 * that hole.
 *
 * Times are entered as workspace wall-clock, not browser wall-clock: see
 * localInputToISO. Duration is shown live but computed again on the server,
 * so a manual entry and a tapped one are calculated the same way.
 */
export default function SleepManualForm({ tzOffset }: { tzOffset: number }) {
  const [sleep, setSleep] = useState("");
  const [wake, setWake] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const router = useRouter();

  const duration = useMemo(() => {
    const a = localInputToISO(sleep, tzOffset);
    const b = localInputToISO(wake, tzOffset);
    if (!a || !b) return null;
    return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  }, [sleep, wake, tzOffset]);

  /**
   * Yesterday 11pm to today 7am — the shape of most missed entries.
   *
   * Clamped to now, because between midnight and 7am the naive version fills
   * in a wake time that hasn't happened yet, and the form would then refuse
   * to submit without saying why.
   */
  function fillLastNight() {
    const nowLocal = new Date(Date.now() + tzOffset * 3600_000);
    const today = nowLocal.toISOString().slice(0, 10);
    const yesterday = new Date(nowLocal.getTime() - 86400_000).toISOString().slice(0, 10);
    const start = `${yesterday}T23:00`;
    const seven = `${today}T07:00`;
    const nowInput = nowLocal.toISOString().slice(0, 16);
    setSleep(start);
    setWake(seven > nowInput ? nowInput : seven);
    setNote(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sleepISO = localInputToISO(sleep, tzOffset);
    if (!sleepISO || saving) return;
    const wakeISO = localInputToISO(wake, tzOffset);
    if (wakeISO && duration !== null && duration <= 0) {
      setNote({ text: "Wake time has to be after the sleep time.", err: true });
      return;
    }
    if (future) {
      setNote({ text: "That time hasn't happened yet — this is for nights already behind you.", err: true });
      return;
    }

    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", sleepISO, wakeISO, notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that");
      setSleep("");
      setWake("");
      setNotes("");
      setNote({ text: "Added to your sleep history" });
      router.refresh();
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Couldn't save that", err: true });
    } finally {
      setSaving(false);
    }
  }

  const bad = duration !== null && duration <= 0;
  const long = duration !== null && duration > 16;
  // The browser's own `max` attribute blocks submit silently, with no message
  // anywhere on screen. Checking it here means the reason is always visible.
  const future = useMemo(() => {
    const now = Date.now();
    return [sleep, wake].some((v) => {
      const iso = localInputToISO(v, tzOffset);
      return iso ? new Date(iso).getTime() > now + 60_000 : false;
    });
  }, [sleep, wake, tzOffset]);

  return (
    <form className="sleep-manual" onSubmit={submit}>
      <div className="sm-grid">
        <label className="sm-field">
          <span>Went to sleep</span>
          <input
            type="datetime-local"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            required
          />
        </label>
        <label className="sm-field">
          <span>Woke up</span>
          <input
            type="datetime-local"
            value={wake}
            onChange={(e) => setWake(e.target.value)}
          />
        </label>
        <div className="sm-field">
          <span>Duration</span>
          <div className={`sm-duration${bad ? " bad" : long ? " odd" : ""}`}>
            {duration === null ? "—" : `${duration.toFixed(1)}h`}
          </div>
        </div>
      </div>

      <label className="sm-field">
        <span>Notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Late render, woke twice, anything worth remembering"
        />
      </label>

      <div className="sm-actions">
        <button type="button" className="btn-discard" onClick={fillLastNight}>
          Last night
        </button>
        {note && <span className={`hub-note${note.err ? " err" : ""}`}>{note.text}</span>}
        {!note && bad && <span className="hub-note err">Wake time has to be after the sleep time.</span>}
        {!note && long && <span className="hub-note err">{duration.toFixed(1)}h — check the dates.</span>}
        {!note && !bad && !long && future && (
          <span className="hub-note err">That time hasn&rsquo;t happened yet.</span>
        )}
        <button type="submit" className="btn-save" disabled={saving || !sleep || bad || future}>
          {saving ? "Saving…" : "Add entry"}
        </button>
      </div>

      <p className="sm-hint">
        Leave &ldquo;woke up&rdquo; empty to record an open night you are still in. Duration is calculated on save, the
        same way the buttons calculate it.
      </p>
    </form>
  );
}
