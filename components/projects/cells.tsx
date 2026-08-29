"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* Inline-editable cells, in the spirit of a Notion table: a cell looks like
   plain text until you hover it, then behaves like a field. Each one commits
   on blur or Enter and cancels on Escape, so nothing is saved by accident and
   nothing needs a Save button. */

function Chevron() {
  return (
    <svg className="chev-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function TextCell({
  value,
  onSave,
  placeholder = "Empty",
  multiline = false,
  bold = false,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  bold?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select?.();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onSave(next);
  }

  if (editing) {
    const Tag = (multiline ? "textarea" : "input") as "input";
    return (
      <Tag
        ref={ref}
        className="pw-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter commits a single-line field; in a textarea it should insert
          // a newline, so there Cmd/Ctrl+Enter is the commit.
          if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`pw-cell${value ? "" : " empty"}`}
      onClick={() => setEditing(true)}
      style={bold ? { fontWeight: 550, color: "var(--ink)" } : undefined}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: multiline ? "pre-wrap" : "nowrap" }}>
        {value || placeholder}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Number                                                              */
/* ------------------------------------------------------------------ */

export function NumberCell({
  value,
  onSave,
  prefix = "",
  placeholder = "—",
}: {
  value?: number;
  onSave: (v: number | undefined) => void;
  prefix?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value === undefined ? "" : String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === "" ? undefined : Number(trimmed.replace(/[^0-9.\-]/g, ""));
    if (next !== undefined && !Number.isFinite(next)) return;
    if (next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        className="pw-input num"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { setDraft(value === undefined ? "" : String(value)); setEditing(false); }
        }}
      />
    );
  }

  return (
    <div className={`pw-cell${value === undefined ? " empty" : ""}`} onClick={() => setEditing(true)}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: value === undefined ? 400 : 600 }}>
        {value === undefined ? placeholder : `${prefix}${value.toLocaleString()}`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */

export function DateCell({
  value,
  onSave,
  placeholder = "—",
  tone,
}: {
  value?: string;
  onSave: (v: string) => void;
  placeholder?: string;
  tone?: "late" | "soon" | null;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        className="pw-input"
        defaultValue={value || ""}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== (value || "")) onSave(e.target.value);
        }}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  const label = value
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : placeholder;

  return (
    <div
      className={`pw-cell is-picker${value ? "" : " empty"}`}
      onClick={() => setEditing(true)}
      style={{ color: tone === "late" ? "var(--critical-ink)" : tone === "soon" ? "var(--warning-ink)" : undefined, fontWeight: tone ? 600 : undefined }}
    >
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Popover shell                                                       */
/* ------------------------------------------------------------------ */

function Popover({ children, onClose, align = "left" }: { children: ReactNode; onClose: () => void; align?: "left" | "right" }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* A full-screen backdrop rather than a document click listener: it
          closes on any outside click without racing the opening click. */}
      <div className="pw-pop-backdrop" onClick={onClose} />
      <div className={`pw-pop${align === "right" ? " right" : ""}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Single-choice                                                       */
/* ------------------------------------------------------------------ */

export function SelectCell({
  value,
  options,
  onSave,
  render,
  placeholder = "—",
  allowEmpty = true,
  open: openProp,
  onOpenChange,
}: {
  value?: string;
  options: string[];
  onSave: (v: string) => void;
  render?: (v: string) => ReactNode;
  placeholder?: string;
  allowEmpty?: boolean;
  /**
   * Open state may be owned by the parent. It has to be, in any list whose row
   * components are re-created between renders: local state in this component
   * would be thrown away with the old element identity the moment a save
   * re-renders the list, closing the popover mid-edit. Left undefined, the
   * cell keeps its own state, which is fine for one-off use.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <div style={{ position: "relative" }}>
      <div className={`pw-cell is-picker${value ? "" : " empty"}`} onClick={() => setOpen(true)}>
        {value ? (render ? render(value) : value) : placeholder}
        <Chevron />
      </div>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          {allowEmpty && (
            <button className={`pw-opt${!value ? " on" : ""}`} onClick={() => { onSave(""); setOpen(false); }}>
              <span style={{ color: "var(--ink-muted)" }}>Clear</span>
              <Tick />
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt}
              className={`pw-opt${opt === value ? " on" : ""}`}
              onClick={() => { onSave(opt); setOpen(false); }}
            >
              {render ? render(opt) : opt}
              <Tick />
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-choice (people, categories)                                   */
/* ------------------------------------------------------------------ */

export interface PickOption {
  id: string;
  label: string;
  color?: string;
}

export function MultiPickCell({
  selected,
  options,
  onSave,
  renderClosed,
  placeholder = "—",
  searchable = false,
  heading,
  open: openProp,
  onOpenChange,
  query: queryProp,
  onQueryChange,
}: {
  selected: string[];
  options: PickOption[];
  onSave: (ids: string[]) => void;
  renderClosed: (chosen: PickOption[]) => ReactNode;
  placeholder?: string;
  searchable?: boolean;
  heading?: string;
  /** See SelectCell — multi-select especially needs the parent to hold this,
   *  since every tick saves and re-renders the list. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The search box needs lifting for the same reason the open flag does:
   *  otherwise a remount empties what the user typed after every tick. */
  query?: string;
  onQueryChange?: (q: string) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [ownQ, setOwnQ] = useState("");
  const q = queryProp ?? ownQ;
  const setQ = onQueryChange ?? setOwnQ;

  const chosen = selected.map((id) => options.find((o) => o.id === id)).filter(Boolean) as PickOption[];
  const visible = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  function toggle(id: string) {
    // Saves on every toggle rather than on close, so a dropped connection
    // loses one tick instead of the whole edit.
    onSave(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div style={{ position: "relative" }}>
      <div className={`pw-cell is-picker${chosen.length ? "" : " empty"}`} onClick={() => setOpen(true)}>
        {chosen.length ? renderClosed(chosen) : placeholder}
        <Chevron />
      </div>
      {open && (
        <Popover onClose={() => { setOpen(false); setQ(""); }}>
          {heading && <div className="pw-pop-head">{heading}</div>}
          {searchable && (
            <input
              className="pw-pop-search"
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {visible.length === 0 && (
            <div style={{ padding: "10px 9px", fontSize: 12, color: "var(--ink-muted)" }}>Nothing matches.</div>
          )}
          {visible.map((o) => (
            <button key={o.id} className={`pw-opt${selected.includes(o.id) ? " on" : ""}`} onClick={() => toggle(o.id)}>
              {o.color && <span className="nav-swatch" style={{ ["--swatch-color" as string]: o.color, width: 16, height: 16 }} />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
              <Tick />
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational helpers                                              */
/* ------------------------------------------------------------------ */

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic colour per person, so the same face keeps the same tint. */
const AVATAR_COLORS = ["--blue", "--orange", "--aqua", "--violet", "--magenta", "--yellow"];
export function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `var(${AVATAR_COLORS[h % AVATAR_COLORS.length]})`;
}

export function AvatarStack({ people, max = 4 }: { people: PickOption[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <span key={p.id} className="av" style={{ background: avatarColor(p.id) }} title={p.label}>
          {initials(p.label)}
        </span>
      ))}
      {extra > 0 && <span className="av more">+{extra}</span>}
    </span>
  );
}
