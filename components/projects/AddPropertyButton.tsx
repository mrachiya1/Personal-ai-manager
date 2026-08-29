"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOM_TYPES, type CustomType } from "@/lib/customProps";
import { Popover } from "./editable";

function TypeIcon({ kind }: { kind: string }) {
  const c = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "text": return <svg {...c}><path d="M4 7h16M4 12h12M4 17h8" /></svg>;
    case "number": return <svg {...c}><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></svg>;
    case "select": return <svg {...c}><path d="M6 9l6 6 6-6" /></svg>;
    case "tags": return <svg {...c}><path d="M3 7v6l8 8 6-6-8-8H3Z" /><circle cx="7" cy="11" r="1.2" /><path d="m14 3 7 7-3 3" /></svg>;
    case "status": return <svg {...c}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" /></svg>;
    case "date": return <svg {...c}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>;
    case "person": return <svg {...c}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
    case "files": return <svg {...c}><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 19a2 2 0 0 1-3-3l8-8" /></svg>;
    case "checkbox": return <svg {...c}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg>;
    case "link": return <svg {...c}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>;
    case "email": return <svg {...c}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case "phone": return <svg {...c}><path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" /></svg>;
    default: return <svg {...c}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

/**
 * Notion's schema builder, in the table header.
 *
 * Two steps rather than one form: pick the type, then name it. That is the
 * order Notion uses and the order the decision actually happens in — you know
 * you want a date before you know what to call it — and it keeps the popover
 * to one readable column instead of a type dropdown beside a text field.
 *
 * The new column appears after a refresh rather than being spliced into local
 * state, because the property has to exist in Notion before a cell can write
 * to it. Optimism that outruns the schema produces a column whose every edit
 * fails.
 */
export default function AddPropertyButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CustomType | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setOpen(false);
    setType(null);
    setName("");
    setError(null);
    setNote(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notion/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Notion refused the new property");
      if (data.note) {
        setNote(data.note);
        setSaving(false);
        router.refresh();
        return;
      }
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that property");
      setSaving(false);
    }
  }

  return (
    <div className="ap-wrap">
      <button
        className="ap-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add a property to the Projects database"
        title="Add a property"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {open && (
        <Popover onClose={reset}>
          {!type ? (
            <>
              <div className="ed-pop-head">New property</div>
              {CUSTOM_TYPES.map((t) => (
                <button key={t.type} className="ap-type" onClick={() => setType(t.type)}>
                  <span className="ap-type-icon">
                    <TypeIcon kind={t.icon} />
                  </span>
                  <span className="ap-type-body">
                    <span className="ap-type-name">{t.label}</span>
                    <span className="ap-type-hint">{t.hint}</span>
                  </span>
                </button>
              ))}
              <div className="ap-foot">
                Formulas, rollups and relations aren&rsquo;t offered — Notion computes them, so there would be nothing
                to edit here.
              </div>
            </>
          ) : (
            <form className="ap-name" onSubmit={create}>
              <button type="button" className="ap-back" onClick={() => { setType(null); setError(null); setNote(null); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {CUSTOM_TYPES.find((t) => t.type === type)?.label}
              </button>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type property name…"
                maxLength={60}
              />
              {error && <div className="ap-error">{error}</div>}
              {note && <div className="ap-note">{note}</div>}
              <div className="ap-actions">
                <button type="button" className="btn-discard" onClick={reset}>
                  {note ? "Done" : "Cancel"}
                </button>
                <button type="submit" className="btn-save" disabled={saving || !name.trim() || Boolean(note)}>
                  {saving ? "Adding…" : "Add to Notion"}
                </button>
              </div>
            </form>
          )}
        </Popover>
      )}
    </div>
  );
}
