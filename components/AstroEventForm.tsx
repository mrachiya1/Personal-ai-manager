"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewAstroEventButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [keyTransits, setKeyTransits] = useState("");
  const [aiInterpretation, setAiInterpretation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/astro-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), eventDate, keyTransits, aiInterpretation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOpen(false);
      setName(""); setKeyTransits(""); setAiInterpretation("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="link-btn" onClick={() => setOpen(true)} type="button">+ Manual entry</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Log an Astro Event</h2>
            <div className="modal-sub">For a reading or transit note not covered by the automated data above</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saturn return reading" autoFocus />
              </div>
              <div className="form-field">
                <label>Event Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Key Transits</label>
                <textarea value={keyTransits} onChange={(e) => setKeyTransits(e.target.value)} placeholder="What's happening astrologically" />
              </div>
              <div className="form-field">
                <label>Interpretation / Notes</label>
                <textarea value={aiInterpretation} onChange={(e) => setAiInterpretation(e.target.value)} />
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="form-actions">
                <button type="button" className="btn-discard" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
