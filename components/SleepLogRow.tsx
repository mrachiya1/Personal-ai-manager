"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SleepLog } from "@/lib/types";
import { formatDateTimeAt, isoToLocalInput, localInputToISO } from "@/lib/clock";

/**
 * One night in the history, correctable in place.
 *
 * A mistimed tap used to leave you with delete-and-retype as the only repair,
 * which loses the notes with it. Editing keeps the row and its place in the
 * history.
 */
export default function SleepLogRow({ log, tzOffset }: { log: SleepLog; tzOffset: number }) {
  const [editing, setEditing] = useState(false);
  const [sleep, setSleep] = useState(isoToLocalInput(log.sleepTime, tzOffset));
  const [wake, setWake] = useState(isoToLocalInput(log.wakeTime, tzOffset));
  const [notes, setNotes] = useState(log.notes || "");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    const sleepISO = localInputToISO(sleep, tzOffset);
    if (!sleepISO) {
      setError("A sleep time is required.");
      return;
    }
    const wakeISO = localInputToISO(wake, tzOffset);
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/sleep/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sleepISO, wakeISO: wakeISO ?? null, notes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/sleep/${log.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't delete that");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that");
      setBusy(null);
    }
  }

  if (editing) {
    const preview = (() => {
      const a = localInputToISO(sleep, tzOffset);
      const b = localInputToISO(wake, tzOffset);
      if (!a || !b) return "—";
      return `${((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000).toFixed(1)}h`;
    })();

    return (
      <tr className="sleep-editing">
        <td colSpan={5}>
          <div className="sm-grid">
            <label className="sm-field">
              <span>Went to sleep</span>
              <input type="datetime-local" value={sleep} onChange={(e) => setSleep(e.target.value)} />
            </label>
            <label className="sm-field">
              <span>Woke up</span>
              <input type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} />
            </label>
            <div className="sm-field">
              <span>Duration</span>
              <div className="sm-duration">{preview}</div>
            </div>
          </div>
          <label className="sm-field" style={{ marginTop: 10 }}>
            <span>Notes</span>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="sm-actions">
            {error && <span className="hub-note err">{error}</span>}
            <button type="button" className="btn-discard" onClick={() => setEditing(false)} disabled={busy !== null}>
              Cancel
            </button>
            <button type="button" className="btn-save" onClick={save} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{log.sleepTime ? formatDateTimeAt(log.sleepTime, tzOffset) : "—"}</td>
      <td>{log.wakeTime ? formatDateTimeAt(log.wakeTime, tzOffset) : <span className="sleep-open">Still asleep</span>}</td>
      <td>{log.durationHours != null ? `${log.durationHours}h` : "—"}</td>
      <td>{log.notes || "—"}</td>
      <td className="sleep-actions">
        <button className="link-btn" type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={remove}
          disabled={busy !== null}
          style={{ color: "var(--ink-muted)" }}
        >
          {busy === "delete" ? "…" : "Delete"}
        </button>
        {error && <div className="form-error" style={{ marginTop: 6 }}>{error}</div>}
      </td>
    </tr>
  );
}
