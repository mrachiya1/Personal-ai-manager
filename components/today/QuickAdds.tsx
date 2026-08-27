"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea } from "@/lib/types";

type Lane = "Ideas" | "Research" | "Learning";

const LANES: Lane[] = ["Ideas", "Research", "Learning"];

const IDEA_TAGS = ["Product", "Client", "Studio", "Pipeline", "Content", "Personal"];
const RESEARCH_TAGS = ["Market", "Tooling", "Competitor", "Technique", "Pricing"];
const SKILL_TAGS = ["SMC", "Procedural Shading", "Python", "Houdini", "n8n", "Sales"];

function tagsFor(lane: Lane) {
  return lane === "Ideas" ? IDEA_TAGS : lane === "Research" ? RESEARCH_TAGS : SKILL_TAGS;
}

/**
 * Capture without leaving the page.
 *
 * Ideas and Research both land in the Ideas database — there is no separate
 * Research table in the workspace, and inventing one would mean a second
 * place to look for the same kind of note. Research entries are tagged
 * "Research" plus their topic, so they stay filterable in Notion and the lane
 * is a real distinction rather than a cosmetic one.
 */
export default function QuickAdds({ recent }: { recent: Idea[] }) {
  const [lane, setLane] = useState<Lane>("Ideas");
  const [text, setText] = useState("");
  const [tag, setTag] = useState(IDEA_TAGS[0]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const router = useRouter();

  function switchLane(next: Lane) {
    setLane(next);
    setTag(tagsFor(next)[0]);
    setNote(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setNote(null);

    const endpoint = lane === "Learning" ? "/api/learning" : "/api/ideas";
    const body =
      lane === "Learning"
        ? { topic: text.trim(), progress: "In Progress", description: tag }
        : {
            idea: text.trim(),
            priority: lane === "Research" ? "Later" : "Now",
            tags: lane === "Research" ? ["Research", tag] : [tag],
          };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that");
      setText("");
      setNote({ text: `Saved to ${lane === "Learning" ? "Learning" : "Ideas"} in Notion` });
      router.refresh();
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Couldn't save that", err: true });
    } finally {
      setSaving(false);
    }
  }

  const placeholder =
    lane === "Ideas"
      ? "+ Add your idea here…"
      : lane === "Research"
        ? "+ What needs looking into?"
        : "+ Skill or topic to master";

  return (
    <div className="card section-card">
      <div className="sc-head">
        <div>
          <h2>Quick adds</h2>
          <div className="section-sub">Straight into Notion, no page change</div>
        </div>
        <div className="qa-tabs" role="tablist" aria-label="Capture lane">
          {LANES.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={lane === l}
              className={`qa-tab${lane === l ? " on" : ""}`}
              onClick={() => switchLane(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <form className="qa-form" onSubmit={submit}>
        <textarea
          className="qa-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits — the textarea is multi-line on purpose,
            // so plain Enter has to keep inserting newlines.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />

        <div className="qa-chips">
          {tagsFor(lane).map((t) => (
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

        <div className="qa-actions">
          {note && <span className={`hub-note${note.err ? " err" : ""}`}>{note.text}</span>}
          <button type="submit" className="btn-save" disabled={saving || !text.trim()}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <div className="qa-recent">
          {recent.slice(0, 5).map((idea) => (
            <span className="idea-tag" key={idea.id}>
              {idea.idea}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
