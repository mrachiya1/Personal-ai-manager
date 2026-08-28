"use client";

import { useEffect, useState } from "react";

/**
 * What a delivered project cost you.
 *
 * The point is not sentiment. Two projects can both ship on time and only one
 * of them wrecks the following week — and the difference shows up nowhere in
 * a deadline, a value or a task count. Capturing it at the moment of delivery
 * (rather than reconstructing it later, when everything shipped feels fine)
 * gives the advisor something real to correlate against workload.
 *
 * Five options, ordered from best to worst, so the scale reads as a scale.
 */
export const FEELS = [
  { value: "Smooth flow", tone: "good", hint: "Everything lined up. Repeat this shape of work." },
  { value: "Highly satisfying", tone: "good", hint: "Hard, but the good kind. Worth the cost." },
  { value: "Grind but fine", tone: "neutral", hint: "Nothing wrong, nothing energising." },
  { value: "Heavy friction", tone: "warn", hint: "Fought the process, the client, or the tooling." },
  { value: "Burnout risk", tone: "bad", hint: "Cost more than it earned. Do not take this shape again." },
] as const;

export default function CompletionFeedback({
  projectName,
  initialFeel,
  initialNote,
  onCancel,
  onSave,
}: {
  projectName: string;
  initialFeel?: string;
  initialNote?: string;
  onCancel: () => void;
  onSave: (feel: string, note: string) => Promise<void> | void;
}) {
  const [feel, setFeel] = useState(initialFeel || "");
  const [note, setNote] = useState(initialNote || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !saving) onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!feel || saving) return;
    setSaving(true);
    await onSave(feel, note.trim());
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onCancel()}>
      <div className="modal cf-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Delivered — how did it feel?</h2>
        <div className="modal-sub">{projectName}</div>

        <form onSubmit={submit}>
          <div className="cf-options" role="radiogroup" aria-label="How the project felt">
            {FEELS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={feel === option.value}
                className={`cf-option ${option.tone}${feel === option.value ? " on" : ""}`}
                onClick={() => setFeel(option.value)}
              >
                <span className="cf-dot" aria-hidden />
                <span className="cf-body">
                  <span className="cf-name">{option.value}</span>
                  <span className="cf-hint">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="form-field" style={{ marginTop: 14 }}>
            <label htmlFor="cf-note">What made it feel that way?</label>
            <textarea
              id="cf-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Scope crept twice, renders ran overnight three times, client was decisive…"
            />
          </div>

          <p className="cf-why">
            Saved to the project in Notion. The advisor reads these back, so patterns across projects — not this one
            answer — are what it acts on.
          </p>

          <div className="form-actions">
            <button type="button" className="btn-discard" onClick={onCancel} disabled={saving}>
              Skip
            </button>
            <button type="submit" className="btn-save" disabled={!feel || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
