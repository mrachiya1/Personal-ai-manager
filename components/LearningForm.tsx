"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewLearningTopicButton() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [resources, setResources] = useState("");
  const [progress, setProgress] = useState("Not Started");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), description, resources, progress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add topic");
      setOpen(false);
      setTopic(""); setDescription(""); setResources(""); setProgress("Not Started");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18M3 12h18" />
        </svg>
        New Topic
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Learning Topic</h2>
            <div className="modal-sub">Writes straight to your Notion Learning Topics database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Topic</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
              </div>
              <div className="form-field">
                <label>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Resources</label>
                <textarea value={resources} onChange={(e) => setResources(e.target.value)} placeholder="Links, courses, books…" />
              </div>
              <div className="form-field">
                <label>Progress</label>
                <select value={progress} onChange={(e) => setProgress(e.target.value)}>
                  <option>Not Started</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
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
